"use client";
// Lịch sử buổi chơi của chủ sân: danh sách buổi (mới nhất trước) → bấm vào xem xếp hạng + từng trận, sao chép gửi Zalo, xóa
import { useEffect, useState } from "react";
import Link from "next/link";
import type { RecordModel } from "pocketbase";
import { pb, ensureAuth, isHostAccount } from "../../lib/pb";
import { daysLeft, sessionDate, sessionText, sessionTime, type SessionSnapshot } from "../../lib/session";

type Row = SessionSnapshot & { id: string };

const toRow = (r: RecordModel): Row => ({
  id: r.id, roomName: r.room_name || "", pin: r.pin || "", startedAt: r.started_at || r.ended_at, endedAt: r.ended_at,
  players: r.data?.players || [], matches: r.data?.matches || [],
});
const duration = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`; };
const medal = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-400 text-orange-950"];

export default function SessionHistory() {
  const [state, setState] = useState<"loading" | "notHost" | "error" | "ready">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Row | null>(null);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureAuth();
        if (!isHostAccount()) { if (alive) setState("notHost"); return; }
        const list = await pb.collection("sessions").getFullList({ sort: "-ended_at" });
        if (!alive) return;
        setRows(list.map(toRow)); setNow(Date.now()); setState("ready");
      } catch (e) { console.error(e); if (alive) setState("error"); }
    })();
    return () => { alive = false; };
  }, []);

  const copy = async (s: Row) => {
    const txt = sessionText(s);
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Sao chép đoạn này:", txt); }
  };
  const remove = async (s: Row) => {
    if (!window.confirm(`Xóa buổi chơi ${s.roomName || "PIN " + s.pin} ngày ${sessionDate(s.startedAt)}? Không khôi phục được.`)) return;
    try { await pb.collection("sessions").delete(s.id); setRows(rs => rs.filter(r => r.id !== s.id)); setOpen(null); }
    catch (e) { console.error(e); alert("Không xóa được, thử lại sau."); }
  };

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-slate-100 overflow-x-clip">
      <div className="pointer-events-none fixed w-[480px] h-[480px] rounded-full bg-blue-600/20 blur-[110px] -top-48 -right-40"></div>
      <div className="relative max-w-2xl mx-auto px-4 pt-4 pb-16">
        <div className="flex items-center gap-3 mb-5">
          {open
            ? <button onClick={() => setOpen(null)} aria-label="Quay lại" className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/15 inline-flex items-center justify-center"><i className="fa-solid fa-arrow-left"></i></button>
            : <Link href="/" aria-label="Trang chủ" className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/15 inline-flex items-center justify-center"><i className="fa-solid fa-arrow-left"></i></Link>}
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{open ? (open.roomName || `PIN ${open.pin}`) : "Lịch sử buổi chơi"}</h1>
            <p className="text-xs text-slate-400">{open ? `${sessionDate(open.startedAt)} · ${sessionTime(open.startedAt)}–${sessionTime(open.endedAt)}` : "Kết quả các phòng đã đóng, tự xóa sau 30 ngày"}</p>
          </div>
        </div>

        {state === "loading" && <div className="space-y-2.5">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse"></div>)}</div>}
        {state === "notHost" && <Empty icon="fa-lock" title="Chỉ chủ sân mới có lịch sử buổi chơi" text="Máy này chưa có quyền chủ sân." />}
        {state === "error" && <Empty icon="fa-wifi" title="Không tải được lịch sử" text="Kiểm tra mạng rồi mở lại trang." />}
        {state === "ready" && !open && rows.length === 0 && <Empty icon="fa-clock-rotate-left" title="Chưa có buổi chơi nào" text="Khi chủ sân thoát phòng, kết quả buổi đó sẽ hiện ở đây trong 30 ngày." />}

        {/* DANH SÁCH BUỔI */}
        {state === "ready" && !open && rows.length > 0 && (
          <div className="space-y-2.5">
            {rows.map((s, i) => (
              <button key={s.id} onClick={() => setOpen(s)} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }} className="br-rise w-full text-left rounded-2xl bg-[#131a2b] border border-slate-800 hover:border-slate-600 p-4 flex items-center gap-3 transition">
                <div className="w-12 shrink-0 text-center">
                  <div className="text-xl font-bold leading-none tabular-nums">{sessionDate(s.startedAt).slice(0, 2)}</div>
                  <div className="text-[11px] text-slate-500 mt-1">th {sessionDate(s.startedAt).slice(3, 5)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{s.roomName || `PIN ${s.pin}`}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{sessionTime(s.startedAt)}–{sessionTime(s.endedAt)} · {s.matches.length} trận · {s.players.length} người</div>
                  {s.players[0] && <div className="text-xs text-amber-300 mt-1 truncate"><i className="fa-solid fa-trophy mr-1"></i>{s.players[0].name} · {s.players[0].wins} thắng</div>}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${daysLeft(s.endedAt, now) <= 5 ? "bg-rose-500/15 text-rose-300" : "bg-white/[0.06] text-slate-400"}`}>còn {daysLeft(s.endedAt, now)} ngày</span>
                  <div className="mt-2 text-slate-600"><i className="fa-solid fa-chevron-right text-xs"></i></div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* CHI TIẾT MỘT BUỔI */}
        {open && (
          <div className="br-fade space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[[open.matches.length, "trận"], [open.players.length, "người chơi"], [duration(open.endedAt - open.startedAt), "thời gian"]].map(([v, l]) => (
                <div key={String(l)} className="rounded-2xl bg-[#131a2b] border border-slate-800 px-3 py-2.5">
                  <div className="text-lg font-bold leading-tight">{v}</div>
                  <div className="text-[11px] text-slate-500">{l}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => copy(open)} className="flex-1 rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-semibold py-3"><i className={`fa-solid ${copied ? "fa-check" : "fa-copy"} mr-2`}></i>{copied ? "Đã sao chép" : "Sao chép gửi nhóm Zalo"}</button>
              <button onClick={() => remove(open)} aria-label="Xóa buổi chơi" className="w-12 rounded-full bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"><i className="fa-solid fa-trash-can"></i></button>
            </div>
            <p className="text-xs text-slate-500 -mt-2">Tự xóa sau {daysLeft(open.endedAt, now)} ngày nữa.</p>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Xếp hạng</h2>
              <div className="rounded-2xl bg-[#131a2b] border border-slate-800 divide-y divide-white/[0.05]">
                {open.players.length === 0 && <p className="px-4 py-5 text-sm text-slate-500">Chưa ai đánh trận nào.</p>}
                {open.players.map((p, i) => {
                  const rate = p.played ? Math.round((p.wins / p.played) * 100) : 0;
                  return (
                    <div key={`${p.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center text-xs font-bold ${medal[i] || "bg-white/[0.06] text-slate-400"}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{p.name} {p.gender === "F" ? <span className="text-pink-400">♀</span> : <span className="text-blue-400">♂</span>}</div>
                        <div className="flex items-center gap-2 mt-1"><div className="h-1 w-24 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-lime-400 rounded-full" style={{ width: `${rate}%` }}></div></div><span className="text-[11px] text-slate-500">{rate}%</span></div>
                      </div>
                      <div className="text-right tabular-nums"><span className="font-bold text-lime-400">{p.wins}</span><span className="text-xs text-slate-500"> / {p.played} trận</span></div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">Các trận ({open.matches.length})</h2>
              <div className="rounded-2xl bg-[#131a2b] border border-slate-800 divide-y divide-white/[0.05]">
                {open.matches.length === 0 && <p className="px-4 py-5 text-sm text-slate-500">Không có trận nào được ghi.</p>}
                {[...open.matches].reverse().map((m, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-11 shrink-0 text-xs text-slate-500 tabular-nums">{sessionTime(m.at)}</span>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      {([[m.a, 1, "bg-blue-500"], [m.b, 2, "bg-rose-500"]] as const).map(([team, side, bar]) => (
                        <div key={side} className={`flex items-center gap-2 ${m.w === side ? "font-bold text-lime-300" : m.w ? "text-slate-500" : ""}`}>
                          <span className={`w-1 h-3.5 shrink-0 rounded-full ${bar}`}></span>
                          <span className="truncate">{team.join(" · ")}</span>
                          {m.w === side && <i className="fa-solid fa-trophy text-[10px]"></i>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {open.matches.some(m => m.w === 0) && <p className="text-[11px] text-slate-500 mt-2">Trận không có cúp: không ghi đội thắng (hoặc ghi từ trước khi có tính năng này).</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-3xl bg-[#131a2b] border border-slate-800 py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-white/[0.06] text-slate-400 inline-flex items-center justify-center text-xl mb-3"><i className={`fa-solid ${icon}`}></i></div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-slate-400 mt-1">{text}</p>
    </div>
  );
}
