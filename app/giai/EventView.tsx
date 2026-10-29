"use client";
// Xem một nội dung: Lịch / Bảng xếp hạng / Nhánh (dùng cho cả khán giả, người chơi và BTC)
import { useState } from "react";
import type { TournamentData, TEvent, TMatch } from "../../lib/tournament/store";
import { entryLabel, groupStandings, koRoundName } from "../../lib/tournament/view";
import { GROUP_KEYS } from "../../lib/tournament/draw";
import { Card, Tabs } from "./ui";

export const scoreText = (m: TMatch) =>
  m.status === "walkover" ? "W/O" : m.scores.length ? m.scores.map(g => `${g[0]}-${g[1]}`).join(", ") : "";

const STATUS_TEXT: Record<TMatch["status"], string> = {
  pending: "Chưa đánh", ready: "Chưa đánh", called: "Đang gọi", playing: "Đang đánh", done: "Xong", walkover: "Xử thắng",
};

// Mô tả nguồn đội ở trận nhánh chưa có đội
function feedText(m: TMatch, side: "a" | "b", ko: TMatch[]): string {
  const f = m.feeds?.[side];
  if (!f) return "…";
  if ("group" in f) return `${f.place === 1 ? "Nhất" : "Nhì"} bảng ${f.group}`;
  const src = ko[f.match];
  const total = Math.max(...ko.map(x => x.round));
  return src ? `Thắng ${koRoundName(src.round, total).toLowerCase()} ${src.order + 1}` : "…";
}

export function MatchRow({ m, data, ko, highlight }: { m: TMatch; data: TournamentData; ko: TMatch[]; highlight?: boolean }) {
  const e = (id: string) => data.entries.find(x => x.id === id);
  const court = data.t.courts.find(c => c.id === m.court)?.name;
  const side = (id: string, s: "a" | "b") => (id ? entryLabel(e(id), data.participants) : <span className="text-gray-400 italic">{feedText(m, s, ko)}</span>);
  return (
    <div className={`border-2 border-black p-2 text-xs ${highlight ? "bg-yellow-100" : "bg-white"}`}>
      <div className="flex justify-between gap-2 text-[10px] font-black uppercase text-gray-500">
        <span>{m.stage === "group" ? (data.events.find(ev => ev.id === m.event)?.format === "rr" ? `Vòng ${m.round}` : `Bảng ${m.group} · vòng ${m.round}`) : ""}</span>
        <span className={m.status === "playing" || m.status === "called" ? "text-green-700" : ""}>{STATUS_TEXT[m.status]}{court && (m.status === "called" || m.status === "playing") ? ` · ${court}` : ""}</span>
      </div>
      <div className="flex justify-between gap-2 mt-1">
        <div className="min-w-0 font-bold">
          <div className={m.winner === "a" ? "text-blue-700" : ""}>{m.winner === "a" && "🏆 "}{side(m.entryA, "a")}</div>
          <div className={m.winner === "b" ? "text-blue-700" : ""}>{m.winner === "b" && "🏆 "}{side(m.entryB, "b")}</div>
        </div>
        <div className="shrink-0 font-black text-right self-center">{scoreText(m)}</div>
      </div>
    </div>
  );
}

export default function EventView({ event, data, myEntryIds = [] }: { event: TEvent; data: TournamentData; myEntryIds?: string[] }) {
  const [tab, setTab] = useState<"schedule" | "table" | "bracket">("schedule");
  const matches = data.matches.filter(m => m.event === event.id);
  const groupMatches = matches.filter(m => m.stage === "group").sort((a, b) => a.round - b.round || a.order - b.order);
  const ko = matches.filter(m => m.stage === "ko").sort((a, b) => a.round - b.round || a.order - b.order);
  const koRounds = ko.length ? Math.max(...ko.map(m => m.round)) : 0;
  const groups = event.format === "rr" ? ["A"] : GROUP_KEYS.slice(0, event.groups || 0);
  const approved = data.entries.filter(e => e.event === event.id && e.status === "approved");
  const mine = (m: TMatch) => myEntryIds.includes(m.entryA) || myEntryIds.includes(m.entryB);

  if (matches.length === 0) {
    return (
      <Card title={`${event.name} · ${approved.length} đôi`}>
        {approved.length === 0 ? <p className="text-xs font-bold text-gray-500">Chưa có đôi nào được duyệt.</p> : (
          <ol className="text-sm font-bold list-decimal pl-5 space-y-0.5">
            {approved.map(e => <li key={e.id}>{entryLabel(e, data.participants)}</li>)}
          </ol>
        )}
        <p className="text-[10px] font-bold text-gray-500 mt-2">Lịch thi đấu sẽ có sau khi BTC bốc thăm.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={tab} onChange={setTab} items={[
        { id: "schedule", label: "Lịch" },
        { id: "table", label: event.format === "rr" ? "Bảng xếp hạng" : "Các bảng" },
        ...(ko.length ? [{ id: "bracket" as const, label: "Nhánh" }] : []),
      ]} />

      {tab === "schedule" && (
        <div className="flex flex-col gap-2">
          {[...groupMatches, ...ko].map(m => <MatchRow key={m.id} m={m} data={data} ko={ko} highlight={mine(m)} />)}
        </div>
      )}

      {tab === "table" && groups.map(g => {
        const rows = groupStandings(event, g, data.entries, matches, data.t.settings.walkover_mode);
        return (
          <Card key={g} title={event.format === "rr" ? "Bảng xếp hạng" : `Bảng ${g}`}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-gray-500 text-left">
                  <th className="py-1">#</th><th>Đôi</th><th className="text-center">Tr</th><th className="text-center">T</th><th className="text-center">HS set</th><th className="text-center">HS điểm</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const e = data.entries.find(x => x.id === r.entry);
                  const goes = event.format === "groups_ko" && r.rank <= (event.advance || 0);
                  return (
                    <tr key={r.entry} className={`border-t border-gray-200 font-bold ${goes ? "bg-green-50" : ""} ${myEntryIds.includes(r.entry) ? "text-blue-700" : ""} ${e?.status === "withdrawn" ? "line-through text-gray-400" : ""}`}>
                      <td className="py-1">{r.rank}{r.byLot && <span title="Bốc thăm" className="text-orange-500">*</span>}</td>
                      <td className="truncate max-w-[140px]">{entryLabel(e, data.participants)}</td>
                      <td className="text-center">{r.played}</td><td className="text-center">{r.won}</td>
                      <td className="text-center">{r.gameDiff > 0 ? "+" : ""}{r.gameDiff}</td><td className="text-center">{r.pointDiff > 0 ? "+" : ""}{r.pointDiff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.some(r => r.byLot) && <p className="text-[10px] font-bold text-orange-600 mt-1">* Xếp hạng bằng bốc thăm (bằng hết các chỉ số)</p>}
          </Card>
        );
      })}

      {tab === "bracket" && Array.from({ length: koRounds }, (_, i) => i + 1).map(r => (
        <Card key={r} title={koRoundName(r, koRounds)}>
          <div className="flex flex-col gap-2">
            {ko.filter(m => m.round === r).map(m => <MatchRow key={m.id} m={m} data={data} ko={ko} highlight={mine(m)} />)}
          </div>
          {r === koRounds - 1 && <p className="text-[10px] font-bold text-gray-500 mt-2">Hai đôi thua bán kết đồng hạng ba.</p>}
        </Card>
      ))}
    </div>
  );
}
