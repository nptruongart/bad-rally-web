"use client";
// BTC: danh sách đôi theo nội dung (duyệt, đổi người, lệ phí, xóa, thêm tay) và danh sách người (SĐT, gộp, gỡ máy đã nhận).
import { useEffect, useState } from "react";
import { pb } from "../../lib/pb";
import type { Entry, Participant, TEvent, TournamentData } from "../../lib/tournament/store";
import { entryLabel } from "../../lib/tournament/view";
import NameInput from "./NameInput";
import { errText } from "./BtcSetup";
import { Btn, Card, Field, Tabs, inputCls } from "./ui";

const STATUS = { pending: ["Chờ duyệt", "bg-orange-100 text-orange-700"], approved: ["Đã duyệt", "bg-green-100 text-emerald-700"], waitlist: ["Danh sách chờ", "bg-slate-200 text-slate-700"], withdrawn: ["Đã rút", "bg-slate-100 text-slate-400"] } as const;
const ORDER = { approved: 0, pending: 1, waitlist: 2, withdrawn: 3 } as const;

// Chọn người có sẵn hoặc gõ tên mới (kèm giới tính)
function PersonPicker({ label, people, value, onChange }: { label: string; people: Participant[]; value: { picked: Participant | null; name: string; gender: "M" | "F" }; onChange: (v: { picked: Participant | null; name: string; gender: "M" | "F" }) => void }) {
  return (
    <Field label={label}>
      <NameInput value={value.name} onChange={name => onChange({ ...value, name })} picked={value.picked} onPick={picked => onChange({ ...value, picked })} people={people} placeholder="Chọn hoặc gõ tên mới" />
      {!value.picked && (
        <div className="flex gap-1 mt-1">
          {(["M", "F"] as const).map(g => <button key={g} type="button" onClick={() => onChange({ ...value, gender: g })} className={`flex-1 rounded-lg border border-slate-200 text-xs font-semibold py-0.5 ${value.gender === g ? "bg-slate-900 text-white border-slate-900" : "bg-white"}`}>{g === "M" ? "Nam" : "Nữ"}</button>)}
        </div>
      )}
    </Field>
  );
}

const ensurePerson = async (tid: string, v: { picked: Participant | null; name: string; gender: "M" | "F" }) =>
  v.picked ? v.picked.id : (await pb.collection("participants").create({ tournament: tid, name: v.name.trim(), gender: v.gender, skill: "Trung bình", users: [] })).id;

