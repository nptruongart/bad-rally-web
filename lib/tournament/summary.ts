// Tổng kết giải: bục trao giải từng nội dung và số liệu chung (thuần, có test)
import { GROUP_KEYS } from './draw.ts';
import { groupStandings } from './view.ts';
import { teamRotPersonStandings, teamRotTeamStandings, type PersonRow, type TeamRow } from './teamrot.ts';
import type { WalkoverMode } from './types.ts';
import type { Entry, TEvent, TMatch } from './store.ts';

const finished = (m: TMatch) => m.status === 'done' || m.status === 'walkover';
const loser = (m: TMatch) => (m.winner === 'a' ? m.entryB : m.winner === 'b' ? m.entryA : '');
const winnerOf = (m: TMatch) => (m.winner === 'a' ? m.entryA : m.winner === 'b' ? m.entryB : '');

export type Podium = {
  complete: boolean; left: number;
  places: { place: number; entries: string[] }[];
  teams?: TeamRow[]; people?: PersonRow[];
};

// Chỉ có bục khi nội dung đã đánh xong hết
export function eventPodium(event: TEvent, entries: Entry[], matches: TMatch[], walkoverMode: WalkoverMode): Podium {
  const mine = matches.filter(m => m.event === event.id);
  const left = mine.filter(m => !finished(m)).length;
  const complete = mine.length > 0 && left === 0;
  const out: Podium = { complete, left, places: [] };
  if (!complete) return out;

  if (event.format === 'team_rot') {
    const es = entries.filter(e => e.event === event.id);
    out.teams = teamRotTeamStandings(GROUP_KEYS.slice(0, event.groups || 0), es, mine);
    out.people = teamRotPersonStandings(es, mine).slice(0, 3);
    return out;
  }

  const ko = mine.filter(m => m.stage === 'ko');
  if (ko.length) {
    const last = Math.max(...ko.map(m => m.round));
    const final = ko.find(m => m.round === last)!;
    out.places.push({ place: 1, entries: [winnerOf(final)] }, { place: 2, entries: [loser(final)] });
    const semis = ko.filter(m => m.round === last - 1).sort((a, b) => a.order - b.order).map(loser).filter(Boolean);
    if (semis.length) out.places.push({ place: 3, entries: semis });
    return out;
  }

  const rows = groupStandings(event, 'A', entries, mine, walkoverMode);
  for (const r of rows.slice(0, 3)) {
    const p = out.places.find(x => x.place === r.rank);
    if (p) p.entries.push(r.entry); else out.places.push({ place: r.rank, entries: [r.entry] });
  }
  return out;
}

export function tournamentStats(matches: TMatch[]): { total: number; done: number; walkover: number; start: number; end: number } {
  const done = matches.filter(finished);
  const called = matches.map(m => m.calledAt).filter(Boolean);
  const ends = done.map(m => m.finishedAt).filter(Boolean);
  return {
    total: matches.length, done: done.length, walkover: done.filter(m => m.status === 'walkover').length,
    start: called.length ? Math.min(...called) : 0, end: ends.length ? Math.max(...ends) : 0,
  };
}
