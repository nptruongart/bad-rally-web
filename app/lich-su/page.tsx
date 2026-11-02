import type { Metadata } from "next";
import SessionHistory from "./SessionHistory";

export const metadata: Metadata = { title: "Lịch sử buổi chơi – Bad Rally" };

// Trang Lịch sử buổi chơi (/lich-su): chủ sân xem lại kết quả các phòng đã đóng (lưu 30 ngày)
export default function LichSuPage() {
  return <SessionHistory />;
}
