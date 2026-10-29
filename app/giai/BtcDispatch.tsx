"use client";
// BTC ngày thi đấu: lưới sân, trận gợi ý (sẵn sàng) / bị khóa kèm lý do, gọi trận, nhập tỉ số, hoàn tác, bỏ cuộc.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { pb } from "../../lib/pb";
import type { TournamentData, TMatch } from "../../lib/tournament/store";
import { planQueue, type BlockReason } from "../../lib/tournament/dispatch";
import { callMatch, inversePatches, uncallMatch, type Patch } from "../../lib/tournament/actions";
import { entryLabel } from "../../lib/tournament/view";
import { useBtcWriter } from "./useBtcWriter";
import ScoreDialog from "./ScoreDialog";
import { scoreText } from "./EventView";
import { errText } from "./BtcSetup";
import { Btn, Card } from "./ui";

const nowMs = () => Date.now();

export default function BtcDispatch({ data, uid, setData }: { data: TournamentData; uid: string; setData: Dispatch<SetStateAction<TournamentData | null>> }) {
  const { write, pending } = useBtcWriter(data.t.code, setData);
  const [scoring, setScoring] = useState<string>("");
  const [undo, setUndo] = useState<{ label: string; patches: Patch[] } | null>(null);
  const [now, setNow] = useState(nowMs);
  const [pickCourt, setPickCourt] = useState<Record<string, number>>({});

  // Đồng hồ cho thời gian nghỉ còn lại; thanh hoàn tác tự ẩn sau 60 giây
  useEffect(() => { const t = setInterval(() => setNow(nowMs()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 60000); return () => clearTimeout(t); }, [undo]);

  const people: Record<string, string[]> = Object.fromEntries(data.entries.map(e => [e.id, [e.p1, e.p2]]));
  const { ready, blocked } = planQueue({ matches: data.matches, people, now, restMs: data.t.settings.rest_minutes * 60000 });
  const onCourt = (courtId: number) => data.matches.find(m => m.court === courtId && (m.status === "called" || m.status === "playing"));
  const freeCourts = data.t.courts.filter(c => !onCourt(c.id));
  const evName = (m: TMatch) => data.events.find(e => e.id === m.event)?.name || "";
  const label = (id: string) => entryLabel(data.entries.find(e => e.id === id), data.participants);
  const person = (id: string) => data.participants.find(p => p.id === id)?.name || "?";

  const apply = (patches: Patch[], undoLabel: string) => {
    setUndo({ label: undoLabel, patches: inversePatches(patches, data.matches, data.events) });
    write(patches);
  };
  const call = (m: TMatch, force = false) => {
    const court = pickCourt[m.id] || freeCourts[0]?.id;
    if (!court) { alert("Không còn sân trống."); return; }
    if (force && !window.confirm("Trận này đang bị khóa (có người đang đánh hoặc chưa nghỉ đủ). Vẫn gọi?")) return;
    apply([callMatch(m, court, nowMs())], `Đã gọi ${evName(m)} vào ${data.t.courts.find(c => c.id === court)?.name}`);
  };
  const reasonText = (r: BlockReason) => {
    if (r.kind === "busy") {
      const m = data.matches.find(x => x.id === r.matchId);
      const court = data.t.courts.find(c => c.id === m?.court)?.name;
      return `${person(r.person)} đang đánh${court ? ` ${court}` : ""}`;
    }
    return `${person(r.person)} nghỉ còn ${Math.max(1, Math.ceil((r.until - now) / 60000))} phút`;
  };
  const scoringMatch = data.matches.find(m => m.id === scoring);

  return (
    <div className="flex flex-col gap-3 pb-20">
      {data.t.status !== "running" && <p className="text-xs font-black text-orange-600">Giải chưa ở trạng thái “Đang thi đấu” (đổi ở tab Giải).</p>}
      {pending > 0 && <p className="text-xs font-black text-orange-600"><i className="fa-solid fa-cloud-arrow-up mr-1"></i>Đang chờ đồng bộ {pending} thao tác (mất mạng sẽ tự gửi lại)</p>}

      <Card title={`Sân (${freeCourts.length}/${data.t.courts.length} trống)`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.t.courts.map(c => {
            const m = onCourt(c.id);
            return (
              <div key={c.id} className={`border-[3px] border-black p-2 ${m ? "bg-green-50" : "bg-gray-50"}`}>
                <div className="flex justify-between items-center"><span className="font-black text-sm">{c.name}</span>{m && <span className="text-[10px] font-black text-gray-500">{evName(m)}</span>}</div>
                {m ? (
                  <>
                    <div className="text-xs font-bold mt-1">{label(m.entryA)}<br />{label(m.entryB)}</div>
                    <div className="flex gap-1 mt-2">
                      <Btn small tone="green" className="flex-1" onClick={() => setScoring(m.id)}>Nhập tỉ số</Btn>
                      <Btn small onClick={() => apply([uncallMatch(m)], `Đã trả trận về hàng chờ`)}>Trả lại</Btn>
                    </div>
                  </>
                ) : <div className="text-xs font-bold text-gray-400 mt-1">Trống</div>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={`Sẵn sàng (${ready.length})`}>
        {ready.length === 0 ? <p className="text-xs font-bold text-gray-500">Không có trận nào sẵn sàng.</p> : (
          <div className="flex flex-col gap-2">
            {ready.map((m, i) => (
              <div key={m.id} className={`border-2 border-black p-2 text-xs ${i === 0 ? "bg-yellow-100" : ""}`}>
                <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                  <span>{evName(m)} · {m.stage === "ko" ? "Nhánh" : `Bảng ${m.group}`} · vòng {m.round}</span>{i === 0 && <span className="text-orange-600">Gợi ý</span>}
                </div>
                <div className="font-bold mt-0.5">{label(m.entryA)} <span className="text-gray-400">vs</span> {label(m.entryB)}</div>
                <div className="flex gap-1 mt-1">
                  {freeCourts.length > 1 && (
                    <select value={pickCourt[m.id] || freeCourts[0].id} onChange={e => setPickCourt({ ...pickCourt, [m.id]: Number(e.target.value) })} className="border-2 border-black text-xs font-bold px-1">
                      {freeCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  <Btn small tone="blue" disabled={freeCourts.length === 0} onClick={() => call(m)}>Gọi{freeCourts.length === 1 ? ` vào ${freeCourts[0].name}` : ""}</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {blocked.length > 0 && (
        <Card title={`Bị khóa (${blocked.length})`}>
          <div className="flex flex-col gap-2">
            {blocked.map(({ match: m, reason }) => (
              <div key={m.id} className="border-2 border-gray-400 p-2 text-xs text-gray-600">
                <div className="font-bold">{evName(m)}: {label(m.entryA)} vs {label(m.entryB)}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex-1 font-black text-orange-600">{reasonText(reason)}</span>
                  {reason.kind === "rest" && <Btn small disabled={freeCourts.length === 0} onClick={() => call(m, true)}>Gọi luôn</Btn>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Trận đã xong (chạm để sửa)">
        <div className="flex flex-col gap-1">
          {data.matches.filter(m => m.status === "done" || m.status === "walkover").sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 30).map(m => (
            <button key={m.id} onClick={() => m.status === "done" && setScoring(m.id)} className="text-left border border-gray-300 px-2 py-1 text-xs font-bold flex justify-between gap-2">
              <span className="truncate">{evName(m)}: {label(m.entryA)} vs {label(m.entryB)}</span><span className="shrink-0">{scoreText(m)}</span>
            </button>
          ))}
        </div>
      </Card>

      {undo && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-md z-[90] bg-black text-white border-[3px] border-black shadow-[4px_4px_0_0_#facc15] flex items-center gap-2 px-3 py-2">
          <span className="flex-1 min-w-0 text-xs font-bold truncate">{undo.label}</span>
          <button onClick={() => { write(undo.patches); setUndo(null); }} className="shrink-0 bg-yellow-300 text-black border-2 border-white px-2 py-1 text-[11px] font-black uppercase">Hoàn tác</button>
          <button onClick={() => setUndo(null)} className="shrink-0 text-gray-400 px-1" aria-label="close"><i className="fa-solid fa-xmark"></i></button>
        </div>
      )}

      {scoringMatch && (
        <ScoreDialog match={scoringMatch} data={data} uid={uid} onClose={() => setScoring("")}
          onSave={patches => { apply(patches, `Đã lưu ${evName(scoringMatch)}: ${scoreText({ ...scoringMatch, scores: patches[0].fields.scores as TMatch["scores"], status: "done" })}`); setScoring(""); }}
          onWithdraw={async (entryId, patches) => {
            try { await pb.collection("entries").update(entryId, { status: "withdrawn" }); } catch (e) { alert(errText(e)); return; }
            apply(patches, `Đã ghi bỏ cuộc: ${label(entryId)}`);
            setScoring("");
          }} />
      )}
    </div>
  );
}
