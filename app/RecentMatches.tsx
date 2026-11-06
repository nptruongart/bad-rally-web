"use client";
// Các trận đã đánh trong phòng (tab Sân): chỉ để xem lại, không đổi gì việc xếp trận.
import { useState } from "react";
import { sessionTime, type SessionMatch } from "../lib/session";

const TEXT = {
  VI: { title: "Các trận đã đánh", more: "Xem thêm", noWinner: "không ghi đội thắng", empty: "Chưa có trận nào kết thúc." },
  EN: { title: "Finished matches", more: "Show more", noWinner: "no winner recorded", empty: "No finished matches yet." },
};
const PAGE = 10;

export default function RecentMatches({ matches, lang, variant }: { matches: SessionMatch[]; lang: "VI" | "EN"; variant: "modern" | "classic" }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const tx = TEXT[lang];
  const list = [...matches].reverse().slice(0, shown);
  const modern = variant === "modern";

  const team = (names: string[], won: boolean) => (
    <span className={modern ? (won ? "text-lime-300 font-semibold" : "text-slate-300") : (won ? "font-black" : "font-bold text-gray-600")}>
      {won && <i className={`fa-solid fa-trophy mr-1 text-[10px] ${modern ? "text-amber-300" : "text-yellow-500"}`}></i>}
      {names.join(" & ")}
    </span>
  );

  return (
    <section className={modern ? "mx-3 sm:mx-4 mt-5 mb-6 rounded-2xl bg-[#131a2b] border border-slate-800 text-slate-100" : "mx-3 sm:mx-4 mt-5 mb-6 bg-white border-[3px] border-black shadow-[4px_4px_0_0_#000]"}>
      <button onClick={() => setOpen(o => !o)} className={`w-full flex items-center gap-2 px-4 py-3 text-left ${modern ? "font-semibold" : "font-black uppercase text-sm"}`}>
        <i className={`fa-solid fa-clock-rotate-left ${modern ? "text-lime-400" : ""}`}></i>
        <span className="flex-1">{tx.title} ({matches.length})</span>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"} text-xs opacity-60`}></i>
      </button>
      {open && (
        <div className={modern ? "border-t border-white/[0.06]" : "border-t-[3px] border-black"}>
          {list.length === 0 && <p className={`px-4 py-4 text-sm ${modern ? "text-slate-500" : "text-gray-500"}`}>{tx.empty}</p>}
          {list.map((m, i) => (
            <div key={`${m.at}-${i}`} className={`flex gap-3 px-4 py-2.5 text-sm ${i > 0 ? (modern ? "border-t border-white/[0.04]" : "border-t border-gray-200") : ""}`}>
              <span className={`shrink-0 w-11 tabular-nums text-xs pt-0.5 ${modern ? "text-slate-500" : "text-gray-500 font-bold"}`}>{sessionTime(m.at)}</span>
              <div className="flex-1 min-w-0 leading-snug">
                <div>{team(m.a, m.w === 1)}</div>
                <div className={`text-[10px] uppercase tracking-wider ${modern ? "text-slate-600" : "text-gray-400 font-bold"}`}>vs</div>
                <div>{team(m.b, m.w === 2)}</div>
                {m.w === 0 && <div className={`text-[11px] italic ${modern ? "text-slate-500" : "text-gray-400"}`}>{tx.noWinner}</div>}
              </div>
            </div>
          ))}
          {matches.length > shown && (
            <button onClick={() => setShown(s => s + PAGE)} className={`w-full py-2.5 text-sm ${modern ? "text-lime-300 font-semibold border-t border-white/[0.06]" : "font-black uppercase border-t-[3px] border-black hover:bg-yellow-200"}`}>{tx.more}</button>
          )}
        </div>
      )}
    </section>
  );
}
