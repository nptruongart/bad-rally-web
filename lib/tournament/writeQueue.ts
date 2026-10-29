// Hàng đợi ghi của BTC chịu được mất mạng: lưu thao tác vào bộ nhớ máy TRƯỚC khi gửi, gửi lần lượt,
// lỗi mạng thì thử lại (2s, 5s, 10s, 20s…), chỉ xóa khỏi bộ nhớ khi server đã nhận.
// Lỗi dữ liệu (4xx, trừ 408/429) thì bỏ thao tác và báo lỗi, để không chặn các thao tác sau.
export type PendingOp = { id: string; kind: string; payload: unknown };

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const DEFAULT_DELAYS = [2000, 5000, 10000, 20000];

const isRetryable = (e: unknown) => {
  const s = (e as { status?: number })?.status;
  return s === undefined || s === 0 || s === 408 || s === 429 || s >= 500;
};

export function createWriteQueue(opts: {
  storageKey: string;
  send: (op: PendingOp) => Promise<void>;
  onState?: (pending: number) => void;
  onError?: (op: PendingOp, err: unknown) => void;
  storage?: Storage;
  retryDelays?: number[];
  maxAttemptsPerFlush?: number;
}) {
  const storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const delays = opts.retryDelays ?? DEFAULT_DELAYS;
  const maxAttempts = opts.maxAttemptsPerFlush ?? Infinity;

  let ops: PendingOp[] = [];
  try { ops = JSON.parse(storage?.getItem(opts.storageKey) || '[]'); } catch { ops = []; }
  const save = () => {
    try { storage?.setItem(opts.storageKey, JSON.stringify(ops)); } catch { /* bộ nhớ bị chặn: vẫn gửi trong phiên này */ }
    opts.onState?.(ops.length);
  };

  let running: Promise<void> | null = null;
  let disposed = false; // hàng đợi đã được thay bằng hàng đợi khác → dừng hẳn, không gửi/ghi gì nữa
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  const run = async () => {
    let attempts = 0;
    while (ops.length > 0 && !disposed) {
      const op = ops[0];
      try {
        await opts.send(op);
      } catch (e) {
        if (isRetryable(e)) {
          attempts++;
          if (attempts >= maxAttempts) return;
          await wait(delays[Math.min(attempts - 1, delays.length - 1)]);
          if (disposed) return;
          continue;
        }
        opts.onError?.(op, e);
      }
      if (disposed) return;
      attempts = 0;
      ops.shift();
      save();
    }
  };

  const flush = (): Promise<void> => {
    if (!running) running = run().finally(() => { running = null; });
    return running;
  };

  return {
    push(op: PendingOp) {
      if (disposed) return;
      ops.push(op);
      save();
      void flush();
    },
    flush,
    pending: () => ops.length,
    dispose() { disposed = true; },
  };
}
