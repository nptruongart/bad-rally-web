"use client";
// Màn hình vào giải: nhập mã / quét QR / (chủ sân) tạo giải. Có ?code= thì mở giải.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import QrScanner from "../QrScanner";
import { pb, ensureAuth, isHostAccount } from "../../lib/pb";
import TournamentHome from "./TournamentHome";
import { Btn, Card, Field, inputCls } from "./ui";

export default function GiaiApp() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("code")?.trim() || "";
  const [input, setInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [canHost, setCanHost] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ensureAuth().then(() => setCanHost(isHostAccount())).catch(() => {});
  }, []);

  const onScan = (text: string) => {
    setScanning(false);
    const raw = text.trim();
    let c = /^\d{6}$/.test(raw) ? raw : "";
    try { const u = new URL(raw); if (/\/giai\/?$/.test(u.pathname)) c = u.searchParams.get("code") || ""; } catch { /* không phải link */ }
    if (/^\d{6}$/.test(c)) router.push(`/giai?code=${c}`);
    else alert("Mã QR này không phải mã giải đấu.");
  };
  const closeScan = () => setScanning(false);

  const create = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      await ensureAuth();
      const r = await pb.send("/api/badrally/tournament-create", { method: "POST", body: { name: newName.trim() } });
      router.push(`/giai?code=${r.code}`);
    } catch (e) {
      alert("Không tạo được giải: " + ((e as { message?: string })?.message || ""));
    } finally { setBusy(false); }
  };

  if (/^\d{6}$/.test(code)) return <TournamentHome code={code} />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white px-4 pt-4 pb-16">
        <div className="max-w-sm mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"><i className="fa-solid fa-arrow-left"></i>Bad Rally</Link>
          <div className="mt-6 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-400 text-slate-900 inline-flex items-center justify-center text-xl"><i className="fa-solid fa-trophy"></i></div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Giải đấu</h1>
              <p className="text-sm text-white/60">Lịch thi đấu, bảng xếp hạng, nhánh đấu trực tiếp</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-sm mx-auto px-4 -mt-10 flex flex-col gap-4 pb-10">
        <Card>
          <div className="flex flex-col gap-3">
            <Field label="Nhập mã giải (6 số)">
              <input value={input} onChange={e => setInput(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="______"
                className={`${inputCls} !text-3xl !py-3 font-bold tracking-[0.4em] text-center tabular-nums`} />
            </Field>
            <Btn tone="blue" disabled={input.length !== 6} onClick={() => router.push(`/giai?code=${input}`)}>Xem giải</Btn>
            <div className="flex items-center gap-3 text-xs text-slate-400"><span className="flex-1 h-px bg-slate-200" />hoặc<span className="flex-1 h-px bg-slate-200" /></div>
            <Btn onClick={() => setScanning(true)}><i className="fa-solid fa-qrcode"></i>Quét mã QR của giải</Btn>
          </div>
        </Card>
        {canHost && (
          <Card title="Tạo giải mới" right={<span className="text-xs text-slate-400">Chủ sân</span>}>
            <div className="flex flex-col gap-3">
              <Field label="Tên giải">
                <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} placeholder="VD: Giải CLB Phú Thọ tháng 11" className={inputCls} />
              </Field>
              <Btn tone="black" disabled={!newName.trim() || busy} onClick={create}><i className="fa-solid fa-plus"></i>Tạo giải</Btn>
            </div>
          </Card>
        )}
      </div>
      {scanning && <QrScanner onResult={onScan} onClose={closeScan} labels={{ title: "Quét mã QR giải", hint: "Đưa mã QR của giải vào khung vàng", cancel: "Đóng", noCamera: "Không mở được camera. Hãy cho phép dùng camera hoặc nhập mã 6 số." }} />}
    </div>
  );
}
