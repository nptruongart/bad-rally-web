"use client";
// BTC: thể thức "Đồng đội xoay cặp" — chọn số đội / người mỗi đội / số trận mỗi người, nhập danh sách đội, xem trước bảng lượt × sân, công bố lịch.
import { useState } from "react";
import { pb } from "../../lib/pb";
import type { Participant, TEvent, TournamentData } from "../../lib/tournament/store";
import { GROUP_KEYS } from "../../lib/tournament/draw";
import { normalizeName } from "../../lib/tournament/names";
import { rotationPairs, teamRotRounds, teamRotSchedule } from "../../lib/tournament/teamrot";
import NameInput from "./NameInput";
import { errText } from "./BtcSetup";
import { Btn, Field, inputCls } from "./ui";

function shuffleInPlace<T>(a: T[], rng: () => number) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
}

type Slot = { name: string; picked: Participant | null };
const TEAM_COLORS = ["bg-orange-100 text-orange-900", "bg-emerald-100 text-emerald-900", "bg-sky-100 text-sky-900", "bg-yellow-100 text-yellow-900"];
export const teamColor = (key: string) => TEAM_COLORS[Math.max(0, GROUP_KEYS.indexOf(key as never))];

// Mã PocketBase tự sinh ở máy để tạo cặp và trận trong cùng một lần gửi
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

// Danh sách đội đã lưu: cặp (i, i+1) có seed i+1 → thành viên thứ i là p1 của cặp đó
function savedRoster(data: TournamentData, event: TEvent, teams: number, size: number): Slot[][] {
  const mine = data.entries.filter(e => e.event === event.id && e.status !== "withdrawn");
  return GROUP_KEYS.slice(0, teams).map(k => Array.from({ length: size }, (_, i) => {
    const e = mine.find(x => x.group === k && x.seed === i + 1);
    const p = e ? data.participants.find(x => x.id === e.p1) || null : null;
    return { name: p?.name || "", picked: p };
  }));
}

