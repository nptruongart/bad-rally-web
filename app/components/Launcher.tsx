"use client";
// Màn hình khởi động. Hiệu ứng thị sai theo chuột ghi thẳng biến CSS (--mx/--my) bằng requestAnimationFrame
// → không vẽ lại cả ứng dụng mỗi lần chuột di chuyển như trước.
import { useEffect, useRef, type CSSProperties } from "react";
import type { Dict, Lang } from "../../lib/i18n";
import { LangToggle, ShuttlecockIcon } from "./ui";

const DROPS = [
  { left: '10%', delay: '0s', duration: '3.5s', size: 'w-10 h-10' },
  { left: '35%', delay: '1.2s', duration: '4s', size: 'w-14 h-14' },
  { left: '60%', delay: '2.5s', duration: '3.8s', size: 'w-8 h-8' },
  { left: '80%', delay: '0.5s', duration: '4.5s', size: 'w-12 h-12' },
  { left: '92%', delay: '1.8s', duration: '4.2s', size: 'w-10 h-10' },
];

const k = (kx: number, ky: number = kx) => ({ '--kx': kx, '--ky': ky }) as CSSProperties;

export default function Launcher({ t, lang, onToggleLang, onStart }: { t: Dict; lang: Lang; onToggleLang: () => void; onStart: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let frame = 0, x = 0, y = 0;
    const onMove = (e: MouseEvent) => {
      x = (e.clientX / window.innerWidth - 0.5) * 40;
      y = (e.clientY / window.innerHeight - 0.5) * 40;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        el.style.setProperty('--mx', x.toFixed(2));
        el.style.setProperty('--my', y.toFixed(2));
      });
    };
    el.addEventListener('mousemove', onMove, { passive: true });
    return () => { el.removeEventListener('mousemove', onMove); if (frame) cancelAnimationFrame(frame); };
  }, []);

  return (
    <div ref={rootRef} className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden z-10 bg-[#f3f4f6]" style={{ backgroundImage: 'var(--paper-texture)' }}>
      <LangToggle lang={lang} onToggle={onToggleLang} />

      {/* CÁC QUẢ CẦU LÔNG SVG RƠI TỪ TRÊN XUỐNG */}
      {DROPS.map((s, i) => (
        <div key={`drop-${i}`} className="shuttle-drop absolute bottom-[5%] z-0 pointer-events-none opacity-0" style={{ left: s.left, animation: `shuttleDrop ${s.duration} infinite ${s.delay}` }}>
          <ShuttlecockIcon className={s.size} />
        </div>
      ))}

      {/* HÌNH TRANG TRÍ BAY LƠ LỬNG */}
      <div className="parallax absolute top-[15%] right-[20%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-slow" style={k(2)}>
        <div className="w-28 h-28 bg-yellow-400 rounded-full border-[3px] border-black flex items-center justify-center text-center shadow-[4px_4px_0_0_#000] rotate-12">
          <span className="text-[10px] font-black uppercase leading-tight" dangerouslySetInnerHTML={{ __html: t.badge }}></span>
        </div>
      </div>
      <div className="parallax absolute top-[25%] left-[25%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-fast" style={k(-1.5)}>
        <div className="w-16 h-16 bg-purple-500 border-[3px] border-black flex items-center justify-center text-white text-3xl font-black shadow-[4px_4px_0_0_#000] -rotate-12">ツ</div>
      </div>
      <div className="parallax absolute bottom-[20%] left-[20%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-slow" style={k(3)}>
        <div className="w-12 h-12 bg-[#bbf7d0] rounded-full border-[3px] border-black shadow-[4px_4px_0_0_#000] flex items-center justify-center"><div className="w-6 h-1 bg-black rounded-full rotate-45 opacity-20"></div></div>
      </div>
      <div className="parallax absolute bottom-[25%] right-[25%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-fast" style={k(-2.5)}>
        <span className="text-6xl drop-shadow-[4px_4px_0_rgba(0,0,0,1)] rotate-45">🏸</span>
      </div>
      <div className="parallax absolute bottom-[10%] left-[45%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-slow" style={k(1, -1)}>
        <div className="w-14 h-14 bg-purple-500 border-[3px] border-black flex items-center justify-center text-white text-2xl font-black shadow-[4px_4px_0_0_#000] rotate-6">ダ</div>
      </div>

      <div className="parallax text-center z-20 transition-transform duration-300 ease-out" style={k(0.5)}>
        <h2 className="text-sm font-black bg-black text-white inline-block px-3 py-1 mb-4 uppercase tracking-widest shadow-[4px_4px_0_0_#facc15]">{t.tagline}</h2>
        <div className="flex flex-col items-center mb-8 relative">
          <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-[#3b82f6] text-stroke-3 text-shadow-hard relative z-10 -mb-6 transform -rotate-2">BAD</h1>
          <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-[#ff5e5e] text-stroke-3 text-shadow-hard relative z-20 transform rotate-2">RALLY</h1>
        </div>
        <div className="bg-white border-[3px] border-black shadow-[6px_6px_0_0_#000] p-5 max-w-sm mx-auto mb-8 relative">
          <p className="font-bold text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t.desc }}></p>
        </div>
        <button onClick={onStart} className="bg-yellow-400 border-[3px] border-black text-lg font-black uppercase tracking-widest py-4 px-12 shadow-[6px_6px_0_0_#000] hover:bg-yellow-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
          {t.startBtn} ➔
        </button>
      </div>

      {/* THẺ BẢN QUYỀN IDEAN Ở TRANG CHỦ */}
      <div className="absolute bottom-4 z-50 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 bg-white border-2 border-black shadow-[2px_2px_0_0_#000]">
        © {new Date().getFullYear()} by <span className="text-blue-600">iDean</span>
      </div>
    </div>
  );
}
