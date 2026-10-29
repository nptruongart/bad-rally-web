import { Suspense } from "react";
import GiaiApp from "./GiaiApp";

// Trang Giải đấu (/giai?code=XXXXXX). Phần đọc ?code= chạy phía trình duyệt nên bọc trong Suspense (yêu cầu của static export).
export default function GiaiPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f3f4f6]" />}>
      <GiaiApp />
    </Suspense>
  );
}
