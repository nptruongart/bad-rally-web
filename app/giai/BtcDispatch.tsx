"use client";
// BTC ngày thi đấu: lưới sân, trận gợi ý (sẵn sàng) / bị khóa kèm lý do, gọi trận, nhập tỉ số, hoàn tác, bỏ cuộc.
import { useEffect, useState } from "react";
import type { TournamentData, TMatch } from "../../lib/tournament/store";
import { planQueue, type BlockReason } from "../../lib/tournament/dispatch";
import { callMatch, inversePatches, uncallMatch, type Patch } from "../../lib/tournament/actions";
import { entryLabel } from "../../lib/tournament/view";
import ScoreDialog from "./ScoreDialog";
import { MatchRow, scoreText, stageLabel } from "./EventView";
import { Btn, Card, Pill } from "./ui";

const nowMs = () => Date.now();

export default function BtcDispatch({ data, uid, write }: { data: TournamentData; uid: string; write: (patches: Patch[]) => void }) {
  const [scoring, setScoring] = useState<string>("");
  const [undo, setUndo] = useState<{ label: string; patches: Patch[] } | null>(null);
  const [now, setNow] = useState(nowMs);
  const [pickCourt, setPickCourt] = useState<Record<string, number>>({});

  // Đồng hồ cho thời gian nghỉ còn lại; thanh hoàn tác tự ẩn sau 60 giây
  useEffect(() => { const t = setInterval(() => setNow(nowMs()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 60000); return () => clearTimeout(t); }, [undo]);

  const people: Record<string, string[]> = Object.fromEntries(data.entries.map(e => [e.id, [e.p1, e.p2]]));
  const { ready, blocked } = planQueue({ matches: data.matches, people, now, restMs: data.t.settings.rest_minutes * 60000, restExempt: data.events.filter(e => e.format === "team_rot").map(e => e.id) });
  const onCourt = (courtId: number) => data.matches.find(m => m.court === courtId && (m.status === "called" || m.status === "playing"));
  const freeCourts = data.t.courts.filter(c => !onCourt(c.id));
  const evName = (m: TMatch) => data.events.find(e => e.id === m.event)?.name || "";
  const label = (id: string) => entryLabel(data.entries.find(e => e.id === id), data.participants);
  const person = (id: string) => data.participants.find(p => p.id === id)?.name || "?";

  const apply = (patches: Patch[], undoLabel: string) => {
    setUndo({ label: undoLabel, patches: inversePatches(patches, data.matches, data.events, data.entries) });
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
      {data.t.status !== "running" && <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Giải chưa ở trạng thái “Đang thi đấu” (đổi ở tab Giải).</p>}

      <Card title="Sân thi đấu" right={<Pill tone={freeCourts.length ? "green" : "gray"}>{freeCourts.length}/{data.t.courts.length} trống</Pill>}>
        <div className="grid grid-cols-2 gap-2">
          {data.t.courts.map(c => {
            const m = onCourt(c.id);
            const mins = m ? Math.max(0, Math.floor((now - m.calledAt) / 60000)) : 0;
            return (
              <div key={c.id} className={`rounded-xl border p-2.5 ${m ? "border-red-200 bg-white" : "border-dashed border-slate-300 bg-slate-50"}`}>
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-slate-900">{c.name}</span>
                  {m ? <Pill tone="live">{mins} phút</Pill> : <Pill tone="green">Trống</Pill>}
                </div>
                {m ? (
                  <>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mt-1">{evName(m)} · {stageLabel(m, data)}</div>
                    <div className="text-sm font-semibold text-slate-800 mt-0.5 leading-snug">{label(m.entryA)}<div className="text-[11px] text-slate-400 font-normal">vs</div>{label(m.entryB)}</div>
                    <div className="flex flex-col gap-1.5 mt-3">
                      <Btn small tone="blue" onClick={() => setScoring(m.id)}><i className="fa-solid fa-pen"></i>Nhập tỉ số</Btn>
                      <Btn small onClick={() => apply([uncallMatch(m)], `Đã trả trận về hàng chờ`)}>Trả lại</Btn>
                    </div>
                  </>
                ) : <div className="text-sm text-slate-400 mt-1">Chưa có trận</div>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Sẵn sàng gọi" right={<Pill tone="blue">{ready.length} trận</Pill>}>
        {ready.length === 0 ? <p className="text-sm text-slate-500">Không có trận nào sẵn sàng.</p> : (
          <div className="flex flex-col gap-2">
            {ready.map((m, i) => (
              <div key={m.id} className={`rounded-xl border p-3 ${i === 0 ? "border-blue-300 bg-blue-50/60" : "border-slate-200"}`}>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{evName(m)} · {stageLabel(m, data)}</span>
                  {i === 0 && <Pill tone="amber"><i className="fa-solid fa-star text-[9px]"></i>Gợi ý</Pill>}
                </div>
                <div className="text-sm font-semibold text-slate-800 mt-1">{label(m.entryA)} <span className="text-slate-400 font-normal mx-0.5">vs</span> {label(m.entryB)}</div>
                <div className="flex gap-1.5 mt-2">
                  {freeCourts.length > 1 && (
                    <select value={pickCourt[m.id] || freeCourts[0].id} onChange={e => setPickCourt({ ...pickCourt, [m.id]: Number(e.target.value) })} className="rounded-lg border border-slate-300 text-xs font-medium px-2 bg-white">
                      {freeCourts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  <Btn small tone="blue" disabled={freeCourts.length === 0} onClick={() => call(m)}><i className="fa-solid fa-bullhorn"></i>Gọi{freeCourts.length === 1 ? ` vào ${freeCourts[0].name}` : ""}</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {blocked.length > 0 && (
        <Card title="Đang chờ" right={<Pill>{blocked.length} trận</Pill>}>
          <div className="flex flex-col divide-y divide-slate-100 -mx-4 border-y border-slate-100">
            {blocked.map(({ match: m, reason }) => (
              <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-700 truncate"><span className="text-slate-400">{evName(m)}:</span> {label(m.entryA)} vs {label(m.entryB)}</div>
                  <div className="text-xs font-medium text-amber-600 mt-0.5"><i className={`fa-solid ${reason.kind === "rest" ? "fa-mug-hot" : "fa-person-running"} mr-1`}></i>{reasonText(reason)}</div>
                </div>
                {reason.kind === "rest" && <Btn small disabled={freeCourts.length === 0} onClick={() => call(m, true)}>Gọi luôn</Btn>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Đã xong" right={<span className="text-xs text-slate-400">Chạm để sửa tỉ số</span>}>
        <div className="flex flex-col gap-2">
          {data.matches.filter(m => m.status === "done" || m.status === "walkover").sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 30).map(m => (
            <button key={m.id} onClick={() => m.status === "done" && setScoring(m.id)} className="text-left hover:opacity-80">
              <MatchRow m={m} data={data} ko={data.matches.filter(x => x.event === m.event && x.stage === "ko")} caption={`${evName(m)} · ${stageLabel(m, data)}`} compact />
            </button>
          ))}
        </div>
      </Card>

      {undo && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-md z-[90] bg-slate-900 text-white rounded-xl shadow-xl flex items-center gap-2 px-3 py-2">
          <span className="flex-1 min-w-0 text-xs font-medium truncate">{undo.label}</span>
          <button onClick={() => { write(undo.patches); setUndo(null); }} className="shrink-0 bg-amber-400 text-slate-900 rounded-md px-2.5 py-1 text-xs font-semibold">Hoàn tác</button>
          <button onClick={() => setUndo(null)} className="shrink-0 text-slate-400 px-1" aria-label="close"><i className="fa-solid fa-xmark"></i></button>
        </div>
      )}

      {scoringMatch && (
        <ScoreDialog match={scoringMatch} data={data} uid={uid} onClose={() => setScoring("")}
          onSave={patches => { apply(patches, `Đã lưu ${evName(scoringMatch)}: ${scoreText({ ...scoringMatch, scores: patches[0].fields.scores as TMatch["scores"], status: "done" })}`); setScoring(""); }}
          onWithdraw={(entryId, patches) => {
            apply(patches, `Đã ghi bỏ cuộc: ${label(entryId)}`);
            setScoring("");
          }} />
      )}
    </div>
  );
}
