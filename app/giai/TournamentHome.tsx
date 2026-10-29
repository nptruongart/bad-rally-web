"use client";
// Trang một giải: đầu trang, chọn nội dung, xem; BTC có thêm chế độ Quản lý.
import { useState } from "react";
import Link from "next/link";
import { isHostAccount } from "../../lib/pb";
import { useTournament } from "../../lib/tournament/store";
import EventView from "./EventView";
import Register, { registrationOpen } from "./Register";
import BtcSetup from "./BtcSetup";
import BtcEntries from "./BtcEntries";
import JoinBtc from "./JoinBtc";
import BtcDraw from "./BtcDraw";
import { Btn, Card, Tabs } from "./ui";

const STATUS_LABEL = { draft: "Đang chuẩn bị", registration: "Đang mở đăng ký", closed: "Đã khóa đăng ký", running: "Đang thi đấu", finished: "Đã kết thúc" } as const;
type ManageTab = "setup" | "entries" | "draw";

export default function TournamentHome({ code }: { code: string }) {
  const { data, error, uid, myParticipantIds, isBtc, reload } = useTournament(code);
  const [eventId, setEventId] = useState("");
  const [mode, setMode] = useState<"view" | "manage">("view");
  const [manageTab, setManageTab] = useState<ManageTab>("setup");

  if (error === "not_found") {
    return (
      <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4">
        <Card title="Không tìm thấy giải"><p className="text-sm font-bold mb-3">Mã {code} không đúng hoặc giải đã bị xóa.</p><Link href="/giai"><Btn>Nhập mã khác</Btn></Link></Card>
      </div>
    );
  }
  if (!data) return <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center text-sm font-black">{error === "network" ? "Mất kết nối, đang thử lại…" : "Đang tải giải…"}</div>;

  const { t, events } = data;
  const current = events.find(e => e.id === eventId) || events[0];
  const myEntryIds = data.entries.filter(e => myParticipantIds.includes(e.p1) || myParticipantIds.includes(e.p2)).map(e => e.id);
  const managing = isBtc && mode === "manage";

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-16" style={{ backgroundImage: "var(--paper-texture)" }}>
      <div className="bg-white border-b-[3px] border-black sticky top-0 z-30 px-3 py-2 flex items-center gap-2">
        <Link href="/giai" className="shrink-0 border-2 border-black px-2 py-1 text-xs font-black"><i className="fa-solid fa-arrow-left"></i></Link>
        <div className="min-w-0 flex-1">
          <div className="font-black text-sm truncate"><i className="fa-solid fa-trophy text-yellow-500 mr-1"></i>{t.name}</div>
          <div className="text-[10px] font-bold text-gray-500">Mã giải {t.code} · {t.status === "registration" && !registrationOpen(t) ? "Hết hạn đăng ký" : STATUS_LABEL[t.status]}{isBtc ? " · Bạn là BTC" : ""}</div>
        </div>
        {isBtc && (
          <button onClick={() => setMode(managing ? "view" : "manage")} className={`shrink-0 border-2 border-black px-2 py-1 text-[10px] font-black uppercase ${managing ? "bg-black text-white" : "bg-[#fcd34d]"}`}>
            {managing ? "Xem" : "Quản lý"}
          </button>
        )}
      </div>

      <div className="max-w-2xl mx-auto p-3 flex flex-col gap-3">
        {managing ? (
          <>
            <Tabs value={manageTab} onChange={setManageTab} items={[{ id: "setup", label: "Giải" }, { id: "entries", label: "Đôi & người" }, { id: "draw", label: "Bốc thăm" }]} />
            {manageTab === "setup" && <BtcSetup data={data} uid={uid} />}
            {manageTab === "entries" && <BtcEntries data={data} />}
            {manageTab === "draw" && <BtcDraw data={data} />}
          </>
        ) : (
          <>
            {!isBtc && isHostAccount() && <JoinBtc code={t.code} onJoined={reload} />}
            <Register data={data} uid={uid} myParticipantIds={myParticipantIds} />
            {events.length === 0 ? (
              <Card title="Chưa có nội dung"><p className="text-xs font-bold text-gray-500">BTC chưa thêm nội dung thi đấu.</p></Card>
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
