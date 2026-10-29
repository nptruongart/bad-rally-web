"use client";
// Máy có quyền chủ sân nhưng chưa là BTC của giải này → nhập mã BTC để cùng điều khiển
import { useState } from "react";
import { pb } from "../../lib/pb";
import { errText } from "./BtcSetup";
import { Btn, Card, inputCls } from "./ui";

export default function JoinBtc({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [btc, setBtc] = useState("");
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try { await pb.send("/api/badrally/tournament-join", { method: "POST", body: { code, btcCode: btc.trim().toUpperCase() } }); onJoined(); }
    catch (e) { alert("Không vào được BTC: " + errText(e)); }
    finally { setBusy(false); }
  };
  return (
    <Card title="Bạn là BTC giải này?">
      <p className="text-[11px] font-medium text-slate-600 mb-2">Nhập mã BTC (xem ở máy BTC đang điều khiển giải) để cùng quản lý giải trên máy này.</p>
      <div className="flex gap-2">
        <input value={btc} onChange={e => setBtc(e.target.value.toUpperCase())} maxLength={20} placeholder="Mã BTC" className={`${inputCls} tracking-widest`} />
        <Btn tone="black" disabled={btc.trim().length < 6 || busy} onClick={join}>Vào</Btn>
      </div>
    </Card>
  );
}
