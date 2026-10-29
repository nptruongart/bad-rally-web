// Chuẩn hóa tên để tìm/gợi ý (giống normalizeName ở pb_hooks/tournament_utils.js — giữ hai bản khớp nhau)
export function normalizeName(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Gợi ý người đã có trong giải: khớp không dấu; tên bắt đầu bằng chuỗi gõ được xếp trước
export function suggestNames<T extends { id: string; name: string }>(q: string, people: T[], limit = 5): T[] {
  const key = normalizeName(q);
  if (!key) return [];
  const hits = people.map(p => ({ p, n: normalizeName(p.name) })).filter(x => x.n.includes(key));
  const starts = hits.filter(x => x.n.startsWith(key)), rest = hits.filter(x => !x.n.startsWith(key));
  return [...starts, ...rest].slice(0, limit).map(x => x.p);
}
