"use client";
// BTC nhập / sửa tỉ số một trận (theo luật điểm của nội dung), hoặc ghi một đôi bỏ cuộc.
import { useState } from "react";
import type { TournamentData, TMatch } from "../../lib/tournament/store";
import type { GameScore } from "../../lib/tournament/types";
import { saveScore, withdrawPatches, type Patch } from "../../lib/tournament/actions";
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
    const r = saveScore({ match, scores, rule, eventMatches, uid, now: nowMs(), force });
    if (r.error) { alert(r.error); return; }
    if (r.needsConfirm) {
      if (window.confirm(`Tỉ số không đúng luật ${rule.points} điểm (trần ${rule.cap}). Vẫn lưu?`)) save(true);
      return;
    }
    onSave(r.patches);
  };
  const withdraw = (entryId: string) => {
    if (!window.confirm(`Ghi "${label(entryId)}" bỏ cuộc? Các trận chưa đánh của đôi này trong ${event.name} sẽ tính thắng xử ép cho đối thủ.`)) return;
    onWithdraw(entryId, withdrawPatches(entryId, eventMatches, nowMs()));
  };
  const set = (i: number, side: 0 | 1, v: string) => setGames(gs => gs.map((g, j) => (j === i ? (side === 0 ? [v.replace(/\D/g, "").slice(0, 2), g[1]] : [g[0], v.replace(/\D/g, "").slice(0, 2)]) : g)));

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white border-[4px] border-black shadow-[6px_6px_0_0_#facc15] w-full max-w-sm p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="text-[10px] font-black uppercase text-gray-500">{event.name}{court ? ` · ${court}` : ""} · {rule.games === 1 ? "1 set" : "2/3 set"} {rule.points} điểm</div>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-1 items-center">
          <span></span>
          {games.map((_, i) => <span key={i} className="text-[10px] font-black text-center w-12">Set {i + 1}</span>)}
          {Array.from({ length: 3 - games.length }, (_, i) => <span key={`x${i}`} />)}
          {(["a", "b"] as const).map((side, s) => (
            <div key={side} className="contents">
              <span className="text-sm font-black truncate">{label(side === "a" ? match.entryA : match.entryB)}</span>
              {games.map((g, i) => (
                <input key={i} value={g[s]} onChange={e => set(i, s as 0 | 1, e.target.value)} inputMode="numeric"
                  className="w-12 border-[3px] border-black text-center text-lg font-black p-1 focus:bg-yellow-50 focus:outline-none" />
              ))}
              {Array.from({ length: 3 - games.length }, (_, i) => <span key={`y${i}`} />)}
            </div>
          ))}
        </div>
        {canAddGame && <Btn small onClick={() => setGames([...games, ["", ""]])}>+ Thêm set</Btn>}
        <Btn tone="green" onClick={() => save()}>Lưu kết quả</Btn>
        <div className="flex gap-2">
          <Btn small tone="red" className="flex-1" onClick={() => withdraw(match.entryA)}>Đội trên bỏ cuộc</Btn>
          <Btn small tone="red" className="flex-1" onClick={() => withdraw(match.entryB)}>Đội dưới bỏ cuộc</Btn>
        </div>
        <Btn small onClick={onClose}>Đóng</Btn>
      </div>
    </div>
  );
}
