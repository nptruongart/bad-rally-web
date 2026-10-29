// Thao tác của BTC trong ngày thi đấu, tính ra các bản sửa (patch) cần ghi — logic thuần, có test.
import { matchResult } from './scoring.ts';
import { fillKoFromGroups, groupResultLocked, nextFromWinner } from './bracket.ts';
import { GROUP_KEYS } from './draw.ts';
import { groupStandings } from './view.ts';
import type { GameScore, ScoringRule, Side, WalkoverMode } from './types.ts';
import type { Entry, TEvent, TMatch } from './store.ts';

export type Patch = { collection: 'matches' | 'events' | 'entries'; id: string; fields: Record<string, unknown> };

const done = (m: TMatch) => m.status === 'done' || m.status === 'walkover';

export const callMatch = (m: TMatch, court: number, now: number): Patch =>
  ({ collection: 'matches', id: m.id, fields: { status: 'called', court, called_at: now, version: m.version + 1 } });

export const uncallMatch = (m: TMatch): Patch =>
  ({ collection: 'matches', id: m.id, fields: { status: 'pending', court: 0, called_at: 0, version: m.version + 1 } });

// Đưa đội thắng trận nhánh vào trận sau; chung kết → nội dung xong. Lỗi nếu trận sau đã bắt đầu.
function advance(match: TMatch, winner: Side, eventMatches: TMatch[]): { patches: Patch[]; error?: string } {
  if (match.stage !== 'ko') return { patches: [] };
  const ko = eventMatches.filter(m => m.stage === 'ko');
  const entry = winner === 'a' ? match.entryA : match.entryB;
  const next = nextFromWinner(ko, match.id, entry);
  if (!next) return { patches: [{ collection: 'events', id: match.event, fields: { stage: 'done' } }] };
  const nm = ko.find(m => m.id === next.id)!;
  if (nm.status !== 'pending' && nm.status !== 'ready') return { patches: [], error: 'Trận vòng sau đã bắt đầu, không sửa kết quả trận này được nữa.' };
  return { patches: [{ collection: 'matches', id: next.id, fields: { [next.side === 'a' ? 'entry_a' : 'entry_b']: entry } }] };
}

// Điền vòng đầu nhánh từ bảng xếp hạng (bỏ qua đôi đã bỏ cuộc khi lấy người đi tiếp)
export function koFillPatches(event: TEvent, entries: Entry[], eventMatches: TMatch[], walkoverMode: WalkoverMode): Patch[] {
  if (event.format !== 'groups_ko') return [];
  const standings: Record<string, string[]> = {};
  for (const g of GROUP_KEYS.slice(0, event.groups || 2)) {
    standings[g] = groupStandings(event, g, entries, eventMatches, walkoverMode)
      .map(r => r.entry).filter(id => entries.find(e => e.id === id)?.status !== 'withdrawn');
  }
  return fillKoFromGroups(eventMatches.filter(m => m.stage === 'ko'), standings)
    .map(u => ({ collection: 'matches' as const, id: u.id, fields: { entry_a: u.entryA, entry_b: u.entryB } }));
}

// Sau khi vòng bảng thay đổi (sửa tỉ số, bỏ cuộc): nếu nhánh đã điền mà chưa bắt đầu → điền lại các trận bị đổi đội
export function refillAfter(event: TEvent | undefined, entries: Entry[] | undefined, matchesAfter: TMatch[], walkoverMode: WalkoverMode): Patch[] {
  if (!event || !entries || event.format !== 'groups_ko') return [];
  const ko = matchesAfter.filter(m => m.stage === 'ko');
  if (!ko.some(m => m.round === 1 && (m.entryA || m.entryB)) || groupResultLocked(ko)) return [];
  if (matchesAfter.some(m => m.stage === 'group' && !done(m))) return [];
  return koFillPatches(event, entries, matchesAfter, walkoverMode).filter(p => {
    const cur = ko.find(m => m.id === p.id)!;
    return cur.entryA !== p.fields.entry_a || cur.entryB !== p.fields.entry_b;
  });
}

