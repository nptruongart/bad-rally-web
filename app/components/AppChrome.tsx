"use client";
// Khung của màn hình chính: header, sidebar, thẻ "Của tôi", hộp thoại, thanh hoàn tác, thanh điều hướng
import { memo } from "react";
import type { Dict, Lang } from "../../lib/i18n";
import type { Court, LastResult, Player, Tab, UserRole } from "../../lib/types";

export const CalledModal = memo(function CalledModal({ t, courtLabel, teammates, opponents, onDismiss }: {
  t: Dict; courtLabel?: string; teammates: Player[]; opponents: Player[]; onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4" onClick={onDismiss}>
      <div className="bg-yellow-300 border-[4px] border-black p-8 max-w-sm w-full text-center shadow-[8px_8px_0_0_#000]">
        <div className="text-5xl mb-2">🏸</div>
        <h2 className="text-3xl font-black uppercase">{t.calledTitle}</h2>
        {courtLabel && <p className="text-5xl font-black text-blue-700 my-3">{t.calledCourt.replace('{court}', courtLabel)}</p>}
        {courtLabel && teammates.length > 0 && <p className="text-sm font-bold">{t.myTeammate}: {teammates.map(p => p.name).join(', ')}</p>}
        {courtLabel && <p className="text-sm font-bold">{t.myOpponents}: {opponents.map(p => p.name).join(', ')}</p>}
        <button onClick={onDismiss} className="mt-6 w-full bg-white border-[3px] border-black py-3 font-black uppercase shadow-[4px_4px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.calledOk}</button>
      </div>
    </div>
  );
});

export const KickedModal = ({ t, onClose }: { t: Dict; onClose: () => void }) => (
  <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
    <div className="bg-white border-[4px] border-black p-8 max-w-sm w-full text-center shadow-[8px_8px_0_0_#facc15] animate-bounce-short">
      <div className="w-16 h-16 bg-red-100 border-[3px] border-black rounded-full flex items-center justify-center mx-auto mb-4">
        <i className="fa-solid fa-person-walking-arrow-right text-red-600 text-3xl"></i>
      </div>
      <h2 className="text-xl font-black uppercase mb-2 text-red-600">{t.roomDeletedTitle}</h2>
      <p className="text-sm font-bold text-gray-700 mb-6">{t.roomDeletedAlert}</p>
      <button onClick={onClose} className="w-full bg-yellow-400 border-[3px] border-black py-3 font-black uppercase shadow-[4px_4px_0_0_#000] hover:bg-yellow-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
        OK
      </button>
    </div>
  </div>
);

