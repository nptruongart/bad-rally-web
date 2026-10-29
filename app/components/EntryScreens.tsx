"use client";
// Các màn hình trước khi vào phòng: chọn vai trò, chủ sân mở phòng (mã QR), khách nhập mã vào phòng
import dynamic from "next/dynamic";
import type { Dict, Lang } from "../../lib/i18n";
import type { Gender, SkillLevel } from "../../lib/types";
import { GenderPicker, LangToggle, SkillOptions } from "./ui";

// Thư viện QR chỉ tải khi cần (giảm dung lượng JS lúc mở app)
const QrCode = dynamic(() => import("../QrCode"), { ssr: false, loading: () => <div className="w-48 h-48 bg-gray-100 animate-pulse" /> });
const QrScanner = dynamic(() => import("../QrScanner"), { ssr: false });

const screenBg = { backgroundImage: 'var(--paper-texture)' };

export function RoleSelect({ t, lang, onToggleLang, onHost, onGuest, onBack }: {
  t: Dict; lang: Lang; onToggleLang: () => void; onHost: () => void; onGuest: () => void; onBack: () => void;
}) {
  return (
    <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={screenBg}>
      <LangToggle lang={lang} onToggle={onToggleLang} />
      <div className="bg-white border-[4px] border-black p-8 shadow-[8px_8px_0_0_#000] max-w-md w-full mx-4 flex flex-col gap-6">
        <div className="text-center">
          <div className="flex items-center justify-center font-black text-2xl mb-2"><i className="fa-solid fa-circle-check text-yellow-400 mr-2 text-stroke-1"></i><span className="text-blue-600">BAD</span><span className="text-yellow-400">RALLY</span></div>
          <p className="font-bold text-gray-500">{t.roleSelectTitle}</p>
        </div>

        <button onClick={onHost} className="bg-blue-100 border-[3px] border-blue-600 p-6 flex flex-col items-center gap-3 hover:bg-blue-200 transition-colors shadow-[4px_4px_0_0_#2563eb] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
          <i className="fa-solid fa-house-laptop text-4xl text-blue-600"></i>
          <div className="text-center">
            <h3 className="font-black text-blue-900 uppercase">{t.hostRole}</h3>
            <p className="text-xs font-bold text-blue-700 mt-1">{t.hostDesc}</p>
          </div>
        </button>

        <button onClick={onGuest} className="bg-yellow-100 border-[3px] border-yellow-600 p-6 flex flex-col items-center gap-3 hover:bg-yellow-200 transition-colors shadow-[4px_4px_0_0_#ca8a04] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
          <i className="fa-solid fa-mobile-screen-button text-4xl text-yellow-600"></i>
          <div className="text-center">
            <h3 className="font-black text-yellow-900 uppercase">{t.guestRole}</h3>
            <p className="text-xs font-bold text-yellow-700 mt-1">{t.guestDesc}</p>
          </div>
        </button>
        <button onClick={onBack} className="text-gray-400 font-bold hover:text-black text-sm text-center mt-2"><i className="fa-solid fa-arrow-left mr-1"></i> {t.backBtn}</button>
      </div>
    </div>
  );
}

