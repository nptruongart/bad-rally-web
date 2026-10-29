"use client";
// Tab Người chơi, Xếp hạng, Cài đặt
import { memo, useMemo, useState } from "react";
import type { Dict } from "../../lib/i18n";
import type { GameSettings, Gender, Player, PlayerStatus, ShuffleMode, SkillLevel, WeightKey } from "../../lib/types";
import { GenderIcon, GenderPicker, SkillOptions } from "./ui";

export interface PlayerActions {
  changeSkill: (p: Player, skill: SkillLevel) => void;
  toggleBreak: (p: Player) => void;
  linkClick: (playerId: string) => void;
  remove: (playerId: string) => void;
}

// Ô nhập người chơi mới (tên + trình độ + giới tính) — giữ state riêng để gõ phím không vẽ lại cả trang
export interface NewPlayerForm { name: string; skill: SkillLevel; gender: Gender }

const PlayerCard = memo(function PlayerCard({ t, tSkill, p, partnerName, isHost, isLinking, actions }: {
  t: Dict; tSkill: (s: SkillLevel) => string; p: Player; partnerName?: string; isHost: boolean; isLinking: boolean; actions: PlayerActions;
}) {
  return (
    <div className={`bg-white rounded-lg p-3 flex flex-col justify-between border-[3px] transition-all ${p.status === 'playing' ? 'border-green-500 bg-green-50' : 'border-black'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex gap-1 items-center">
          {isHost ? (
            // Chủ sân chạm vào trình độ để sửa (khách tự khai có thể chưa đúng)
            <span className="relative inline-flex items-center">
              <select value={p.skill} onChange={e => actions.changeSkill(p, e.target.value as SkillLevel)} title={t.editSkill} className="appearance-none bg-[#fcd34d] text-black text-[10px] font-bold pl-1.5 pr-4 py-0.5 border border-black rounded-[4px] cursor-pointer">
                <SkillOptions tSkill={tSkill} />
              </select>
              <i className="fa-solid fa-caret-down text-[8px] absolute right-1.5 pointer-events-none"></i>
            </span>
          ) : <span className="bg-[#fcd34d] text-black text-[10px] font-bold px-1.5 py-0.5 border border-black rounded-[4px]">{tSkill(p.skill)}</span>}
          <span className="bg-gray-200 text-gray-500 text-[10px] font-bold px-1.5 py-0.5 border border-gray-300 rounded-[4px]">{p.playCount}G</span>
        </div>
        {isHost && (
          <div className="flex gap-2 text-gray-400 text-xs">
            <i className={`fa-solid fa-mug-hot cursor-pointer ${p.status === 'break' ? 'text-black' : 'hover:text-black'}`} title={t.onBreak} onClick={() => actions.toggleBreak(p)}></i>
            <i className={`fa-solid fa-link cursor-pointer text-[10px] ${p.partnerId ? 'text-green-500' : isLinking ? 'text-blue-500 animate-pulse' : 'hover:text-black'}`} title={p.partnerId ? t.linkCancel : isLinking ? t.linking : t.linkFixed} onClick={() => actions.linkClick(p.id)}></i>
            <i className="fa-regular fa-trash-can hover:text-red-500 cursor-pointer" onClick={() => actions.remove(p.id)}></i>
          </div>
        )}
      </div>
      <div className="font-black text-[15px] truncate mt-1 text-gray-800 flex items-center flex-wrap gap-1">
        {p.name} <GenderIcon gender={p.gender} />
        {p.status === 'playing' && <span className="text-[10px] text-green-600 ml-1 italic">({t.playing})</span>}
        {p.partnerId && partnerName !== undefined && (
          <span className="text-[9px] text-green-700 bg-green-100 border border-green-400 px-1 rounded flex items-center gap-1 cursor-pointer hover:bg-red-100 hover:text-red-600 hover:border-red-400" title={t.linkCancel} onClick={() => { if (isHost) actions.linkClick(p.id); }}>
            <i className="fa-solid fa-link text-[8px]"></i> {partnerName}
          </span>
        )}
      </div>
    </div>
  );
});

type Filter = "all" | PlayerStatus;
type Sort = "status" | "name" | "games";
const STATUS_ORDER: Record<PlayerStatus, number> = { playing: 1, waiting: 2, break: 3 };

export const PlayersTab = memo(function PlayersTab({ t, tSkill, players, isHost, linkingPlayerId, actions, form, onFormChange, onAdd, onRemoveAll }: {
  t: Dict; tSkill: (s: SkillLevel) => string; players: Player[]; isHost: boolean; linkingPlayerId: string | null; actions: PlayerActions;
  form: NewPlayerForm; onFormChange: (patch: Partial<NewPlayerForm>) => void; onAdd: () => void; onRemoveAll: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("status");

  const counts = useMemo(() => {
    const c = { waiting: 0, playing: 0, break: 0 };
    for (const p of players) c[p.status]++;
    return c;
  }, [players]);
  const names = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players]);
  const shown = useMemo(() => players
    .filter(p => filter === 'all' || p.status === filter)
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "games") return b.playCount - a.playCount;
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.playCount - b.playCount;
    }), [players, filter, sort]);

  const filterBtn = (id: Filter, label: string, n: number) => (
    <button onClick={() => setFilter(id)} className={`px-4 py-1.5 rounded-full text-xs font-bold border ${filter === id ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>{label} ({n})</button>
  );

  return (
    <div className="max-w-6xl mx-auto w-full bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 mb-4">
        <div className="flex items-center gap-3 mb-2 md:mb-0">
          <h2 className="text-xl font-black uppercase">{t.members} ({players.length})</h2>
          <span className="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full text-xs border border-green-300">{players.length - counts.break} {t.active}</span>
        </div>
        {isHost && <button onClick={onRemoveAll} className="text-red-500 hover:text-red-700 font-bold text-sm flex items-center"><i className="fa-solid fa-trash-can mr-1"></i> {t.deleteAll}</button>}
      </div>

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {filterBtn('all', t.all, players.length)}
          {filterBtn('waiting', t.waiting, counts.waiting)}
          {filterBtn('playing', t.playing, counts.playing)}
          {filterBtn('break', t.onBreak, counts.break)}
        </div>

        <div className="flex items-center gap-2">
          <i className="fa-solid fa-arrow-down-short-wide text-gray-400"></i><span className="text-sm font-bold text-gray-500">{t.sortBy}</span>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="border-2 border-black rounded px-3 py-1 text-sm font-bold outline-none cursor-pointer">
            <option value="status">{t.sortStatus}</option><option value="name">{t.sortName}</option><option value="games">{t.sortGames}</option>
          </select>
        </div>
      </div>

      {isHost && (
        <div className="flex flex-col gap-3 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex flex-col md:flex-row gap-2">
            <input type="text" maxLength={40} className="neo-input text-sm flex-1 bg-white" placeholder={t.playerNamePlaceholder} value={form.name} onChange={e => onFormChange({ name: e.target.value })} onKeyDown={e => e.key === 'Enter' && onAdd()} />
            <div className="flex gap-2 w-full md:w-auto">
              <select className="neo-input text-sm bg-white cursor-pointer w-auto flex-1 md:flex-none" value={form.skill} onChange={e => onFormChange({ skill: e.target.value as SkillLevel })}>
                <SkillOptions tSkill={tSkill} />
              </select>
              <button onClick={onAdd} className="bg-[#fcd34d] border-2 border-black w-10 flex items-center justify-center font-black text-lg hover:bg-[#fbbf24]">+</button>
            </div>
          </div>
          {/* CHỌN GIỚI TÍNH BÊN HOST - TAB NGƯỜI CHƠI */}
          <GenderPicker value={form.gender} onChange={g => onFormChange({ gender: g })} t={t} className="flex gap-2 max-w-[200px]" padding="p-1.5" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {shown.map(p => (
          <PlayerCard key={p.id} t={t} tSkill={tSkill} p={p} partnerName={p.partnerId ? names.get(p.partnerId) : undefined} isHost={isHost} isLinking={linkingPlayerId === p.id} actions={actions} />
        ))}
        {shown.length === 0 && <div className="col-span-full text-center py-10 text-gray-400 font-bold">{t.noPlayers}</div>}
      </div>
    </div>
  );
});

export const RankingTab = memo(function RankingTab({ t, tSkill, players }: { t: Dict; tSkill: (s: SkillLevel) => string; players: Player[] }) {
  const ranked = useMemo(() => players.filter(p => p.playCount > 0).sort((a, b) => b.wins - a.wins || a.playCount - b.playCount), [players]);
  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="bg-white neo-border neo-shadow p-6">
        <div className="flex items-center gap-3 mb-6 border-b pb-4">
          <i className="fa-solid fa-trophy text-yellow-400 text-3xl text-stroke-1"></i><h2 className="text-2xl font-black uppercase tracking-tight">{t.leaderboard}</h2>
        </div>
        {ranked.length === 0 ? (
          <p className="text-center font-bold text-gray-500 py-10">{t.noMatchResults}</p>
        ) : (
          <div className="space-y-2">
            {ranked.map((p, index) => (
              <div key={p.id} className="flex justify-between items-center bg-gray-50 p-3 neo-border">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black border-2 border-black ${index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-gray-300' : index === 2 ? 'bg-[#cd7f32] text-white' : 'bg-white'}`}>{index + 1}</div>
                  <div>
                    <div className="font-black text-sm flex items-center">{p.name} <GenderIcon gender={p.gender} /></div>
                    <div className="text-[10px] uppercase font-bold text-gray-500">{tSkill(p.skill)}</div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div className="flex flex-col items-center"><span className="text-xs font-bold text-gray-500">{t.matchLabel}</span><span className="font-black">{p.playCount}</span></div>
                  <div className="flex flex-col items-center"><span className="text-xs font-bold text-yellow-600">{t.winLabel}</span><span className="font-black text-lg text-yellow-500">{p.wins}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const WEIGHT_KEYS: WeightKey[] = ['playCountFairness', 'waitTimePriority', 'avoidSamePartner', 'avoidSameOpponents', 'skillBalance', 'keepPreviousPair'];
const SHUFFLE_MODES: ShuffleMode[] = ['Equal Rotation', 'Skill Based', 'Social Mix', 'Fixed Pairs', 'Manual'];

export const GuestSettingsNotice = ({ t }: { t: Dict }) => (
  <div className="max-w-[420px] mx-auto w-full space-y-5">
    <div className="bg-yellow-50 border-[3px] border-yellow-500 p-6 text-center shadow-[4px_4px_0_0_#ca8a04]">
      <i className="fa-solid fa-lock text-3xl text-yellow-500 mb-2"></i>
      <h3 className="font-black text-lg text-yellow-700">{t.guestSettingsWarning}</h3>
      <p className="text-xs font-bold text-yellow-600 mt-2">{t.guestSettingsDesc}</p>
    </div>
  </div>
);

export function SettingsTab({ t, tSkill, settings, roomName, players, form, actions, onFormChange, onAdd }: {
  t: Dict; tSkill: (s: SkillLevel) => string; settings: GameSettings; roomName: string; players: Player[];
  form: NewPlayerForm; onFormChange: (patch: Partial<NewPlayerForm>) => void; onAdd: () => void;
  actions: {
    setRoomName: (v: string) => void; saveRoomName: (v: string) => void;
    updateSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
    updateWeight: (key: WeightKey, value: number) => void; setShuffleMode: (m: ShuffleMode) => void;
    apply: () => void; addGuests: () => void; removePlayer: (id: string) => void; resetCounts: () => void; resetEvent: () => void;
  };
}) {
  const [weightsOpen, setWeightsOpen] = useState(true);
  const manual = settings.shuffleMode === 'Manual';
  return (
    <div className="max-w-[420px] mx-auto w-full space-y-5">
      <div className="bg-white border-[3px] border-black flex flex-col mt-4">
        <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider">{t.gameSettings}</div>
        <div className="p-4 space-y-4">
          <div><label className="text-[10px] font-black uppercase mb-1 block">{t.roomNameLabel}</label><input type="text" maxLength={60} placeholder={t.roomNamePlaceholder} className="neo-input text-xs font-bold w-full p-2 border-2 border-black" value={roomName} onChange={(e) => actions.setRoomName(e.target.value)} onBlur={(e) => actions.saveRoomName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></div>
          <div>
            <label className="text-[10px] font-black uppercase mb-1 block">{t.totalCourts}</label>
            <div className="flex items-center gap-2"><button onClick={() => actions.updateSetting('totalCourts', Math.max(1, settings.totalCourts - 1))} className="bg-[#fcd34d] border-2 border-black w-6 h-6 flex justify-center items-center font-black text-xs">-</button><span className="font-black text-sm w-4 text-center">{settings.totalCourts}</span><button onClick={() => actions.updateSetting('totalCourts', Math.min(30, settings.totalCourts + 1))} className="bg-[#fcd34d] border-2 border-black w-6 h-6 flex justify-center items-center font-black text-xs">+</button></div>
          </div>
          <hr className="border-t-[2px] border-dashed border-gray-300" />
          <div>
            <label className="text-[10px] font-black uppercase mb-1 block">{t.shuffleMode}</label>
            <select className="neo-input text-xs font-bold bg-white w-full border-2 border-black p-1.5" value={settings.shuffleMode} onChange={(e) => actions.setShuffleMode(e.target.value as ShuffleMode)}>
              {SHUFFLE_MODES.map(m => <option key={m} value={m}>{t.shuffleModes[m]}</option>)}
            </select>
            <p className="text-[8px] text-gray-400 font-bold mt-1">{t.shuffleDescs[settings.shuffleMode]}</p>
          </div>
          <hr className="border-t-[2px] border-dashed border-gray-300" />
          <div className="flex justify-between items-center cursor-pointer" onClick={() => setWeightsOpen(o => !o)}>
            <label className="text-[10px] font-black uppercase cursor-pointer">{t.shuffleWeights}</label><i className={`fa-solid fa-chevron-${weightsOpen ? 'up' : 'down'} text-[10px]`}></i>
          </div>
          {weightsOpen && (
            <div className="space-y-4 mt-2">
              {WEIGHT_KEYS.map((key) => (
                <div key={key}>
                  <div className="flex justify-between text-[9px] font-bold mb-1"><span>{t.weights[key]}</span><span>{settings.weights[key]}</span></div>
                  <input type="range" disabled={!manual} className={`w-full h-1 rounded-lg appearance-none outline-none ${manual ? 'bg-black cursor-pointer' : 'bg-gray-300 cursor-not-allowed opacity-50'}`} min="0" max="100" value={settings.weights[key]} onChange={(e) => actions.updateWeight(key, parseInt(e.target.value))} />
                </div>
              ))}
            </div>
          )}
          <hr className="border-t-[2px] border-dashed border-gray-300" />
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-black uppercase">{t.trackResults}</label>
            <div role="switch" aria-checked={settings.trackMatchResults} className={`w-8 h-4 border-2 border-black rounded-full relative cursor-pointer ${settings.trackMatchResults ? 'bg-yellow-400' : 'bg-gray-200'}`} onClick={() => actions.updateSetting('trackMatchResults', !settings.trackMatchResults)}>
              <div className={`w-3 h-3 bg-black rounded-full absolute top-0.5 transition-all ${settings.trackMatchResults ? 'left-[16px]' : 'left-0.5'}`}></div>
            </div>
          </div>

          <button onClick={actions.apply} className="w-full bg-[#fcd34d] border-[2px] border-black py-2.5 text-[11px] font-black uppercase shadow-[2px_2px_0_0_#000] hover:bg-[#fbbf24] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 mt-4">
            <i className="fa-solid fa-cloud-arrow-up"></i> {t.applyChanges}
          </button>
        </div>
      </div>

      <div className="bg-white border-[3px] border-black flex flex-col">
        <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider">{t.addPlayersMenu}</div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase mb-1 block">{t.sortName}</label>
            <input type="text" maxLength={40} className="w-full border-2 border-black p-1.5 text-xs font-bold focus:outline-none focus:border-[3px] mb-2" placeholder={t.playerNamePlaceholder} value={form.name} onChange={e => onFormChange({ name: e.target.value })} onKeyDown={e => e.key === 'Enter' && onAdd()} />
            {/* CHỌN GIỚI TÍNH BÊN HOST - TAB CÀI ĐẶT */}
            <GenderPicker value={form.gender} onChange={g => onFormChange({ gender: g })} t={t} className="flex gap-2 mb-2" padding="p-1.5" />
          </div>

          <div className="flex gap-2">
            <select className="flex-1 border-2 border-black p-1.5 text-xs font-bold bg-white cursor-pointer" value={form.skill} onChange={e => onFormChange({ skill: e.target.value as SkillLevel })}>
              <SkillOptions tSkill={tSkill} />
            </select>
            <button onClick={onAdd} className="bg-[#fcd34d] border-2 border-black w-8 flex items-center justify-center font-black text-lg hover:bg-[#fbbf24]">+</button>
          </div>
          <button onClick={actions.addGuests} className="w-full bg-white border-2 border-black py-2 text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-gray-50">
            <i className="fa-solid fa-user-plus"></i> {t.quickAddGuests}
          </button>
          <div className="pt-2">
            <label className="text-[10px] font-black uppercase mb-2 block">{t.navPlayers} ({players.length})</label>
            <div className="border-2 border-black bg-gray-50 max-h-[180px] overflow-y-auto p-2 space-y-2 relative rounded-xs custom-scrollbar">
              {players.map(p => (
                <div key={p.id} className="border-2 border-black p-2 flex justify-between items-center bg-white rounded-md shadow-xs">
                  <div className="flex flex-col">
                    <div className="flex gap-1 mb-0.5">
                      <span className="bg-[#fcd34d] text-[8px] font-black px-1 border border-black rounded-[2px]">{tSkill(p.skill)}</span>
                      <span className="bg-gray-100 text-gray-500 text-[8px] font-black px-1 border border-gray-300 rounded-[2px]">{p.playCount}G</span>
                    </div>
                    <span className="font-black text-[11px] truncate max-w-[140px]">{p.name} <GenderIcon gender={p.gender} /></span>
                  </div>
                  <div className="flex gap-2.5 text-gray-300 pr-1">
                    <i className="fa-regular fa-trash-can hover:text-red-500 cursor-pointer text-[10px]" onClick={() => actions.removePlayer(p.id)}></i>
                  </div>
                </div>
              ))}
              {players.length === 0 && <p className="text-[10px] text-gray-400 font-bold text-center py-4">{t.noPlayers}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-[3px] border-black flex flex-col">
        <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider">{t.resetCountsTitle}</div>
        <div className="p-4">
          <p className="text-[9px] font-bold text-gray-500 mb-3 leading-relaxed">{t.resetCountsDesc}</p>
          <button onClick={actions.resetCounts} className="w-full bg-[#fcd34d] border-2 border-black py-2.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_#000] hover:bg-[#fbbf24] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
            {t.resetCountsBtn}
          </button>
        </div>
      </div>

      <div className="bg-white border-[3px] border-black flex flex-col mb-10">
        <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider bg-red-500 text-white">{t.dangerZone}</div>
        <div className="p-4">
          <button onClick={actions.resetEvent} className="w-full bg-[#ff5e5e] text-white border-2 border-black py-2.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_#000] hover:bg-red-500 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
            {t.resetEventBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
