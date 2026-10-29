// Kiểu dữ liệu + hằng số + hàm chuyển đổi dùng chung của Bad Rally
import type { RecordModel } from "pocketbase";
import type { MatchCategory } from "./matchmaking";

export type SkillLevel = 'Mới chơi' | 'Yếu-' | 'Yếu' | 'Yếu+' | 'Trung bình-' | 'Trung bình' | 'Trung bình+' | 'Khá-' | 'Khá' | 'Khá+';
export type ShuffleMode = 'Equal Rotation' | 'Skill Based' | 'Social Mix' | 'Fixed Pairs' | 'Manual';
export type PlayerStatus = 'waiting' | 'playing' | 'break';
export type UserRole = 'host' | 'guest';
export type Gender = 'M' | 'F';
export type Screen = "launcher" | "role_select" | "host_setup" | "guest_join" | "app";
export type Tab = "courts" | "ranking" | "players" | "settings";

export interface Player {
  id: string;
  name: string;
  skill: SkillLevel;
  gender?: Gender;
  playCount: number;
  wins: number;
  status: PlayerStatus;
  partnerId?: string;
  waitSince?: number; // thời điểm bắt đầu chờ (ms)
  userId?: string;    // tài khoản của khách tự đăng ký (trống nếu chủ sân thêm tay)
  baseCount?: number; // số trận "tính sẵn" khi vào muộn (server tính) – chỉ dùng để xếp trận công bằng
}

export interface GameSettings {
  totalCourts: number;
  shuffleMode: ShuffleMode;
  trackMatchResults: boolean;
  weights: {
    playCountFairness: number; waitTimePriority: number; avoidSamePartner: number;
    avoidSameOpponents: number; skillBalance: number; keepPreviousPair: number;
  };
}
export type WeightKey = keyof GameSettings['weights'];

// Lưu trong rooms.courts: chỉ giữ id người chơi (không chép cả object để tránh dữ liệu cũ)
export interface CourtData {
  id: number;
  name?: string; // tên sân do chủ sân đặt (trống → "Sân {id}")
  status: 'available' | 'drafting' | 'active' | 'scoring';
  playerIds: string[];
  matchType: '1v1' | '1v2' | '2v2';
  category?: MatchCategory; // thể loại trận đôi (đôi nam / đôi nữ / nam nữ), mặc định tự do
}
export type MatchType = CourtData['matchType'];

export interface Court extends CourtData {
  players: Player[];
}

// 1/2 = đội thắng, -1 = kết thúc không ghi điểm (vẫn tính trận), 0 = hủy trận (không tính)
export type MatchOutcome = 1 | 2 | 0 | -1;

export interface LastResult {
  courtId: number;
  court: CourtData;
  players: Record<string, Partial<Player>>;
  at: number;
  addedHistory: boolean;
  winningTeam: MatchOutcome;
}

export const ALL_SKILLS: SkillLevel[] = ['Mới chơi', 'Yếu-', 'Yếu', 'Yếu+', 'Trung bình-', 'Trung bình', 'Trung bình+', 'Khá-', 'Khá', 'Khá+'];
export const CATEGORY_OPTIONS: MatchCategory[] = ['any', 'MD', 'WD', 'XD'];
export const MATCH_TYPES: MatchType[] = ['1v1', '1v2', '2v2'];

// Thời điểm hiện tại (ms) — chỉ gọi trong hàm xử lý sự kiện, không gọi khi render
export const nowMs = () => Date.now();
// Số trận dùng cho thuật toán: số trận thật + phần tính sẵn của người vào muộn
export const fairCount = (p: { playCount: number; baseCount?: number }) => p.playCount + (p.baseCount || 0);

// Số người đội 1 (nửa trên sân) và tổng số người cần cho kiểu trận
export const topCountOf = (matchType: MatchType) => (matchType === '2v2' ? 2 : 1);
export const neededFor = (matchType: MatchType) => (matchType === '1v1' ? 2 : matchType === '1v2' ? 3 : 4);

// Hồ sơ người chơi lưu trên máy (tên, trình độ, giới tính) để lần sau điền sẵn
export const PROFILE_KEY = 'badRallyProfile';
export const COURT_LAYOUT_KEY = 'badRallyCourtLayout';
export const SESSION_KEY = 'badRallySession';

export const DEFAULT_SETTINGS: GameSettings = {
  totalCourts: 4,
  shuffleMode: "Manual",
  trackMatchResults: true,
  weights: { playCountFairness: 100, waitTimePriority: 80, avoidSamePartner: 70, avoidSameOpponents: 55, skillBalance: 0, keepPreviousPair: 0 }
};

// Trọng số mẫu của từng chế độ trộn (chế độ Thủ công giữ nguyên trọng số đang chỉnh)
export const SHUFFLE_PRESETS: Partial<Record<ShuffleMode, GameSettings['weights']>> = {
  'Equal Rotation': { playCountFairness: 100, waitTimePriority: 80, avoidSamePartner: 70, avoidSameOpponents: 55, skillBalance: 0, keepPreviousPair: 0 },
  'Skill Based': { playCountFairness: 35, waitTimePriority: 10, avoidSamePartner: 85, avoidSameOpponents: 75, skillBalance: 100, keepPreviousPair: 0 },
  'Social Mix': { playCountFairness: 10, waitTimePriority: 10, avoidSamePartner: 100, avoidSameOpponents: 90, skillBalance: 0, keepPreviousPair: 0 },
  'Fixed Pairs': { playCountFairness: 100, waitTimePriority: 50, avoidSamePartner: 0, avoidSameOpponents: 90, skillBalance: 0, keepPreviousPair: 100 },
};

// Bản ghi PocketBase ⇄ Player
export const toPlayer = (r: RecordModel): Player => ({
  id: r.id,
  name: r.name,
  skill: (ALL_SKILLS.includes(r.skill) ? r.skill : 'Trung bình') as SkillLevel,
  gender: r.gender || undefined,
  playCount: r.play_count || 0,
  wins: r.wins || 0,
  status: r.status as PlayerStatus,
  partnerId: r.partner || undefined,
  waitSince: r.wait_since || 0,
  userId: r.user || undefined,
  baseCount: r.base_count || 0,
});

export const toFields = (p: Partial<Player>) => {
  const f: Record<string, unknown> = {};
  if ('name' in p) f.name = p.name;
  if ('skill' in p) f.skill = p.skill;
  if ('gender' in p) f.gender = p.gender ?? '';
  if ('playCount' in p) f.play_count = p.playCount;
  if ('wins' in p) f.wins = p.wins;
  if ('status' in p) f.status = p.status;
  if ('partnerId' in p) f.partner = p.partnerId ?? '';
  if ('waitSince' in p) f.wait_since = p.waitSince;
  if ('baseCount' in p) f.base_count = p.baseCount;
  return f;
};

const PLAYER_KEYS: (keyof Player)[] = ['id', 'name', 'skill', 'gender', 'playCount', 'wins', 'status', 'partnerId', 'waitSince', 'userId', 'baseCount'];
// Hai bản ghi người chơi giống hệt nhau → giữ object cũ để các thẻ đã memo không phải vẽ lại
export const samePlayer = (a: Player, b: Player) => PLAYER_KEYS.every(k => a[k] === b[k]);
