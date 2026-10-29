"use client";
// Khối giao diện dùng chung cho trang Giải đấu (phong cách app thể thao: nền sáng, thẻ bo góc, nhấn xanh navy)
import type { ReactNode } from "react";

export function Btn({ children, onClick, tone = "white", small, disabled, type = "button", className = "" }: {
  children: ReactNode; onClick?: () => void; tone?: "white" | "yellow" | "blue" | "red" | "green" | "black";
  small?: boolean; disabled?: boolean; type?: "button" | "submit"; className?: string;
}) {
  const colors = {
    white: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    yellow: "bg-amber-400 text-slate-900 hover:bg-amber-300",
    blue: "bg-blue-600 text-white hover:bg-blue-700",
    red: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
    green: "bg-emerald-600 text-white hover:bg-emerald-700",
    black: "bg-slate-900 text-white hover:bg-slate-800",
  }[tone];
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`${colors} rounded-lg font-semibold inline-flex items-center justify-center gap-1.5 ${small ? "text-xs px-2.5 py-1.5" : "text-sm px-4 py-2.5"} shadow-sm active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>
      {children}
    </button>
  );
}

export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 pt-3.5 pb-2 flex justify-between items-center gap-2">
          <span className="text-sm font-bold text-slate-900 truncate">{title}</span>{right}
        </div>
      )}
      <div className={title ? "px-4 pb-4" : "p-4"}>{children}</div>
    </div>
  );
}

// variant "pill": chọn nội dung / nhóm lớn; "line": thanh gạch chân cho tab con
export function Tabs<T extends string>({ value, onChange, items, variant = "pill" }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; variant?: "pill" | "line" }) {
  if (variant === "line") {
    return (
      <div className="flex gap-5 border-b border-slate-200 overflow-x-auto [scrollbar-width:none]">
        {items.map(it => (
          <button key={it.id} onClick={() => onChange(it.id)}
            className={`shrink-0 -mb-px border-b-2 pb-2 pt-1 text-sm font-semibold whitespace-nowrap transition ${value === it.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {it.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {items.map(it => (
        <button key={it.id} onClick={() => onChange(it.id)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition ${value === it.id ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const PILL = {
  gray: "bg-slate-100 text-slate-600", blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-600", live: "bg-red-600 text-white",
} as const;
export function Pill({ tone = "gray", children, className = "" }: { tone?: keyof typeof PILL; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${PILL[tone]} ${className}`}>
      {tone === "live" && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
      {children}
    </span>
  );
}

export const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
