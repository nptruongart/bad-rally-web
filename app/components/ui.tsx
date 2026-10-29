// Các mảnh giao diện nhỏ dùng lại nhiều nơi
import { memo } from "react";
import { ALL_SKILLS, type Gender, type SkillLevel } from "../../lib/types";
import type { Dict, Lang } from "../../lib/i18n";

export const GenderIcon = ({ gender }: { gender?: Gender }) =>
  gender === 'F'
    ? <span className="text-pink-500 font-black ml-1 drop-shadow-[1px_1px_0_#fff]">♀</span>
    : <span className="text-blue-500 font-black ml-1 drop-shadow-[1px_1px_0_#fff]">♂</span>;

export const ShuttlecockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(3px 3px 0px rgba(0,0,0,1))' }}>
    <path d="M10 14L5 3L8 4L11 13" fill="white" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 14L19 3L16 4L13 13" fill="white" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 13V2" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6 7H18" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 10H16" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 22C14.2091 22 16 20.2091 16 18C16 15.7909 12 13 12 13C12 13 8 15.7909 8 18C8 20.2091 9.79086 22 12 22Z" fill="#facc15" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Nút đổi ngôn ngữ ở góc trên màn hình khởi động / chọn vai trò / vào phòng
export const LangToggle = ({ lang, onToggle }: { lang: Lang; onToggle: () => void }) => (
  <button onClick={onToggle} className="absolute top-4 right-4 z-50 bg-[#bfdbfe] border-[3px] border-black px-3 py-1 text-sm font-black shadow-[4px_4px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition-all">
    {lang === 'VI' ? '🇻🇳 VI' : '🇬🇧 EN'}
  </button>
);

// Chọn giới tính Nam / Nữ
export const GenderPicker = memo(function GenderPicker({ value, onChange, t, className = "flex gap-2", padding = "py-1.5" }: {
  value: Gender; onChange: (g: Gender) => void; t: Dict; className?: string; padding?: string;
}) {
  return (
    <div className={className}>
      <button onClick={() => onChange('M')} className={`flex-1 border-[3px] border-black ${padding} text-xs font-black uppercase transition-all flex items-center justify-center gap-1 ${value === 'M' ? 'bg-blue-300 shadow-[2px_2px_0_0_#000]' : 'bg-gray-100 hover:bg-gray-200'}`}><span className="text-blue-600 text-sm">♂</span> {t.male}</button>
      <button onClick={() => onChange('F')} className={`flex-1 border-[3px] border-black ${padding} text-xs font-black uppercase transition-all flex items-center justify-center gap-1 ${value === 'F' ? 'bg-pink-300 shadow-[2px_2px_0_0_#000]' : 'bg-gray-100 hover:bg-gray-200'}`}><span className="text-pink-500 text-sm">♀</span> {t.female}</button>
    </div>
  );
});

// Danh sách trình độ cho thẻ <select>
export const SkillOptions = ({ tSkill }: { tSkill: (s: SkillLevel) => string }) => (
  <>{ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}</>
);

// So sánh props nông; mảng thì so từng phần tử → thẻ chỉ vẽ lại khi dữ liệu của chính nó đổi
export function shallowPropsEqual<P extends object>(a: P, b: P): boolean {
  const ka = Object.keys(a) as (keyof P)[];
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const x = a[k], y = b[k];
    if (x === y) continue;
    if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i])) continue;
    return false;
  }
  return true;
}
