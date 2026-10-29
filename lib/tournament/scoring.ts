// Luật điểm: kiểm tra từng set và kết quả cả trận theo luật đã chọn cho nội dung.
import type { GameScore, ScoringRule, Side } from './types.ts';

// Trần điểm gợi ý: 21 điểm → 30 (luật 3x21), 15 điểm → 21 (luật 3x15 BWF từ 2027), khác → +9
export function defaultCap(points: number): number {
  if (points === 21) return 30;
  if (points === 15) return 21;
  return points + 9;
}

// Bên thắng một set: đạt ≥ points và hơn ≥ 2, hoặc chạm đúng trần và hơn 1. Không khớp → 'invalid'.
export function gameStatus([a, b]: GameScore, rule: ScoringRule): Side | 'invalid' {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (a === b || hi > rule.cap) return 'invalid';
  const ok = hi === rule.cap ? hi - lo >= 1 : hi >= rule.points && hi - lo >= 2 && (hi === rule.points || hi - lo === 2);
  return ok ? (a > b ? 'a' : 'b') : 'invalid';
}

export function matchResult(scores: GameScore[], rule: ScoringRule): { winner: Side | null; valid: boolean; games: [number, number]; points: [number, number] } {
  const need = Math.ceil(rule.games / 2);
  const games: [number, number] = [0, 0];
  const points: [number, number] = [0, 0];
  let valid = true;
  let winner: Side | null = null;
  for (const g of scores) {
    points[0] += g[0];
    points[1] += g[1];
    if (winner) { valid = false; continue; } // set thừa sau khi trận đã có kết quả
    const s = gameStatus(g, rule);
    if (s === 'invalid') { valid = false; continue; }
    games[s === 'a' ? 0 : 1]++;
    if (games[0] === need) winner = 'a';
    else if (games[1] === need) winner = 'b';
  }
  return { winner, valid, games, points };
}
