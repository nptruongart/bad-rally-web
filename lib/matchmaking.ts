// Thuật toán xếp trận theo trọng số.
// Duyệt các tổ hợp người chơi trong nhóm ưu tiên nhất, chấm điểm từng cách chia đội, chọn phương án điểm cao nhất.

export interface MMPlayer {
  id: string;
  playCount: number;
  waitSince?: number;
  partnerId?: string; // cặp cố định: luôn chung đội
  skill: number;      // 0 (mới chơi) .. 9 (khá+)
  gender?: 'M' | 'F'; // không có → tính là nam (giống icon hiển thị)
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

// Thể loại trận đôi: tự do / đôi nam / đôi nữ / nam nữ (mỗi đội 1 nam + 1 nữ)
export type MatchCategory = 'any' | 'MD' | 'WD' | 'XD';

export const genderOf = (p: { gender?: 'M' | 'F' }) => (p.gender === 'F' ? 'F' : 'M');

// Thể loại chỉ áp dụng cho trận đôi 2v2
export const effectiveCategory = (matchType: MatchType, category?: MatchCategory): MatchCategory =>
  matchType === '2v2' && category ? category : 'any';

// Người chơi có được xếp vào trận thuộc thể loại này không
export const fitsCategory = (p: { gender?: 'M' | 'F' }, category: MatchCategory) =>
  category === 'MD' ? genderOf(p) === 'M' : category === 'WD' ? genderOf(p) === 'F' : true;

// Đội hợp lệ với thể loại (đôi nam nữ: đúng 1 nam + 1 nữ)
export const teamFitsCategory = (team: { gender?: 'M' | 'F' }[], category: MatchCategory) =>
  category === 'XD' ? team.filter(p => genderOf(p) === 'M').length === 1 && team.filter(p => genderOf(p) === 'F').length === 1
    : team.every(p => fitsCategory(p, category));

export const teamSizes = (matchType: MatchType): [number, number] =>
  matchType === '1v1' ? [1, 1] : matchType === '1v2' ? [1, 2] : [2, 2];

// Khi chia đội cho nhóm đã chọn, luôn cân bằng trình độ ít nhất ở mức này (kể cả chế độ không bật cân bằng kỹ năng)
const MIN_SPLIT_BALANCE = 60;

const POOL_SIZE = 12; // chỉ xét 12 người ưu tiên nhất → tối đa vài nghìn phương án, chạy tức thì

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface HistoryStats {
  partnered: Map<string, number>;
  opposed: Map<string, number>;
  lastPartners: Map<string, Set<string>>; // đồng đội ở trận gần nhất của mỗi người
}

// Lịch sử chỉ đổi khi có trận mới (mảng mới) → tính thống kê 1 lần cho mỗi phiên bản lịch sử
const statsCache = new WeakMap<MatchRecord[], HistoryStats>();

function buildStats(history: MatchRecord[]): HistoryStats {
  const cached = statsCache.get(history);
  if (cached) return cached;
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
  const stats = { partnered, opposed, lastPartners };
  statsCache.set(history, stats);
  return stats;
}

// Bảng tra cứu theo chỉ số cho nhóm ứng viên (≤ 13 người) → chấm điểm hàng nghìn phương án không cần tra Map/chuỗi
interface ScoreTable {
  n: number;
  fair: number[];     // (số trận - ít nhất) * 10
  wait: number[];     // điểm chờ (tối đa 10)
  skill: number[];
  partner: Float64Array; // n*n: số lần từng chung đội
  opp: Float64Array;     // n*n: số lần từng đối đầu
  keep: Uint8Array;      // n*n: là đồng đội ở trận gần nhất
}

function buildTable(players: MMPlayer[], stats: HistoryStats, minPlayCount: number, now: number): ScoreTable {
  const n = players.length;
  const partner = new Float64Array(n * n), opp = new Float64Array(n * n), keep = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const k = pairKey(players[i].id, players[j].id);
      partner[i * n + j] = stats.partnered.get(k) || 0;
      opp[i * n + j] = stats.opposed.get(k) || 0;
      keep[i * n + j] = stats.lastPartners.get(players[i].id)?.has(players[j].id) ? 1 : 0;
    }
  }
  return {
    n, partner, opp, keep,
    fair: players.map(p => p.playCount - minPlayCount),
    wait: players.map(p => Math.min((now - (p.waitSince || now)) / 60000, 30) / 3),
    skill: players.map(p => p.skill),
  };
}

