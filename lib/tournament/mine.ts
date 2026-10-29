// Phần "của tôi" ở giải đấu: trận nào cần báo tới lượt, trận kế tiếp của từng đôi.
import type { TMatch } from './store.ts';

const involves = (ids: string[], m: TMatch) => ids.includes(m.entryA) || ids.includes(m.entryB);

// Khóa đã xác nhận "OK" cho một lần gọi (id trận + thời điểm gọi): gọi lại lần nữa thì báo lại
export const ackKey = (m: TMatch) => `${m.id}:${m.calledAt}`;

// Trận của tôi đang được gọi ra sân mà tôi chưa bấm OK — dùng cả khi vừa mở lại app (lỡ realtime lúc khóa màn hình)
export const newCalls = (myEntryIds: string[], matches: TMatch[], acked: string[]) =>
  matches.filter(m => m.status === 'called' && involves(myEntryIds, m) && !acked.includes(ackKey(m)));

// Mỗi đôi của tôi: trận chưa xong sớm nhất (đang gọi xếp trước)
export function myNextMatches(myEntryIds: string[], matches: TMatch[]): TMatch[] {
  const open = matches.filter(m => m.status !== 'done' && m.status !== 'walkover' && involves(myEntryIds, m));
  const out: TMatch[] = [];
  for (const id of myEntryIds) {
    const onCourt = (m: TMatch) => (m.status === 'called' || m.status === 'playing' ? 0 : 1);
    const next = open.filter(m => m.entryA === id || m.entryB === id)
      .sort((a, b) => onCourt(a) - onCourt(b) || (a.stage === b.stage ? 0 : a.stage === 'group' ? -1 : 1) || a.round - b.round || a.order - b.order)[0];
    if (next && !out.includes(next)) out.push(next);
  }
  return out.sort((a, b) => (b.status === 'called' ? 1 : 0) - (a.status === 'called' ? 1 : 0));
}
