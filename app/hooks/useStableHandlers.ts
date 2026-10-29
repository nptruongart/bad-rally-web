import { useLayoutEffect, useMemo, useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => any;

// Trả về object hàm có địa chỉ cố định suốt vòng đời component, nhưng luôn gọi phiên bản mới nhất.
// Nhờ vậy các component con đã memo (thẻ sân, thẻ người chơi) không phải vẽ lại chỉ vì hàm xử lý được tạo lại.
export function useStableHandlers<T extends Record<string, Fn>>(handlers: T): T {
  const ref = useRef(handlers);
  useLayoutEffect(() => { ref.current = handlers; });
  const keys = Object.keys(handlers).join("|");
  return useMemo(() => {
    const out = {} as Record<string, Fn>;
    for (const k of keys.split("|")) out[k] = (...args: unknown[]) => ref.current[k](...args);
    return out as T;
  }, [keys]);
}
