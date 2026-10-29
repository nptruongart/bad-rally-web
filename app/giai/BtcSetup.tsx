"use client";
// BTC: thông tin giải, sân, trạng thái, link/QR giải, mã BTC + danh sách máy BTC, các nội dung thi đấu.
import { useEffect, useState } from "react";
import type { ClientResponseError } from "pocketbase";
import { pb, PUBLIC_APP_URL } from "../../lib/pb";
import QrCode from "../QrCode";
import type { TEvent, TournamentData } from "../../lib/tournament/store";
import { defaultCap } from "../../lib/tournament/scoring";
import { Btn, Card, Field, inputCls } from "./ui";

export const errText = (e: unknown) => (e as ClientResponseError)?.response?.message || (e as Error)?.message || "Lỗi không rõ";
const BTC_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomBtcCode = () => Array.from(crypto.getRandomValues(new Uint32Array(8)), n => BTC_ALPHABET[n % BTC_ALPHABET.length]).join("");
const toLocalInput = (iso: string) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

const NEXT_STATUS: Record<TournamentData["t"]["status"], { to: TournamentData["t"]["status"]; label: string; tone: "yellow" | "blue" | "red" | "green" }[]> = {
  draft: [{ to: "registration", label: "Mở đăng ký", tone: "green" }],
  registration: [{ to: "closed", label: "Khóa đăng ký", tone: "red" }],
  closed: [{ to: "registration", label: "Mở lại đăng ký", tone: "yellow" }, { to: "running", label: "Bắt đầu thi đấu", tone: "green" }],
  running: [{ to: "finished", label: "Kết thúc giải", tone: "red" }],
  finished: [{ to: "running", label: "Mở lại giải", tone: "yellow" }],
};

function EventEditor({ ev, tournamentId, onDone }: { ev?: TEvent; tournamentId: string; onDone: () => void }) {
  const [name, setName] = useState(ev?.name || "");
  const [category, setCategory] = useState<TEvent["category"]>(ev?.category || "MD");
  const [maxEntries, setMaxEntries] = useState(ev?.maxEntries || 12);
  const [games, setGames] = useState<1 | 3>(ev?.scoring.games || 1);
  const [points, setPoints] = useState(ev?.scoring.points || 21);
  const [cap, setCap] = useState(ev?.scoring.cap || 30);
  const save = async () => {
    if (!name.trim()) { alert("Nhập tên nội dung."); return; }
    const body = { name: name.trim(), category, max_entries: maxEntries, scoring: { games, points, cap } };
    try {
      if (ev) await pb.collection("events").update(ev.id, body);
      else await pb.collection("events").create({ ...body, tournament: tournamentId, stage: "registration", order: Date.now() % 1e9 });
      onDone();
    } catch (e) { alert("Không lưu được nội dung: " + errText(e)); }
  };
  return (
    <div className="flex flex-col gap-2 border-2 border-dashed border-black p-2 bg-yellow-50">
      <Field label="Tên nội dung"><input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="VD: Đôi nam B" className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Loại">
          <select value={category} onChange={e => setCategory(e.target.value as TEvent["category"])} className={inputCls}>
            <option value="MD">Đôi nam</option><option value="WD">Đôi nữ</option><option value="XD">Nam nữ</option><option value="open">Tự do</option>
          </select>
        </Field>
        <Field label="Số đôi tối đa"><input type="number" min={2} max={12} value={maxEntries} onChange={e => setMaxEntries(Math.min(12, Math.max(2, Number(e.target.value) || 2)))} className={inputCls} /></Field>
        <Field label="Số set">
          <select value={games} onChange={e => setGames(Number(e.target.value) as 1 | 3)} className={inputCls}><option value={1}>1 set</option><option value={3}>Thắng 2/3 set</option></select>
        </Field>
        <Field label="Điểm mỗi set">
          <input type="number" min={5} max={51} value={points} onChange={e => { const p = Number(e.target.value) || 21; setPoints(p); setCap(defaultCap(p)); }} className={inputCls} />
        </Field>
        <Field label="Điểm trần"><input type="number" min={points} max={60} value={cap} onChange={e => setCap(Number(e.target.value) || defaultCap(points))} className={inputCls} /></Field>
      </div>
      <p className="text-[10px] font-bold text-gray-500">Gợi ý: 21 điểm trần 30 (luật cũ) · 15 điểm trần 21 (luật BWF từ 2027).</p>
      <div className="flex gap-2"><Btn tone="black" onClick={save}>Lưu nội dung</Btn><Btn onClick={onDone}>Hủy</Btn></div>
    </div>
  );
}

