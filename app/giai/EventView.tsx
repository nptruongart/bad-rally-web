"use client";
// Xem một nội dung: Lịch / Bảng xếp hạng / Nhánh (dùng cho cả khán giả, người chơi và BTC)
import { useState, type ReactNode } from "react";
import type { TournamentData, TEvent, TMatch } from "../../lib/tournament/store";
import { entryLabel, groupStandings, koRoundName } from "../../lib/tournament/view";
import { GROUP_KEYS } from "../../lib/tournament/draw";
import { Card, Pill, Tabs } from "./ui";
import { teamRotPersonStandings, teamRotTeamStandings } from "../../lib/tournament/teamrot";
import { teamColor } from "./BtcTeamRot";

// Nhãn vòng của một trận (vòng bảng / đồng đội xoay cặp); trận nhánh do nơi gọi tự ghi
export function stageLabel(m: TMatch, data: TournamentData): string {
  const ev = data.events.find(x => x.id === m.event);
  if (m.stage === "ko") return "Nhánh";
  if (ev?.format === "team_rot") return `Lượt ${m.round} · ${teamVs(m, data)}`;
  return ev?.format === "rr" ? `Vòng ${m.round}` : `Bảng ${m.group} · Vòng ${m.round}`;
}
const teamVs = (m: TMatch, data: TournamentData) => {
  const g = (id: string) => data.entries.find(e => e.id === id)?.group || "?";
  return `Bảng ${g(m.entryA)} vs ${g(m.entryB)}`;
};

export const scoreText = (m: TMatch) =>
  m.status === "walkover" ? "W/O" : m.scores.length ? m.scores.map(g => `${g[0]}-${g[1]}`).join(", ") : "";

const isLive = (m: TMatch) => m.status === "called" || m.status === "playing";
const isDone = (m: TMatch) => m.status === "done" || m.status === "walkover";

// Mô tả nguồn đội ở trận nhánh chưa có đội
function feedText(m: TMatch, side: "a" | "b", ko: TMatch[]): string {
  const f = m.feeds?.[side];
  if (!f) return "Chờ xác định";
  if ("group" in f) return `${f.place === 1 ? "Nhất" : "Nhì"} bảng ${f.group}`;
  const src = ko[f.match];
  const total = Math.max(...ko.map(x => x.round));
  return src ? `Thắng ${koRoundName(src.round, total).toLowerCase()} ${src.order + 1}` : "Chờ xác định";
}

export function StatusPill({ m, data }: { m: TMatch; data: TournamentData }) {
  const court = data.t.courts.find(c => c.id === m.court)?.name;
  if (isLive(m)) return <Pill tone="live">{court || "Đang đấu"}</Pill>;
  if (m.status === "walkover") return <Pill tone="amber">Xử thắng</Pill>;
  if (m.status === "done") return <Pill>Kết thúc</Pill>;
  return <Pill tone="gray" className="!bg-transparent !px-0 text-slate-400">Chưa đánh</Pill>;
}

