"use client";
// Đăng ký thi đấu (khi giải mở đăng ký), "Tôi là …" để nhận tên, và danh sách đôi của tôi.
import { useState } from "react";
import type { ClientResponseError } from "pocketbase";
import { pb } from "../../lib/pb";
import type { Participant, TEvent, TournamentData } from "../../lib/tournament/store";
import { entryLabel } from "../../lib/tournament/view";
import { SKILLS } from "../../lib/tournament/skills";
import NameInput from "./NameInput";
import { Btn, Card, Field, inputCls } from "./ui";

const nowMs = () => Date.now();
export const registrationOpen = (t: TournamentData["t"]) =>
  t.status === "registration" && (!t.regDeadline || new Date(t.regDeadline).getTime() > nowMs());

const errText = (e: unknown) => (e as ClientResponseError)?.response?.message || (e as Error)?.message || "Lỗi không rõ";

const CAT_LABEL: Record<TEvent["category"], string> = { MD: "Đôi nam", WD: "Đôi nữ", XD: "Nam nữ", open: "Tự do" };
const STATUS_LABEL = { pending: "Chờ BTC duyệt", approved: "Đã duyệt", waitlist: "Danh sách chờ", withdrawn: "Đã rút" } as const;

// Giới tính đồng đội bắt buộc theo nội dung (open → tự chọn)
const partnerGender = (cat: TEvent["category"], mine: "M" | "F"): "M" | "F" | null =>
  cat === "MD" ? "M" : cat === "WD" ? "F" : cat === "XD" ? (mine === "M" ? "F" : "M") : null;
const fitsMe = (cat: TEvent["category"], g: "M" | "F") => (cat === "MD" ? g === "M" : cat === "WD" ? g === "F" : true);

