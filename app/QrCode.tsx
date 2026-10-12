"use client";
import { useEffect, useRef } from "react";
import QRCode from "qrcode";

// Sinh mã QR ngay trên máy (không cần mạng, không gửi link phòng cho dịch vụ bên ngoài)
export default function QrCode({ value, size = 192, className }: { value: string; size?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .catch((e: unknown) => console.error("Lỗi tạo mã QR:", e));
  }, [value, size]);

  return <canvas ref={canvasRef} role="img" aria-label="QR Code" className={className} style={{ width: size, height: size }} />;
}
