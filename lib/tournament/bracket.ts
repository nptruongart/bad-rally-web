// Sinh trận sau bốc thăm, điền nhánh từ bảng xếp hạng, đưa đội thắng lên vòng sau (logic thuần).
import { GROUP_KEYS, knockoutPlan, roundRobin, type Feed, type GroupKey } from './draw.ts';
import { skillRank } from './skills.ts';
import type { Entry, Participant, TMatch } from './store.ts';

export type MatchSpec = {
  stage: 'group' | 'ko'; group: string; round: number; order: number;
  entryA: string; entryB: string; feeds: { a: Feed; b: Feed } | null;
};

// Trận vòng bảng (mỗi bảng vòng tròn, xếp xen kẽ các bảng theo vòng) + trận nhánh (chưa có đội)
export function buildEventMatches(input: { format: 'rr' | 'groups_ko'; groups: Partial<Record<GroupKey, string[]>>; groupCount?: 2 | 4; advance?: 1 | 2 }): MatchSpec[] {
  const group: MatchSpec[] = [];
  for (const g of GROUP_KEYS) {
    const list = input.groups[g];
    if (!list || list.length < 2) continue;
    for (const m of roundRobin(list)) group.push({ stage: 'group', group: g, round: m.round, order: 0, entryA: m.a, entryB: m.b, feeds: null });
  }
  group.sort((x, y) => x.round - y.round || x.group.localeCompare(y.group));
  group.forEach((m, i) => { m.order = i; });
  if (input.format !== 'groups_ko') return group;
  const ko = knockoutPlan(input.groupCount ?? 2, input.advance ?? 2).map(k => ({
    stage: 'ko' as const, group: '', round: k.round, order: k.slot, entryA: '', entryB: '', feeds: { a: k.a, b: k.b },
  }));
  return [...group, ...ko];
}

const sortKo = (ko: TMatch[]) => [...ko].sort((a, b) => a.round - b.round || a.order - b.order);

// standings: bảng → danh sách id đôi theo hạng. Trả về các trận vòng đầu nhánh cần điền.
export function fillKoFromGroups(ko: TMatch[], standings: Partial<Record<string, string[]>>): { id: string; entryA: string; entryB: string }[] {
  const pick = (f?: Feed) => (f && 'group' in f ? standings[f.group]?.[f.place - 1] || '' : '');
  return sortKo(ko)
    .filter(m => m.feeds?.a && 'group' in m.feeds.a)
    .map(m => ({ id: m.id, entryA: pick(m.feeds!.a), entryB: pick(m.feeds!.b) }));
}

// Đội thắng trận nhánh `matchId` đi vào ô nào của trận nào (null nếu là chung kết)
export function nextFromWinner(ko: TMatch[], matchId: string, winnerEntry: string): { id: string; side: 'a' | 'b'; entry: string } | null {
  const sorted = sortKo(ko);
  const idx = sorted.findIndex(m => m.id === matchId);
  for (const m of sorted) {
    for (const side of ['a', 'b'] as const) {
      const f = m.feeds?.[side];
      if (f && 'match' in f && f.match === idx) return { id: m.id, side, entry: winnerEntry };
    }
  }
  return null;
}

// Sửa tỉ số vòng bảng chỉ được khi nhánh chưa bắt đầu
export const groupResultLocked = (ko: TMatch[]) => ko.some(m => m.status === 'called' || m.status === 'playing' || m.status === 'done' || m.status === 'walkover');

// Gợi ý hạt giống: đôi có tổng thứ hạng trình độ của 2 người cao nhất
export function suggestSeeds(entries: Entry[], people: Participant[], count: number): string[] {
  const rank = (id: string) => skillRank(people.find(p => p.id === id)?.skill || '');
  return [...entries].sort((a, b) => rank(b.p1) + rank(b.p2) - (rank(a.p1) + rank(a.p2))).slice(0, count).map(e => e.id);
}
