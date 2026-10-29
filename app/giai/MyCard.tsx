"use client";
// Thẻ "Của tôi" ở giải đấu + màn hình báo "TỚI LƯỢT BẠN" (chuông, rung, nháy tiêu đề) khi trận của tôi được gọi.
import { useEffect, useRef, useState } from "react";
import type { TournamentData } from "../../lib/tournament/store";
import { ackKey, myNextMatches, newCalls } from "../../lib/tournament/mine";
import { planQueue } from "../../lib/tournament/dispatch";
import { entryLabel } from "../../lib/tournament/view";
import { alertCalledToCourt, stopTitleFlash } from "../../lib/alerts";
import { Btn, Pill } from "./ui";

const nowMs = () => Date.now();
const readAcks = (key: string): string[] => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };

export default function MyCard({ data, myEntryIds, alertOnly }: { data: TournamentData; myEntryIds: string[]; alertOnly?: boolean }) {
  const storageKey = `badRallyAck:${data.t.code}`;
  const [acks, setAcks] = useState<string[]>(() => readAcks(storageKey));
  const rung = useRef<Set<string>>(new Set());
  const calls = newCalls(myEntryIds, data.matches, acks);
  const label = (id: string) => entryLabel(data.entries.find(e => e.id === id), data.participants);
  const evName = (id: string) => data.events.find(e => e.id === id)?.name || "";
  const courtName = (id: number) => data.t.courts.find(c => c.id === id)?.name || `Sân ${id}`;

  // Kêu chuông/rung một lần cho mỗi lần được gọi
  useEffect(() => {
    const fresh = calls.filter(m => !rung.current.has(ackKey(m)));
    if (fresh.length === 0) return;
    fresh.forEach(m => rung.current.add(ackKey(m)));
    alertCalledToCourt("🔔 TỚI LƯỢT BẠN!");
  }, [calls]);

  const ok = () => {
    const next = [...acks, ...calls.map(ackKey)].slice(-200);
    setAcks(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* bộ nhớ bị chặn */ }
    stopTitleFlash();
  };

  if (myEntryIds.length === 0) return null;
  const people: Record<string, string[]> = Object.fromEntries(data.entries.map(e => [e.id, [e.p1, e.p2]]));
  const { ready, blocked } = planQueue({ matches: data.matches, people, now: nowMs(), restMs: data.t.settings.rest_minutes * 60000 });
  const next = myNextMatches(myEntryIds, data.matches);
  // Trạng thái trận kế: chữ + tông màu cho chấm/nhãn
  const status = (m: (typeof next)[number]): [string, string] => {
    if (m.status === "called" || m.status === "playing") return [`Đang được gọi · ${courtName(m.court)}`, "live"];
    if (!m.entryA || !m.entryB) return ["Chờ kết quả vòng trước", "gray"];
    const i = ready.findIndex(r => r.id === m.id);
    if (i >= 0) return [i === 0 ? "Sắp tới lượt" : `Còn khoảng ${i} trận nữa`, i === 0 ? "amber" : "blue"];
    const b = blocked.find(x => x.match.id === m.id);
    if (b?.reason.kind === "rest") return ["Đang nghỉ giữa trận", "gray"];
    return ["Chờ sân / người đang đánh trận khác", "gray"];
  };

  return (
    <>
      {!alertOnly && (
        <div className="rounded-2xl bg-white border border-blue-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-600 text-white flex items-center gap-2 text-sm font-bold"><i className="fa-solid fa-user"></i>Trận của tôi</div>
          {next.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">Bạn không còn trận nào phải đánh.</p> : (
            <div className="divide-y divide-slate-100">
              {next.map(m => {
                const mine = myEntryIds.includes(m.entryA) ? m.entryA : m.entryB;
                const opp = mine === m.entryA ? m.entryB : m.entryA;
                const [text, tone] = status(m);
                return (
                  <div key={m.id} className={`px-4 py-3 ${tone === "live" ? "bg-red-50" : ""}`}>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{evName(m.event)} · {m.stage === "ko" ? "Nhánh" : `Vòng ${m.round}`}</span>
                      <Pill tone={tone as "live" | "amber" | "blue" | "gray"}>{text}</Pill>
                    </div>
                    <div className="mt-1 text-sm"><b className="text-slate-900">{label(mine)}</b> <span className="text-slate-400 mx-1">vs</span> <span className="text-slate-700">{opp ? label(opp) : "Chờ xác định"}</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {calls.length > 0 && (
        <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={ok}>
          <div className="bg-white rounded-3xl max-w-sm w-full text-center shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white px-6 pt-7 pb-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-white/15 inline-flex items-center justify-center text-3xl animate-bounce">🏸</div>
              <h2 className="mt-3 text-2xl font-bold">Tới lượt bạn!</h2>
              <p className="text-sm text-white/70">Mời ra sân thi đấu</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              {calls.map(m => (
                <div key={m.id}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{evName(m.event)}</p>
                  <p className="text-5xl font-extrabold text-blue-700 leading-tight">{courtName(m.court)}</p>
                  <p className="text-sm text-slate-700 mt-1"><b>{label(m.entryA)}</b> <span className="text-slate-400">vs</span> <b>{label(m.entryB)}</b></p>
                </div>
              ))}
              <Btn tone="blue" className="w-full !py-3 !text-base" onClick={ok}>OK, ra sân</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
