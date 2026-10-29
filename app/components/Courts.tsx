"use client";
// Tab Sân: dạng lưới (thẻ sân) và dạng bảng. Mỗi sân là 1 component memo → khi 1 người chơi thay đổi,
// chỉ sân có người đó vẽ lại thay vì toàn bộ màn hình.
import { memo } from "react";
import type { MatchCategory } from "../../lib/matchmaking";
import type { Dict } from "../../lib/i18n";
import { CATEGORY_OPTIONS, MATCH_TYPES, neededFor, topCountOf, type CourtData, type MatchOutcome, type MatchType, type Player } from "../../lib/types";
import { GenderIcon, shallowPropsEqual } from "./ui";

export interface CourtActions {
  renameCourt: (court: CourtData) => void;
  changeMatchType: (courtId: number, type: MatchType) => void;
  changeCategory: (courtId: number, cat: MatchCategory) => void;
  generate: (courtId?: number) => void;
  startDrafting: (courtId: number) => void;
  cancelDrafting: (courtId: number) => void;
  toggleDraftPlayer: (courtId: number, p: Player) => void;
  startManual: (courtId: number) => void;
  finish: (courtId: number) => void;
  result: (courtId: number, outcome: MatchOutcome) => void;
}

interface CourtViewProps {
  t: Dict;
  court: CourtData;
  players: Player[];   // người chơi trên sân (theo thứ tự playerIds)
  draftPool: Player[]; // người đang rảnh hợp lệ để xếp tay (chỉ có khi sân đang xếp tay)
  label: string;       // tên sân
  catLabel: string;    // nhãn thể loại (trống nếu tự do)
  isHost: boolean;
  trackResults: boolean;
  actions: CourtActions;
}

const MATCH_ICON: Record<MatchType, string> = { '1v1': 'fa-regular fa-user', '1v2': 'fa-solid fa-user-group', '2v2': 'fa-solid fa-users' };

