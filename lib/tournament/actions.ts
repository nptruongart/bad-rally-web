// Thao tác của BTC trong ngày thi đấu, tính ra các bản sửa (patch) cần ghi — logic thuần, có test.
import { matchResult } from './scoring.ts';
import { groupResultLocked, nextFromWinner } from './bracket.ts';
import type { GameScore, ScoringRule, Side } from './types.ts';
import type { TEvent, TMatch } from './store.ts';

export type Patch = { collection: 'matches' | 'events'; id: string; fields: Record<string, unknown> };

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

export function saveScore(input: {
  match: TMatch; scores: GameScore[]; rule: ScoringRule; eventMatches: TMatch[]; uid: string; now: number; force?: boolean;
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
  return {
    patches: [
      { collection: 'matches', id: match.id, fields: { scores, winner, status: 'done', finished_at: now, log, version: match.version + 1 } },
      ...adv.patches,
    ],
  };
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
export function inversePatches(patches: Patch[], matches: TMatch[], events: TEvent[]): Patch[] {
  return patches.map(p => {
    const cur = (p.collection === 'matches' ? matches.find(m => m.id === p.id) : events.find(e => e.id === p.id)) as Record<string, unknown> | undefined;
    const fields: Record<string, unknown> = {};
    for (const k of Object.keys(p.fields)) {
      if (k === 'version') fields.version = (p.fields.version as number) + 1;
      else fields[k] = cur ? cur[FIELD[k] as string] : null;
    }
    return { collection: p.collection, id: p.id, fields };
  });
}
