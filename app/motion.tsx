"use client";
// Chuyển động cho màn phòng: màn mở đầu (cầu bay → logo), số đếm nhảy, rung nhẹ khi thao tác
import { useEffect, useRef, useState } from "react";

// Máy bật "giảm chuyển động" thì tắt hiệu ứng, trừ khi đã ép bật (localStorage br-motion = "on", hoặc mở link có ?motion=1)
if (typeof window !== "undefined") {
  try { if (/[?&]motion=1/.test(location.search)) localStorage.setItem("br-motion", "on"); } catch { /* chế độ riêng tư */ }
}
const forced = () => { try { return localStorage.getItem("br-motion") === "on"; } catch { return false; } };
const reduced = () => typeof window !== "undefined" && !forced() && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Gắn cờ ép bật hiệu ứng lên <html> sau khi trang đã chạy (gắn sớm hơn sẽ lệch hydration)
export function useMotionFlag() {
  useEffect(() => { if (forced()) document.documentElement.dataset.motion = "on"; }, []);
}

// Rung ngắn xác nhận thao tác (Android; iPhone không hỗ trợ rung từ web nên bỏ qua)
export const buzz = (ms: number | number[] = 12) => { try { navigator.vibrate?.(ms); } catch { /* không hỗ trợ */ } };

// Số chạy từ giá trị cũ tới giá trị mới (lần đầu chạy từ 0)
export function AnimNum({ value, ms = 700 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { from.current = value; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, ms]);
  return <>{reduced() ? value : shown}</>;
}

// Quả cầu lông vẽ bằng SVG (đế tròn + chùm lông hình nón)
export function Shuttle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M22 10 L42 10 L37 40 L27 40 Z" fill="#f8fafc" opacity=".95" />
      <path d="M27 10 L29 40 M32 10 L32 40 M37 10 L35 40" stroke="#94a3b8" strokeWidth="1.2" />
      <path d="M23.5 19 L40.5 19 M25 28 L39 28" stroke="#cbd5e1" strokeWidth="1" />
      <rect x="26" y="39" width="12" height="4" rx="1.5" fill="#a3e635" />
      <path d="M26 43 h12 a6 6 0 0 1 -12 0 Z" fill="#fde68a" />
    </svg>
  );
}

// Màn mở đầu khi vào phòng: mỗi phiên chỉ chạy 1 lần, chạm để bỏ qua
export function RoomIntro({ title }: { title?: string }) {
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined" || reduced()) return false;
    try { return !sessionStorage.getItem("br-intro"); } catch { return true; /* chế độ riêng tư */ }
  });
  // Gắn cờ ép bật cho CSS sau khi trang đã chạy (gắn sớm hơn sẽ lệch hydration của thẻ <html>)
  useEffect(() => { if (forced()) document.documentElement.dataset.motion = "on"; }, []);
  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem("br-intro", "1"); } catch { /* chế độ riêng tư */ }
    const id = setTimeout(() => setShow(false), 1900);
    return () => clearTimeout(id);
  }, [show]);
  if (!show) return null;
  return (
    <div onClick={() => setShow(false)} className="br-intro fixed inset-0 z-[200] bg-[#0b0f1a] flex flex-col items-center justify-center overflow-hidden cursor-pointer">
      <div className="absolute w-[420px] h-[420px] rounded-full bg-blue-600/40 blur-[90px] -top-40 -right-40 br-glow" />
      <div className="absolute w-[360px] h-[360px] rounded-full bg-lime-400/20 blur-[90px] -bottom-40 -left-32 br-glow" />
      <Shuttle className="br-intro-shuttle w-16 h-16 absolute" />
      <div className="relative mt-24 text-center">
        <div className="br-intro-word text-5xl font-black tracking-tight">
          <span className="text-white">BAD</span> <span className="text-lime-400">RALLY</span>
        </div>
        <div className="br-intro-line h-[3px] mx-auto mt-3 rounded-full bg-lime-400" />
        {title && <div className="br-intro-sub mt-3 text-sm text-slate-400">{title}</div>}
      </div>
    </div>
  );
}