export default function BtcSetup({ data, uid }: { data: TournamentData; uid: string }) {
  const { t, events, entries } = data;
  const [name, setName] = useState(t.name);
  const [courts, setCourts] = useState(t.courts);
  const [deadline, setDeadline] = useState(toLocalInput(t.regDeadline));
  const [rest, setRest] = useState(t.settings.rest_minutes);
  const [walkover, setWalkover] = useState(t.settings.walkover_mode);
  const [secret, setSecret] = useState<{ id: string; code: string } | null>(null);
  const [editing, setEditing] = useState<string>("");
  const link = `${PUBLIC_APP_URL}/giai?code=${t.code}`;

  useEffect(() => {
    pb.collection("tournament_secrets").getFirstListItem(pb.filter("tournament = {:t}", { t: t.id }))
      .then(r => setSecret({ id: r.id, code: r.btc_code })).catch(() => setSecret(null));
  }, [t.id]);

  const saveInfo = async () => {
    try {
      await pb.collection("tournaments").update(t.id, {
        name: name.trim() || t.name, courts: courts.filter(c => c.name.trim()),
        reg_deadline: deadline ? new Date(deadline).toISOString() : "",
        settings: { ...t.settings, rest_minutes: rest, walkover_mode: walkover },
      });
      alert("Đã lưu thông tin giải.");
    } catch (e) { alert("Không lưu được: " + errText(e)); }
  };
  const setStatus = async (to: TournamentData["t"]["status"]) => {
    if (to === "finished" && !window.confirm("Kết thúc giải? Mọi người vẫn xem được kết quả.")) return;
    try { await pb.collection("tournaments").update(t.id, { status: to }); } catch (e) { alert(errText(e)); }
  };
  const rotateCode = async () => {
    if (!secret || !window.confirm("Đổi mã BTC? Mã cũ không dùng được nữa (máy BTC hiện có vẫn giữ quyền).")) return;
    const code = randomBtcCode();
    try { await pb.collection("tournament_secrets").update(secret.id, { btc_code: code }); setSecret({ ...secret, code }); } catch (e) { alert(errText(e)); }
  };
  const removeHost = async (id: string) => {
    if (t.hosts.length <= 1) { alert("Giải phải còn ít nhất 1 máy BTC."); return; }
    if (!window.confirm(id === uid ? "Bỏ quyền BTC của chính máy này?" : "Gỡ quyền BTC của máy này?")) return;
    try { await pb.collection("tournaments").update(t.id, { hosts: t.hosts.filter(h => h !== id) }); } catch (e) { alert(errText(e)); }
  };
  const deleteEvent = async (ev: TEvent) => {
    const n = entries.filter(e => e.event === ev.id).length;
    if (!window.confirm(`Xóa nội dung "${ev.name}"${n ? ` cùng ${n} đôi đã đăng ký` : ""}? Không hoàn tác được.`)) return;
    try { await pb.collection("events").delete(ev.id); } catch (e) { alert(errText(e)); }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card title="Trạng thái giải">
        <div className="flex flex-wrap gap-2">
          {NEXT_STATUS[t.status].map(s => <Btn key={s.to} tone={s.tone} onClick={() => setStatus(s.to)}>{s.label}</Btn>)}
        </div>
      </Card>

      <Card title="Link & QR giải">
        <div className="flex flex-col items-center gap-2">
          <div className="border-4 border-black p-1 bg-white"><QrCode value={link} size={176} className="w-44 h-44" /></div>
          <p className="text-xs font-bold break-all text-center">{link}</p>
          <Btn small onClick={() => { navigator.clipboard?.writeText(link).then(() => alert("Đã chép link."), () => alert(link)); }}>Chép link</Btn>
        </div>
      </Card>

      <Card title="Thông tin giải">
        <div className="flex flex-col gap-2">
          <Field label="Tên giải"><input value={name} onChange={e => setName(e.target.value)} maxLength={80} className={inputCls} /></Field>
          <Field label="Hạn đăng ký"><input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} /></Field>
          <Field label="Các sân">
            <div className="flex flex-col gap-1">
              {courts.map((c, i) => (
                <div key={c.id} className="flex gap-1">
                  <input value={c.name} onChange={e => setCourts(courts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={20} className={inputCls} />
                  <Btn small tone="red" onClick={() => setCourts(courts.filter((_, j) => j !== i))}><i className="fa-solid fa-xmark"></i></Btn>
                </div>
              ))}
              <Btn small onClick={() => { const id = Math.max(0, ...courts.map(c => c.id)) + 1; setCourts([...courts, { id, name: `Sân ${id}` }]); }}>+ Thêm sân</Btn>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nghỉ giữa trận (phút)"><input type="number" min={0} max={60} value={rest} onChange={e => setRest(Math.max(0, Number(e.target.value) || 0))} className={inputCls} /></Field>
            <Field label="Đôi bỏ cuộc">
              <select value={walkover} onChange={e => setWalkover(e.target.value as typeof walkover)} className={inputCls}>
                <option value="walkover">Đối thủ thắng xử ép</option><option value="bwf">Xóa kết quả (luật BWF)</option>
              </select>
            </Field>
          </div>
          <Btn tone="black" onClick={saveInfo}>Lưu thông tin</Btn>
        </div>
      </Card>

      <Card title="Nội dung thi đấu">
        <div className="flex flex-col gap-2">
          {events.map(ev => editing === ev.id ? <EventEditor key={ev.id} ev={ev} tournamentId={t.id} onDone={() => setEditing("")} /> : (
            <div key={ev.id} className="flex items-center gap-2 border-2 border-black p-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-black">{ev.name}</div>
                <div className="font-bold text-gray-500">{entries.filter(e => e.event === ev.id && e.status === "approved").length}/{ev.maxEntries} đôi · {ev.scoring.games === 1 ? "1 set" : "2/3 set"} {ev.scoring.points} điểm (trần {ev.scoring.cap})</div>
              </div>
              <Btn small onClick={() => setEditing(ev.id)}><i className="fa-solid fa-pen"></i></Btn>
              {(!ev.stage || ev.stage === "registration") && <Btn small tone="red" onClick={() => deleteEvent(ev)}><i className="fa-solid fa-trash-can"></i></Btn>}
            </div>
          ))}
          {editing === "new" ? <EventEditor tournamentId={t.id} onDone={() => setEditing("")} /> : <Btn tone="yellow" onClick={() => setEditing("new")}>+ Thêm nội dung</Btn>}
        </div>
      </Card>

      <Card title="Mã BTC (cho máy BTC khác)">
        <p className="text-[11px] font-bold text-gray-600 mb-2">Máy có quyền chủ sân nhập mã này (trong trang giải) là cùng điều khiển giải. Dùng khi đổi máy, mất máy, hoặc cần 2 người làm BTC. Không gửi mã vào nhóm chung.</p>
        <div className="flex items-center gap-2">
          <span className="font-black text-2xl tracking-[0.2em] border-2 border-dashed border-black px-3 py-1 bg-gray-50">{secret?.code || "…"}</span>
          <Btn small onClick={rotateCode}>Đổi mã</Btn>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase">Các máy BTC ({t.hosts.length})</span>
          {t.hosts.map((h, i) => (
            <div key={h} className="flex items-center gap-2 text-xs font-bold">
              <span className="flex-1">Máy {i + 1}{h === uid ? " (máy này)" : ""}</span>
              <Btn small tone="red" onClick={() => removeHost(h)}>Gỡ</Btn>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
