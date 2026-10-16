"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Quét mã QR bằng camera ngay trong app (không mở sang Safari/Chrome như camera của máy).
// Cần thiết cho app thêm ra màn hình chính trên iPhone: app đó có bộ nhớ riêng, link mở từ camera luôn vào Safari.
export default function QrScanner({ onResult, onClose, labels }: {
  onResult: (text: string) => void;
  onClose: () => void;
  labels: { title: string; hint: string; cancel: string; noCamera: string };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (done) { stream.getTracks().forEach(t => t.stop()); return; }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        // Đọc khung hình ~5 lần/giây, thu nhỏ còn tối đa 640px cho nhẹ máy
        timer = setInterval(() => {
          if (done || !ctx || video.readyState < 2 || !video.videoWidth) return;
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            done = true;
            navigator.vibrate?.(80);
            onResult(code.data);
          }
        }, 200);
      } catch (e) {
        console.error("Lỗi mở camera:", e);
        setError(labels.noCamera);
      }
    })();

    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [onResult, labels.noCamera]);

  return (
    <div className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-white border-[4px] border-black p-4 max-w-sm w-full shadow-[8px_8px_0_0_#facc15] flex flex-col gap-3">
        <h2 className="font-black text-lg uppercase text-center"><i className="fa-solid fa-qrcode mr-2"></i>{labels.title}</h2>
        {error ? (
          <p className="text-sm font-bold text-red-600 text-center py-8">{error}</p>
        ) : (
          <div className="relative w-full aspect-square bg-black border-[3px] border-black overflow-hidden">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-[15%] border-4 border-yellow-300 pointer-events-none"></div>
          </div>
        )}
        {!error && <p className="text-xs font-bold text-gray-500 text-center">{labels.hint}</p>}
        <button onClick={onClose} className="w-full bg-gray-200 border-[3px] border-black py-2 text-sm font-black uppercase">{labels.cancel}</button>
      </div>
    </div>
  );
}
