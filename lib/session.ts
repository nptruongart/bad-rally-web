// Buổi chơi: ảnh chụp kết quả của một phòng lúc chủ sân thoát (xếp hạng + từng trận), lưu 30 ngày
import type { MatchRecord } from './matchmaking.ts';

export const SESSION_TTL_DAYS = 30;
const DAY = 86_400_000;

export interface SessionPlayer { name: string; gender?: 'M' | 'F'; skill: string; played: number; wins: number }
export interface SessionMatch { a: string[]; b: string[]; w: 0 | 1 | 2; at: number }
export interface SessionSnapshot {
  roomName: string; pin: string; startedAt: number; endedAt: number;
  players: SessionPlayer[]; matches: SessionMatch[];
}

type RoomPlayer = { id: string; name: string; gender?: 'M' | 'F'; skill: string; playCount: number; wins: number };

// Các trận theo thứ tự thời gian, có tên (ưu tiên tên lúc đánh) và đội thắng
export function sessionMatches(history: MatchRecord[], players: { id: string; name: string }[]): SessionMatch[] {
  const nameOf = new Map(players.map(p => [p.id, p.name]));
  const names = (ids: string[], saved?: string[]) => saved && saved.length === ids.length ? saved : ids.map(id => nameOf.get(id) ?? '?');
  return [...history].sort((x, y) => x.at - y.at)
    .map((r): SessionMatch => ({ a: names(r.t1, r.n1), b: names(r.t2, r.n2), w: r.w ?? 0, at: r.at }));
}

export function buildSession(input: {
  roomName: string; pin: string; roomCreated: number; now: number;
  players: RoomPlayer[]; history: MatchRecord[];
}): SessionSnapshot {
  const matches = sessionMatches(input.history, input.players);
  const players = input.players.filter(p => p.playCount > 0)
    .map(p => ({ name: p.name, gender: p.gender, skill: p.skill, played: p.playCount, wins: p.wins }))
    .sort((x, y) => y.wins - x.wins || x.played - y.played || x.name.localeCompare(y.name, 'vi'));
  return {
    roomName: input.roomName, pin: input.pin,
    startedAt: input.roomCreated || matches[0]?.at || input.now, endedAt: input.now,
    players, matches,
  };
}

export const hasContent = (s: SessionSnapshot) => s.matches.length > 0 || s.players.length > 0;

const fmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', ...opts }).format(ms);
export const sessionDate = (ms: number) => fmt(ms, { day: '2-digit', month: '2-digit', year: 'numeric' });
export const sessionTime = (ms: number) => fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false });

// Văn bản dán vào nhóm Zalo
export function sessionText(s: SessionSnapshot): string {
  const head = `🏸 ${s.roomName || 'Buổi chơi'} – ${sessionDate(s.startedAt)} (${sessionTime(s.startedAt)}–${sessionTime(s.endedAt)})`;
  const stats = `${s.matches.length} trận · ${s.players.length} người`;
  const rows = s.players.map((p, i) => `${i + 1}. ${p.name} – ${p.wins} thắng / ${p.played} trận`);
  return [head, stats, '', 'Xếp hạng:', ...rows].join('\n');
}

// Số ngày còn lại trước khi server tự xóa (làm tròn lên, không âm)
export const daysLeft = (endedAt: number, now: number) => Math.max(0, Math.ceil((endedAt + SESSION_TTL_DAYS * DAY - now) / DAY));
