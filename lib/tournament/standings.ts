// Bảng xếp hạng vòng bảng / vòng tròn theo BWF General Competition Regulations 5.1, điều 16.2:
// 1) số trận thắng; 2) hai đôi bằng → đối đầu; 3) từ ba đôi bằng → hiệu số set toàn bảng,
//    còn hai → đối đầu, còn ≥ ba → hiệu số điểm, còn hai → đối đầu, còn ≥ ba → bốc thăm.
import { matchResult } from './scoring.ts';
import type { ResultInput, ScoringRule, StandingRow, WalkoverMode } from './types.ts';

type Opts = { walkoverMode: WalkoverMode; withdrawn: string[]; rng: () => number };

export function computeStandings(entries: string[], results: ResultInput[], rule: ScoringRule, opts: Opts): StandingRow[] {
  const dropped = new Set(opts.walkoverMode === 'bwf' ? opts.withdrawn : []);
  const ids = entries.filter(e => !dropped.has(e));
  const valid = results.filter(r => !dropped.has(r.a) && !dropped.has(r.b) && ids.includes(r.a) && ids.includes(r.b));

  const rows = new Map<string, StandingRow>(ids.map(e => [e, { entry: e, played: 0, won: 0, lost: 0, gameDiff: 0, pointDiff: 0, rank: 0, byLot: false }]));
  const need = Math.ceil(rule.games / 2);
  for (const r of valid) {
    let games: [number, number], points: [number, number];
    if (r.walkover) {
      games = r.winner === 'a' ? [need, 0] : [0, need];
      points = r.winner === 'a' ? [rule.points * need, 0] : [0, rule.points * need];
    } else {
      ({ games, points } = matchResult(r.scores, rule));
    }
    const a = rows.get(r.a)!, b = rows.get(r.b)!;
    a.played++; b.played++;
    if (r.winner === 'a') { a.won++; b.lost++; } else { b.won++; a.lost++; }
    a.gameDiff += games[0] - games[1]; b.gameDiff += games[1] - games[0];
    a.pointDiff += points[0] - points[1]; b.pointDiff += points[1] - points[0];
  }

  const headToHead = (x: string, y: string): string | null => {
    const m = valid.find(r => (r.a === x && r.b === y) || (r.a === y && r.b === x));
    if (!m) return null;
    return m.winner === 'a' ? m.a : m.b;
  };

  // Bốc thăm: mỗi đôi nhận một số ngẫu nhiên theo thứ tự đầu vào, số nhỏ xếp trên
  const byLot = (group: string[]): string[] => {
    const keyed = group.map(e => ({ e, k: opts.rng() }));
    keyed.forEach(({ e }) => { rows.get(e)!.byLot = true; });
    return keyed.sort((p, q) => p.k - q.k).map(p => p.e);
  };

  // Hai đôi bằng nhau: đối đầu. Chưa gặp nhau (bảng đang đấu) → hiệu số set, hiệu số điểm, rồi mới bốc thăm.
  const pair = (group: string[]): string[] => {
    const w = headToHead(group[0], group[1]);
    if (w) return w === group[0] ? group : [group[1], group[0]];
    return splitBy(group, e => rows.get(e)!.gameDiff, g2 =>
      splitBy(g2, e => rows.get(e)!.pointDiff, byLot));
  };

  // Tách nhóm theo một chỉ số (giảm dần), rồi xử lý từng nhóm con
  const splitBy = (group: string[], metric: (e: string) => number, resolve: (sub: string[]) => string[]): string[] => {
    const sorted = [...group].sort((p, q) => metric(q) - metric(p));
    const out: string[] = [];
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j < sorted.length && metric(sorted[j]) === metric(sorted[i])) j++;
      const sub = sorted.slice(i, j);
      out.push(...(sub.length === 1 ? sub : resolve(sub)));
      i = j;
    }
    return out;
  };

  const byPoints = (group: string[]): string[] =>
    splitBy(group, e => rows.get(e)!.pointDiff, sub => (sub.length === 2 ? pair(sub) : byLot(sub)));
  const byGames = (group: string[]): string[] =>
    splitBy(group, e => rows.get(e)!.gameDiff, sub => (sub.length === 2 ? pair(sub) : byPoints(sub)));
  const ordered = splitBy(ids, e => rows.get(e)!.won, sub => (sub.length === 2 ? pair(sub) : byGames(sub)));

  return ordered.map((e, i) => ({ ...rows.get(e)!, rank: i + 1 }));
}
