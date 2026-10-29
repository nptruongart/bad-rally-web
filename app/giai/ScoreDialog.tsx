"use client";
// BTC nhập / sửa tỉ số một trận (theo luật điểm của nội dung), hoặc ghi một đôi bỏ cuộc.
import { useState } from "react";
import type { TournamentData, TMatch } from "../../lib/tournament/store";
import type { GameScore } from "../../lib/tournament/types";
import { refillAfter, saveScore, withdrawPatches, type Patch } from "../../lib/tournament/actions";
import { entryLabel } from "../../lib/tournament/view";
import { Btn } from "./ui";

const nowMs = () => Date.now();

export default function ScoreDialog({ match, data, uid, onSave, onWithdraw, onClose }: {
  match: TMatch; data: TournamentData; uid: string;
  onSave: (patches: Patch[]) => void;
  onWithdraw: (entryId: string, patches: Patch[]) => void;
  onClose: () => void;
}) {
  const event = data.events.find(e => e.id === match.event)!;
  const rule = event.scoring;
  const initial: GameScore[] = match.scores.length ? match.scores : [[0, 0]];
  const [games, setGames] = useState<[string, string][]>(initial.map(g => [g[0] ? String(g[0]) : "", g[1] ? String(g[1]) : ""]));
  const label = (id: string) => entryLabel(data.entries.find(e => e.id === id), data.participants);
  const court = data.t.courts.find(c => c.id === match.court)?.name;
  const scores: GameScore[] = games.filter(g => g[0] !== "" || g[1] !== "").map(g => [Number(g[0]) || 0, Number(g[1]) || 0]);
  const wonA = scores.filter(g => g[0] > g[1]).length, wonB = scores.filter(g => g[1] > g[0]).length;
  const canAddGame = rule.games === 3 && games.length < 3 && wonA < 2 && wonB < 2 && games.every(g => g[0] !== "" && g[1] !== "");
  const eventMatches = data.matches.filter(m => m.event === match.event);

  const save = (force = false) => {
    const r = saveScore({ match, scores, rule, eventMatches, uid, now: nowMs(), force, event, entries: data.entries, walkoverMode: data.t.settings.walkover_mode });
    if (r.error) { alert(r.error); return; }
    if (r.needsConfirm) {
      if (window.confirm(`Tỉ số không đúng luật ${rule.points} điểm (trần ${rule.cap}). Vẫn lưu?`)) save(true);
      return;
    }
    onSave(r.patches);
  };
  const withdraw = (entryId: string) => {
    if (!window.confirm(`Ghi "${label(entryId)}" bỏ cuộc? Các trận chưa đánh của đôi này trong ${event.name} sẽ tính thắng xử ép cho đối thủ.`)) return;
    // Đôi rút + các trận còn lại xử thắng cho đối thủ + (nếu nhánh đã điền mà chưa đánh) điền lại nhánh — tất cả hoàn tác được
    const wp = withdrawPatches(entryId, eventMatches, nowMs());
    const matchesAfter = eventMatches.map(m => { const p = wp.find(x => x.collection === "matches" && x.id === m.id); return p ? { ...m, status: "walkover" as const, winner: p.fields.winner as "a" | "b" } : m; });
    const entriesAfter = data.entries.map(e => (e.id === entryId ? { ...e, status: "withdrawn" as const } : e));
    onWithdraw(entryId, [{ collection: "entries", id: entryId, fields: { status: "withdrawn" } }, ...wp, ...refillAfter(event, entriesAfter, matchesAfter, data.t.settings.walkover_mode)]);
  };
  const set = (i: number, side: 0 | 1, v: string) => setGames(gs => gs.map((g, j) => (j === i ? (side === 0 ? [v.replace(/\D/g, "").slice(0, 2), g[1]] : [g[0], v.replace(/\D/g, "").slice(0, 2)]) : g)));

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-900 text-white px-5 pt-4 pb-3 flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{rule.games === 1 ? "1 set" : "2/3 set"} · {rule.points} điểm (trần {rule.cap})</div>
            <div className="font-bold">{event.name}{court ? ` · ${court}` : ""}</div>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-2 items-center">
            <span></span>
            {games.map((_, i) => <span key={i} className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 text-center w-14">Set {i + 1}</span>)}
            {Array.from({ length: 3 - games.length }, (_, i) => <span key={`x${i}`} />)}
            {(["a", "b"] as const).map((side, s) => (
              <div key={side} className="contents">
                <span className="text-sm font-bold text-slate-900 truncate">{label(side === "a" ? match.entryA : match.entryB)}</span>
                {games.map((g, i) => {
                  const win = g[s] !== "" && g[1 - s] !== "" && Number(g[s]) > Number(g[1 - s]);
                  return (
                    <input key={i} value={g[s]} onChange={e => set(i, s as 0 | 1, e.target.value)} inputMode="numeric" placeholder="0"
                      className={`w-14 h-14 rounded-xl border-2 text-center text-2xl font-bold tabular-nums placeholder:text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${win ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-900"}`} />
                  );
                })}
                {Array.from({ length: 3 - games.length }, (_, i) => <span key={`y${i}`} />)}
              </div>
            ))}
          </div>
          {canAddGame && <Btn small onClick={() => setGames([...games, ["", ""]])}><i className="fa-solid fa-plus"></i>Thêm set</Btn>}
          <Btn tone="blue" className="!py-3" onClick={() => save()}><i className="fa-solid fa-check"></i>Lưu kết quả</Btn>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Bỏ cuộc</div>
            <div className="flex gap-2">
              <Btn small tone="red" className="flex-1 min-w-0" onClick={() => withdraw(match.entryA)}><span className="truncate">{label(match.entryA)}</span></Btn>
              <Btn small tone="red" className="flex-1 min-w-0" onClick={() => withdraw(match.entryB)}><span className="truncate">{label(match.entryB)}</span></Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