function EntryRow({ e, data, event }: { e: Entry; data: TournamentData; event: TEvent }) {
  const [edit, setEdit] = useState(false);
  const [p1, setP1] = useState(e.p1);
  const [p2, setP2] = useState(e.p2);
  const upd = async (body: Record<string, unknown>) => { try { await pb.collection("entries").update(e.id, body); } catch (err) { alert(errText(err)); } };
  const del = async () => { if (window.confirm(`Xóa đôi ${entryLabel(e, data.participants)}?`)) { try { await pb.collection("entries").delete(e.id); } catch (err) { alert(errText(err)); } } };
  const drawn = !!event.stage && event.stage !== "registration";
  const [label, cls] = STATUS[e.status];
  return (
    <div className="rounded-lg border border-slate-200 p-2 text-xs flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 font-semibold truncate">{entryLabel(e, data.participants)}</span>
        <span className={`shrink-0 px-1.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        {(e.status === "pending" || e.status === "waitlist") && <Btn small tone="green" onClick={() => upd({ status: "approved" })}>Duyệt</Btn>}
        {e.status === "approved" && !drawn && <Btn small onClick={() => upd({ status: "pending" })}>Bỏ duyệt</Btn>}
        <label className="flex items-center gap-1 font-medium ml-1"><input type="checkbox" checked={e.paid} onChange={ev => upd({ paid: ev.target.checked })} />Lệ phí</label>
        <span className="flex-1"></span>
        <Btn small onClick={() => setEdit(!edit)}><i className="fa-solid fa-user-pen"></i></Btn>
        {!drawn && <Btn small tone="red" onClick={del}><i className="fa-solid fa-trash-can"></i></Btn>}
      </div>
      {edit && (
        <div className="grid grid-cols-2 gap-1 mt-1">
          {[[p1, setP1], [p2, setP2]].map(([v, set], i) => (
            <select key={i} value={v as string} onChange={ev => (set as (s: string) => void)(ev.target.value)} className="rounded-lg border border-slate-200 p-1 text-xs font-medium">
              {data.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ))}
          <Btn small tone="black" onClick={async () => { await upd({ p1, p2 }); setEdit(false); }}>Lưu đổi người</Btn>
        </div>
      )}
    </div>
  );
}

type Pick = { picked: Participant | null; name: string; gender: "M" | "F" };

function AddEntry({ data, event }: { data: TournamentData; event: TEvent }) {
  const empty: Pick = { picked: null, name: "", gender: event.category === "WD" ? "F" : "M" };
  const [a, setA] = useState<Pick>(empty);
  const [b, setB] = useState<Pick>({ ...empty, gender: event.category === "XD" ? "F" : empty.gender });
  const add = async () => {
    if ((!a.picked && !a.name.trim()) || (!b.picked && !b.name.trim())) { alert("Nhập đủ 2 người."); return; }
    try {
      const p1 = await ensurePerson(data.t.id, a), p2 = await ensurePerson(data.t.id, b);
      await pb.collection("entries").create({ event: event.id, p1, p2, status: "approved" });
      setA(empty); setB({ ...b, picked: null, name: "" });
    } catch (e) { alert("Không thêm được đôi: " + errText(e)); }
  };
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-2 flex flex-col gap-2 bg-amber-50/60">
      <div className="grid grid-cols-2 gap-2">
        <PersonPicker label="Người 1" people={data.participants} value={a} onChange={setA} />
        <PersonPicker label="Người 2" people={data.participants} value={b} onChange={setB} />
      </div>
      <Btn tone="black" onClick={add}>+ Thêm đôi (đã duyệt)</Btn>
    </div>
  );
}

function People({ data }: { data: TournamentData }) {
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeTo, setMergeTo] = useState("");
  useEffect(() => {
    pb.collection("contacts").getFullList({ filter: pb.filter("participant.tournament = {:t}", { t: data.t.id }) })
      .then(list => setPhones(Object.fromEntries(list.map(c => [c.participant, c.phone])))).catch(() => {});
  }, [data.t.id, data.participants.length]);

  const rename = async (p: Participant) => {
    const name = window.prompt("Tên mới:", p.name);
    if (name && name.trim() && name.trim() !== p.name) { try { await pb.collection("participants").update(p.id, { name: name.trim() }); } catch (e) { alert(errText(e)); } }
  };
  const clearDevices = async (p: Participant) => {
    if (!window.confirm(`Gỡ ${p.users.length} máy đã nhận tên "${p.name}"? Họ cần chọn "Tôi là…" lại.`)) return;
    try { await pb.collection("participants").update(p.id, { users: [] }); } catch (e) { alert(errText(e)); }
  };
  // Gộp B vào A: chuyển mọi đôi của B sang A, gộp máy đã nhận (tối đa 3), rồi xóa B
  const merge = async () => {
    const from = data.participants.find(p => p.id === mergeFrom), to = data.participants.find(p => p.id === mergeTo);
    if (!from || !to || from.id === to.id) { alert("Chọn 2 người khác nhau."); return; }
    if (!window.confirm(`Gộp "${from.name}" vào "${to.name}"? Các đôi của "${from.name}" sẽ chuyển sang "${to.name}".`)) return;
    try {
      for (const e of data.entries.filter(x => x.p1 === from.id || x.p2 === from.id)) {
        await pb.collection("entries").update(e.id, e.p1 === from.id ? { p1: to.id } : { p2: to.id });
      }
      const users = [...new Set([...to.users, ...from.users])].slice(0, 3);
      await pb.collection("participants").update(to.id, { users });
      await pb.collection("participants").delete(from.id);
      setMergeFrom(""); setMergeTo("");
    } catch (e) { alert("Không gộp được: " + errText(e)); }
  };

  // Phân biệt người trùng tên: kèm các nội dung họ đang đăng ký
  const personLabel = (p: Participant) => {
    const evs = data.entries.filter(e => e.p1 === p.id || e.p2 === p.id).map(e => data.events.find(x => x.id === e.event)?.name).filter(Boolean);
    return `${p.name} · ${evs.length ? evs.join(", ") : "chưa có đôi"}`;
  };
  const sorted = [...data.participants].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  return (
    <div className="flex flex-col gap-3">
      <Card title="Gộp 2 người bị trùng">
        <div className="grid grid-cols-2 gap-2">
          <select value={mergeFrom} onChange={e => setMergeFrom(e.target.value)} className={inputCls}><option value="">Người trùng…</option>{sorted.map(p => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}</select>
          <select value={mergeTo} onChange={e => setMergeTo(e.target.value)} className={inputCls}><option value="">Gộp vào…</option>{sorted.map(p => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}</select>
        </div>
        <Btn tone="black" className="mt-2 w-full" onClick={merge}>Gộp</Btn>
      </Card>
      <Card title={`Người chơi (${data.participants.length})`}>
        <div className="flex flex-col divide-y divide-gray-200">
          {sorted.map(p => (
            <div key={p.id} className="flex items-center gap-2 py-1.5 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{p.name} <span className={p.gender === "F" ? "text-pink-500" : "text-blue-500"}>{p.gender === "F" ? "♀" : "♂"}</span></div>
                <div className="font-medium text-slate-500">{phones[p.id] || "—"} · {data.entries.filter(e => (e.p1 === p.id || e.p2 === p.id) && e.status !== "withdrawn").length} đôi · {p.users.length} máy</div>
              </div>
              <Btn small onClick={() => rename(p)}><i className="fa-solid fa-pen"></i></Btn>
              {p.users.length > 0 && <Btn small onClick={() => clearDevices(p)}>Gỡ máy</Btn>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function BtcEntries({ data }: { data: TournamentData }) {
  const [tab, setTab] = useState<string>(data.events[0]?.id || "people");
  const event = data.events.find(e => e.id === tab);
  const list = event ? data.entries.filter(e => e.event === event.id).sort((a, b) => ORDER[a.status] - ORDER[b.status]) : [];
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={tab} onChange={setTab} items={[...data.events.map(e => ({ id: e.id, label: e.name })), { id: "people", label: "Người chơi" }]} />
      {event ? (
        <Card title={`${event.name}: ${list.filter(e => e.status === "approved").length}/${event.maxEntries} đôi đã duyệt`}>
          <div className="flex flex-col gap-2">
            {list.length === 0 && <p className="text-xs font-medium text-slate-500">Chưa có đôi nào.</p>}
            {list.map(e => <EntryRow key={e.id} e={e} data={data} event={event} />)}
            <AddEntry data={data} event={event} />
          </div>
        </Card>
      ) : <People data={data} />}
    </div>
  );
}
