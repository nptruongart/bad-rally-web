// Hàm hiển thị dùng chung cho các màn hình giải đấu (thuần, không phụ thuộc React)
import { computeStandings } from './standings.ts';
import type { ResultInput, StandingRow, WalkoverMode } from './types.ts';
import type { Entry, Participant, TEvent, TMatch } from './store.ts';

// Tên vòng loại trực tiếp theo số vòng còn lại tới chung kết
export function koRoundName(round: number, totalRounds: number): string {
  const left = totalRounds - round;
  return left === 0 ? 'Chung kết' : left === 1 ? 'Bán kết' : left === 2 ? 'Tứ kết' : `Vòng ${round}`;
}

export function entryLabel(entry: Entry | undefined, participants: Participant[]): string {
  if (!entry) return '…';
  const name = (id: string) => participants.find(p => p.id === id)?.name || '?';
  return `${name(entry.p1)} – ${name(entry.p2)}`;
}

export const matchToResult = (m: TMatch): ResultInput | null =>
  (m.status === 'done' || m.status === 'walkover') && m.entryA && m.entryB && m.winner
    ? { a: m.entryA, b: m.entryB, scores: m.scores, winner: m.winner, walkover: m.status === 'walkover' }
    : null;

// Bốc thăm xác định theo id các đôi: cùng dữ liệu → cùng kết quả trên mọi máy, không nhảy thứ tự mỗi lần cập nhật
export function stableRng(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let x = Math.imul(h ^ (h >>> 15), 1 | h);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Bảng xếp hạng một bảng (vòng tròn coi như bảng 'A' duy nhất). Đôi bỏ cuộc sau bốc thăm vẫn trong bảng (status withdrawn).
export function groupStandings(event: TEvent, group: string, entries: Entry[], matches: TMatch[], walkoverMode: WalkoverMode = 'walkover', rng?: () => number): StandingRow[] {
  const inGroup = entries.filter(e => e.event === event.id && e.group === group && (e.status === 'approved' || e.status === 'withdrawn'));
  const results = matches
    .filter(m => m.event === event.id && m.stage === 'group' && m.group === group)
    .map(matchToResult)
    .filter((r): r is ResultInput => !!r);
  return computeStandings(inGroup.map(e => e.id), results, event.scoring, {
    walkoverMode,
    withdrawn: inGroup.filter(e => e.status === 'withdrawn').map(e => e.id),
    rng: rng ?? stableRng(event.id + group + inGroup.map(e => e.id).sort().join()),
  });
}
