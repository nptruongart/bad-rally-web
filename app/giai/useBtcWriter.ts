"use client";
// Ghi của BTC trong ngày thi đấu (gọi trận, tỉ số, điền nhánh, bỏ cuộc…): cập nhật màn hình ngay, rồi gửi qua hàng đợi
// chịu mất mạng (lưu trên máy, tự gửi lại khi có mạng). Chỉ dùng cho PATCH (gửi lại nhiều lần vẫn cùng kết quả).
// MỖI GIẢI CHỈ MỘT HÀNG ĐỢI trong cả trang (giữ khi BTC chuyển tab) → không bao giờ có 2 hàng đợi cùng gửi lại.
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { pb } from "../../lib/pb";
import { createWriteQueue, type PendingOp } from "../../lib/tournament/writeQueue";
import { toEntry, toEvent, toMatch, type TournamentData } from "../../lib/tournament/store";
import type { Patch } from "../../lib/tournament/actions";
import { errText } from "./BtcSetup";

type Queue = ReturnType<typeof createWriteQueue> & { listeners: Set<(n: number) => void> };
const queues = new Map<string, Queue>();

function queueFor(code: string): Queue {
  let q = queues.get(code);
  if (q) return q;
  const listeners = new Set<(n: number) => void>();
  const base = createWriteQueue({
    storageKey: `badRallyTq:${code}`,
    send: async (op: PendingOp) => {
      const p = op.payload as Patch;
      await pb.collection(p.collection).update(p.id, p.fields);
    },
    onState: n => listeners.forEach(l => l(n)),
    onError: (_op, e) => alert("Một thao tác không lưu được (có thể máy BTC khác vừa sửa trận này). Màn hình sẽ tải lại.\n" + errText(e)),
  });
  q = Object.assign(base, { listeners });
  queues.set(code, q);
  window.addEventListener("online", () => { void base.flush(); });
  void base.flush(); // gửi nốt các thao tác còn lại từ lần mở trước
  return q;
}

export function useBtcWriter(code: string, setData: Dispatch<SetStateAction<TournamentData | null>>, reload?: () => void) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const q = queueFor(code);
    const l = (n: number) => { setPending(n); if (n === 0) reload?.(); };
    q.listeners.add(l);
    l(q.pending());
    return () => { q.listeners.delete(l); };
  }, [code, reload]);

  // Áp dụng ngay trên màn hình (trước khi server trả lời) rồi xếp vào hàng đợi gửi
  const write = (patches: Patch[]) => {
    setData(d => {
      if (!d) return d;
      let { matches, events, entries } = d;
      for (const p of patches) {
        if (p.collection === "matches") matches = matches.map(m => (m.id === p.id ? toMatch({ ...rawMatch(m), ...p.fields } as never) : m));
        else if (p.collection === "events") events = events.map(e => (e.id === p.id ? toEvent({ ...rawEvent(e), ...p.fields } as never) : e));
        else entries = entries.map(e => (e.id === p.id ? toEntry({ ...rawEntry(e), ...p.fields } as never) : e));
      }
      return { ...d, matches, events, entries };
    });
    const q = queueFor(code);
    for (const p of patches) q.push({ id: crypto.randomUUID(), kind: p.collection, payload: p });
  };

  return { write, pending };
}

// Đổi ngược về dạng bản ghi PocketBase để trộn với trường vừa sửa
const rawMatch = (m: TournamentData["matches"][number]) => ({
  id: m.id, event: m.event, stage: m.stage, group: m.group, round: m.round, order: m.order, entry_a: m.entryA, entry_b: m.entryB,
  feeds: m.feeds, status: m.status, court: m.court, scores: m.scores, winner: m.winner, called_at: m.calledAt, finished_at: m.finishedAt, log: m.log, version: m.version,
});
const rawEvent = (e: TournamentData["events"][number]) => ({
  id: e.id, tournament: e.tournament, name: e.name, category: e.category, max_entries: e.maxEntries, format: e.format,
  groups: e.groups, advance: e.advance, scoring: e.scoring, stage: e.stage, order: e.order,
});
const rawEntry = (e: TournamentData["entries"][number]) => ({
  id: e.id, event: e.event, p1: e.p1, p2: e.p2, status: e.status, seed: e.seed, group: e.group, paid: e.paid, created_by: e.createdBy,
});
