"use client";
// Nhập tỉ số khi kết thúc trận (không bắt buộc): đội nhiều điểm hơn thắng. Bấm nhanh "Đội 1/2 thắng" vẫn dùng được như cũ.
import { useState } from "react";
import { parseScore, type Score } from "../lib/score";

const TEXT = {
  VI: { label: "Tỉ số", save: "Lưu điểm", t1: "Đội 1", t2: "Đội 2", empty: "Nhập điểm cả 2 đội.", invalid: "Điểm là số từ 0 đến 99.", tie: "Hai đội bằng điểm, sửa lại tỉ số." },
  EN: { label: "Score", save: "Save", t1: "Team 1", t2: "Team 2", empty: "Enter both teams' points.", invalid: "Points must be 0–99.", tie: "Scores are tied, please fix." },
};
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 2);

export default function ScoreEntry({ lang, variant, compact, onSave }: {
  lang: "VI" | "EN"; variant: "modern" | "classic"; compact?: boolean; onSave: (score: Score, winner: 1 | 2) => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState("");
  const tx = TEXT[lang];
  const modern = variant === "modern";

  const save = () => {
    const r = parseScore(a, b);
    if (!r.ok) { setError(tx[r.error]); return; }
    setError("");
    onSave(r.s, r.w);
  };

  // Ô điểm viền xanh (đội 1) / đỏ (đội 2) giống vạch màu đội trên thẻ sân
  const box = modern
    ? `${compact ? "w-12 h-9" : "flex-1 min-w-0 h-11"} rounded-xl bg-[#0e1422] border text-center text-lg font-bold text-slate-100 tabular-nums focus:outline-none focus:border-lime-400 placeholder:text-slate-600`
    : `${compact ? "w-10 h-7 text-sm" : "flex-1 min-w-0 h-9 text-base"} bg-white border-2 text-center font-black tabular-nums focus:outline-none focus:bg-yellow-100 placeholder:text-gray-300`;
  const edge = (team: 1 | 2) => modern ? (team === 1 ? "border-blue-500/70" : "border-rose-500/70") : (team === 1 ? "border-blue-600" : "border-red-500");
  const input = (v: string, set: (x: string) => void, label: string, team: 1 | 2) => (
    <input value={v} onChange={e => { set(digits(e.target.value)); setError(""); }} onKeyDown={e => { if (e.key === "Enter") save(); }}
      inputMode="numeric" pattern="[0-9]*" maxLength={2} placeholder={label} aria-label={`${tx.label} ${label}`}
      className={`${box} ${edge(team)} ${modern ? "placeholder:text-xs placeholder:font-semibold" : "placeholder:text-[9px]"}`} />
  );

  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "flex flex-col gap-1"}>
      <div className="flex items-center gap-1.5">
        {input(a, setA, tx.t1, 1)}
        <span className={modern ? "text-slate-500 font-bold" : "font-black"}>–</span>
        {input(b, setB, tx.t2, 2)}
        <button onClick={save} disabled={!a || !b}
          className={modern
            ? `shrink-0 whitespace-nowrap rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-semibold text-sm ${compact ? "px-3 h-9" : "px-4 h-11"} disabled:opacity-30 active:scale-[0.98] transition`
            : `shrink-0 whitespace-nowrap bg-green-400 hover:bg-green-500 border-2 border-black font-black uppercase ${compact ? "text-[9px] px-2 h-7" : "text-[10px] px-3 h-9"} shadow-[2px_2px_0_0_#000] disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none`}>
          {tx.save}
        </button>
      </div>
      {error && <p className={modern ? "text-xs text-rose-300 text-center" : "text-[10px] font-bold text-red-600 text-center"}>{error}</p>}
    </div>
  );
}
