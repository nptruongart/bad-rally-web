"use client";
// Tổng kết giải: bục trao giải từng nội dung, số liệu chung, sao chép kết quả gửi nhóm; BTC kết thúc giải tại đây.
import { useState } from "react";
import { pb } from "../../lib/pb";
import type { TournamentData } from "../../lib/tournament/store";
import { eventPodium, tournamentStats, type Podium } from "../../lib/tournament/summary";
import { entryLabel } from "../../lib/tournament/view";
import { teamColor } from "./BtcTeamRot";
import { errText } from "./BtcSetup";
import { Btn, Card, Pill } from "./ui";

const MEDAL = ["🥇", "🥈", "🥉"];
const medal = (place: number) => MEDAL[place - 1] || `${place}.`;
const PLACE_NAME = ["Vô địch", "Á quân", "Hạng ba"];
const hhmm = (ms: number) => (ms ? new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "–");
const span = (a: number, b: number) => { if (!a || !b || b <= a) return "–"; const m = Math.round((b - a) / 60000); return m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`; };

export default function Summary({ data, isBtc }: { data: TournamentData; isBtc?: boolean }) {
  const [copied, setCopied] = useState(false);
  const { t } = data;
  const stats = tournamentStats(data.matches);
  const label = (id: string) => entryLabel(data.entries.find(e => e.id === id), data.participants);
  const person = (id: string) => data.participants.find(p => p.id === id)?.name || "?";
  const podiums = data.events.map(ev => ({ ev, p: eventPodium(ev, data.entries, data.matches, t.settings.walkover_mode) }));
  const allDone = stats.total > 0 && stats.done === stats.total;

  // Đoạn chữ dán vào nhóm Zalo
  const text = () => {
    const lines = [`🏆 KẾT QUẢ ${t.name.toUpperCase()}`];
    for (const { ev, p } of podiums) {
      if (!p.complete) continue;
      lines.push("", `▸ ${ev.name}`);
      if (p.teams) {
        p.teams.forEach(r => lines.push(`${medal(r.rank)} Bảng ${r.team}: ${r.won} điểm (HS ${r.diff > 0 ? "+" : ""}${r.diff})`));
        if (p.people?.length) lines.push(`Cá nhân: ${p.people.map(r => `${medal(r.rank)} ${person(r.person)} ${r.won} thắng`).join(", ")}`);
      } else p.places.forEach(pl => lines.push(`${medal(pl.place)} ${pl.entries.map(label).join(" / ")}`));
    }
    lines.push("", `${stats.done} trận · ${span(stats.start, stats.end)}`);
    return lines.join("\n");
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Sao chép đoạn này:", text()); }
  };
  const finish = async () => {
    if (!window.confirm("Kết thúc giải? Mọi người sẽ thấy phần tổng kết ở đầu trang giải.")) return;
    try { await pb.collection("tournaments").update(t.id, { status: "finished" }); } catch (e) { alert(errText(e)); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <i className="fa-solid fa-trophy text-3xl"></i>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{t.status === "finished" ? "Giải đã kết thúc" : allDone ? "Đã đánh xong mọi trận" : "Tổng kết tạm thời"}</div>
            <div className="font-bold text-lg leading-tight truncate">{t.name}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[[`${stats.done}/${stats.total}`, "Trận đã đấu"], [`${hhmm(stats.start)} – ${hhmm(stats.end)}`, "Bắt đầu – kết thúc"], [span(stats.start, stats.end), "Thời gian"]].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-white/40 px-2.5 py-2"><div className="font-bold tabular-nums text-sm leading-tight">{v}</div><div className="text-[11px] opacity-70 mt-0.5">{l}</div></div>
          ))}
        </div>
        {stats.walkover > 0 && <p className="text-xs mt-2 opacity-80">Trong đó {stats.walkover} trận xử thắng.</p>}
      </div>

      {isBtc && t.status !== "finished" && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-3 ${allDone ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
          <span className="flex-1">{allDone ? "Đã xong mọi trận. Kết thúc giải để mọi người thấy tổng kết." : `Còn ${stats.total - stats.done} trận chưa xong.`}</span>
          <Btn small tone={allDone ? "green" : "white"} onClick={finish}>Kết thúc giải</Btn>
        </div>
      )}

      {podiums.map(({ ev, p }) => <EventPodium key={ev.id} name={ev.name} p={p} label={label} person={person} />)}

      <Btn tone="blue" onClick={copy} disabled={!podiums.some(x => x.p.complete)}>
        <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`}></i>{copied ? "Đã sao chép" : "Sao chép kết quả (gửi nhóm Zalo)"}
      </Btn>
    </div>
  );
}

function EventPodium({ name, p, label, person }: { name: string; p: Podium; label: (id: string) => string; person: (id: string) => string }) {
  if (!p.complete) {
    return (
      <Card title={name} right={<Pill>{p.left ? `Còn ${p.left} trận` : "Chưa bốc thăm"}</Pill>}>
        <p className="text-sm text-slate-400">Kết quả sẽ có khi nội dung đánh xong.</p>
      </Card>
    );
  }
  if (p.teams) {
    return (
      <Card title={name} right={<Pill tone="green">Đã xong</Pill>}>
        <div className="flex flex-col gap-1.5">
          {p.teams.map(r => (
            <div key={r.team} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.rank === 1 ? "bg-amber-50 border border-amber-200" : "bg-slate-50"}`}>
              <span className="text-xl w-7 text-center">{medal(r.rank)}</span>
              <span className={`rounded-md px-2 py-0.5 text-sm font-bold ${teamColor(r.team)}`}>Bảng {r.team}</span>
              <span className="flex-1" />
              <span className="text-xs text-slate-500">HS {r.diff > 0 ? "+" : ""}{r.diff}</span>
              <span className="font-bold tabular-nums w-14 text-right">{r.won} điểm</span>
            </div>
          ))}
        </div>
        {!!p.people?.length && <>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mt-4 mb-1.5">Cá nhân xuất sắc</div>
          <div className="grid grid-cols-3 gap-2">
            {p.people.map(r => (
              <div key={r.person} className="rounded-xl border border-slate-200 px-2 py-2 text-center">
                <div className="text-xl">{medal(r.rank)}</div>
                <div className="text-sm font-bold truncate">{person(r.person)}</div>
                <div className="text-xs text-slate-500">Bảng {r.team} · {r.won} thắng · HS {r.diff > 0 ? "+" : ""}{r.diff}</div>
              </div>
            ))}
          </div>
        </>}
      </Card>
    );
  }
  return (
    <Card title={name} right={<Pill tone="green">Đã xong</Pill>}>
      <div className="flex flex-col gap-1.5">
        {p.places.flatMap(pl => pl.entries.map(id => (
          <div key={id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${pl.place === 1 ? "bg-amber-50 border border-amber-200" : "bg-slate-50"}`}>
            <span className="text-xl w-7 text-center">{medal(pl.place)}</span>
            <span className="flex-1 min-w-0 font-semibold text-slate-900 truncate">{label(id)}</span>
            <span className="text-xs text-slate-500 shrink-0">{PLACE_NAME[pl.place - 1] || `Hạng ${pl.place}`}</span>
          </div>
        )))}
      </div>
    </Card>
  );
}