export function saveScore(input: {
  match: TMatch; scores: GameScore[]; rule: ScoringRule; eventMatches: TMatch[]; uid: string; now: number; force?: boolean;
  event?: TEvent; entries?: Entry[]; walkoverMode?: WalkoverMode;
}): { patches: Patch[]; error?: string; needsConfirm?: boolean } {
  const { match, scores, rule, eventMatches, uid, now, force } = input;
  if (match.stage === 'group' && groupResultLocked(eventMatches.filter(m => m.stage === 'ko'))) {
    return { patches: [], error: 'Nhánh loại trực tiếp đã bắt đầu, không sửa kết quả vòng bảng được nữa.' };
  }
  const res = matchResult(scores, rule);
  // Sai luật: vẫn suy ra bên thắng theo số set rồi tổng điểm để BTC xác nhận
  const fallback: Side | null = res.games[0] !== res.games[1] ? (res.games[0] > res.games[1] ? 'a' : 'b')
    : res.points[0] !== res.points[1] ? (res.points[0] > res.points[1] ? 'a' : 'b') : null;
  const winner = res.valid && res.winner ? res.winner : fallback;
  if (!winner) return { patches: [], error: 'Tỉ số chưa phân được đội thắng.' };
  if (!(res.valid && res.winner) && !force) return { patches: [], needsConfirm: true };

  const adv = advance(match, winner, eventMatches);
  if (adv.error) return { patches: [], error: adv.error };
  const log = match.scores.length ? [...match.log, { at: now, by: uid, from: match.scores, to: scores }] : match.log;
  const main: Patch = { collection: 'matches', id: match.id, fields: { scores, winner, status: 'done', finished_at: now, log, version: match.version + 1 } };
  const after = eventMatches.map(m => (m.id === match.id ? { ...m, scores, winner, status: 'done' as const } : m));
  const refill = match.stage === 'group' ? refillAfter(input.event, input.entries, after, input.walkoverMode ?? 'walkover') : [];
  return { patches: [main, ...adv.patches, ...refill] };
}

// Đôi bỏ cuộc: các trận chưa đánh của đôi đó → đối thủ thắng xử ép (trận nhánh thì đưa đối thủ lên vòng sau)
export function withdrawPatches(entryId: string, eventMatches: TMatch[], now: number): Patch[] {
  const out: Patch[] = [];
  for (const m of eventMatches) {
    if (done(m) || !m.entryA || !m.entryB || (m.entryA !== entryId && m.entryB !== entryId)) continue;
    const winner: Side = m.entryA === entryId ? 'b' : 'a';
    out.push({ collection: 'matches', id: m.id, fields: { status: 'walkover', winner, scores: [], court: 0, finished_at: now, version: m.version + 1 } });
    out.push(...advance(m, winner, eventMatches).patches);
  }
  return out;
}

const FIELD: Record<string, keyof TMatch | keyof TEvent> = {
  status: 'status', winner: 'winner', scores: 'scores', court: 'court', called_at: 'calledAt', finished_at: 'finishedAt',
  log: 'log', entry_a: 'entryA', entry_b: 'entryB', stage: 'stage',
};

// Bản sửa ngược để Hoàn tác (version vẫn tăng để không đè lên ghi mới hơn)
export function inversePatches(patches: Patch[], matches: TMatch[], events: TEvent[], entries: Entry[]): Patch[] {
  return patches.map(p => {
    const list: { id: string }[] = p.collection === 'matches' ? matches : p.collection === 'events' ? events : entries;
    const cur = list.find(x => x.id === p.id) as Record<string, unknown> | undefined;
    const fields: Record<string, unknown> = {};
    for (const k of Object.keys(p.fields)) {
      if (k === 'version') fields.version = (p.fields.version as number) + 1;
      else fields[k] = cur ? cur[FIELD[k] as string] : null;
    }
    return { collection: p.collection, id: p.id, fields };
  });
}