// Cùng công thức với bản cũ, nhưng nhận chỉ số người chơi trong bảng tra cứu
function scoreIdx(t1: number[], t2: number[], w: Weights, T: ScoreTable): number {
  const n = T.n;
  let fairSum = 0, wait = 0;
  for (const i of t1) { fairSum += T.fair[i]; wait += T.wait[i]; }
  for (const i of t2) { fairSum += T.fair[i]; wait += T.wait[i]; }
  // Công bằng số trận: mỗi trận nhiều hơn người ít trận nhất bị trừ 10 điểm
  const fairness = -fairSum * 10;

  let samePartner = 0, keepPair = 0;
  for (const team of [t1, t2]) {
    for (let a = 0; a < team.length; a++) {
      for (let b = a + 1; b < team.length; b++) {
        samePartner += T.partner[team[a] * n + team[b]];
        keepPair += T.keep[team[a] * n + team[b]];
      }
    }
  }
  let sameOpponents = 0;
  for (const a of t1) for (const b of t2) sameOpponents += T.opp[a * n + b];

  // Cân bằng kỹ năng: so sức mạnh trung bình 2 đội (thang 0..9)
  let s1 = 0, s2 = 0;
  for (const i of t1) s1 += T.skill[i];
  for (const i of t2) s2 += T.skill[i];
  const skillGap = Math.abs(s1 / t1.length - s2 / t2.length);

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
  category: MatchCategory = 'any',
): [MMPlayer[], MMPlayer[]] | null {
  const [size1, size2] = teamSizes(matchType);
  const needed = size1 + size2;
  const cat = effectiveCategory(matchType, category);
  available = available.filter(p => fitsCategory(p, cat));
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
    if (partner && !seen.has(partner.id) && (cat !== 'XD' || genderOf(p) !== genderOf(partner))) { units.push([p, partner]); seen.add(partner.id); }
    else units.push([p]);
    seen.add(p.id);
  }

  const pool: MMPlayer[][] = [];
  if (cat === 'XD') {
    // Đôi nam nữ: lấy tối đa 6 nam + 6 nữ ưu tiên nhất, để không bị 12 người đầu toàn một giới
    const count = { M: 0, F: 0 };
    for (const u of units) {
      if (count.M >= POOL_SIZE / 2 && count.F >= POOL_SIZE / 2) break;
      if (!u.some(p => count[genderOf(p)] < POOL_SIZE / 2)) continue;
      pool.push(u);
      u.forEach(p => count[genderOf(p)]++);
    }
  } else {
    let pooled = 0;
    for (const u of units) { if (pooled >= POOL_SIZE) break; pool.push(u); pooled += u.length; }
  }

  const stats = buildStats(history);
  const minPlayCount = sorted[0].playCount;
  const rank = new Map(sorted.map((p, i) => [p.id, i]));

  // Đánh chỉ số cho người trong nhóm ứng viên; mỗi đơn vị (người lẻ / cặp cố định) là danh sách chỉ số
  const flatPool = pool.flat();
  const T = buildTable(flatPool, stats, minPlayCount, now);
  const rankOf = flatPool.map(p => rank.get(p.id)!);
  const unitIdx: number[][] = [];
  { let k = 0; for (const u of pool) { unitIdx.push(u.map(() => k++)); } }
  const toPlayers = (idx: number[]) => idx.map(i => flatPool[i]);
  // Mọi người trong nhóm đã lọc theo thể loại → chỉ đôi nam nữ cần kiểm tra thêm (đúng 1 nam + 1 nữ mỗi đội)
  const isMale = flatPool.map(p => genderOf(p) === 'M');
  const fitsIdx = (idx: number[]) => {
    if (cat !== 'XD') return true;
    let m = 0;
    for (const i of idx) if (isMale[i]) m++;
    return m === 1 && idx.length === 2;
  };

  let best: { t1: number[]; t2: number[]; score: number } | null = null;
  const t1: number[] = [], t2: number[] = [];

  const consider = () => {
    if (!fitsIdx(t1) || !fitsIdx(t2)) return;
    // Hệ số rất nhỏ theo thứ tự ưu tiên để phá thế hòa ổn định
    let rankSum = 0;
    for (const i of t1) rankSum += rankOf[i];
    for (const i of t2) rankSum += rankOf[i];
    const score = scoreIdx(t1, t2, weights, T) - rankSum * 1e-3;
    if (!best || score > best.score) best = { t1: [...t1], t2: [...t2], score };
  };

  // Số người còn lại từ đơn vị i trở đi (để cắt nhánh sớm)
  const remainingFrom: number[] = new Array(pool.length + 1).fill(0);
  for (let i = pool.length - 1; i >= 0; i--) remainingFrom[i] = remainingFrom[i + 1] + pool[i].length;

  // Chia từng đơn vị vào đội 1 hoặc đội 2 (cặp cố định không bị tách)
  const assign = (i: number) => {
    if (t1.length === size1 && t2.length === size2) { consider(); return; }
    if (i >= pool.length) return;
    if (remainingFrom[i] < size1 - t1.length + size2 - t2.length) return;
    const u = unitIdx[i];
    if (t1.length + u.length <= size1) { t1.push(...u); assign(i + 1); t1.length -= u.length; }
    if (t2.length + u.length <= size2) { t2.push(...u); assign(i + 1); t2.length -= u.length; }
    assign(i + 1); // bỏ qua đơn vị này
  };
  assign(0);

  if (best) {
    const chosen = best as { t1: number[]; t2: number[] };
    // Bước 2: giữ nguyên những người đã chọn, chia lại đội sao cho 2 bên cân sức nhất (ở mọi chế độ).
    // Đổi cách chia không ảnh hưởng ai được ra sân nên không làm lệch xoay vòng.
    const ids = new Set([...chosen.t1, ...chosen.t2]);
    const chosenUnits = unitIdx.filter(u => u.every(i => ids.has(i)));
    const splitWeights = { ...weights, skillBalance: Math.max(weights.skillBalance, MIN_SPLIT_BALANCE) };
    let split: { t1: number[]; t2: number[]; score: number } | null = null;
    const s1: number[] = [], s2: number[] = [];
    const trySplit = (i: number) => {
      if (i === chosenUnits.length) {
        if (s1.length !== size1 || s2.length !== size2 || !fitsIdx(s1) || !fitsIdx(s2)) return;
        const score = scoreIdx(s1, s2, splitWeights, T);
        if (!split || score > split.score + 1e-9) split = { t1: [...s1], t2: [...s2], score };
        return;
      }
      const u = chosenUnits[i];
      if (s1.length + u.length <= size1) { s1.push(...u); trySplit(i + 1); s1.length -= u.length; }
      if (s2.length + u.length <= size2) { s2.push(...u); trySplit(i + 1); s2.length -= u.length; }
    };
    trySplit(0);
    const final = (split as { t1: number[]; t2: number[] } | null) || chosen;
    return [toPlayers(final.t1), toPlayers(final.t2)];
  }

  // Đôi nam nữ không ghép được (thiếu nam hoặc nữ) → không xếp
  if (cat === 'XD') return null;
  // Chỉ còn cặp cố định không vừa đội (vd. 1v1) → buộc tách cặp ưu tiên nhất
  const flat = sorted.slice(0, needed);
  return [flat.slice(0, size1), flat.slice(size1, needed)];
}