const SidebarItem = ({ icon, bg, title, desc, onClick }: { icon: string; bg: string; title: string; desc: string; onClick?: () => void }) => (
  <button onClick={onClick} className="bg-white border-[3px] border-black rounded-lg p-3 text-left shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:shadow-none transition-all flex gap-3 items-center group">
    <div className={`w-8 h-8 rounded-full border-2 border-black ${bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}><i className={`fa-solid ${icon}`}></i></div>
    <div>
      <div className="font-black text-sm leading-tight">{title}</div>
      <div className="text-[9px] font-bold text-gray-700 mt-0.5 leading-tight">{desc}</div>
    </div>
  </button>
);

export const Sidebar = memo(function Sidebar({ t, open, userRole, roomPin, onClose, onShowQr, onShare, onExit }: {
  t: Dict; open: boolean; userRole: UserRole; roomPin: string;
  onClose: () => void; onShowQr: () => void; onShare: () => void; onExit: () => void;
}) {
  return (
    <div className={`fixed inset-0 z-[60] ${open ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose}></div>
      <div className={`absolute top-0 right-0 w-[320px] max-w-[85vw] h-full bg-[#f8f9fa] border-l-[3px] border-black transform transition-transform duration-300 ease-out flex flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b-[3px] border-black bg-white">
          <div className="flex items-center border-2 border-black rounded-full px-3 py-1 bg-yellow-100">
            <i className="fa-solid fa-circle-check text-yellow-500 mr-1 text-xs"></i>
            <span className="font-black text-xs text-blue-600">BAD</span><span className="font-black text-xs text-yellow-500">RALLY</span>
          </div>
          <div className="flex gap-3 items-center">
            <button onClick={onClose} className="text-xl font-black hover:text-red-500 transition-colors" aria-label="close"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto no-scrollbar flex-1">
          <div className="bg-black text-white p-3 font-black text-xs uppercase flex items-center justify-between shadow-[3px_3px_0_0_#facc15] mb-2">
            <span>Role: {userRole === 'host' ? t.hostRoleBadge : t.guestRoleBadge}</span>
            {userRole === 'host' && <span className="bg-white text-black px-2 py-0.5 text-[9px]">PIN: {roomPin}</span>}
          </div>

          {userRole === 'host' && <SidebarItem icon="fa-qrcode" bg="bg-[#bfdbfe]" title={t.sidebar.scrollTop} desc={t.sidebar.scrollTopDesc} onClick={onShowQr} />}
          <SidebarItem icon="fa-share-nodes" bg="bg-[#fef08a]" title={t.sidebar.share} desc={t.sidebar.shareDesc} onClick={onShare} />
          <SidebarItem icon="fa-headset" bg="bg-[#e5e7eb]" title={t.sidebar.contact} desc={t.sidebar.contactDesc} />

          <button onClick={onExit} className="bg-red-50 border-[3px] border-red-600 rounded-lg p-3 text-left shadow-[3px_3px_0_0_#dc2626] hover:bg-red-100 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#dc2626] active:shadow-none transition-all flex gap-3 items-center group mt-auto">
            <div className="w-8 h-8 rounded-full border-2 border-red-600 bg-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><i className="fa-solid fa-right-from-bracket text-red-600"></i></div>
            <div>
              <div className="font-black text-sm leading-tight text-red-700">{t.sidebar.exitRoom}</div>
              <div className="text-[9px] font-bold text-red-600 mt-0.5 leading-tight">{t.sidebar.exitRoomDesc}</div>
            </div>
          </button>
        </div>

        <div className="p-4 border-t-2 border-dashed border-gray-300 space-y-3 pb-8">
          <button className="flex items-center justify-between w-full text-[11px] font-bold text-gray-600 hover:text-black transition-colors"><span><i className="fa-regular fa-file-alt w-5 text-center"></i> {t.sidebar.terms}</span><i className="fa-solid fa-chevron-right text-[10px]"></i></button>
          <button className="flex items-center justify-between w-full text-[11px] font-bold text-gray-600 hover:text-black transition-colors"><span><i className="fa-solid fa-shield-halved w-5 text-center"></i> {t.sidebar.privacy}</span><i className="fa-solid fa-chevron-right text-[10px]"></i></button>
          <div className="pt-4 flex flex-col items-center justify-center gap-1 opacity-60">
            <div className="flex items-center border border-black rounded px-2 py-0.5 bg-yellow-100">
              <i className="fa-solid fa-circle-check text-yellow-500 mr-1 text-[8px]"></i>
              <span className="font-black text-[8px] text-blue-600">BAD</span><span className="font-black text-[8px] text-yellow-500">RALLY</span>
            </div>
            <span className="text-[9px] font-bold">{t.sidebar.version}</span>
            {/* THẺ BẢN QUYỀN IDEAN Ở TRONG SIDEBAR */}
            <span className="text-[9px] font-black mt-1 uppercase text-gray-400 tracking-widest">© {new Date().getFullYear()} by iDean</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export const AppHeader = memo(function AppHeader({ t, lang, userRole, roomPin, roomName, activeTab, viewMode, zoomLevel, onExit, onRenameRoom, onToggleView, onResetZoom, onZoom, onToggleLang, onOpenSidebar }: {
  t: Dict; lang: Lang; userRole: UserRole; roomPin: string; roomName: string; activeTab: Tab; viewMode: "grid" | "table"; zoomLevel: number;
  onExit: () => void; onRenameRoom: () => void; onToggleView: () => void; onResetZoom: () => void; onZoom: (delta: number) => void; onToggleLang: () => void; onOpenSidebar: () => void;
}) {
  return (
    <div className="bg-white border-b-[3px] border-black flex justify-between items-center p-2 sticky top-0 z-30 shadow-xs w-full">
      <button onClick={onExit} className="neo-btn bg-white px-3 py-1 text-sm rounded flex items-center shadow-[2px_2px_0_0_#000] border-2 border-black font-black"><i className="fa-solid fa-arrow-left mr-2"></i> Thoát</button>

      <div className="font-black text-lg flex items-center absolute left-1/2 transform -translate-x-1/2 flex-col leading-none mt-1">
        <div className="flex items-center"><i className="fa-solid fa-circle-check text-yellow-400 mr-1 text-stroke-1"></i><span className="text-blue-600 tracking-tighter">BAD</span><span className="text-yellow-400 tracking-tighter ml-1">RALLY</span></div>
        {roomName && <span onClick={onRenameRoom} className={`text-[10px] font-black text-gray-700 mt-1 max-w-[150px] truncate ${userRole === 'host' ? 'cursor-pointer' : ''}`}>{roomName}</span>}
        {userRole === 'host' && <span onClick={roomName ? undefined : onRenameRoom} className={`text-[8px] bg-yellow-400 px-1 border border-black mt-1 ${roomName ? '' : 'cursor-pointer'}`}>PIN: {roomPin}{!roomName && <i className="fa-solid fa-pen ml-1"></i>}</span>}
        {userRole === 'guest' && <span className="text-[8px] bg-blue-200 text-blue-800 px-1 border border-blue-600 mt-1">Mode: Guest</span>}
      </div>

      <div className="flex items-center gap-2">
        {activeTab === "courts" && (
          <button onClick={onToggleView} className="bg-white neo-border px-2 py-1 text-[10px] font-bold flex items-center gap-1 hover:bg-gray-100 hidden md:flex">
            <i className={`fa-solid ${viewMode === 'grid' ? 'fa-table-list' : 'fa-border-all'}`}></i> {viewMode === 'grid' ? t.tableView : t.gridView}
          </button>
        )}

        <button onClick={onResetZoom} className="bg-white neo-border px-2 py-1 text-[10px] font-bold flex items-center gap-1 hover:bg-gray-100 hidden md:flex">
          <i className="fa-solid fa-rotate-left"></i> {t.resetLayout}
        </button>

        <div className="hidden md:flex items-center text-xs font-bold mx-2 border-[2px] border-black bg-white rounded">
          <button onClick={() => onZoom(-0.1)} className="px-2 py-1 text-gray-600 hover:text-black hover:bg-gray-200">-</button>
          <span className="w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => onZoom(0.1)} className="px-2 py-1 text-gray-600 hover:text-black hover:bg-gray-200">+</button>
        </div>

        <button onClick={onToggleLang} className="bg-[#bfdbfe] border-2 border-black px-2 py-1 text-[10px] font-black shadow-[2px_2px_0_0_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all hidden sm:block">
          {lang === 'VI' ? '🇻🇳 VI' : '🇬🇧 EN'}
        </button>

        <button onClick={onOpenSidebar} className="hover:bg-gray-200 px-3 py-1 rounded transition-colors ml-2" aria-label="menu"><i className="fa-solid fa-ellipsis-vertical text-xl"></i></button>
      </div>
    </div>
  );
});

// Thẻ "Của tôi" cho khách: trạng thái, vị trí hàng chờ, sân đang đánh + nút Nghỉ / Sẵn sàng / Về
export const MyStatusCard = memo(function MyStatusCard({ t, me, courtLabel, courtCategory, courtScoring, teammates, opponents, queuePos, queueTotal, etaText, onToggleBreak, onLeave }: {
  t: Dict; me?: Player; courtLabel?: string; courtCategory: string; courtScoring: boolean; teammates: Player[]; opponents: Player[];
  queuePos: number; queueTotal: number; etaText: string; onToggleBreak: () => void; onLeave: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto mb-4 bg-white border-[3px] border-black shadow-[4px_4px_0_0_#000]">
      <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider flex justify-between items-center gap-2">
        <span className="truncate"><i className="fa-solid fa-user mr-1"></i>{t.myCardTitle}{me ? ` · ${me.name}` : ''}</span>
        {me && <span className="text-yellow-300 shrink-0">{me.playCount} {t.matchLabel} · {me.wins} {t.winLabel}</span>}
      </div>
      <div className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          {!me && <p className="text-sm font-bold text-gray-500">{t.myNotInList}</p>}
          {me && courtLabel && (
            <>
              <p className="font-black text-green-700 text-lg leading-tight"><i className="fa-solid fa-person-running mr-1"></i>{t.myPlaying.replace('{court}', courtLabel)}{courtCategory && <span className="ml-2 text-[10px] bg-pink-300 text-black border-2 border-black px-1.5 align-middle">{courtCategory}</span>}</p>
              {teammates.length > 0 && <p className="text-xs font-bold text-gray-700 mt-1">{t.myTeammate}: <span className="text-blue-700">{teammates.map(p => p.name).join(', ')}</span></p>}
              <p className="text-xs font-bold text-gray-700">{t.myOpponents}: <span className="text-red-600">{opponents.map(p => p.name).join(', ')}</span></p>
              {courtScoring && <p className="text-[10px] font-bold text-orange-600 mt-1">{t.myScoring}</p>}
            </>
          )}
          {me && !courtLabel && me.status === 'waiting' && (
            <>
              <p className="font-black text-lg leading-tight"><i className="fa-solid fa-hourglass-half mr-1 text-yellow-500"></i>{t.myWaiting.replace('{pos}', String(queuePos)).replace('{total}', String(queueTotal))}</p>
              <p className="text-xs font-bold text-gray-500 mt-1">{etaText}</p>
            </>
          )}
          {me && !courtLabel && me.status === 'break' && <p className="font-black text-lg text-gray-500 leading-tight"><i className="fa-solid fa-mug-hot mr-1"></i>{t.myOnBreak}</p>}
          {me && !courtLabel && me.status === 'playing' && <p className="font-black text-lg text-green-700 leading-tight"><i className="fa-solid fa-person-running mr-1"></i>{t.playing}</p>}
        </div>
        {me && (
          <div className="flex gap-2 shrink-0">
            {me.status !== 'playing' && (
              <button onClick={onToggleBreak} className={`border-2 border-black px-3 py-2 text-xs font-black uppercase shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ${me.status === 'break' ? 'bg-green-300' : 'bg-white'}`}><i className={`fa-solid ${me.status === 'break' ? 'fa-play' : 'fa-mug-hot'} mr-1`}></i>{me.status === 'break' ? t.btnReady : t.btnBreak}</button>
            )}
            <button onClick={onLeave} className="border-2 border-black px-3 py-2 text-xs font-black uppercase bg-red-100 text-red-700 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><i className="fa-solid fa-right-from-bracket mr-1"></i>{t.btnLeave}</button>
          </div>
        )}
      </div>
    </div>
  );
});

export const UndoBar = ({ t, lastResult, courtLabel, onUndo, onClose }: { t: Dict; lastResult: LastResult; courtLabel: string; onUndo: () => void; onClose: () => void }) => (
  <div className="fixed bottom-[152px] left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-md z-[55] bg-black text-white border-[3px] border-black shadow-[4px_4px_0_0_#facc15] flex items-center gap-2 px-3 py-2">
    <span className="flex-1 min-w-0 text-xs font-bold truncate"><i className="fa-solid fa-check text-green-400 mr-1"></i>{t.undoLabel.replace('{court}', courtLabel)}: {lastResult.winningTeam === 1 ? t.team1Win : lastResult.winningTeam === 2 ? t.team2Win : lastResult.winningTeam === 0 ? t.cancelMatch : t.undoFinished}</span>
    <button onClick={onUndo} className="shrink-0 bg-yellow-300 text-black border-2 border-white px-2 py-1 text-[11px] font-black uppercase"><i className="fa-solid fa-rotate-left mr-1"></i>{t.undoBtn}</button>
    <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-white px-1" aria-label="close"><i className="fa-solid fa-xmark"></i></button>
  </div>
);

export const NextGameFab = ({ t, onClick }: { t: Dict; onClick: () => void }) => (
  <div className="fixed bottom-24 right-8 flex flex-col gap-3 z-40">
    <button onClick={onClick} className="bg-[#facc15] border-2 border-black font-black px-6 py-3 rounded-full shadow-[4px_4px_0_0_#000] flex items-center justify-center gap-2 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition-all">
      <i className="fa-solid fa-shuffle"></i> {t.nextGame}
    </button>
  </div>
);

export const BottomNav = memo(function BottomNav({ t, activeTab, onChange }: { t: Dict; activeTab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "courts", icon: "fa-table-cells-large", label: t.navCourts },
    { id: "ranking", icon: "fa-trophy", label: t.navRanking },
    { id: "players", icon: "fa-users", label: t.navPlayers },
    { id: "settings", icon: "fa-gear", label: t.navSettings },
  ];
  return (
    <div className="bg-white border-t-[3px] border-black fixed bottom-0 w-full flex z-50">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)} className={`flex-1 py-3 flex flex-col items-center transition-all ${activeTab === tab.id ? "bg-yellow-300 border-t-[5px] border-black -mt-[2px]" : "text-gray-500 hover:bg-gray-100"}`}>
          <i className={`fa-solid ${tab.icon} text-xl mb-1 ${activeTab === tab.id ? "text-black" : ""}`}></i>
          <span className={`text-[10px] font-bold uppercase ${activeTab === tab.id ? "text-black" : ""}`}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
});

// Ghép cặp đội của khách (đồng đội / đối thủ) trên sân đang đánh
export function splitTeams(court: Court, meId: string) {
  const top = court.matchType === '2v2' ? 2 : 1;
  const team1 = court.players.slice(0, top), team2 = court.players.slice(top);
  const mine = team1.some(p => p.id === meId) ? team1 : team2;
  return { teammates: mine.filter(p => p.id !== meId), opponents: mine === team1 ? team2 : team1 };
}
