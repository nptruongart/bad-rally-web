// Thuật toán xếp trận theo trọng số.
// Duyệt các tổ hợp người chơi trong nhóm ưu tiên nhất, chấm điểm từng cách chia đội, chọn phương án điểm cao nhất.

export interface MMPlayer {
  id: string;
  playCount: number;
  waitSince?: number;
  partnerId?: string; // cặp cố định: luôn chung đội
  skill: number;      // 0 (mới chơi) .. 9 (khá+)
}

export interface MatchRecord {
  t1: string[];
  t2: string[];
  at: number;
}

export interface Weights {
  playCountFairness: number;
  waitTimePriority: number;
  avoidSamePartner: number;
  avoidSameOpponents: number;
  skillBalance: number;
  keepPreviousPair: number;
}

export type MatchType = '1v1' | '1v2' | '2v2';

export const teamSizes = (matchType: MatchType): [number, number] =>
  matchType === '1v1' ? [1, 1] : matchType === '1v2' ? [1, 2] : [2, 2];

const POOL_SIZE = 12; // chỉ xét 12 người ưu tiên nhất → tối đa vài nghìn phương án, chạy tức thì

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface HistoryStats {
  partnered: Map<string, number>;
  opposed: Map<string, number>;
  lastPartners: Map<string, Set<string>>; // đồng đội ở trận gần nhất của mỗi người
}

function buildStats(history: MatchRecord[]): HistoryStats {
  const partnered = new Map<string, number>();
  const opposed = new Map<string, number>();
  const lastPartners = new Map<string, Set<string>>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);

  for (const { t1, t2 } of [...history].sort((a, b) => a.at - b.at)) {
    for (const team of [t1, t2]) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) bump(partnered, pairKey(team[i], team[j]));
        lastPartners.set(team[i], new Set(team.filter(id => id !== team[i])));
      }
    }
    for (const a of t1) for (const b of t2) bump(opposed, pairKey(a, b));
  }
  return { partnered, opposed, lastPartners };
}

function scoreMatch(team1: MMPlayer[], team2: MMPlayer[], w: Weights, stats: HistoryStats, minPlayCount: number, now: number): number {
  const all = [...team1, ...team2];
  const teams = [team1, team2];

  // Công bằng số trận: mỗi trận nhiều hơn người ít trận nhất bị trừ 10 điểm
  const fairness = -all.reduce((s, p) => s + (p.playCount - minPlayCount), 0) * 10;
  // Thời gian chờ: tối đa 10 điểm/người (chờ ≥ 30 phút)
  const wait = all.reduce((s, p) => s + Math.min((now - (p.waitSince || now)) / 60000, 30) / 3, 0);

  let samePartner = 0, keepPair = 0;
  for (const team of teams) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        samePartner += stats.partnered.get(pairKey(team[i].id, team[j].id)) || 0;
        if (stats.lastPartners.get(team[i].id)?.has(team[j].id)) keepPair++;
      }
    }
  }
  let sameOpponents = 0;
  for (const a of team1) for (const b of team2) sameOpponents += stats.opposed.get(pairKey(a.id, b.id)) || 0;

  // Cân bằng kỹ năng: so sức mạnh trung bình 2 đội (thang 0..9)
  const avg = (t: MMPlayer[]) => t.reduce((s, p) => s + p.skill, 0) / t.length;
  const skillGap = Math.abs(avg(team1) - avg(team2));

  return (
    (w.playCountFairness / 100) * fairness +
    (w.waitTimePriority / 100) * wait -
    (w.avoidSamePartner / 100) * samePartner * 10 -
    (w.avoidSameOpponents / 100) * sameOpponents * 5 -
    (w.skillBalance / 100) * skillGap * 10 +
    (w.keepPreviousPair / 100) * keepPair * 10
  );
}

// Trả về [đội 1, đội 2] hoặc null nếu không đủ người
export function pickMatch(
  available: MMPlayer[],
  matchType: MatchType,
  weights: Weights,
  history: MatchRecord[],
  now: number,
): [MMPlayer[], MMPlayer[]] | null {
  const [size1, size2] = teamSizes(matchType);
  const needed = size1 + size2;
  if (available.length < needed) return null;

  // Thứ tự ưu tiên: ít trận trước, bằng nhau thì ai chờ lâu hơn
  const sorted = [...available].sort((a, b) => a.playCount - b.playCount || (a.waitSince || 0) - (b.waitSince || 0));
  const byId = new Map(sorted.map(p => [p.id, p]));

  // Gom cặp cố định thành 1 đơn vị (chỉ khi cả 2 đều đang chờ)
  const units: MMPlayer[][] = [];
  const seen = new Set<string>();
  for (const p of sorted) {
    if (seen.has(p.id)) continue;
    const partner = p.partnerId ? byId.get(p.partnerId) : undefined;
    if (partner && !seen.has(partner.id)) { units.push([p, partner]); seen.add(partner.id); }
    else units.push([p]);
    seen.add(p.id);
  }

  const pool: MMPlayer[][] = [];
  let pooled = 0;
  for (const u of units) { if (pooled >= POOL_SIZE) break; pool.push(u); pooled += u.length; }

  const stats = buildStats(history);
  const minPlayCount = sorted[0].playCount;
  const rank = new Map(sorted.map((p, i) => [p.id, i]));

  let best: { t1: MMPlayer[]; t2: MMPlayer[]; score: number } | null = null;

  const consider = (t1: MMPlayer[], t2: MMPlayer[]) => {
    // Hệ số rất nhỏ theo thứ tự ưu tiên để phá thế hòa ổn định
    const score = scoreMatch(t1, t2, weights, stats, minPlayCount, now) - [...t1, ...t2].reduce((s, p) => s + rank.get(p.id)!, 0) * 1e-3;
    if (!best || score > best.score) best = { t1, t2, score };
  };

  // Chia từng đơn vị vào đội 1 hoặc đội 2 (cặp cố định không bị tách)
  const assign = (i: number, t1: MMPlayer[], t2: MMPlayer[]) => {
    if (t1.length === size1 && t2.length === size2) { consider(t1, t2); return; }
    if (i >= pool.length) return;
    const remaining = pool.slice(i).reduce((s, u) => s + u.length, 0);
    if (remaining < size1 - t1.length + size2 - t2.length) return;
    const u = pool[i];
    if (t1.length + u.length <= size1) assign(i + 1, [...t1, ...u], t2);
    if (t2.length + u.length <= size2) assign(i + 1, t1, [...t2, ...u]);
    assign(i + 1, t1, t2); // bỏ qua đơn vị này
  };
  assign(0, [], []);

  if (best) return [(best as { t1: MMPlayer[] }).t1, (best as { t2: MMPlayer[] }).t2];

  // Chỉ còn cặp cố định không vừa đội (vd. 1v1) → buộc tách cặp ưu tiên nhất
  const flat = sorted.slice(0, needed);
  return [flat.slice(0, size1), flat.slice(size1, needed)];
}