export function ClaimName({ data, uid, myParticipantIds }: { data: TournamentData; uid: string; myParticipantIds: string[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Participant | null>(null);
  const [busy, setBusy] = useState(false);
  const free = data.participants.filter(p => !p.users.includes(uid));
  const claim = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try { await pb.collection("participants").update(picked.id, { users: [...picked.users, uid] }); setPicked(null); setQ(""); }
    catch (e) { alert("Không nhận được tên: " + errText(e)); }
    finally { setBusy(false); }
  };
  return (
    <Card title={myParticipantIds.length ? "Thêm tên khác của tôi" : "Tôi là …"}>
      <p className="text-[11px] font-bold text-gray-600 mb-2">Có người đã đăng ký giúp bạn? Chọn đúng tên mình để nhận thông báo tới lượt và xem trận của bạn.</p>
      <div className="flex flex-col gap-2">
        <NameInput value={q} onChange={setQ} picked={picked} onPick={setPicked} people={free} placeholder="Gõ tên bạn…" />
        <Btn tone="blue" disabled={!picked || busy} onClick={claim}>Tôi là {picked?.name || "…"}</Btn>
      </div>
    </Card>
  );
}

export default function Register({ data, uid, myParticipantIds }: { data: TournamentData; uid: string; myParticipantIds: string[] }) {
  const { t, events, participants } = data;
  // Máy này có thể đã nhận nhiều tên (vd. đăng ký giúp người nhà) → chọn đăng ký cho ai
  const myPeople = participants.filter(p => myParticipantIds.includes(p.id));
  const [forId, setForId] = useState("");
  const mine = myPeople.find(p => p.id === forId) || myPeople[0] || null;
  const [meName, setMeName] = useState("");
  const [mePicked, setMePicked] = useState<Participant | null>(null);
  const [gender, setGender] = useState<"M" | "F">(mine?.gender === "F" ? "F" : "M");
  const [skill, setSkill] = useState<string>("Trung bình");
  const [phone, setPhone] = useState("");
  const [eventId, setEventId] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerPicked, setPartnerPicked] = useState<Participant | null>(null);
  const [openGender, setOpenGender] = useState<"M" | "F">("M");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const me = mine || mePicked;
  const myGender: "M" | "F" = me?.gender === "F" ? "F" : me?.gender === "M" ? "M" : gender;
  const available = events.filter(e => e.stage === "registration" || !e.stage).filter(e => fitsMe(e.category, myGender));
  const ev = available.find(e => e.id === eventId) || available[0];
  const pGender = ev ? partnerGender(ev.category, myGender) : null;

  const myEntries = data.entries.filter(e => e.createdBy === uid || myParticipantIds.includes(e.p1) || myParticipantIds.includes(e.p2));

  const submit = async () => {
    if (!ev || busy) return;
    if (!me && !meName.trim()) { alert("Nhập tên của bạn."); return; }
    if (!partnerPicked && !partnerName.trim()) { alert("Nhập tên đồng đội."); return; }
    setBusy(true);
    try {
      let meId = me?.id;
      if (!meId) {
        const rec = await pb.collection("participants").create({ tournament: t.id, name: meName.trim(), gender, skill, users: [uid] });
        meId = rec.id;
        if (phone.trim()) await pb.collection("contacts").create({ participant: meId, phone: phone.trim() });
      } else if (mePicked && !mePicked.users.includes(uid)) {
        await pb.collection("participants").update(mePicked.id, { users: [...mePicked.users, uid] });
      }
      let partnerId = partnerPicked?.id;
      if (!partnerId) {
        const rec = await pb.collection("participants").create({ tournament: t.id, name: partnerName.trim(), gender: pGender || openGender, skill: "Trung bình", users: [] });
        partnerId = rec.id;
      }
      const entry = await pb.collection("entries").create({ event: ev.id, p1: meId, p2: partnerId });
      setDone(`Đã đăng ký ${ev.name}: ${entry.status === "waitlist" ? "đã đủ đôi, bạn vào danh sách chờ." : "chờ BTC duyệt."}`);
      setPartnerName(""); setPartnerPicked(null); setMeName(""); setMePicked(null);
    } catch (e) {
      alert("Không đăng ký được: " + errText(e));
    } finally { setBusy(false); }
  };

  const withdraw = async (id: string) => {
    if (!window.confirm("Rút đôi này khỏi nội dung?")) return;
    try { await pb.collection("entries").update(id, { status: "withdrawn" }); }
    catch (e) { alert("Không rút được: " + errText(e)); }
  };

  return (
    <div className="flex flex-col gap-3">
      {myEntries.length > 0 && (
        <Card title="Đôi của tôi">
          <div className="flex flex-col gap-2">
            {myEntries.map(e => (
              <div key={e.id} className="flex items-center gap-2 border-2 border-black p-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-black truncate">{events.find(x => x.id === e.event)?.name}: {entryLabel(e, participants)}</div>
                  <div className={`font-bold ${e.status === "approved" ? "text-green-700" : e.status === "withdrawn" ? "text-gray-400" : "text-orange-600"}`}>{STATUS_LABEL[e.status]}</div>
                </div>
                {e.createdBy === uid && e.status !== "withdrawn" && registrationOpen(t) && <Btn small tone="red" onClick={() => withdraw(e.id)}>Rút</Btn>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {registrationOpen(t) && (
        <Card title={<><i className="fa-solid fa-pen-to-square mr-1"></i>Đăng ký thi đấu</>} right={t.regDeadline ? <span className="text-yellow-300 normal-case">Hạn: {new Date(t.regDeadline).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</span> : null}>
          <div className="flex flex-col gap-3">
            {mine ? (
              myPeople.length > 1 ? (
                <Field label="Đăng ký cho">
                  <select value={mine.id} onChange={e => setForId(e.target.value)} className={inputCls}>{myPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                </Field>
              ) : <p className="text-sm font-bold">Bạn: <span className="font-black">{mine.name}</span></p>
            ) : (
              <>
                <Field label="Tên của bạn">
                  <NameInput value={meName} onChange={setMeName} picked={mePicked} onPick={setMePicked} people={participants.filter(p => p.users.length === 0)} placeholder="Họ tên" />
                </Field>
                {!mePicked && (
                  <>
                    <div className="flex gap-2">
                      {(["M", "F"] as const).map(g => (
                        <button key={g} type="button" onClick={() => setGender(g)} className={`flex-1 border-[3px] border-black py-1.5 text-xs font-black uppercase ${gender === g ? (g === "M" ? "bg-blue-300" : "bg-pink-300") : "bg-gray-100"}`}>{g === "M" ? "♂ Nam" : "♀ Nữ"}</button>
                      ))}
                    </div>
                    <Field label="Trình độ (tự đánh giá)">
                      <select value={skill} onChange={e => setSkill(e.target.value)} className={inputCls}>{SKILLS.map(s => <option key={s}>{s}</option>)}</select>
                    </Field>
                    <Field label="Số điện thoại (không bắt buộc, chỉ BTC thấy)">
                      <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" maxLength={20} className={inputCls} />
                    </Field>
                  </>
                )}
              </>
            )}
            {available.length === 0 ? <p className="text-xs font-bold text-gray-500">Không còn nội dung phù hợp để đăng ký.</p> : (
              <>
                <Field label="Nội dung">
                  <select value={ev?.id} onChange={e => setEventId(e.target.value)} className={inputCls}>
                    {available.map(e => <option key={e.id} value={e.id}>{e.name}{e.name.toLowerCase() === CAT_LABEL[e.category].toLowerCase() ? "" : ` (${CAT_LABEL[e.category]})`}</option>)}
                  </select>
                </Field>
                <Field label={`Tên đồng đội${pGender ? (pGender === "M" ? " (nam)" : " (nữ)") : ""}`}>
                  <NameInput value={partnerName} onChange={setPartnerName} picked={partnerPicked} onPick={setPartnerPicked}
                    people={participants.filter(p => p.id !== me?.id && (!pGender || p.gender === pGender))} placeholder="Họ tên đồng đội" />
                </Field>
                {!pGender && !partnerPicked && (
                  <div className="flex gap-2">
                    {(["M", "F"] as const).map(g => (
                      <button key={g} type="button" onClick={() => setOpenGender(g)} className={`flex-1 border-2 border-black py-1 text-[11px] font-black ${openGender === g ? "bg-black text-white" : "bg-white"}`}>Đồng đội {g === "M" ? "nam" : "nữ"}</button>
                    ))}
                  </div>
                )}
                <Btn tone="yellow" disabled={busy} onClick={submit}>{busy ? "Đang gửi…" : "Đăng ký"}</Btn>
              </>
            )}
            {done && <p className="text-xs font-black text-green-700">{done}</p>}
          </div>
        </Card>
      )}

      {participants.length > 0 && <ClaimName data={data} uid={uid} myParticipantIds={myParticipantIds} />}
    </div>
  );
}
