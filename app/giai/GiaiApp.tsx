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
    <div className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4" style={{ backgroundImage: "var(--paper-texture)" }}>
      <div className="max-w-sm w-full flex flex-col gap-4">
        <Link href="/" className="self-start text-xs font-black uppercase"><i className="fa-solid fa-arrow-left mr-1"></i>Bad Rally</Link>
        <Card title={<><i className="fa-solid fa-trophy mr-1 text-yellow-300"></i>Giải đấu</>}>
          <div className="flex flex-col gap-3">
            <Field label="Mã giải (6 số)">
              <input value={input} onChange={e => setInput(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="VD: 482913"
                className={`${inputCls} text-2xl tracking-widest text-center`} />
            </Field>
            <Btn tone="yellow" disabled={input.length !== 6} onClick={() => router.push(`/giai?code=${input}`)}>Xem giải</Btn>
            <Btn tone="blue" onClick={() => setScanning(true)}><i className="fa-solid fa-camera mr-2"></i>Quét mã QR</Btn>
          </div>
        </Card>
        {canHost && (
          <Card title="Tạo giải mới (chủ sân)">
            <div className="flex flex-col gap-3">
              <Field label="Tên giải">
                <input value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} placeholder="VD: Giải CLB Phú Thọ tháng 11" className={inputCls} />
              </Field>
              <Btn tone="black" disabled={!newName.trim() || busy} onClick={create}>Tạo giải</Btn>
            </div>
          </Card>
        )}
      </div>
      {scanning && <QrScanner onResult={onScan} onClose={closeScan} labels={{ title: "Quét mã QR giải", hint: "Đưa mã QR của giải vào khung vàng", cancel: "Đóng", noCamera: "Không mở được camera. Hãy cho phép dùng camera hoặc nhập mã 6 số." }} />}
    </div>
  );
}