export default function BtcTeamRot({ data, event }: { data: TournamentData; event: TEvent }) {
  const old = data.entries.filter(e => e.event === event.id && e.status !== "withdrawn");
  const oldTeams = new Set(old.map(e => e.group)).size;
  const [teams, setTeams] = useState<2 | 4>(oldTeams === 2 ? 2 : 4);
  const [size, setSize] = useState(old.length && oldTeams ? Math.round(old.length / oldTeams) : 5);
  const [per, setPer] = useState(4);
  const [roster, setRoster] = useState<Slot[][]>(() => savedRoster(data, event, teams, size));
  const [busy, setBusy] = useState(false);
  const keys = GROUP_KEYS.slice(0, teams);
  const rounds = teamRotRounds(size, per);
  const sched = teamRotSchedule({ teams, size, perPerson: per });
  const pairs = rotationPairs(size);
  const courtsNeeded = teams / 2;

  const resize = (t: number, s: number) => setRoster(r => Array.from({ length: t }, (_, i) => Array.from({ length: s }, (_, j) => r[i]?.[j] || { name: "", picked: null })));
  const setSlot = (ti: number, si: number, v: Partial<Slot>) => setRoster(r => r.map((team, i) => (i !== ti ? team : team.map((s, j) => (j === si ? { ...s, ...v } : s)))));
  const shuffle = () => {
    const all = roster.flat().filter(s => s.name.trim() || s.picked);
    shuffleInPlace(all, Math.random);
    setRoster(keys.map((_, ti) => Array.from({ length: size }, (_, si) => all[si * teams + ti] || { name: "", picked: null })));
  };

  const filled = roster.flat().filter(s => s.picked || s.name.trim()).length;
  const keyOf = (s: Slot) => (s.picked ? `id:${s.picked.id}` : `n:${normalizeName(s.name)}`);
  const dup = (() => { const seen = new Set<string>(); for (const s of roster.flat()) { if (!s.picked && !s.name.trim()) continue; const k = keyOf(s); if (seen.has(k)) return s.picked?.name || s.name.trim(); seen.add(k); } return ""; })();
  const problem = event.category === "XD" ? "Nội dung Nam nữ không dùng được thể thức này (cặp xoay vòng không giữ được 1 nam 1 nữ)."
    : filled < teams * size ? `Còn thiếu ${teams * size - filled} người.` : dup ? `Tên "${dup}" bị nhập 2 lần.` : "";

  const publish = async () => {
    if (problem || busy) return;
    if (!window.confirm(`Công bố lịch ${event.name}: ${teams} bảng × ${size} người, ${rounds} lượt, ${sched.length} trận?`)) return;
    setBusy(true);
    try {
      const gender = event.category === "WD" ? "F" : event.category === "MD" ? "M" : "";
      // Người mới gõ tên → tạo trong giải; trùng tên người đã có thì dùng lại
      const ids: string[][] = [];
      for (const team of roster) {
        const row: string[] = [];
        for (const s of team) {
          const existing = s.picked || data.participants.find(p => normalizeName(p.name) === normalizeName(s.name));
          row.push(existing ? existing.id : (await pb.collection("participants").create({ tournament: data.t.id, name: s.name.trim(), gender, skill: "Trung bình", users: [] })).id);
        }
        ids.push(row);
      }
      const batch = pb.createBatch();
      batch.collection("events").update(event.id, { format: "team_rot", groups: teams, advance: 0, stage: "groups" });
      for (const e of old) batch.collection("entries").delete(e.id);
      const entryId: string[][] = keys.map(() => pairs.map(() => newId()));
      keys.forEach((k, ti) => pairs.forEach(([x, y], pi) =>
        batch.collection("entries").create({ id: entryId[ti][pi], event: event.id, p1: ids[ti][x], p2: ids[ti][y], status: "approved", group: k, seed: x + 1 })));
      for (const s of sched) {
        batch.collection("matches").create({ event: event.id, stage: "group", group: "", round: s.round, order: s.order,
          entry_a: entryId[s.teamA][s.pair], entry_b: entryId[s.teamB][s.pair], status: "pending", version: 0, scores: [], log: [] });
      }
      await batch.send();
    } catch (e) { alert("Không công bố được: " + errText(e)); }
    finally { setBusy(false); }
  };

  const code = (team: number, pair: number) => pairs[pair].map(i => `${keys[team]}${i + 1}`).join("·");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Số bảng (đội)">
          <select value={teams} onChange={e => { const t = Number(e.target.value) as 2 | 4; setTeams(t); resize(t, size); }} className={inputCls}><option value={2}>2</option><option value={4}>4</option></select>
        </Field>
        <Field label="Người mỗi bảng">
          <select value={size} onChange={e => { const s = Number(e.target.value); setSize(s); resize(teams, s); }} className={inputCls}>{[4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
        </Field>
        <Field label="Trận mỗi người">
          <select value={per} onChange={e => setPer(Number(e.target.value))} className={inputCls}>{[2, 4, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
        </Field>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        {teams * size} người · {rounds} lượt · {sched.length} trận · mỗi lượt {courtsNeeded} trận (cần {courtsNeeded} sân{data.t.courts.length < courtsNeeded ? `, giải đang có ${data.t.courts.length}` : ""}). Mỗi trận: 1 cặp của bảng này gặp 1 cặp của bảng kia; xếp hạng bảng theo tổng điểm.
      </p>

      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold text-slate-900">Danh sách các bảng</span>
          <Btn small onClick={shuffle} disabled={filled < 2}><i className="fa-solid fa-shuffle"></i>Xáo ngẫu nhiên</Btn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {keys.map((k, ti) => (
            <div key={k} className="rounded-xl border border-slate-200 overflow-hidden">
              <div className={`px-3 py-1.5 text-sm font-bold ${teamColor(k)}`}>Bảng {k}</div>
              <div className="p-2 flex flex-col gap-1.5">
                {Array.from({ length: size }, (_, si) => {
                  const s = roster[ti]?.[si] || { name: "", picked: null };
                  return (
                    <div key={si} className="flex items-center gap-2">
                      <span className="w-7 shrink-0 text-xs font-bold text-slate-400">{k}{si + 1}</span>
                      <div className="flex-1 min-w-0">
                        <NameInput value={s.name} onChange={v => setSlot(ti, si, { name: v })} picked={s.picked} onPick={p => setSlot(ti, si, { picked: p, name: p?.name || "" })} people={data.participants} placeholder="Tên" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-bold text-slate-900 mb-2">Lượt trận (xem trước)</div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="text-xs border-collapse min-w-full">
            <thead>
              <tr className="text-slate-400">
                <th className="py-1 pr-2 text-left font-semibold">Lượt</th>
                {Array.from({ length: courtsNeeded }, (_, c) => <th key={c} className="py-1 px-1 font-semibold">{data.t.courts[c]?.name || `Sân ${c + 1}`}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rounds }, (_, r) => (
                <tr key={r} className="border-t border-slate-100">
                  <td className="py-1 pr-2 font-bold text-slate-500 tabular-nums">{r + 1}</td>
                  {sched.filter(s => s.round === r + 1).map(s => (
                    <td key={s.order} className="py-1 px-1">
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <span className={`rounded px-1.5 py-0.5 font-semibold ${teamColor(keys[s.teamA])}`}>{code(s.teamA, s.pair)}</span>
                        <span className="text-slate-300">vs</span>
                        <span className={`rounded px-1.5 py-0.5 font-semibold ${teamColor(keys[s.teamB])}`}>{code(s.teamB, s.pair)}</span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {problem ? <p className="text-sm font-medium text-red-600">{problem}</p> : null}
      <Btn tone="green" disabled={!!problem || busy} onClick={publish}>{busy ? "Đang công bố…" : "Công bố lịch"}</Btn>
    </div>
  );
}
