"use client";
// Ghi của BTC trong ngày thi đấu (gọi trận, tỉ số, điền nhánh…): cập nhật màn hình ngay, rồi gửi qua hàng đợi
// chịu mất mạng (lưu trên máy, tự gửi lại khi có mạng). Chỉ dùng cho PATCH (gửi lại nhiều lần vẫn cùng kết quả).
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { pb } from "../../lib/pb";
import { createWriteQueue, type PendingOp } from "../../lib/tournament/writeQueue";
import { toEvent, toMatch, type TournamentData } from "../../lib/tournament/store";
import type { Patch } from "../../lib/tournament/actions";
import { errText } from "./BtcSetup";


export function useBtcWriter(code: string, setData: Dispatch<SetStateAction<TournamentData | null>>) {
  const [pending, setPending] = useState(0);
  const queueRef = useRef<ReturnType<typeof createWriteQueue> | null>(null);

  useEffect(() => {
    const q = createWriteQueue({
      storageKey: `badRallyTq:${code}`,
      send: async (op: PendingOp) => {
        const p = op.payload as Patch;
        await pb.collection(p.collection).update(p.id, p.fields);
      },
      onState: setPending,
      onError: (_op, e) => alert("Một thao tác không lưu được: " + errText(e)),
    });
    queueRef.current = q;
    void q.flush(); // gửi nốt các thao tác còn lại từ lần mở trước
    const online = () => { void q.flush(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [code]);

  // Áp dụng ngay trên màn hình (trước khi server trả lời) rồi xếp vào hàng đợi gửi
  const write = (patches: Patch[]) => {
    setData(d => {
      if (!d) return d;
      let matches = d.matches, events = d.events;
      for (const p of patches) {
        if (p.collection === "matches") matches = matches.map(m => (m.id === p.id ? toMatch({ ...rawMatch(m), ...p.fields } as never) : m));
        else events = events.map(e => (e.id === p.id ? toEvent({ ...rawEvent(e), ...p.fields } as never) : e));
      }
      return { ...d, matches, events };
    });
    for (const p of patches) queueRef.current?.push({ id: crypto.randomUUID(), kind: p.collection, payload: p });
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
