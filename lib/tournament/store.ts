"use client";
// Tầng dữ liệu của trang Giải đấu: tải cả giải theo mã, lắng nghe realtime, tải lại khi mở lại app / có mạng.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordModel, UnsubscribeFunc } from 'pocketbase';
import { pb, ensureAuth } from '../pb.ts';
import type { GameScore, ScoringRule, WalkoverMode } from './types.ts';
import type { MatchStatus } from './dispatch.ts';
import type { Feed } from './draw.ts';

export const tournamentIdFromCode = (code: string) => `trn${code}000000`;

export type Court = { id: number; name: string };
export type Tournament = {
  id: string; code: string; name: string; hosts: string[];
  status: 'draft' | 'registration' | 'closed' | 'running' | 'finished';
  regDeadline: string; courts: Court[];
  settings: { rest_minutes: number; walkover_mode: WalkoverMode };
};
export type TEvent = {
  id: string; tournament: string; name: string; category: 'MD' | 'WD' | 'XD' | 'open';
  maxEntries: number; format: 'rr' | 'groups_ko' | 'team_rot' | ''; groups: number; advance: number;
  scoring: ScoringRule; stage: 'registration' | 'drawn' | 'groups' | 'ko' | 'done' | ''; order: number;
};
export type Participant = { id: string; tournament: string; name: string; gender: 'M' | 'F' | ''; skill: string; users: string[] };
export type Entry = {
  id: string; event: string; p1: string; p2: string;
  status: 'pending' | 'approved' | 'waitlist' | 'withdrawn'; seed: number; group: string; paid: boolean; createdBy: string;
};
export type LogItem = { at: number; by: string; from: GameScore[]; to: GameScore[] };
export type TMatch = {
  id: string; event: string; stage: 'group' | 'ko'; group: string; round: number; order: number;
  entryA: string; entryB: string; feeds: { a?: Feed; b?: Feed } | null; status: MatchStatus; court: number;
  scores: GameScore[]; winner: 'a' | 'b' | ''; calledAt: number; finishedAt: number; log: LogItem[]; version: number;
};

const DEFAULT_SCORING: ScoringRule = { games: 1, points: 21, cap: 30 };

export const toTournament = (r: RecordModel): Tournament => ({
  id: r.id, code: r.code, name: r.name, hosts: r.hosts || [], status: r.status, regDeadline: r.reg_deadline || '',
  courts: r.courts || [], settings: { rest_minutes: 10, walkover_mode: 'walkover', ...(r.settings || {}) },
});
export const toEvent = (r: RecordModel): TEvent => ({
  id: r.id, tournament: r.tournament, name: r.name, category: r.category, maxEntries: r.max_entries || 12,
  format: r.format || '', groups: r.groups || 0, advance: r.advance || 0, scoring: { ...DEFAULT_SCORING, ...(r.scoring || {}) },
  stage: r.stage || '', order: r.order || 0,
});
export const toParticipant = (r: RecordModel): Participant => ({ id: r.id, tournament: r.tournament, name: r.name, gender: r.gender || '', skill: r.skill || '', users: r.users || [] });
export const toEntry = (r: RecordModel): Entry => ({
  id: r.id, event: r.event, p1: r.p1, p2: r.p2, status: r.status, seed: r.seed || 0, group: r.group || '', paid: !!r.paid, createdBy: r.created_by || '',
});
export const toMatch = (r: RecordModel): TMatch => ({
  id: r.id, event: r.event, stage: r.stage, group: r.group || '', round: r.round || 0, order: r.order || 0,
  entryA: r.entry_a || '', entryB: r.entry_b || '', feeds: r.feeds || null, status: r.status, court: r.court || 0,
  scores: r.scores || [], winner: r.winner || '', calledAt: r.called_at || 0, finishedAt: r.finished_at || 0, log: r.log || [], version: r.version || 0,
});

export type TournamentData = {
  t: Tournament; events: TEvent[]; participants: Participant[]; entries: Entry[]; matches: TMatch[];
};

const upsert = <T extends { id: string }>(list: T[], item: T, del: boolean) =>
  del ? list.filter(x => x.id !== item.id) : list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [...list, item];

export function useTournament(code: string) {
  const [data, setData] = useState<TournamentData | null>(null);
  const [error, setError] = useState<'not_found' | 'network' | ''>('');
  const [uid, setUid] = useState('');
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!/^\d{6}$/.test(code)) return;
    const id = tournamentIdFromCode(code);
    let cancelled = false;
    const unsubs: UnsubscribeFunc[] = [];
    const byT = pb.filter('tournament = {:id}', { id });
    const byEventT = pb.filter('event.tournament = {:id}', { id });

    const load = async () => {
      try {
        const me = await ensureAuth();
        const [t, events, participants, entries, matches] = await Promise.all([
          pb.collection('tournaments').getOne(id),
          pb.collection('events').getFullList({ filter: byT, sort: 'order,created' }),
          pb.collection('participants').getFullList({ filter: byT, sort: 'created' }),
          pb.collection('entries').getFullList({ filter: byEventT, sort: 'created' }),
          pb.collection('matches').getFullList({ filter: byEventT, sort: 'round,order' }),
        ]);
        if (cancelled) return;
        setUid(me);
        setError('');
        setData({ t: toTournament(t), events: events.map(toEvent), participants: participants.map(toParticipant), entries: entries.map(toEntry), matches: matches.map(toMatch) });
      } catch (e) {
        if (!cancelled) setError((e as { status?: number })?.status === 404 ? 'not_found' : 'network');
      }
    };
    loadRef.current = load;

    const patch = <K extends keyof Omit<TournamentData, 't'>>(key: K, item: TournamentData[K][number], del: boolean) =>
      setData(d => (d ? { ...d, [key]: upsert(d[key] as { id: string }[], item, del) } : d));

    (async () => {
      try {
        await ensureAuth();
        unsubs.push(await pb.collection('tournaments').subscribe(id, e => setData(d => (d ? { ...d, t: toTournament(e.record) } : d))));
        unsubs.push(await pb.collection('events').subscribe('*', e => patch('events', toEvent(e.record), e.action === 'delete'), { filter: byT }));
        unsubs.push(await pb.collection('participants').subscribe('*', e => patch('participants', toParticipant(e.record), e.action === 'delete'), { filter: byT }));
        unsubs.push(await pb.collection('entries').subscribe('*', e => patch('entries', toEntry(e.record), e.action === 'delete'), { filter: byEventT }));
        unsubs.push(await pb.collection('matches').subscribe('*', e => patch('matches', toMatch(e.record), e.action === 'delete'), { filter: byEventT }));
        unsubs.push(await pb.realtime.subscribe('PB_CONNECT', () => { load(); }));
        if (cancelled) { unsubs.forEach(u => u()); return; }
      } catch (e) { console.error('Lỗi realtime giải đấu:', e); }
      await load();
    })();

    let lastWake = 0;
    const onWake = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastWake < 2000) return;
      lastWake = Date.now();
      load();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    return () => {
      cancelled = true;
      unsubs.forEach(u => u());
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [code]);

  const reload = useCallback(() => loadRef.current(), []);
  const isBtc = !!data && !!uid && data.t.hosts.includes(uid);
  const myParticipantIds = data && uid ? data.participants.filter(p => p.users.includes(uid)).map(p => p.id) : [];
  return { data, error, uid, isBtc, myParticipantIds, reload, setData };
}
