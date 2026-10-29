"use client";
// BTC: chọn thể thức, hạt giống, bốc thăm (xem trước, bốc lại, đổi chỗ) → công bố lịch; hết vòng bảng → điền nhánh.
import { useState } from "react";
import { pb } from "../../lib/pb";
import type { TEvent, TournamentData } from "../../lib/tournament/store";
import { GROUP_KEYS, drawGroups, suggestFormat, type GroupKey } from "../../lib/tournament/draw";
import { buildEventMatches, fillKoFromGroups, groupResultLocked, suggestSeeds } from "../../lib/tournament/bracket";
import { entryLabel, groupStandings } from "../../lib/tournament/view";
import { errText } from "./BtcSetup";
import { Btn, Card, Field, Tabs, inputCls } from "./ui";

type Groups = Partial<Record<GroupKey, string[]>>;

function DrawEvent({ data, event }: { data: TournamentData; event: TEvent }) {
  const approved = data.entries.filter(e => e.event === event.id && e.status === "approved");
  const n = approved.length;
  const sug = suggestFormat(n);
  const [format, setFormat] = useState<"rr" | "groups_ko">(sug.format);
  const [groupCount, setGroupCount] = useState<2 | 4>(sug.groups ?? 2);
  const [advance, setAdvance] = useState<1 | 2>(sug.advance ?? 2);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [preview, setPreview] = useState<Groups | null>(null);
  const [swapFirst, setSwapFirst] = useState("");
  const [busy, setBusy] = useState(false);
  const label = (id: string) => entryLabel(data.entries.find(e => e.id === id), data.participants);
  const matches = data.matches.filter(m => m.event === event.id);
  const ko = matches.filter(m => m.stage === "ko");
  const published = matches.length > 0;

  const keys = format === "rr" ? (["A"] as GroupKey[]) : GROUP_KEYS.slice(0, groupCount);
  const maxSeeds = format === "rr" ? 0 : groupCount;
  const invalid = n < 3 ? "Cần ít nhất 3 đôi đã duyệt." : format === "groups_ko" && n < groupCount * 2 ? `Cần ít nhất ${groupCount * 2} đôi cho ${groupCount} bảng.` : "";

  const draw = () => {
    if (format === "rr") { setPreview({ A: approved.map(e => e.id) }); return; }
    const g = drawGroups(approved.map(e => ({ id: e.id, seed: seeds.includes(e.id) ? seeds.indexOf(e.id) + 1 : undefined })), groupCount, Math.random);
    setPreview(Object.fromEntries(keys.map(k => [k, g[k]])));
  };
  const clickEntry = (id: string) => {
    if (!preview || format === "rr") return;
    if (!swapFirst) { setSwapFirst(id); return; }
    if (swapFirst === id) { setSwapFirst(""); return; }
    const next: Groups = {};
    for (const k of keys) next[k] = (preview[k] || []).map(x => (x === swapFirst ? id : x === id ? swapFirst : x));
    setPreview(next); setSwapFirst("");
  };
  const publish = async () => {
    if (!preview || busy) return;
    if (!window.confirm(`Công bố lịch ${event.name}? Mọi người sẽ thấy bảng và lịch thi đấu.`)) return;
    setBusy(true);
    try {
      const specs = buildEventMatches({ format, groups: preview, groupCount, advance });
      const batch = pb.createBatch();
      for (const k of keys) for (const id of preview[k] || []) batch.collection("entries").update(id, { group: k, seed: seeds.includes(id) ? seeds.indexOf(id) + 1 : 0 });
      for (const s of specs) batch.collection("matches").create({ event: event.id, stage: s.stage, group: s.group, round: s.round, order: s.order, entry_a: s.entryA, entry_b: s.entryB, feeds: s.feeds, status: "pending", version: 0, scores: [], log: [] });
      batch.collection("events").update(event.id, { format, groups: format === "rr" ? 1 : groupCount, advance: format === "rr" ? 0 : advance, stage: "groups" });
      await batch.send();
      setPreview(null);
    } catch (e) { alert("Không công bố được: " + errText(e)); }
    finally { setBusy(false); }
  };
  const unpublish = async () => {
    if (matches.some(m => m.status !== "pending" && m.status !== "ready")) { alert("Đã có trận được gọi hoặc có kết quả, không hủy bốc thăm được."); return; }
    if (!window.confirm("Hủy bốc thăm và xóa lịch của nội dung này?")) return;
    try {
      const batch = pb.createBatch();
      for (const m of matches) batch.collection("matches").delete(m.id);
      batch.collection("events").update(event.id, { stage: "registration" });
      await batch.send();
    } catch (e) { alert(errText(e)); }
  };
  const fillBracket = async () => {
    const groupMs = matches.filter(m => m.stage === "group");
    if (groupMs.some(m => m.status !== "done" && m.status !== "walkover")) { alert("Vòng bảng chưa xong hết."); return; }
    if (groupResultLocked(ko)) { alert("Nhánh đã bắt đầu, không điền lại được."); return; }
    const gs = GROUP_KEYS.slice(0, event.groups || 2);
    const standings: Record<string, string[]> = {};
    let lot = false;
    for (const g of gs) {
      const rows = groupStandings(event, g, data.entries, matches, data.t.settings.walkover_mode);
      standings[g] = rows.map(r => r.entry);
      lot ||= rows.slice(0, (event.advance || 0) + 1).some(r => r.byLot);
    }
    if (lot && !window.confirm("Có thứ hạng phải phân định bằng bốc thăm (bằng hết các chỉ số). Vẫn điền nhánh?")) return;
    try {
      const batch = pb.createBatch();
      for (const u of fillKoFromGroups(ko, standings)) batch.collection("matches").update(u.id, { entry_a: u.entryA, entry_b: u.entryB });
      batch.collection("events").update(event.id, { stage: "ko" });
      await batch.send();
    } catch (e) { alert(errText(e)); }
  };

  if (published) {
    const groupDone = matches.filter(m => m.stage === "group").every(m => m.status === "done" || m.status === "walkover");
    return (
      <Card title={`${event.name}: đã công bố lịch`}>
        <div className="flex flex-col gap-2 text-xs font-bold">
          <p>{event.format === "rr" ? "Vòng tròn" : `${event.groups} bảng, mỗi bảng lấy ${event.advance} đôi`} · {matches.filter(m => m.status === "done" || m.status === "walkover").length}/{matches.length} trận xong</p>
          {event.format === "groups_ko" && (
            <Btn tone="green" disabled={!groupDone || groupResultLocked(ko)} onClick={fillBracket}>
              {ko.some(m => m.entryA) ? "Điền lại nhánh từ bảng xếp hạng" : "Điền nhánh từ bảng xếp hạng"}
            </Btn>
          )}
          {!groupDone && event.format === "groups_ko" && <p className="text-gray-500">Đánh xong vòng bảng thì điền nhánh.</p>}
          <Btn tone="red" small onClick={unpublish}>Hủy bốc thăm</Btn>
        </div>
      </Card>
    );
  }

  return (
    <Card title={`${event.name}: ${n} đôi đã duyệt`}>
      <div className="flex flex-col gap-3">
        {data.t.status === "registration" && <p className="text-xs font-bold text-orange-600">Giải còn đang mở đăng ký. Nên khóa đăng ký trước khi bốc thăm.</p>}
        <div className="grid grid-cols-3 gap-2">
          <Field label="Thể thức">
            <select value={format} onChange={e => { setFormat(e.target.value as typeof format); setPreview(null); }} className={inputCls}><option value="rr">Vòng tròn</option><option value="groups_ko">Bảng → loại</option></select>
          </Field>
          {format === "groups_ko" && <>
            <Field label="Số bảng"><select value={groupCount} onChange={e => { setGroupCount(Number(e.target.value) as 2 | 4); setPreview(null); setSeeds(s => s.slice(0, Number(e.target.value))); }} className={inputCls}><option value={2}>2</option><option value={4}>4</option></select></Field>
            <Field label="Lấy mỗi bảng"><select value={advance} onChange={e => setAdvance(Number(e.target.value) as 1 | 2)} className={inputCls}><option value={1}>1</option><option value={2}>2</option></select></Field>
          </>}
        </div>
        <p className="text-[10px] font-bold text-gray-500">Gợi ý với {n} đôi: {sug.format === "rr" ? "vòng tròn" : "2 bảng, mỗi bảng lấy 2 → bán kết chéo"}.</p>

        {maxSeeds > 0 && (
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-black uppercase">Hạt giống ({seeds.length}/{maxSeeds}) — chạm theo thứ tự 1, 2…</span>
              <Btn small onClick={() => setSeeds(suggestSeeds(approved, data.participants, maxSeeds))}>Gợi ý</Btn>
            </div>
            <div className="flex flex-col gap-1">
              {approved.map(e => {
                const s = seeds.indexOf(e.id);
                return (
                  <button key={e.id} type="button" onClick={() => setSeeds(cur => (s >= 0 ? cur.filter(x => x !== e.id) : cur.length < maxSeeds ? [...cur, e.id] : cur))}
                    className={`text-left border-2 border-black px-2 py-1 text-xs font-bold ${s >= 0 ? "bg-yellow-200" : "bg-white"}`}>
                    {s >= 0 && <span className="font-black mr-1">#{s + 1}</span>}{label(e.id)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {invalid ? <p className="text-xs font-black text-red-600">{invalid}</p> : <Btn tone="yellow" onClick={draw}>{preview ? "Bốc lại" : "Bốc thăm"}</Btn>}

        {preview && (
          <>
            {format === "groups_ko" && <p className="text-[10px] font-bold text-gray-500">Chạm 2 đôi ở 2 bảng để đổi chỗ.</p>}
            <div className={`grid gap-2 ${keys.length > 1 ? "grid-cols-2" : ""}`}>
              {keys.map(k => (
                <div key={k} className="border-2 border-black">
                  <div className="bg-black text-white text-[10px] font-black px-2 py-0.5">{format === "rr" ? "Vòng tròn" : `Bảng ${k}`}</div>
                  {(preview[k] || []).map(id => (
                    <button key={id} type="button" onClick={() => clickEntry(id)} className={`block w-full text-left px-2 py-1 text-xs font-bold border-t border-gray-200 ${swapFirst === id ? "bg-blue-200" : ""}`}>
                      {seeds.includes(id) && <span className="text-orange-600 mr-1">#{seeds.indexOf(id) + 1}</span>}{label(id)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <Btn tone="green" disabled={busy} onClick={publish}>Công bố lịch</Btn>
          </>
        )}
      </div>
    </Card>
  );
}

export default function BtcDraw({ data }: { data: TournamentData }) {
  const [tab, setTab] = useState(data.events[0]?.id || "");
  const event = data.events.find(e => e.id === tab) || data.events[0];
  if (!event) return <Card title="Bốc thăm"><p className="text-xs font-bold">Chưa có nội dung.</p></Card>;
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={event.id} onChange={setTab} items={data.events.map(e => ({ id: e.id, label: e.name }))} />
      <DrawEvent key={event.id} data={data} event={event} />
    </div>
  );
}
