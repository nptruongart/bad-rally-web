// Tỉ số nhập tay khi kết thúc trận (1 ván): đội nhiều điểm hơn thắng, không ép luật 21 điểm (nhiều nhóm đánh 11, 15…)
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
