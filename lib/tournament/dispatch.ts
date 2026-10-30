// Hàng đợi gọi trận chung cho mọi nội dung: trận nào sẵn sàng, trận nào bị khóa (người đang đánh / chưa nghỉ đủ), thứ tự gợi ý.
export type MatchStatus = 'pending' | 'ready' | 'called' | 'playing' | 'done' | 'walkover';

export type DMatch = {
  id: string;
  event: string;
  stage: 'group' | 'ko';
  round: number;
  order: number;
  entryA?: string;
  entryB?: string;
  status: MatchStatus;
  finishedAt?: number;
};

export type BlockReason = { kind: 'busy'; person: string; matchId: string } | { kind: 'rest'; person: string; until: number };

const isOpen = (s: MatchStatus) => s === 'pending' || s === 'ready';
const isOnCourt = (s: MatchStatus) => s === 'called' || s === 'playing';

// restExempt: nội dung tự lo phần nghỉ trong lịch (đồng đội xoay cặp) → giữa 2 trận cùng nội dung đó không tính giờ nghỉ
export function planQueue<M extends DMatch>(input: { matches: M[]; people: Record<string, string[]>; now: number; restMs: number; restExempt?: string[] }): {
  ready: M[];
  blocked: { match: M; reason: BlockReason }[];
} {
  const { matches, people, now, restMs } = input;
  const exempt = new Set(input.restExempt || []);
  const who = (m: DMatch) => [...(people[m.entryA!] || []), ...(people[m.entryB!] || [])];

  const onCourt = new Map<string, string>(); // người → trận đang ở sân
  const lastDone = new Map<string, number>(); // người → lúc xong trận gần nhất
  const lastDoneOther = new Map<string, number>(); // người → lúc xong trận gần nhất không thuộc nội dung miễn nghỉ
  const remaining = new Map<string, number>(); // nội dung → số trận chưa xong
  for (const m of matches) {
    if (m.status !== 'done' && m.status !== 'walkover') remaining.set(m.event, (remaining.get(m.event) || 0) + 1);
    if (!m.entryA || !m.entryB) continue;
    for (const p of who(m)) {
      if (isOnCourt(m.status)) onCourt.set(p, m.id);
      if (m.status === 'done' && m.finishedAt) {
        lastDone.set(p, Math.max(lastDone.get(p) || 0, m.finishedAt));
        if (!exempt.has(m.event)) lastDoneOther.set(p, Math.max(lastDoneOther.get(p) || 0, m.finishedAt));
      }
    }
  }

  const ready: M[] = [];
  const blocked: { match: M; reason: BlockReason }[] = [];
  for (const m of matches) {
    if (!isOpen(m.status) || !m.entryA || !m.entryB) continue;
    const ps = who(m);
    const busy = ps.find(p => onCourt.has(p));
    if (busy) { blocked.push({ match: m, reason: { kind: 'busy', person: busy, matchId: onCourt.get(busy)! } }); continue; }
    const last = exempt.has(m.event) ? lastDoneOther : lastDone;
    const resting = ps.find(p => last.has(p) && last.get(p)! + restMs > now);
    if (resting) { blocked.push({ match: m, reason: { kind: 'rest', person: resting, until: last.get(resting)! + restMs } }); continue; }
    ready.push(m);
  }

  const lastPlayed = (m: DMatch) => Math.max(0, ...who(m).map(p => lastDone.get(p) || 0));
  ready.sort((x, y) =>
    (x.stage === y.stage ? 0 : x.stage === 'group' ? -1 : 1)
    || x.round - y.round
    || (remaining.get(y.event) || 0) - (remaining.get(x.event) || 0)
    || lastPlayed(x) - lastPlayed(y)
    || x.order - y.order);
  return { ready, blocked };
}
