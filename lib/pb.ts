import PocketBase from 'pocketbase';

// Địa chỉ web công khai (để sinh link QR). Trên app Capacitor, window.location.origin là https://localhost nên không dùng được.
export const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://146-235-22-130.sslip.io').replace(/\/$/, '');

// PocketBase chạy cùng tên miền (Caddy chuyển /api/* sang PocketBase)
export const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL || PUBLIC_APP_URL);
pb.autoCancellation(false);

// id bản ghi phòng suy ra từ PIN → khách mở phòng bằng PIN mà không cần quyền liệt kê phòng
export const roomIdFromPin = (pin: string) => `room${pin}00000`;

const CREDS_KEY = 'badRallyAnon';

const randomToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');

let authPromise: Promise<string> | null = null;

// Mỗi thiết bị tự có 1 tài khoản ẩn danh (email/mật khẩu ngẫu nhiên lưu trên máy) → không cần đăng ký.
// Chỉ xác thực với server 1 lần mỗi phiên mở app; các lần gọi sau dùng lại kết quả.
export function ensureAuth(): Promise<string> {
  if (!authPromise) authPromise = doAuth().catch((e) => { authPromise = null; throw e; });
  return authPromise;
}

async function doAuth(): Promise<string> {
  if (pb.authStore.isValid && pb.authStore.record) {
    // Token còn hạn nhưng tài khoản có thể đã bị xóa trên server → kiểm tra lại
    try {
      const auth = await pb.collection('users').authRefresh();
      return auth.record.id;
    } catch {
      pb.authStore.clear();
    }
  }

  let creds: { email: string; password: string } | null = null;
  try { creds = JSON.parse(localStorage.getItem(CREDS_KEY) || 'null'); } catch { creds = null; }

  if (creds) {
    try {
      const auth = await pb.collection('users').authWithPassword(creds.email, creds.password);
      return auth.record.id;
    } catch (e) {
      console.warn('Không đăng nhập lại được tài khoản ẩn danh, tạo tài khoản mới', e);
    }
  }

  const email = `${randomToken().slice(0, 24)}@anon.badrally.app`;
  const password = randomToken();
  await pb.collection('users').create({ email, password, passwordConfirm: password });
  try { localStorage.setItem(CREDS_KEY, JSON.stringify({ email, password })); } catch { /* bộ nhớ bị chặn: vẫn dùng được trong phiên này */ }
  const auth = await pb.collection('users').authWithPassword(email, password);
  return auth.record.id;
}

// Máy này đã được cấp quyền chủ sân chưa (theo phiên đăng nhập đã lưu; server vẫn kiểm tra lại khi tạo phòng)
export const isHostAccount = () => !!pb.authStore.record?.is_host;

// Đổi mã mời chủ sân (từ link/QR chủ sân) lấy quyền tạo phòng cho máy này
export async function redeemHostCode(code: string): Promise<void> {
  await ensureAuth();
  await pb.send('/api/badrally/redeem-host', { method: 'POST', body: { code } });
  await pb.collection('users').authRefresh();
}
