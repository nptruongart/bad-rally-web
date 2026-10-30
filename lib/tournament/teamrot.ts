// Thể thức "Đồng đội xoay cặp": các đội (bảng) N người; mỗi trận là 1 cặp của đội này gặp 1 cặp của đội kia.
// Cặp trong đội là 2 người liền nhau theo vòng (1-2, 2-3, …, N-1), mỗi người thuộc đúng 2 cặp → mỗi vòng N lượt ai cũng đánh 2 trận.
import type { Entry, TMatch } from './store.ts';

// Các cặp (chỉ số thành viên, 0-based) theo thứ tự đánh. Lịch lặp lại theo vòng nên thứ tự phải:
// không ai đánh 2 lượt liền nhau (kể cả lượt cuối nối lượt đầu vòng sau), khoảng nghỉ dài nhất ngắn nhất có thể.
// Tìm vét (5–7 người: ≤ 720 cách), lấy cách nhỏ nhất theo thứ tự → 5 người: (1,2) (3,4) (5,1) (2,3) (4,5)
const pairCache = new Map<number, [number, number][]>();
export function rotationPairs(size: number): [number, number][] {
  const cached = pairCache.get(size);
  if (cached) return cached;
  const pair = (i: number): [number, number] => [i, (i + 1) % size];
  const clash = (i: number, j: number) => { const [a, b] = pair(i); return pair(j).includes(a) || pair(j).includes(b); };
  let best: number[] = [], bestGap = Infinity;
  const maxGap = (order: number[]) => {
    let worst = 0;
    for (let p = 0; p < size; p++) {
      const at = order.flatMap((i, k) => (pair(i).includes(p) ? [k] : []));
      for (let k = 0; k < at.length; k++) worst = Math.max(worst, ((at[(k + 1) % at.length] - at[k] + size - 1) % size) + 1);
    }
    return worst;
  };
  const walk = (order: number[], left: number[]) => {
    if (!left.length) {
      if (clash(order[order.length - 1], order[0])) return;
      const g = maxGap(order);
      if (g < bestGap) { bestGap = g; best = [...order]; }
      return;
    }
    for (const i of left) if (!clash(order[order.length - 1], i)) walk([...order, i], left.filter(x => x !== i));
  };
  walk([0], Array.from({ length: size - 1 }, (_, i) => i + 1));
  // Không có cách nào tránh đánh liền (4 người): giữ thứ tự bước 2
  if (!best.length) for (let s = 0; s < 2; s++) for (let i = s; i < size; i += 2) best.push(i);
  const out = best.map(pair);
  pairCache.set(size, out);
  return out;
}

// Mỗi người đánh perPerson trận (số chẵn) → số lượt
export const teamRotRounds = (size: number, perPerson: number) => (size * perPerson) / 2;

// Các ngày gặp nhau kiểu vòng tròn giữa các đội (số đội chẵn): đội 0 cố định, các đội còn lại xoay
export function teamMatchdays(teams: number): [number, number][][] {
  const n = teams - 1;
  return Array.from({ length: n }, (_, d) => {
    const out: [number, number][] = [[0, d + 1]];
    for (let k = 1; k < teams / 2; k++) {
      const x = ((d + k) % n) + 1, y = (((d - k) % n) + n) % n + 1;
      out.push(x < y ? [x, y] : [y, x]);
    }
    return out;
  });
}

export type TeamRotSlot = { round: number; order: number; teamA: number; teamB: number; pair: number };

// Lượt r dùng cặp thứ (r mod N) cho mọi đội; các đội gặp nhau theo khối lượt liên tiếp (4 đội, 10 lượt: 3-3-3 rồi lặp lại)
export function teamRotSchedule(o: { teams: number; size: number; perPerson: number }): TeamRotSlot[] {
  const rounds = teamRotRounds(o.size, o.perPerson);
  const days = teamMatchdays(o.teams);
  const block = Math.max(1, Math.floor(rounds / days.length));
  const out: TeamRotSlot[] = [];
  for (let r = 0; r < rounds; r++) {
    const day = days[Math.floor(r / block) % days.length];
    day.forEach(([a, b], i) => out.push({ round: r + 1, order: i, teamA: a, teamB: b, pair: r % o.size }));
  }
  return out;
}

const finished = (m: TMatch) => m.status === 'done' && m.scores.length > 0;
const points = (m: TMatch): [number, number] => m.scores.reduce<[number, number]>((s, g) => [s[0] + g[0], s[1] + g[1]], [0, 0]);

type Stat = { played: number; won: number; pointsFor: number; pointsAgainst: number; diff: number; rank: number };
const blank = (): Stat => ({ played: 0, won: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, rank: 0 });

// Thắng 1 trận = 1 điểm: xếp theo số trận thắng, rồi hiệu số, rồi tổng điểm ghi được; bằng hết thì cùng hạng
function rankRows<T extends Stat>(rows: T[]): T[] {
  const key = (r: T) => [r.won, r.diff, r.pointsFor];
  rows.sort((x, y) => { const a = key(x), b = key(y); return b[0] - a[0] || b[1] - a[1] || b[2] - a[2]; });
  rows.forEach((r, i) => { const p = rows[i - 1]; r.rank = p && key(p).join() === key(r).join() ? p.rank : i + 1; });
  return rows;
}

function tally(stat: Stat, mine: number, theirs: number, won: boolean) {
  stat.played++; stat.pointsFor += mine; stat.pointsAgainst += theirs; stat.diff = stat.pointsFor - stat.pointsAgainst;
  if (won) stat.won++;
}

export type TeamRow = Stat & { team: string };
export function teamRotTeamStandings(teamKeys: string[], entries: Entry[], matches: TMatch[]): TeamRow[] {
  const rows = new Map(teamKeys.map(k => [k, { team: k, ...blank() }]));
  const team = (id: string) => entries.find(e => e.id === id)?.group || '';
  for (const m of matches.filter(finished)) {
    const [pa, pb] = points(m);
    const ra = rows.get(team(m.entryA)), rb = rows.get(team(m.entryB));
    if (ra) tally(ra, pa, pb, m.winner === 'a');
    if (rb) tally(rb, pb, pa, m.winner === 'b');
  }
  return rankRows([...rows.values()]);
}

export type PersonRow = Stat & { person: string; team: string };
export function teamRotPersonStandings(entries: Entry[], matches: TMatch[]): PersonRow[] {
  const rows = new Map<string, PersonRow>();
  for (const e of entries) for (const p of [e.p1, e.p2]) if (!rows.has(p)) rows.set(p, { person: p, team: e.group, ...blank() });
  for (const m of matches.filter(finished)) {
    const [pa, pb] = points(m);
    for (const [id, mine, theirs, won] of [[m.entryA, pa, pb, m.winner === 'a'], [m.entryB, pb, pa, m.winner === 'b']] as const) {
      const e = entries.find(x => x.id === id);
      if (e) for (const p of [e.p1, e.p2]) tally(rows.get(p)!, mine, theirs, won);
    }
  }
  return rankRows([...rows.values()]);
}
