"use client";
// Khối giao diện dùng chung cho trang Giải đấu (cùng phong cách neo-brutalist của app)
import type { ReactNode } from "react";

export function Btn({ children, onClick, tone = "white", small, disabled, type = "button", className = "" }: {
  children: ReactNode; onClick?: () => void; tone?: "white" | "yellow" | "blue" | "red" | "green" | "black";
  small?: boolean; disabled?: boolean; type?: "button" | "submit"; className?: string;
}) {
  const colors = {
    white: "bg-white text-black", yellow: "bg-[#fcd34d] text-black", blue: "bg-blue-600 text-white",
    red: "bg-red-500 text-white", green: "bg-green-500 text-white", black: "bg-black text-white",
  }[tone];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${colors} border-[3px] border-black font-black uppercase ${small ? "text-[10px] px-2 py-1 shadow-[2px_2px_0_0_#000]" : "text-xs px-3 py-2 shadow-[3px_3px_0_0_#000]"} active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );
}

export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border-[3px] border-black shadow-[4px_4px_0_0_#000] ${className}`}>
      {title && (
        <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider flex justify-between items-center gap-2">
          <span className="truncate">{title}</span>{right}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {items.map(it => (
        <button key={it.id} onClick={() => onChange(it.id)}
          className={`shrink-0 border-2 border-black px-3 py-1.5 text-[11px] font-black uppercase whitespace-nowrap ${value === it.id ? "bg-black text-white" : "bg-white hover:bg-gray-100"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full border-[3px] border-black p-2 text-sm font-bold bg-white focus:outline-none focus:bg-yellow-50";
