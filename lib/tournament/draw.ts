// Thể thức, chia bảng, lịch vòng tròn và nhánh loại trực tiếp.
export type GroupKey = 'A' | 'B' | 'C' | 'D';
export const GROUP_KEYS: GroupKey[] = ['A', 'B', 'C', 'D'];

// Nguồn đội của một trận nhánh: hạng mấy của bảng nào, hoặc đội thắng của trận nhánh trước (chỉ số trong mảng)
export type Feed = { group: GroupKey; place: number } | { match: number };
export type KoSlot = { round: number; slot: number; a: Feed; b: Feed };

// 4–5 đôi đánh vòng tròn; từ 6 đôi chia 2 bảng lấy 2 (BTC đổi được sang 4 bảng)
export function suggestFormat(n: number): { format: 'rr' | 'groups_ko'; groups?: 2 | 4; advance?: 1 | 2 } {
  if (n <= 5) return { format: 'rr' };
  return { format: 'groups_ko', groups: 2, advance: 2 };
}

// Hạt giống xếp kiểu rắn (1→A, 2→B, …, rồi quay ngược); các đôi còn lại xáo ngẫu nhiên, mỗi đôi vào bảng ít người nhất
export function drawGroups(entries: { id: string; seed?: number }[], groups: 2 | 4, rng: () => number): Record<GroupKey, string[]> {
  const keys = GROUP_KEYS.slice(0, groups);
  const out: Record<GroupKey, string[]> = { A: [], B: [], C: [], D: [] };
  const seeds = entries.filter(e => e.seed != null).sort((x, y) => x.seed! - y.seed!);
  seeds.forEach((e, i) => {
    const lap = Math.floor(i / groups), pos = i % groups;
    out[keys[lap % 2 === 0 ? pos : groups - 1 - pos]].push(e.id);
  });
  const rest = entries.filter(e => e.seed == null).map(e => e.id);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  for (const id of rest) {
    const target = keys.reduce((best, k) => (out[k].length < out[best].length ? k : best), keys[0]);
    out[target].push(id);
  }
  return out;
}

// Lịch vòng tròn kiểu xoay vòng (circle method): đôi đầu đứng yên, các đôi khác xoay; số lẻ thì thêm "nghỉ"
export function roundRobin(ids: string[]): { round: number; a: string; b: string }[] {
  const list: (string | null)[] = ids.length % 2 ? [...ids, null] : [...ids];
  const n = list.length;
  const out: { round: number; a: string; b: string }[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a && b) out.push({ round: r + 1, a, b });
    }
    list.splice(1, 0, list.pop()!);
  }
  return out;
}

// Vòng đầu nhánh: bắt cặp chéo để hai đôi cùng bảng chỉ gặp lại ở chung kết
const FIRST_ROUND: Record<string, [string, string][]> = {
  '2-1': [['A1', 'B1']],
  '2-2': [['A1', 'B2'], ['B1', 'A2']],
  '4-1': [['A1', 'C1'], ['B1', 'D1']],
  '4-2': [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']],
};

export function knockoutPlan(groups: 2 | 4, advance: 1 | 2): KoSlot[] {
  const feed = (s: string): Feed => ({ group: s[0] as GroupKey, place: Number(s[1]) });
  const out: KoSlot[] = FIRST_ROUND[`${groups}-${advance}`].map(([a, b], slot) => ({ round: 1, slot, a: feed(a), b: feed(b) }));
  let prev = out.map((_, i) => i);
  for (let round = 2; prev.length > 1; round++) {
    const next: number[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      out.push({ round, slot: i / 2, a: { match: prev[i] }, b: { match: prev[i + 1] } });
      next.push(out.length - 1);
    }
    prev = next;
  }
  return out;
}