// Thẻ trận dạng bảng điểm: 2 dòng đội, mỗi set một cột, đội thắng in đậm
export function MatchRow({ m, data, ko, highlight, caption, compact }: { m: TMatch; data: TournamentData; ko: TMatch[]; highlight?: boolean; caption?: ReactNode; compact?: boolean }) {
  const e = (id: string) => data.entries.find(x => x.id === id);
  const cap = caption ?? (m.stage === "group" ? stageLabel(m, data) : koRoundName(m.round, Math.max(...ko.map(x => x.round))));
  const line = (s: "a" | "b") => {
    const id = s === "a" ? m.entryA : m.entryB;
    const won = m.winner === s;
    const lost = isDone(m) && m.winner && !won;
    return (
      <div className={`flex items-center gap-2 ${compact ? "py-1" : "py-1.5"}`}>
        <span className={`w-1 self-stretch rounded-full ${won ? "bg-blue-600" : "bg-transparent"}`} />
        <span className={`flex-1 min-w-0 truncate ${compact ? "text-[13px]" : "text-sm"} ${won ? "font-bold text-slate-900" : lost ? "text-slate-400" : "font-medium text-slate-800"}`}>
          {id ? entryLabel(e(id), data.participants) : <span className="italic text-slate-400 font-normal">{feedText(m, s, ko)}</span>}
        </span>
        {m.status === "walkover" ? (
          <span className={`w-9 text-center text-xs font-bold ${won ? "text-blue-700" : "text-slate-300"}`}>{won ? "W" : "–"}</span>
        ) : m.scores.map((g, i) => {
          const mine = g[s === "a" ? 0 : 1], other = g[s === "a" ? 1 : 0];
          return <span key={i} className={`w-7 text-center tabular-nums ${compact ? "text-[13px]" : "text-sm"} ${mine > other ? "font-bold text-slate-900" : "text-slate-400"}`}>{mine}</span>;
        })}
      </div>
    );
  };
  return (
    <div className={`rounded-xl border ${highlight ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-200" : isLive(m) ? "border-red-200 bg-white" : "border-slate-200 bg-white"} ${compact ? "px-2.5 py-1.5" : "px-3 py-2"}`}>
      <div className="flex justify-between items-center gap-2 mb-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 truncate">{cap}</span>
        <StatusPill m={m} data={data} />
      </div>
      <div className="divide-y divide-slate-100">{line("a")}{line("b")}</div>
    </div>
  );
}

