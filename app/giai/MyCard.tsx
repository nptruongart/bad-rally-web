"use client";
// Thẻ "Của tôi" ở giải đấu + màn hình báo "TỚI LƯỢT BẠN" (chuông, rung, nháy tiêu đề) khi trận của tôi được gọi.
import { useEffect, useRef, useState } from "react";
import type { TournamentData } from "../../lib/tournament/store";
import { ackKey, myNextMatches, newCalls } from "../../lib/tournament/mine";
import { planQueue } from "../../lib/tournament/dispatch";
import { entryLabel } from "../../lib/tournament/view";
import { alertCalledToCourt, stopTitleFlash } from "../../lib/alerts";
import { Btn, Card } from "./ui";

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
  const status = (m: (typeof next)[number]) => {
    if (m.status === "called" || m.status === "playing") return <span className="text-green-700">Đang được gọi: {courtName(m.court)}</span>;
    if (!m.entryA || !m.entryB) return <span className="text-gray-500">Chờ kết quả vòng trước</span>;
    const i = ready.findIndex(r => r.id === m.id);
    if (i >= 0) return <span>{i === 0 ? "Sắp tới lượt" : `Còn khoảng ${i} trận nữa`}</span>;
    const b = blocked.find(x => x.match.id === m.id);
    if (b?.reason.kind === "rest") return <span>Đang nghỉ giữa trận</span>;
    return <span className="text-gray-500">Chờ sân / người đang đánh trận khác</span>;
  };

  return (
    <>
      {!alertOnly && <Card title={<><i className="fa-solid fa-user mr-1"></i>Của tôi</>}>
        {next.length === 0 ? <p className="text-xs font-bold text-gray-500">Bạn không còn trận nào phải đánh.</p> : (
          <div className="flex flex-col gap-2">
            {next.map(m => {
              const mine = myEntryIds.includes(m.entryA) ? m.entryA : m.entryB;
              const opp = mine === m.entryA ? m.entryB : m.entryA;
              return (
                <div key={m.id} className={`border-2 border-black p-2 text-xs ${m.status === "called" ? "bg-green-50" : ""}`}>
                  <div className="text-[10px] font-black uppercase text-gray-500">{evName(m.event)} · {m.stage === "ko" ? "Nhánh" : `vòng ${m.round}`}</div>
                  <div className="font-bold">{label(mine)} <span className="text-gray-400">vs</span> {opp ? label(opp) : "?"}</div>
                  <div className="font-black mt-0.5">{status(m)}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>}

      {calls.length > 0 && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4" onClick={ok}>
          <div className="bg-yellow-300 border-[4px] border-black p-6 max-w-sm w-full text-center shadow-[8px_8px_0_0_#000]">
            <div className="text-5xl mb-2">🏸</div>
            <h2 className="text-3xl font-black uppercase">Tới lượt bạn!</h2>
            {calls.map(m => (
              <div key={m.id} className="mt-3">
                <p className="text-4xl font-black text-blue-700">{courtName(m.court)}</p>
                <p className="text-sm font-black">{evName(m.event)}</p>
                <p className="text-sm font-bold">{label(m.entryA)} vs {label(m.entryB)}</p>
              </div>
            ))}
            <Btn tone="white" className="mt-5 w-full" onClick={ok}>OK, ra sân</Btn>
          </div>
        </div>
      )}
    </>
  );
}
