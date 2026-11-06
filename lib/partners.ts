// Cảnh báo xếp tay: 2 người cùng đội đã từng đánh chung bao nhiêu trận trong phòng này.
import { genderOf, type MatchCategory, type MatchRecord, type MatchType } from './matchmaking.ts';

export const partnerCount = (history: MatchRecord[], a: string, b: string) =>
  history.filter(r => [r.t1, r.t2].some(t => t.includes(a) && t.includes(b))).length;

// Đội theo thứ tự chọn khi xếp tay (giống lúc bắt đầu trận): nam nữ thì nam thứ k ghép nữ thứ k
export function draftTeams(picked: { id: string; gender?: 'M' | 'F' }[], matchType: MatchType, category: MatchCategory): string[][] {
  if (category === 'XD') {
    const men = picked.filter(p => genderOf(p) === 'M'), women = picked.filter(p => genderOf(p) === 'F');
    return [0, 1].map(k => [men[k], women[k]].filter(Boolean).map(p => p!.id)).filter(t => t.length > 0);
  }
  const top = matchType === '2v2' ? 2 : 1;
  const ids = picked.map(p => p.id);
  return [ids.slice(0, top), ids.slice(top)].filter(t => t.length > 0);
}

export function partnerWarnings(history: MatchRecord[], teams: string[][]): { a: string; b: string; count: number }[] {
  const out: { a: string; b: string; count: number }[] = [];
  for (const t of teams)
    for (let i = 0; i < t.length; i++)
      for (let j = i + 1; j < t.length; j++) {
        const count = partnerCount(history, t[i], t[j]);
        if (count > 0) out.push({ a: t[i], b: t[j], count });
      }
  return out;
}