function Standings({ event, g, data, matches, myEntryIds }: { event: TEvent; g: string; data: TournamentData; matches: TMatch[]; myEntryIds: string[] }) {
  const rows = groupStandings(event, g, data.entries, matches, data.t.settings.walkover_mode);
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <Card title={event.format === "rr" ? "Bảng xếp hạng" : `Bảng ${g}`} right={event.format === "groups_ko" ? <span className="text-xs text-slate-400">Lấy {event.advance} đôi</span> : undefined}>
      <div className="-mx-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50 border-y border-slate-100">
              <th className="py-1.5 pl-4 pr-1 text-left font-semibold w-8">#</th>
              <th className="text-left font-semibold">Đôi</th>
              <th className="font-semibold w-8">Tr</th><th className="font-semibold w-8">T</th>
              <th className="font-semibold w-10">Set</th><th className="font-semibold w-12 pr-4">Điểm</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const e = data.entries.find(x => x.id === r.entry);
              const goes = event.format === "groups_ko" && r.rank <= (event.advance || 0);
              const out = e?.status === "withdrawn";
              return (
                <tr key={r.entry} className={`border-b border-slate-100 last:border-0 ${myEntryIds.includes(r.entry) ? "bg-blue-50/60" : ""} ${out ? "line-through text-slate-400" : "text-slate-800"}`}>
                  <td className="py-2 pl-4 pr-1">
                    <span className={`inline-flex w-6 h-6 items-center justify-center rounded-md text-xs font-bold ${goes ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>{r.rank}</span>
                    {r.byLot && <span title="Bốc thăm" className="text-amber-500 font-bold">*</span>}
                  </td>
                  <td className="font-semibold truncate max-w-[150px]">{entryLabel(e, data.participants)}</td>
                  <td className="text-center tabular-nums text-slate-500">{r.played}</td>
                  <td className="text-center tabular-nums font-bold">{r.won}</td>
                  <td className="text-center tabular-nums text-slate-500">{sign(r.gameDiff)}</td>
                  <td className="text-center tabular-nums text-slate-500 pr-4">{sign(r.pointDiff)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] text-slate-400">
        <span>Tr: trận · T: thắng · Set/Điểm: hiệu số</span>
        {event.format === "groups_ko" && <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />Vào vòng loại</span>}
        {rows.some(r => r.byLot) && <span className="text-amber-600">* Phân hạng bằng bốc thăm</span>}
      </div>
    </Card>
  );
}

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
const TH = "text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50 border-y border-slate-100";
const rankBadge = (rank: number, top: boolean) => <span className={`inline-flex w-6 h-6 items-center justify-center rounded-md text-xs font-bold ${top ? "bg-amber-400 text-slate-900" : "bg-slate-100 text-slate-500"}`}>{rank}</span>;

// Đồng đội xoay cặp: xếp hạng bảng theo tổng điểm + danh sách thành viên
function TeamTable({ event, data, matches }: { event: TEvent; data: TournamentData; matches: TMatch[] }) {
  const keys = GROUP_KEYS.slice(0, event.groups || 0);
  const entries = data.entries.filter(e => e.event === event.id);
  const rows = teamRotTeamStandings(keys, entries, matches);
  const members = (k: string) => entries.filter(e => e.group === k).sort((a, b) => a.seed - b.seed).map(e => data.participants.find(p => p.id === e.p1)?.name || "?");
  return (
    <>
      <Card title="Xếp hạng bảng" right={<span className="text-xs text-slate-400">Theo tổng điểm</span>}>
        <div className="-mx-4">
          <table className="w-full text-sm">
            <thead><tr className={TH}>
              <th className="py-1.5 pl-4 pr-1 text-left font-semibold w-8">#</th><th className="text-left font-semibold">Bảng</th>
              <th className="font-semibold w-8">Tr</th><th className="font-semibold w-8">T</th><th className="font-semibold w-14">Điểm</th><th className="font-semibold w-12 pr-4">HS</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.team} className="border-b border-slate-100 last:border-0 text-slate-800">
                  <td className="py-2 pl-4 pr-1">{rankBadge(r.rank, r.rank === 1 && r.played > 0)}</td>
                  <td><span className={`rounded-md px-2 py-0.5 font-bold ${teamColor(r.team)}`}>Bảng {r.team}</span></td>
                  <td className="text-center tabular-nums text-slate-500">{r.played}</td>
                  <td className="text-center tabular-nums text-slate-500">{r.won}</td>
                  <td className="text-center tabular-nums font-bold text-base">{r.pointsFor}</td>
                  <td className="text-center tabular-nums text-slate-500 pr-4">{sign(r.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Điểm: tổng điểm các cặp của bảng ghi được · bằng điểm xét số trận thắng (T), rồi hiệu số (HS)</p>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {keys.map(k => (
          <div key={k} className="rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className={`px-3 py-1.5 text-sm font-bold ${teamColor(k)}`}>Bảng {k}</div>
            <ol className="px-3 py-2 text-sm text-slate-700 space-y-0.5">{members(k).map((n, i) => <li key={i}><span className="text-xs text-slate-400 w-6 inline-block">{k}{i + 1}</span>{n}</li>)}</ol>
          </div>
        ))}
      </div>
    </>
  );
}

function PersonTable({ event, data, matches, myIds }: { event: TEvent; data: TournamentData; matches: TMatch[]; myIds: string[] }) {
  const [team, setTeam] = useState("");
  const rows = teamRotPersonStandings(data.entries.filter(e => e.event === event.id), matches).filter(r => !team || r.team === team);
  const keys = GROUP_KEYS.slice(0, event.groups || 0);
  return (
    <Card title="Xếp hạng cá nhân" right={
      <select value={team} onChange={e => setTeam(e.target.value)} className="rounded-lg border border-slate-200 text-xs px-2 py-1 bg-white">
        <option value="">Tất cả bảng</option>{keys.map(k => <option key={k} value={k}>Bảng {k}</option>)}
      </select>}>
      <div className="-mx-4">
        <table className="w-full text-sm">
          <thead><tr className={TH}>
            <th className="py-1.5 pl-4 pr-1 text-left font-semibold w-8">#</th><th className="text-left font-semibold">Người chơi</th>
            <th className="font-semibold w-8">Tr</th><th className="font-semibold w-8">T</th><th className="font-semibold w-12">Điểm</th><th className="font-semibold w-12 pr-4">HS</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.person} className={`border-b border-slate-100 last:border-0 text-slate-800 ${myIds.includes(r.person) ? "bg-blue-50/60" : ""}`}>
                <td className="py-2 pl-4 pr-1">{rankBadge(r.rank, r.rank <= 3 && r.played > 0)}</td>
                <td className="truncate max-w-[150px]"><span className={`rounded px-1.5 py-0.5 text-[11px] font-bold mr-1.5 ${teamColor(r.team)}`}>{r.team}</span><span className="font-semibold">{data.participants.find(p => p.id === r.person)?.name || "?"}</span></td>
                <td className="text-center tabular-nums text-slate-500">{r.played}</td>
                <td className="text-center tabular-nums text-slate-500">{r.won}</td>
                <td className="text-center tabular-nums font-bold">{r.pointsFor}</td>
                <td className="text-center tabular-nums text-slate-500 pr-4">{sign(r.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Sơ đồ nhánh: mỗi vòng một cột, trận vòng sau nằm giữa hai trận nuôi nó; kéo ngang trên điện thoại
function Bracket({ ko, data, mine }: { ko: TMatch[]; data: TournamentData; mine: (m: TMatch) => boolean }) {
  const rounds = Math.max(...ko.map(m => m.round));
  const final = ko.find(m => m.round === rounds);
  const champ = final && isDone(final) && final.winner ? (final.winner === "a" ? final.entryA : final.entryB) : "";
  return (
    <div className="flex flex-col gap-3">
      {champ && (
        <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 px-4 py-3 flex items-center gap-3 shadow-sm">
          <i className="fa-solid fa-trophy text-2xl"></i>
          <div><div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Vô địch</div><div className="font-bold">{entryLabel(data.entries.find(e => e.id === champ), data.participants)}</div></div>
        </div>
      )}
      <div className="overflow-x-auto -mx-3 px-3 pb-2">
        <div className="flex gap-4 min-w-max">
          {Array.from({ length: rounds }, (_, i) => i + 1).map(r => (
            <div key={r} className="w-[44vw] min-w-[160px] max-w-[230px] flex flex-col">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 text-center">{koRoundName(r, rounds)}</div>
              <div className="flex-1 flex flex-col justify-around gap-3">
                {ko.filter(m => m.round === r).map(m => (
                  <div key={m.id} className="relative">
                    <MatchRow m={m} data={data} ko={ko} highlight={mine(m)} caption={`Trận ${m.order + 1}`} compact />
                    {r < rounds && <span className="absolute top-1/2 -right-4 w-4 border-t border-slate-300" />}
                    {r > 1 && <span className="absolute top-1/2 -left-4 w-4 border-t border-slate-300" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {rounds >= 2 && <p className="text-xs text-slate-400">Hai đôi thua bán kết đồng hạng ba.</p>}
    </div>
  );
}

export default function EventView({ event, data, myEntryIds = [], myParticipantIds = [] }: { event: TEvent; data: TournamentData; myEntryIds?: string[]; myParticipantIds?: string[] }) {
  const [tab, setTab] = useState<"schedule" | "table" | "bracket" | "people">("schedule");
  const team = event.format === "team_rot";
  const [filter, setFilter] = useState<"all" | "live" | "todo" | "done">("all");
  const matches = data.matches.filter(m => m.event === event.id);
  const groupMatches = matches.filter(m => m.stage === "group").sort((a, b) => a.round - b.round || a.order - b.order);
  const ko = matches.filter(m => m.stage === "ko").sort((a, b) => a.round - b.round || a.order - b.order);
  const groups = event.format === "rr" ? ["A"] : GROUP_KEYS.slice(0, event.groups || 0);
  const approved = data.entries.filter(e => e.event === event.id && e.status === "approved");
  const mine = (m: TMatch) => myEntryIds.includes(m.entryA) || myEntryIds.includes(m.entryB);

  if (matches.length === 0) {
    return (
      <Card title={`${event.name}`} right={<Pill>{approved.length} đôi</Pill>}>
        {team ? <p className="text-sm text-slate-500">Đồng đội xoay cặp: danh sách các bảng sẽ hiện khi BTC công bố lịch.</p> : approved.length === 0 ? <p className="text-sm text-slate-500">Chưa có đôi nào được duyệt.</p> : (
          <ol className="divide-y divide-slate-100 -mx-4 border-y border-slate-100">
            {approved.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-500 text-xs font-bold inline-flex items-center justify-center">{i + 1}</span>
                <span className="font-medium text-slate-800">{entryLabel(e, data.participants)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-slate-400 mt-3"><i className="fa-regular fa-clock mr-1"></i>Lịch thi đấu sẽ có sau khi BTC bốc thăm.</p>
      </Card>
    );
  }

  const all = [...groupMatches, ...ko];
  const shown = all.filter(m => filter === "all" || (filter === "live" ? isLive(m) : filter === "done" ? isDone(m) : !isLive(m) && !isDone(m)));
  const liveCount = all.filter(isLive).length;
  const doneCount = all.filter(isDone).length;
  // Gom lịch theo nhóm hiển thị (Bảng A · Vòng 1 / Bán kết…)
  const sections: { key: string; title: string; items: TMatch[] }[] = [];
  for (const m of shown) {
    const title = team ? `Lượt ${m.round}` : m.stage === "group" ? (event.format === "rr" ? `Vòng ${m.round}` : `Vòng bảng · Lượt ${m.round}`) : koRoundName(m.round, Math.max(...ko.map(x => x.round)));
    const key = `${m.stage}-${m.round}`;
    const s = sections.find(x => x.key === key);
    if (s) s.items.push(m); else sections.push({ key, title, items: [m] });
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs variant="line" value={tab} onChange={setTab} items={[
        { id: "schedule", label: "Lịch thi đấu" },
        { id: "table", label: team ? "Xếp hạng bảng" : event.format === "rr" ? "Xếp hạng" : "Các bảng" },
        ...(team ? [{ id: "people" as const, label: "Cá nhân" }] : []),
        ...(ko.length ? [{ id: "bracket" as const, label: "Nhánh đấu" }] : []),
      ]} />

      {tab === "schedule" && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${(doneCount / all.length) * 100}%` }} /></div>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">{doneCount}/{all.length} trận</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {([["all", "Tất cả"], ["live", `Đang đấu${liveCount ? ` (${liveCount})` : ""}`], ["todo", "Sắp tới"], ["done", "Đã xong"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold border transition ${filter === id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"}`}>{label}</button>
            ))}
          </div>
          {sections.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Không có trận nào.</p>}
          {sections.map(s => (
            <div key={s.key} className="flex flex-col gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mt-1">{s.title}</div>
              {s.items.map(m => <MatchRow key={m.id} m={m} data={data} ko={ko} highlight={mine(m)} caption={team ? teamVs(m, data) : m.stage === "group" && event.format === "groups_ko" ? `Bảng ${m.group}` : `Trận ${m.order + 1}`} />)}
            </div>
          ))}
        </>
      )}

      {tab === "table" && team && <TeamTable event={event} data={data} matches={matches} />}
      {tab === "people" && <PersonTable event={event} data={data} matches={matches} myIds={myParticipantIds} />}
      {tab === "table" && !team && groups.map(g => <Standings key={g} event={event} g={g} data={data} matches={matches} myEntryIds={myEntryIds} />)}

      {tab === "bracket" && <Bracket ko={ko} data={data} mine={mine} />}
    </div>
  );
}
