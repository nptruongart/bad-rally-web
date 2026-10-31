"use client";
// Trang chính: mở giao diện máy này đã chọn (mới hoặc cổ điển). Hai bản dùng chung dữ liệu phòng.
import ClassicApp from "./ClassicApp";
import ModernApp from "./ModernApp";
import { useUiChoice } from "./uiChoice";

export default function Home() {
  const ui = useUiChoice();
  if (ui === null) return <div className="fixed inset-0 bg-[#0b0f1a]" />;
  return ui === "classic" ? <ClassicApp /> : <ModernApp />;
}
