// Tỉ số nhập tay khi kết thúc trận (1 ván): đội nhiều điểm hơn thắng, không ép luật 21 điểm (nhiều nhóm đánh 11, 15…)
import type { MatchRecord } from './matchmaking.ts';

export type Score = [number, number]; // [đội 1, đội 2]

export type ParsedScore = { ok: true; s: Score; w: 1 | 2 } | { ok: false; error: 'empty' | 'invalid' | 'tie' };

export function parseScore(a: string, b: string): ParsedScore {
  const x = a.trim(), y = b.trim();
  if (!x || !y) return { ok: false, error: 'empty' };
  if (!/^\d{1,2}$/.test(x) || !/^\d{1,2}$/.test(y)) return { ok: false, error: 'invalid' };
  const s: Score = [Number(x), Number(y)];
  if (s[0] === s[1]) return { ok: false, error: 'tie' };
  return { ok: true, s, w: s[0] > s[1] ? 1 : 2 };
}

export const formatScore = (s?: Score) => (s ? `${s[0]} – ${s[1]}` : '');

// Hiệu số = tổng điểm ghi được − tổng điểm thua, chỉ tính trận có nhập tỉ số; người chưa có trận nào có tỉ số → không có trong Map
export function pointDiffs(history: MatchRecord[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const r of history) {
    if (!r.s) continue;
    const m = r.s[0] - r.s[1];
    r.t1.forEach(id => d.set(id, (d.get(id) ?? 0) + m));
    r.t2.forEach(id => d.set(id, (d.get(id) ?? 0) - m));
  }
  return d;
}

export const formatDiff = (d?: number) => (d === undefined ? '' : d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0');

// Xếp hạng: nhiều trận thắng hơn → hiệu số cao hơn → ít trận hơn
export const rankCompare = (a: { id: string; wins: number; playCount: number }, b: { id: string; wins: number; playCount: number }, diffs: Map<string, number>) =>
  b.wins - a.wins || (diffs.get(b.id) ?? 0) - (diffs.get(a.id) ?? 0) || a.playCount - b.playCount;
