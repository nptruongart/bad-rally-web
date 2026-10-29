"use client";
// Trang một giải: đầu trang, chọn nội dung, xem; BTC có thêm chế độ Quản lý.
import { useEffect, useState } from "react";
import Link from "next/link";
import { isHostAccount } from "../../lib/pb";
import { useTournament } from "../../lib/tournament/store";
import EventView from "./EventView";
import Register, { registrationOpen } from "./Register";
import BtcSetup from "./BtcSetup";
import BtcEntries from "./BtcEntries";
import JoinBtc from "./JoinBtc";
import MyCard from "./MyCard";
import { unlockAudio } from "../../lib/alerts";
import BtcDraw from "./BtcDraw";
import BtcDispatch from "./BtcDispatch";
import { useBtcWriter } from "./useBtcWriter";
import { Btn, Card, Pill, Tabs } from "./ui";

const STATUS_LABEL = { draft: "Đang chuẩn bị", registration: "Đang mở đăng ký", closed: "Đã khóa đăng ký", running: "Đang thi đấu", finished: "Đã kết thúc" } as const;
type ManageTab = "setup" | "entries" | "draw" | "dispatch";

export default function TournamentHome({ code }: { code: string }) {
  const { data, error, uid, myParticipantIds, isBtc, reload, setData } = useTournament(code);
  // Một hàng đợi ghi cho cả trang giải (giữ khi BTC chuyển tab) + báo đang chờ đồng bộ ở mọi tab
  const { write, pending } = useBtcWriter(code, setData, reload);
  const [eventId, setEventId] = useState("");
  const [mode, setMode] = useState<"view" | "manage">("view");
  const [manageTab, setManageTab] = useState<ManageTab>("setup");
  // Trình duyệt chỉ cho phát chuông sau khi người dùng chạm vào trang
  useEffect(() => { window.addEventListener("pointerdown", unlockAudio); return () => window.removeEventListener("pointerdown", unlockAudio); }, []);

  if (error === "not_found") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card title="Không tìm thấy giải"><p className="text-sm text-slate-600 mb-3">Mã {code} không đúng hoặc giải đã bị xóa.</p><Link href="/giai"><Btn>Nhập mã khác</Btn></Link></Card>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-500">{error === "network" ? "Mất kết nối, đang thử lại…" : "Đang tải giải…"}</div>;

  const { t, events } = data;
  const current = events.find(e => e.id === eventId) || events[0];
  const myEntryIds = data.entries.filter(e => myParticipantIds.includes(e.p1) || myParticipantIds.includes(e.p2)).map(e => e.id);
  const managing = isBtc && mode === "manage";

  return (
    <div className="min-h-screen bg-slate-100 pb-16 text-slate-900">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white">
        <div className="max-w-2xl mx-auto px-3 pt-3 pb-4">
          <div className="flex items-center gap-2">
            <Link href="/giai" aria-label="Quay lại" className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"><i className="fa-solid fa-arrow-left text-sm"></i></Link>
            <div className="flex-1" />
            {isBtc && (
              <button onClick={() => setMode(managing ? "view" : "manage")} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${managing ? "bg-white text-slate-900" : "bg-amber-400 text-slate-900"}`}>
                <i className={`fa-solid ${managing ? "fa-eye" : "fa-sliders"} mr-1.5`}></i>{managing ? "Xem như khán giả" : "Quản lý giải"}
              </button>
            )}
          </div>
          <div className="mt-3 flex items-start gap-3">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-amber-400 text-slate-900 inline-flex items-center justify-center text-xl"><i className="fa-solid fa-trophy"></i></div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">{t.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <Pill tone={t.status === "running" ? "live" : t.status === "registration" && registrationOpen(t) ? "green" : "gray"} className={t.status === "running" ? "" : "!bg-white/10 !text-white"}>
                  {t.status === "registration" && !registrationOpen(t) ? "Hết hạn đăng ký" : STATUS_LABEL[t.status]}
                </Pill>
                <span className="text-white/60">Mã giải <b className="text-white tracking-wider">{t.code}</b></span>
                {isBtc && <span className="text-amber-300 font-semibold">· Bạn là BTC</span>}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              [events.length, "Nội dung"],
              [data.entries.filter(e => e.status === "approved").length, "Đôi"],
              [`${data.matches.filter(m => m.status === "done" || m.status === "walkover").length}/${data.matches.length}`, "Trận xong"],
            ].map(([v, l]) => (
              <div key={l as string} className="rounded-xl bg-white/[0.07] px-3 py-2">
                <div className="text-lg font-bold tabular-nums leading-none">{v}</div>
                <div className="text-[11px] text-white/60 mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-3 flex flex-col gap-3">
        {isBtc && pending > 0 && <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><i className="fa-solid fa-cloud-arrow-up mr-1"></i>Đang chờ đồng bộ {pending} thao tác (mất mạng sẽ tự gửi lại)</p>}
        {managing ? (
          <>
            <Tabs variant="line" value={manageTab} onChange={setManageTab} items={[{ id: "setup", label: "Giải" }, { id: "entries", label: "Đôi & người" }, { id: "draw", label: "Bốc thăm" }, { id: "dispatch", label: "Điều phối" }]} />
            <MyCard data={data} myEntryIds={myEntryIds} alertOnly />
            {manageTab === "setup" && <BtcSetup data={data} uid={uid} />}
            {manageTab === "entries" && <BtcEntries data={data} />}
            {manageTab === "draw" && <BtcDraw data={data} />}
            {manageTab === "dispatch" && <BtcDispatch data={data} uid={uid} write={write} />}
          </>
        ) : (
          <>
            {!isBtc && isHostAccount() && <JoinBtc code={t.code} onJoined={reload} />}
            <MyCard data={data} myEntryIds={myEntryIds} />
            <Register data={data} uid={uid} myParticipantIds={myParticipantIds} />
            {events.length === 0 ? (
              <Card title="Chưa có nội dung"><p className="text-sm text-slate-500">BTC chưa thêm nội dung thi đấu.</p></Card>
            ) : (
              <>
                <Tabs value={current.id} onChange={setEventId} items={events.map(e => ({ id: e.id, label: e.name }))} />
                <EventView key={current.id} event={current} data={data} myEntryIds={myEntryIds} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