export const CourtCard = memo(function CourtCard({ t, court, players, draftPool, label, catLabel, isHost, trackResults, actions }: CourtViewProps) {
  const isGuest = !isHost;
  const topCount = topCountOf(court.matchType);
  const bottomCount = court.matchType === '1v1' ? 1 : 2;
  const neededPlayers = topCount + bottomCount;

  return (
    <div className="relative flex flex-col gap-2 w-[256px] shrink-0 snap-center">
      <button onClick={() => actions.renameCourt(court)} disabled={!isHost} title={isHost ? t.renameCourt : undefined} className="self-start bg-black text-white text-[11px] font-black uppercase px-2 py-0.5 border-2 border-black disabled:cursor-default max-w-full truncate">
        {label}{isHost && <i className="fa-solid fa-pen text-[8px] ml-1.5 text-yellow-300"></i>}
      </button>
      <div className="h-[380px] w-full bg-white neo-border p-1 relative flex flex-col shadow-md">

        {/* SÂN TRỐNG */}
        {court.status === 'available' && (
          <div className="bg-[#f8f9fa] w-full h-full border border-gray-200 flex flex-col justify-center items-center relative shadow-xs">
            {isHost && (
              <div className="absolute top-2 right-2 flex gap-1 z-20"><button className="p-1.5 bg-white border border-black hover:bg-gray-100 cursor-pointer"><i className="fa-solid fa-grip-vertical text-xs"></i></button><button className="p-1.5 bg-white border border-black text-red-500 hover:bg-red-50 cursor-pointer"><i className="fa-solid fa-trash-can text-xs"></i></button></div>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"><span className="text-[160px] font-black text-gray-200/60 leading-none select-none">{court.id}</span></div>
            <div className="text-center z-10 mb-6 mt-12"><h3 className="text-gray-400 font-bold tracking-[0.2em] text-[13px] leading-tight uppercase" dangerouslySetInnerHTML={{ __html: t.courtEmpty }}></h3></div>

            <div className="flex gap-1.5 z-10 mb-4">
              {MATCH_TYPES.map(type => (
                <button key={type} onClick={() => actions.changeMatchType(court.id, type)} disabled={isGuest} className={`flex items-center gap-1 px-2 py-1 border-2 border-black text-[10px] font-bold ${court.matchType === type ? 'bg-[#3b82f6] text-white shadow-[2px_2px_0_0_#000]' : 'bg-white text-gray-600'} ${isGuest ? 'opacity-50 cursor-not-allowed' : ''}`}><i className={MATCH_ICON[type]}></i> {type}</button>
              ))}
            </div>
            {court.matchType === '2v2' && (
              <div className="flex gap-1 z-10 -mt-2 mb-4">
                {CATEGORY_OPTIONS.map(cat => (
                  <button key={cat} onClick={() => actions.changeCategory(court.id, cat)} disabled={isGuest} className={`px-1.5 py-0.5 border-2 border-black text-[9px] font-bold ${(court.category || 'any') === cat ? 'bg-pink-300 text-black shadow-[1px_1px_0_0_#000]' : 'bg-white text-gray-600'} ${isGuest ? 'opacity-50 cursor-not-allowed' : ''}`}>{t.categories[cat]}</button>
                ))}
              </div>
            )}
            {isHost ? (
              <div className="w-[85%] flex flex-col gap-2 z-10">
                <button onClick={() => actions.generate(court.id)} className="w-full bg-[#3b82f6] text-white font-black tracking-wide border-2 border-black py-2 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all hover:bg-blue-500 text-[11px]">{t.start}</button>
                <button onClick={() => actions.startDrafting(court.id)} className="w-full bg-yellow-300 text-black font-black tracking-wide border-2 border-black py-1.5 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all hover:bg-yellow-200 text-[10px]"><i className="fa-solid fa-hand-pointer mr-1"></i>{t.manualSetup}</button>
              </div>
            ) : (
              <p className="text-[9px] font-bold text-gray-400 z-10 mt-4 italic">{t.guestWaitingDraft}</p>
            )}
          </div>
        )}

        {/* GIAO DIỆN XẾP TAY */}
        {court.status === 'drafting' && (
          <div className="bg-[#fef9c3] w-full h-full border-2 border-black flex flex-col relative shadow-xs p-3">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"><span className="text-[120px] font-black text-yellow-500/10 leading-none select-none">{court.id}</span></div>
            <h4 className="text-[11px] font-black uppercase mb-3 text-center border-b-[2px] border-black pb-1 z-10">{t.draftTitle} ({court.matchType}{catLabel && ` · ${catLabel}`})</h4>

            <div className="flex flex-col gap-1 mb-2 min-h-[50px] z-10">
              <div className="text-[9px] font-bold text-gray-500">{t.draftSelected} ({players.length}/{neededPlayers}):</div>
              <div className="flex flex-wrap gap-1">
                {players.map(p => (
                  <span key={p.id} onClick={() => actions.toggleDraftPlayer(court.id, p)} className="bg-[#3b82f6] text-white border-2 border-black px-2 py-1 text-[10px] font-bold cursor-pointer hover:bg-red-500 hover:line-through transition-colors flex items-center gap-1 shadow-[1px_1px_0_0_#000]">{p.name} <GenderIcon gender={p.gender} /> <i className="fa-solid fa-xmark text-[8px] ml-1"></i></span>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border-t-[2px] border-black pt-2 mb-3 custom-scrollbar z-10">
              <div className="text-[9px] font-bold text-gray-500 mb-1.5">{t.draftWaiting}:</div>
              <div className="flex flex-wrap gap-1.5">
                {draftPool.map(p => (
                  <span key={p.id} onClick={() => actions.toggleDraftPlayer(court.id, p)} className="bg-white border-2 border-black px-2 py-1 text-[10px] font-bold cursor-pointer hover:bg-green-300 transition-colors shadow-[1px_1px_0_0_#000]">{p.name} <GenderIcon gender={p.gender} /></span>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-auto z-10">
              <button onClick={() => actions.cancelDrafting(court.id)} className="flex-1 bg-white border-2 border-black py-2 text-[10px] font-black uppercase hover:bg-red-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all shadow-[2px_2px_0_0_#000]">{t.draftCancel}</button>
              <button onClick={() => actions.startManual(court.id)} className={`flex-1 border-2 border-black py-2 text-[10px] font-black uppercase active:translate-x-[2px] active:translate-y-[2px] transition-all shadow-[2px_2px_0_0_#000] ${players.length === neededPlayers ? 'bg-green-400 hover:bg-green-500 text-black active:shadow-none' : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none active:translate-x-0 active:translate-y-0'}`}>{t.draftStart}</button>
            </div>
          </div>
        )}

        {/* ĐANG ĐÁ (ACTIVE) & CHỜ KẾT QUẢ (SCORING) */}
        {(court.status === 'active' || court.status === 'scoring') && (
          <div className="bg-[#428259] w-full h-full border-2 border-black relative overflow-hidden flex flex-col py-1">
            {catLabel && <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 bg-pink-300 border-2 border-t-0 border-black px-2 text-[9px] font-black uppercase whitespace-nowrap">{catLabel}</div>}
            <div className="absolute inset-2 border-2 border-white/60 pointer-events-none"></div><div className="absolute left-0 right-0 top-1/2 border-t-[3px] border-dashed border-white transform -translate-y-1/2 z-0 pointer-events-none"></div><div className="absolute top-2 bottom-2 left-1/2 w-0.5 bg-white/60 transform -translate-x-1/2 pointer-events-none"></div>
            {isHost && <div className="absolute top-2 right-2 flex gap-1 bg-white neo-border p-0.5 z-20"><button onClick={() => actions.result(court.id, 0)} className="hover:bg-red-100 text-red-500 px-1 text-xs" title={t.cancelMatch}><i className="fa-solid fa-trash-can"></i></button></div>}

            {/* NỬA TRÊN: ĐỘI 1 */}
            <div className="flex-1 flex flex-col items-center justify-center relative bg-blue-400/80 mx-1 mt-1 mb-0.5 border-[2px] border-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]">
              <span className="absolute top-1 left-2 text-[9px] font-black text-white text-stroke-1">{t.team1Label}</span>
              <div className={`w-full grid ${topCount === 2 ? 'grid-cols-2' : 'grid-cols-1'} items-center justify-items-center z-10 px-2 gap-2`}>
                {players.slice(0, topCount).map(p => (<div key={p.id} className="bg-white border-2 border-blue-900 px-1 py-1.5 w-full max-w-[100px] text-center truncate font-black text-[12px] text-blue-900 shadow-[2px_2px_0_0_#1e3a8a]">{p.name} <GenderIcon gender={p.gender} /></div>))}
              </div>
            </div>

            {/* NÚT KẾT THÚC HOẶC CHỜ KẾT QUẢ */}
            {court.status === 'active' && isHost && (
              <button onClick={() => actions.finish(court.id)} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-400 border-2 border-black px-4 py-2 font-black text-[11px] uppercase z-20 shadow-[3px_3px_0_0_#000] hover:bg-yellow-300 active:scale-95 active:shadow-none transition-all">{t.finishMatch}</button>
            )}
            {court.status === 'scoring' && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white border-2 border-black px-3 py-1 font-black text-[10px] uppercase z-20 shadow-[2px_2px_0_0_#000]">{isHost ? t.waitingResult : t.guestScoringTag}</div>
            )}
            {court.status === 'active' && isGuest && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white border-2 border-black px-3 py-1 font-black text-[10px] uppercase z-20 shadow-[2px_2px_0_0_#000]">{t.guestActiveTag}</div>
            )}

            {/* NỬA DƯỚI: ĐỘI 2 */}
            <div className="flex-1 flex flex-col items-center justify-center relative bg-red-400/80 mx-1 mt-0.5 mb-1 border-[2px] border-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]">
              <span className="absolute bottom-1 right-2 text-[9px] font-black text-white text-stroke-1">{t.team2Label}</span>
              <div className={`w-full grid ${bottomCount === 2 ? 'grid-cols-2' : 'grid-cols-1'} items-center justify-items-center z-10 px-2 gap-2`}>
                {players.slice(topCount, topCount + bottomCount).map(p => (<div key={p.id} className="bg-white border-2 border-red-900 px-1 py-1.5 w-full max-w-[100px] text-center truncate font-black text-[12px] text-red-900 shadow-[2px_2px_0_0_#7f1d1d]">{p.name} <GenderIcon gender={p.gender} /></div>))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CHỌN ĐỘI THẮNG */}
      {court.status === 'scoring' && trackResults && isHost && (
        <div className="flex flex-col gap-1.5 w-full mt-1">
          <div className="flex gap-1.5">
            <button onClick={() => actions.result(court.id, 1)} className="flex-1 bg-blue-600 text-white rounded py-2 text-[10px] font-black border-[2px] border-black hover:bg-blue-500 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><i className="fa-solid fa-trophy text-yellow-300 mr-1"></i> {t.team1Win}</button>
            <button onClick={() => actions.result(court.id, 2)} className="flex-1 bg-red-500 text-white rounded py-2 text-[10px] font-black border-[2px] border-black hover:bg-red-400 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><i className="fa-solid fa-trophy text-yellow-300 mr-1"></i> {t.team2Win}</button>
          </div>
          <button onClick={() => actions.result(court.id, 0)} className="w-full bg-gray-200 text-gray-700 rounded py-1.5 text-[9px] font-bold border border-gray-400 hover:bg-gray-300">{t.cancelResult}</button>
        </div>
      )}
    </div>
  );
}, shallowPropsEqual);

export const CourtRow = memo(function CourtRow({ t, court, players, draftPool, catLabel, isHost, trackResults, actions }: CourtViewProps) {
  const isGuest = !isHost;
  const neededPlayers = neededFor(court.matchType);
  const top = topCountOf(court.matchType);

  return (
    <tr className={`border-b-[2px] border-dashed border-gray-300 transition-colors ${court.status === 'drafting' ? 'bg-[#fef9c3]' : court.status === 'scoring' ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
      <td className={`p-3 text-center font-black ${court.name ? 'text-sm' : 'text-xl'} ${isHost ? 'cursor-pointer' : ''}`} onClick={() => actions.renameCourt(court)}>{court.name || court.id}</td>

      <td className="p-3">
        {court.status === 'available' && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.courtEmptyTable}</span>
            <div className="flex gap-1">
              {MATCH_TYPES.map(type => (
                <button key={type} disabled={isGuest} onClick={() => actions.changeMatchType(court.id, type)} className={`px-2 py-0.5 border-2 border-black text-[9px] font-bold ${court.matchType === type ? 'bg-[#3b82f6] text-white' : 'bg-white text-gray-600'} ${isGuest ? 'opacity-50' : ''}`}>{type}</button>
              ))}
            </div>
            {court.matchType === '2v2' && (
              <div className="flex gap-1">
                {CATEGORY_OPTIONS.map(cat => (
                  <button key={cat} disabled={isGuest} onClick={() => actions.changeCategory(court.id, cat)} className={`px-1.5 py-0.5 border-2 border-black text-[9px] font-bold ${(court.category || 'any') === cat ? 'bg-pink-300 text-black' : 'bg-white text-gray-600'} ${isGuest ? 'opacity-50' : ''}`}>{t.categories[cat]}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {court.status === 'drafting' && <span className="text-[10px] font-bold text-yellow-600 uppercase bg-yellow-100 px-2 py-1 rounded-full border border-yellow-600">{t.draftTitle} ({court.matchType}{catLabel && ` · ${catLabel}`})</span>}
        {court.status === 'active' && <span className="text-[10px] font-bold text-green-600 uppercase bg-green-100 px-2 py-1 rounded-full border border-green-600">{t.playing} ({court.matchType}{catLabel && ` · ${catLabel}`})</span>}
        {court.status === 'scoring' && <span className="text-[10px] font-bold text-orange-600 uppercase bg-orange-100 px-2 py-1 rounded-full border border-orange-600">{isHost ? t.waitingResult : t.guestScoringTag}</span>}
      </td>

      <td className="p-3">
        {(court.status === 'active' || court.status === 'scoring') ? (
          <div className="flex items-center gap-4">
            <div className="font-black text-sm flex gap-2">
              {players.slice(0, top).map(p => <span key={p.id} className="bg-blue-100 text-blue-900 px-2 py-1 border-2 border-blue-600 min-w-max">{p.name} <GenderIcon gender={p.gender} /></span>)}
            </div>
            <span className="text-gray-400 font-black italic">VS</span>
            <div className="font-black text-sm flex gap-2">
              {players.slice(top).map(p => <span key={p.id} className="bg-red-100 text-red-900 px-2 py-1 border-2 border-red-600 min-w-max">{p.name} <GenderIcon gender={p.gender} /></span>)}
            </div>
          </div>
        ) : court.status === 'drafting' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-500">{t.draftSelected}:</span>
              <div className="flex flex-wrap gap-1">
                {players.map(p => <span key={p.id} onClick={() => actions.toggleDraftPlayer(court.id, p)} className="bg-[#3b82f6] text-white border border-black px-1.5 py-0.5 text-[10px] font-bold cursor-pointer hover:bg-red-500 hover:line-through">{p.name} <GenderIcon gender={p.gender} /></span>)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-500">{t.draftWaiting}:</span>
              <div className="flex flex-wrap gap-1 max-w-[400px]">
                {draftPool.map(p => <span key={p.id} onClick={() => actions.toggleDraftPlayer(court.id, p)} className="bg-white border border-black px-1.5 py-0.5 text-[10px] font-bold cursor-pointer hover:bg-green-200">{p.name} <GenderIcon gender={p.gender} /></span>)}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-gray-400 italic text-sm">-</span>
        )}
      </td>

      <td className="p-3 text-center">
        {court.status === 'available' && isHost && (
          <div className="flex flex-col gap-1 items-center">
            <button onClick={() => actions.generate(court.id)} className="bg-[#3b82f6] text-white font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[100px] hover:bg-blue-500 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.start}</button>
            <button onClick={() => actions.startDrafting(court.id)} className="bg-yellow-300 text-black font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[100px] hover:bg-yellow-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.manualSetup}</button>
          </div>
        )}
        {court.status === 'drafting' && isHost && (
          <div className="flex flex-col gap-1 items-center">
            <button onClick={() => actions.startManual(court.id)} className={`font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[100px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ${players.length === neededPlayers ? 'bg-green-400 text-black' : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'}`}>{t.draftStart}</button>
            <button onClick={() => actions.cancelDrafting(court.id)} className="bg-white text-black font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[100px] hover:bg-red-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.draftCancel}</button>
          </div>
        )}
        {court.status === 'active' && isHost && (
          <div className="flex flex-col gap-1 items-center justify-center">
            <button onClick={() => actions.finish(court.id)} className="bg-yellow-400 font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[120px] hover:bg-yellow-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.finishMatch}</button>
            <button onClick={() => actions.result(court.id, 0)} className="w-[120px] bg-gray-100 text-red-500 rounded py-1 mt-1 text-[9px] font-bold border border-gray-300 hover:bg-red-100">{t.cancelMatch}</button>
          </div>
        )}
        {court.status === 'scoring' && trackResults && isHost && (
          <div className="flex flex-col gap-1 items-center justify-center w-[150px]">
            <div className="flex gap-1 w-full">
              <button onClick={() => actions.result(court.id, 1)} className="flex-1 bg-blue-600 text-white text-[9px] font-black py-1.5 border-2 border-black shadow-[1px_1px_0_0_#000] hover:bg-blue-500 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">{t.team1Win}</button>
              <button onClick={() => actions.result(court.id, 2)} className="flex-1 bg-red-500 text-white text-[9px] font-black py-1.5 border-2 border-black shadow-[1px_1px_0_0_#000] hover:bg-red-400 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">{t.team2Win}</button>
            </div>
            <button onClick={() => actions.result(court.id, 0)} className="w-full bg-gray-100 text-gray-500 rounded py-1 mt-1 text-[9px] font-bold border border-gray-300 hover:bg-gray-200">{t.cancelResult}</button>
          </div>
        )}
      </td>
    </tr>
  );
}, shallowPropsEqual);

export const EmptyRoom = ({ t, roomPin, isHost, zoomLevel, onAddManually }: { t: Dict; roomPin: string; isHost: boolean; zoomLevel: number; onAddManually: () => void }) => (
  <div className="flex items-center justify-center h-full mt-20" style={{ zoom: zoomLevel ? 1 / zoomLevel : 1 }}>
    <div className="bg-white neo-border neo-shadow p-6 max-w-[280px] w-full text-center relative flex flex-col items-center">
      <i className="fa-solid fa-users-slash text-gray-400 text-3xl mb-2 text-stroke-1"></i>
      <h3 className="font-black text-sm uppercase mb-4 tracking-wide">{t.setupNeeded}</h3>
      <p className="text-[10px] font-bold text-gray-500 mb-4">{t.setupNeededDesc.replace('{pin}', roomPin)}</p>
      {isHost && <button onClick={onAddManually} className="w-full bg-yellow-400 border-2 border-black font-black uppercase text-[10px] py-2 shadow-[2px_2px_0_0_#000]">{t.manualAddBtn}</button>}
    </div>
  </div>
);

export const CourtsTable = ({ t, children }: { t: Dict; children: React.ReactNode }) => (
  <div className="w-full max-w-6xl mx-auto bg-white border-[3px] border-black shadow-[6px_6px_0_0_#000] p-4 mt-6 overflow-x-auto">
    <table className="w-full text-left border-collapse min-w-[800px]">
      <thead>
        <tr className="border-b-[3px] border-black text-xs font-black uppercase text-gray-700 bg-gray-100">
          <th className="p-3 w-16 text-center">{t.court}</th>
          <th className="p-3 w-32">{t.status}</th>
          <th className="p-3">{t.players}</th>
          <th className="p-3 text-center w-48">{t.action}</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

