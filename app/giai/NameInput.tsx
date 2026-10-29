"use client";
// Ô nhập tên có gợi ý người đã có trong giải (tìm không dấu) → tránh tạo trùng người
import { useState } from "react";
import type { Participant } from "../../lib/tournament/store";
import { suggestNames } from "../../lib/tournament/names";
import { inputCls } from "./ui";

export default function NameInput({ value, onChange, picked, onPick, people, placeholder }: {
  value: string; onChange: (v: string) => void;
  picked: Participant | null; onPick: (p: Participant | null) => void;
  people: Participant[]; placeholder?: string;
}) {
  const [focus, setFocus] = useState(false);
  const hits = picked ? [] : suggestNames(value, people);
  if (picked) {
    return (
      <div className="flex items-center gap-2 border-[3px] border-black p-2 bg-green-50">
        <span className="flex-1 text-sm font-black"><i className="fa-solid fa-user-check mr-1 text-green-600"></i>{picked.name}</span>
        <button type="button" onClick={() => { onPick(null); onChange(""); }} className="text-xs font-black underline">Đổi</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
        maxLength={40} placeholder={placeholder} className={inputCls} />
      {focus && hits.length > 0 && (
        <div className="absolute z-20 left-0 right-0 bg-white border-[3px] border-t-0 border-black">
          <div className="text-[10px] font-bold text-gray-500 px-2 pt-1">Đã có trong giải — chọn để không tạo trùng:</div>
          {hits.map(p => (
            <button type="button" key={p.id} onMouseDown={e => e.preventDefault()} onClick={() => onPick(p)}
              className="block w-full text-left px-2 py-1.5 text-sm font-bold hover:bg-yellow-100">{p.name}{p.gender ? (p.gender === "M" ? " ♂" : " ♀") : ""}</button>
          ))}
        </div>
      )}
    </div>
  );
}