export function HostSetup({ t, roomPin, roomName, joinUrl, onRoomNameChange, onRoomNameCommit, onContinue }: {
  t: Dict; roomPin: string; roomName: string; joinUrl: string;
  onRoomNameChange: (v: string) => void; onRoomNameCommit: (v: string) => void; onContinue: () => void;
}) {
  return (
    <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={screenBg}>
      <div className="bg-white border-[4px] border-black p-8 shadow-[8px_8px_0_0_#000] max-w-sm w-full mx-4 flex flex-col items-center gap-6">
        <h2 className="font-black text-xl uppercase text-center border-b-4 border-yellow-400 pb-2">{t.roomCreated}</h2>

        <div className="text-center w-full">
          <p className="font-bold text-gray-500 text-xs mb-1">{t.roomPinLabel}</p>
          <div className="font-black text-5xl tracking-[0.2em] text-blue-600 bg-gray-100 py-3 border-2 border-dashed border-black">{roomPin}</div>
        </div>

        <div className="w-full -mt-2">
          <label className="font-bold text-gray-500 text-xs mb-1 block">{t.roomNameLabel}</label>
          <input type="text" maxLength={60} value={roomName} placeholder={t.roomNamePlaceholder} onChange={e => onRoomNameChange(e.target.value)} onBlur={e => onRoomNameCommit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-full border-[3px] border-black p-2 text-sm font-bold" />
        </div>

        <div className="border-4 border-black p-2 bg-white relative">
          <QrCode value={joinUrl} size={192} className="w-48 h-48" />
        </div>
        <p className="text-xs font-bold text-center text-gray-500">{t.qrDesc}</p>

        {/* THẺ BẢN QUYỀN IDEAN Ở TRANG QUÉT QR */}
        <p className="text-[10px] font-black bg-yellow-300 px-3 py-1 border-2 border-black -mt-4 z-10 shadow-[2px_2px_0_0_#000]">Powered by iDean</p>

        <button onClick={onContinue} className="w-full bg-[#fcd34d] border-[3px] border-black py-4 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] hover:bg-[#fbbf24] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.goToDashboard}</button>
      </div>
    </div>
  );
}

export function GuestJoin(props: {
  t: Dict; lang: Lang; onToggleLang: () => void; tSkill: (s: SkillLevel) => string;
  roomPin: string; onRoomPinChange: (v: string) => void;
  name: string; onNameChange: (v: string) => void;
  gender: Gender; onGenderChange: (g: Gender) => void;
  skill: SkillLevel; onSkillChange: (s: SkillLevel) => void;
  scannerOpen: boolean; onOpenScanner: () => void; onScanResult: (text: string) => void; onCloseScanner: () => void;
  busy: boolean; onJoin: () => void; onCancel: () => void;
}) {
  const { t } = props;
  return (
    <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={screenBg}>
      <LangToggle lang={props.lang} onToggle={props.onToggleLang} />
      <div className="bg-white border-[4px] border-black p-6 shadow-[8px_8px_0_0_#000] max-w-sm w-full mx-4 flex flex-col gap-4">
        <h2 className="font-black text-xl uppercase text-center border-b-4 border-yellow-400 pb-2">{t.joinMatch}</h2>

        <div>
          <label className="text-[11px] font-black uppercase mb-1 block">{t.pinLabel}</label>
          <input type="text" inputMode="numeric" autoComplete="off" maxLength={6} placeholder={t.pinPlaceholder} className="w-full border-[3px] border-black p-3 text-2xl tracking-widest text-center font-black focus:outline-none focus:bg-yellow-50" value={props.roomPin} onChange={e => props.onRoomPinChange(e.target.value)} />
          <button onClick={props.onOpenScanner} className="mt-2 w-full bg-[#bfdbfe] border-[3px] border-black py-2 text-xs font-black uppercase shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><i className="fa-solid fa-camera mr-2"></i>{t.scanQr}</button>
        </div>
        {props.scannerOpen && <QrScanner onResult={props.onScanResult} onClose={props.onCloseScanner} labels={{ title: t.scanTitle, hint: t.scanHint, cancel: t.scanCancel, noCamera: t.scanNoCamera }} />}

        <div>
          <label className="text-[11px] font-black uppercase mb-1 block">{t.yourNameLabel}</label>
          <input type="text" maxLength={40} placeholder={t.namePlaceholder} className="w-full border-[3px] border-black p-2 text-sm font-bold focus:outline-none focus:bg-yellow-50 mb-2" value={props.name} onChange={e => props.onNameChange(e.target.value)} />
          <GenderPicker value={props.gender} onChange={props.onGenderChange} t={t} />
        </div>

        <div>
          <label className="text-[11px] font-black uppercase mb-1 block">{t.skillLabel}</label>
          <select className="w-full border-[3px] border-black p-2 text-sm font-bold cursor-pointer bg-white" value={props.skill} onChange={e => props.onSkillChange(e.target.value as SkillLevel)}>
            <SkillOptions tSkill={props.tSkill} />
          </select>
        </div>

        <button onClick={props.onJoin} disabled={props.busy} className="w-full bg-[#3b82f6] text-white border-[3px] border-black py-4 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] hover:bg-blue-600 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all mt-2 disabled:opacity-60">{props.busy ? '...' : t.joinBtn}</button>
        <button onClick={props.onCancel} className="text-gray-400 font-bold hover:text-black text-sm text-center mt-2">{t.cancelBtn}</button>
      </div>
    </div>
  );
}
