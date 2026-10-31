"use client";
// Giao diện mỗi máy tự chọn: "modern" (mặc định) hoặc "classic". Lưu trong localStorage của máy đó.
import { useSyncExternalStore } from "react";

export type UiChoice = "modern" | "classic";
const KEY = "br-ui";
const EVENT = "br-ui-change";

const read = (): UiChoice => {
  try { return localStorage.getItem(KEY) === "classic" ? "classic" : "modern"; } catch { return "modern"; }
};

export function setUiChoice(v: UiChoice) {
  try { localStorage.setItem(KEY, v); } catch { /* bộ nhớ bị chặn: chỉ đổi trong lần mở này */ }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};

// Lúc dựng sẵn (static export) chưa biết máy chọn gì → trả null, trang chưa vẽ gì cho tới khi chạy trên máy
export function useUiChoice(): UiChoice | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
