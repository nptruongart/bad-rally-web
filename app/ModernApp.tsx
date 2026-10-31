"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientResponseError, RecordModel, UnsubscribeFunc } from "pocketbase";
import { Preferences } from '@capacitor/preferences'; // Bộ nhớ chuẩn Native App
import { pb, ensureAuth, roomIdFromPin, PUBLIC_APP_URL, isHostAccount, redeemHostCode } from "../lib/pb";
import QrCode from "./QrCode";
import QrScanner from "./QrScanner";
import { AnimNum, RoomIntro, Shuttle, buzz, useMotionFlag } from "./motion";
import { setUiChoice } from "./uiChoice";

// Ô nhập / nhãn trên nền tối
const DIN = "w-full rounded-xl bg-[#0e1422] border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-lime-400";
const DLB = "text-sm font-semibold mb-1.5 block";

// Nhãn trạng thái trên nền tối
const DPILL = {
  live: "bg-red-500 text-white", amber: "bg-[#3a2a0a] text-amber-300", green: "bg-[#0f2e1f] text-emerald-300",
  blue: "bg-[#132447] text-blue-300", lime: "bg-[#24320c] text-lime-300",
} as const;
function DPill({ tone, children }: { tone: keyof typeof DPILL; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${DPILL[tone]}`}>
      {tone === "live" && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
      {children}
    </span>
  );
}
import { unlockAudio, alertCalledToCourt, stopTitleFlash } from "../lib/alerts";
import { pickMatch, genderOf, effectiveCategory, fitsCategory, teamFitsCategory, type MatchRecord, type MatchCategory } from "../lib/matchmaking";

// --- CÁC KIỂU DỮ LIỆU ---
type SkillLevel = 'Mới chơi' | 'Yếu-' | 'Yếu' | 'Yếu+' | 'Trung bình-' | 'Trung bình' | 'Trung bình+' | 'Khá-' | 'Khá' | 'Khá+';
type ShuffleMode = 'Equal Rotation' | 'Skill Based' | 'Social Mix' | 'Fixed Pairs' | 'Manual';
type PlayerStatus = 'waiting' | 'playing' | 'break';
type UserRole = 'host' | 'guest';
type Gender = 'M' | 'F';

interface Player {
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

interface GameSettings {
  totalCourts: number;
  shuffleMode: ShuffleMode;
  trackMatchResults: boolean;
  weights: {
    playCountFairness: number; waitTimePriority: number; avoidSamePartner: number;
    avoidSameOpponents: number; skillBalance: number; keepPreviousPair: number;
  };
}

// Lưu trong rooms.courts: chỉ giữ id người chơi (không chép cả object để tránh dữ liệu cũ)
interface CourtData {
  id: number;
  name?: string; // tên sân do chủ sân đặt (trống → "Sân {id}")
  status: 'available' | 'drafting' | 'active' | 'scoring';
  playerIds: string[];
  matchType: '1v1' | '1v2' | '2v2';
  category?: MatchCategory; // thể loại trận đôi (đôi nam / đôi nữ / nam nữ), mặc định tự do
}

interface Court extends CourtData {
  players: Player[];
}

// --- TỪ ĐIỂN ĐA NGÔN NGỮ ---
const dict = {
  VI: {
    badge: "Phân bổ sân<br/>& Ghép cặp<br/>Thông minh",
    tagline: "App xếp trận thông minh",
    desc: "Tạo các tổ hợp đánh đôi công bằng cho Cầu lông, Tennis & Bóng bàn.<br/>Quản lý sân, xoay vòng và kết quả trận đấu dễ dàng.",
    startBtn: "Khởi động ứng dụng",
    tournamentBtn: "Giải đấu",
    home: "Trang chủ",
    tableView: "DẠNG BẢNG",
    layoutWrap: "Lưới",
    layoutRow: "Dàn ngang",
    gridView: "DẠNG LƯỚI",
    resetLayout: "ĐẶT LẠI",
    navCourts: "Sân",
    navRanking: "Xếp hạng",
    navPlayers: "Người chơi",
    navSettings: "Cài đặt",
    setupNeeded: "PHÒNG TRỐNG",
    setupNeededDesc: "Chưa có người chơi nào tham gia phòng {pin}. Đưa mã QR cho mọi người quét nhé!",
    manualAddBtn: "THÊM THỦ CÔNG",
    step1: "Bước 1: Cài đặt trận",
    step2: "Bước 2: Thêm người chơi",
    courtEmpty: "SÂN<br />TRỐNG",
    courtEmptyTable: "SÂN TRỐNG",
    start: "Xếp tự động",
    manualSetup: "Tự chọn",
    finishMatch: "Kết thúc trận",
    waitingResult: "Chọn đội thắng",
    team1Win: "Đội 1 thắng",
    team2Win: "Đội 2 thắng",
    cancelResult: "Hủy (Không tính điểm)",
    team1Label: "Đội 1",
    team2Label: "Đội 2",
    cancelMatch: "Hủy trận",
    nextGame: "Tạo trận mới",
    featFair: "Ghép cặp công bằng",
    uiClassic: "Giao diện cổ điển",
    uiClassicDesc: "Quay về kiểu cũ (nền giấy, viền đen)",
    featQr: "Quét QR vào phòng",
    featCall: "Báo tới lượt",
    queueTitle: "Hàng chờ",
    queueNext: "Lượt kế tiếp",
    statPlaying: "sân đang đánh",
    statWaiting: "người chờ",
    statBreak: "đang nghỉ",
    courtFree: "Trống",
    arrangeMatch: "Xếp trận",
    continuePicking: "Tiếp tục chọn",
    autoFair: "Xếp tự động · công bằng nhất",
    pickManual: "Tự chọn người",
    matchTypeTitle: "Kiểu trận",
    arrangeTitle: "Xếp {court}",
    members: "THÀNH VIÊN",
    active: "đang hoạt động",
    deleteAll: "Xóa tất cả",
    all: "Tất cả",
    waiting: "Đang chờ",
    playing: "Đang ra sân",
    onBreak: "Đang nghỉ",
    sortBy: "Sắp xếp theo",
    sortStatus: "Trạng thái",
    sortName: "Tên",
    sortGames: "Số trận",
    playerNamePlaceholder: "Nhập tên người chơi mới...",
    quickAddGuests: "Thêm nhanh 8 khách",
    noPlayers: "Chưa có người chơi.",
    leaderboard: "BẢNG VÀNG",
    noMatchResults: "Chưa có kết quả trận đấu.",
    matchLabel: "Trận",
    winLabel: "Thắng",
    gameSettings: "CÀI ĐẶT TRẬN ĐẤU",
    totalCourts: "Tổng số sân",
    courtsTxt: "sân",
    shuffleMode: "Chế độ trộn",
    shuffleModes: { "Equal Rotation": "Xoay vòng đều", "Skill Based": "Dựa trên kỹ năng", "Social Mix": "Trộn xã hội", "Fixed Pairs": "Cặp cố định", "Manual": "Thủ công" },
    shuffleDescs: {
      "Equal Rotation": "Ưu tiên công bằng số trận và thời gian chờ, hạn chế trùng đồng đội.",
      "Skill Based": "Chia đội cân sức theo trình độ, tránh trùng đồng đội và đối thủ.",
      "Social Mix": "Ưu tiên gặp gỡ nhiều người: hạn chế tối đa trùng đồng đội và đối thủ.",
      "Fixed Pairs": "Giữ nguyên đồng đội của trận trước, đổi đối thủ liên tục.",
      "Manual": "Tự chỉnh từng trọng số bên dưới (0 = bỏ qua, 100 = ưu tiên cao nhất).",
    },
    shuffleWeights: "Trọng số xếp trận",
    weights: { playCountFairness: "Công bằng số trận", waitTimePriority: "Ưu tiên thời gian chờ", avoidSamePartner: "Tránh trùng đồng đội", avoidSameOpponents: "Tránh trùng đối thủ", skillBalance: "Cân bằng kỹ năng", keepPreviousPair: "Giữ cặp trận trước" },
    trackResults: "Ghi nhận điểm số (Thắng/Thua)",
    applyChanges: "LƯU CÀI ĐẶT",
    addPlayersMenu: "THÊM NGƯỜI CHƠI",
    genderLabel: "Giới tính",
    male: "Nam",
    female: "Nữ",
    resetCountsTitle: "ĐẶT LẠI SỐ TRẬN?",
    resetCountsDesc: "Bắt đầu phiên mới bằng cách đặt lại số trận, thứ tự chờ và lịch sử ghép cặp. Các sân sẽ bị xóa và bộ đếm thời gian dừng lại. Thành viên, cặp cố định, trạng thái nghỉ, cài đặt sân và kết quả đã lưu sẽ được giữ nguyên.",
    resetCountsBtn: "Đặt lại số trận",
    dangerZone: "Khu vực nguy hiểm",
    resetEventBtn: "Đóng Phòng (Xóa Cloud)",
    alertCourtFull: "Đang full sân!",
    alertNotEnoughPlayers: "Không đủ {n} người chờ để xếp trận {type}! (Đang có {m} người rảnh)",
    alertNeedPlayers: "Vui lòng chọn đủ {n} người chơi!",
    alertNeedName: "Vui lòng nhập tên hiển thị!",
    myCardTitle: "Của tôi",
    myWaiting: "Đang chờ – bạn đứng thứ {pos}/{total}",
    myEtaNext: "Dự kiến: vào sân ở lượt kế tiếp",
    myEtaLater: "Dự kiến: sau khoảng {n} trận nữa",
    myPlaying: "Đang đánh ở {court}",
    myTeammate: "Đồng đội",
    myOpponents: "Đối thủ",
    myScoring: "Chờ chủ sân ghi kết quả...",
    myOnBreak: "Bạn đang nghỉ – sẽ không được xếp trận",
    myNotInList: "Bạn không còn trong danh sách phòng này.",
    btnBreak: "Nghỉ",
    btnReady: "Sẵn sàng",
    btnLeave: "Về",
    editSkill: "Chạm để sửa trình độ",
    confirmLeave: "Rời phòng? Tên bạn sẽ được xóa khỏi danh sách chờ.",
    undoLabel: "{court}",
    undoFinished: "Đã kết thúc",
    undoBtn: "Hoàn tác",
    undoUnavailable: "Không hoàn tác được: sân hoặc người chơi đã được xếp trận khác.",
    calledTitle: "TỚI LƯỢT BẠN!",
    calledCourt: "{court}",
    calledOk: "OK, RA SÂN",
    hostGranted: "Máy này đã được cấp quyền Chủ sân! Giờ bạn có thể tạo phòng.",
    hostRedeemError: "Không kích hoạt được quyền chủ sân",
    scanQr: "Quét mã QR",
    scanTitle: "Quét mã QR",
    scanHint: "Đưa mã QR của phòng (hoặc mã chủ sân) vào khung vàng",
    scanCancel: "Đóng",
    scanNoCamera: "Không mở được camera. Hãy cho phép app dùng camera trong Cài đặt của điện thoại, hoặc nhập mã phòng 6 số.",
    scanAppQr: "Đây là mã mở app. Hãy quét mã QR của phòng trên máy chủ sân, hoặc nhập mã phòng 6 số.",
    scanUnknown: "Mã QR này không phải của Bad Rally.",
    noHostPermission: "Máy này chưa có quyền tạo phòng. Hãy xin người quản lý mã QR chủ sân.",
    categories: { any: "Tự do", MD: "Đôi nam", WD: "Đôi nữ", XD: "Nam nữ" } as Record<MatchCategory, string>,
    categoryNeed: { any: "4 người", MD: "4 nam", WD: "4 nữ", XD: "2 nam + 2 nữ" } as Record<MatchCategory, string>,
    alertCategoryNotEnough: "Không đủ người cho trận {cat}! (cần {need}, đang chờ: {m} nam, {f} nữ)",
    alertXDTeams: "Đôi nam nữ cần chọn đúng 2 nam và 2 nữ!",
    alertInvalidPin: "Mã phòng gồm 6 chữ số!",
    alertRoomNotFound: "Mã phòng không tồn tại hoặc đã bị đóng!",
    createRoomError: "Lỗi tạo phòng! Kiểm tra kết nối mạng rồi thử lại.",
    joinRoomError: "Lỗi tham gia phòng",
    syncError: "Không lưu được thay đổi (mất mạng?). Dữ liệu sẽ được tải lại.",
    settingsSaved: "Đã lưu cài đặt!",
    confirmDeleteAll: "Bạn có chắc muốn xóa tất cả người chơi?",
    confirmResetCounts: "Đặt lại tất cả số trận?",
    confirmResetEvent: "Đóng phòng và xóa toàn bộ dữ liệu trên Cloud?",
    guestPrefix: "Khách",
    court: "Sân",
    status: "Trạng thái",
    players: "Người chơi",
    action: "Thao tác",
    linkCancel: "Hủy ghép cặp",
    linking: "Đang chọn (chọn thêm người)...",
    linkFixed: "Ghép cặp cố định",
    draftTitle: "Xếp thủ công",
    draftSelected: "Đã chọn",
    draftWaiting: "Đang rảnh",
    draftStart: "Vào sân",
    draftCancel: "Hủy",
    roleSelectTitle: "Bạn muốn truy cập với tư cách nào?",
    hostRole: "Tạo Phòng (Chủ Sân)",
    hostDesc: "Sử dụng máy này để quản lý sân, xếp trận và sinh mã QR cho người khác tham gia.",
    guestRole: "Tham Gia (Khách)",
    guestDesc: "Quét mã QR hoặc nhập mã PIN phòng để đăng ký lên sân từ điện thoại của bạn.",
    backBtn: "Quay lại",
    roomCreated: "Phòng Đã Mở!",
    roomPinLabel: "Mã PIN Phòng:",
    roomNameLabel: "Tên phòng / nhóm (không bắt buộc)",
    roomNamePlaceholder: "VD: CLB Phú Thọ – tối thứ 3",
    roomNamePrompt: "Tên phòng / nhóm:",
    courtNamePrompt: "Tên sân (VD: Sân 5, Sân VIP). Để trống = tên mặc định:",
    renameCourt: "Đổi tên sân",
    qrDesc: "Người chơi dùng điện thoại quét mã QR này để tự đăng ký tên vào danh sách thi đấu.",
    goToDashboard: "Vào bảng điều khiển",
    joinMatch: "Tham gia trận",
    pinLabel: "Mã Phòng (PIN)",
    pinPlaceholder: "Ví dụ: 123456",
    yourNameLabel: "Tên hiển thị của bạn",
    namePlaceholder: "Nhập tên...",
    skillLabel: "Tự đánh giá trình độ",
    joinBtn: "Đăng ký vào sân",
    cancelBtn: "Hủy",
    guestSettingsWarning: "Góc Chủ Sân",
    guestSettingsDesc: "Tính năng cài đặt hệ thống chỉ dành cho người quản lý phòng.",
    hostRoleBadge: "Chủ Sân",
    guestRoleBadge: "Khách",
    guestWaitingDraft: "Chờ chủ sân xếp trận...",
    guestActiveTag: "Đang đánh",
    guestScoringTag: "Chờ kết quả…",
    hostExitWarning: "⚠️ BẠN LÀ CHỦ SÂN!\n\nNếu bạn thoát, phòng này sẽ bị XÓA và tất cả Khách sẽ bị ngắt kết nối.\nBạn có chắc chắn muốn thoát và đóng phòng?",
    roomDeletedTitle: "Phòng Đã Đóng",
    roomDeletedAlert: "Chủ sân đã kết thúc sự kiện và đóng phòng này. Cảm ơn bạn đã tham gia!",
    sidebar: {
      login: "Đăng nhập",
      loginDesc: "Lưu trữ thành viên và số liệu thống kê lên đám mây.",
      exitRoom: "Thoát phòng",
      exitRoomDesc: "Quay lại màn hình chính và ngắt kết nối.",
      scrollTop: "Trở lại mã QR",
      scrollTopDesc: "Quay lại màn hình hiển thị mã QR",
      contact: "Liên hệ hỗ trợ",
      contactDesc: "Báo lỗi hoặc góp ý tính năng",
      share: "Chia sẻ ứng dụng",
      shareDesc: "Gửi link app này cho bạn bè",
      terms: "Điều khoản dịch vụ",
      privacy: "Chính sách bảo mật",
      version: "Phiên bản 3.2"
    }
  },
  EN: {
    badge: "Court Allocation<br/>& Matchmaking",
    tagline: "Smart Matchmaking App",
    desc: "Create fair doubles combinations for Badminton, Tennis & Table Tennis.<br/>Manage courts, rotations and match results easily.",
    startBtn: "Launch Application",
    tournamentBtn: "Tournaments",
    home: "Home",
    tableView: "TABLE VIEW",
    layoutWrap: "Grid",
    layoutRow: "Row",
    gridView: "GRID VIEW",
    resetLayout: "RESET",
    navCourts: "Courts",
    navRanking: "Ranking",
    navPlayers: "Players",
    navSettings: "Settings",
    setupNeeded: "EMPTY ROOM",
    setupNeededDesc: "No players have joined room {pin} yet. Show the QR code for others to scan!",
    manualAddBtn: "ADD MANUALLY",
    step1: "Step 1: Game Settings",
    step2: "Step 2: Add Players",
    courtEmpty: "COURT<br />EMPTY",
    courtEmptyTable: "COURT EMPTY",
    start: "Auto pick",
    manualSetup: "Pick",
    finishMatch: "End match",
    waitingResult: "Choose winner",
    team1Win: "Team 1 won",
    team2Win: "Team 2 won",
    cancelResult: "Cancel (No Score)",
    team1Label: "Team 1",
    team2Label: "Team 2",
    cancelMatch: "Cancel Match",
    nextGame: "Next game",
    featFair: "Fair pairing",
    uiClassic: "Classic look",
    uiClassicDesc: "Switch back to the old style",
    featQr: "Scan QR to join",
    featCall: "Turn alerts",
    queueTitle: "Queue",
    queueNext: "Up next",
    statPlaying: "courts in play",
    statWaiting: "waiting",
    statBreak: "on break",
    courtFree: "Free",
    arrangeMatch: "Set up match",
    continuePicking: "Keep picking",
    autoFair: "Auto pick · fairest",
    pickManual: "Pick players",
    matchTypeTitle: "Match type",
    arrangeTitle: "Set up {court}",
    members: "MEMBERS",
    active: "active",
    deleteAll: "Delete All",
    all: "All",
    waiting: "Waiting",
    playing: "Playing",
    onBreak: "On Break",
    sortBy: "Sort by",
    sortStatus: "Status",
    sortName: "Name",
    sortGames: "Games",
    playerNamePlaceholder: "Enter player name...",
    quickAddGuests: "Quick Add 8 Guests",
    noPlayers: "No players added.",
    leaderboard: "LEADERBOARD",
    noMatchResults: "No match results recorded.",
    matchLabel: "Games",
    winLabel: "Wins",
    gameSettings: "GAME SETTINGS",
    totalCourts: "Total Courts",
    courtsTxt: "courts",
    shuffleMode: "Shuffle Mode",
    shuffleModes: { "Equal Rotation": "Equal Rotation", "Skill Based": "Skill Based", "Social Mix": "Social Mix", "Fixed Pairs": "Fixed Pairs", "Manual": "Manual" },
    shuffleDescs: {
      "Equal Rotation": "Prioritizes fair game counts and wait times, limits repeat partners.",
      "Skill Based": "Balances teams by skill level, avoids repeat partners and opponents.",
      "Social Mix": "Maximizes mixing: strongly avoids repeat partners and opponents.",
      "Fixed Pairs": "Keeps partners from the previous game, rotates opponents.",
      "Manual": "Tune each weight below (0 = ignore, 100 = highest priority).",
    },
    shuffleWeights: "Shuffle Weights",
    weights: { playCountFairness: "Play count fairness", waitTimePriority: "Wait time priority", avoidSamePartner: "Avoid same partner", avoidSameOpponents: "Avoid same opponents", skillBalance: "Skill balance", keepPreviousPair: "Keep previous pair" },
    trackResults: "Track Match Results (Win/Loss)",
    applyChanges: "SAVE SETTINGS",
    addPlayersMenu: "ADD PLAYERS",
    genderLabel: "Gender",
    male: "Male",
    female: "Female",
    resetCountsTitle: "RESET GAME COUNTS?",
    resetCountsDesc: "Start a new session by resetting game counts, waiting order, and pairing history. Courts will be cleared and the timer stopped. Members, fixed pairs, break status, court settings, and recorded results will be kept.",
    resetCountsBtn: "Reset game counts",
    dangerZone: "Danger Zone",
    resetEventBtn: "Close Room (Wipe Cloud)",
    alertCourtFull: "Courts are full!",
    alertNotEnoughPlayers: "Not enough {n} waiting players for {type} match! ({m} available)",
    alertNeedPlayers: "Please select {n} players!",
    alertNeedName: "Please enter your display name!",
    myCardTitle: "Me",
    myWaiting: "Waiting – you are #{pos} of {total}",
    myEtaNext: "Expected: next round",
    myEtaLater: "Expected: in about {n} more games",
    myPlaying: "Playing on {court}",
    myTeammate: "Partner",
    myOpponents: "Opponents",
    myScoring: "Waiting for the host to record the result...",
    myOnBreak: "You are on break – you won't be scheduled",
    myNotInList: "You are no longer in this room's list.",
    btnBreak: "Break",
    btnReady: "Ready",
    btnLeave: "Leave",
    editSkill: "Tap to change skill level",
    confirmLeave: "Leave the room? Your name will be removed from the queue.",
    undoLabel: "{court}",
    undoFinished: "Finished",
    undoBtn: "Undo",
    undoUnavailable: "Can't undo: the court or players have already been assigned elsewhere.",
    calledTitle: "YOUR TURN!",
    calledCourt: "{court}",
    calledOk: "OK, GOING",
    hostGranted: "This device now has Host access! You can create rooms.",
    hostRedeemError: "Could not activate host access",
    scanQr: "Scan QR code",
    scanTitle: "Scan QR code",
    scanHint: "Point at the room QR (or host QR) inside the yellow frame",
    scanCancel: "Close",
    scanNoCamera: "Can't open the camera. Allow camera access in your phone settings, or type the 6-digit room PIN.",
    scanAppQr: "This QR just opens the app. Scan the room QR on the host's device, or type the 6-digit room PIN.",
    scanUnknown: "This QR code isn't from Bad Rally.",
    noHostPermission: "This device cannot create rooms yet. Ask the organizer for the host QR code.",
    categories: { any: "Open", MD: "Men's", WD: "Women's", XD: "Mixed" } as Record<MatchCategory, string>,
    categoryNeed: { any: "4 players", MD: "4 men", WD: "4 women", XD: "2 men + 2 women" } as Record<MatchCategory, string>,
    alertCategoryNotEnough: "Not enough players for a {cat} match! (need {need}, waiting: {m} men, {f} women)",
    alertXDTeams: "Mixed doubles needs exactly 2 men and 2 women!",
    alertInvalidPin: "Room PIN must be 6 digits!",
    alertRoomNotFound: "Room not found or already closed!",
    createRoomError: "Could not create room! Check your connection and try again.",
    joinRoomError: "Could not join room",
    syncError: "Could not save changes (offline?). Data will be reloaded.",
    settingsSaved: "Settings saved!",
    confirmDeleteAll: "Are you sure you want to delete all players?",
    confirmResetCounts: "Reset all game counts?",
    confirmResetEvent: "Close room and wipe all cloud data?",
    guestPrefix: "Guest",
    court: "Court",
    status: "Status",
    players: "Players",
    action: "Action",
    linkCancel: "Unlink pair",
    linking: "Selecting (choose another)...",
    linkFixed: "Fixed pair",
    draftTitle: "Manual setup",
    draftSelected: "Selected",
    draftWaiting: "Available",
    draftStart: "Start",
    draftCancel: "Cancel",
    roleSelectTitle: "How would you like to access?",
    hostRole: "Create Room (Host)",
    hostDesc: "Use this device to manage courts, matches, and generate QR code for others.",
    guestRole: "Join (Guest)",
    guestDesc: "Scan QR code or enter Room PIN to register yourself onto the court list.",
    backBtn: "Go Back",
    roomCreated: "Room Opened!",
    roomPinLabel: "Room PIN:",
    roomNameLabel: "Room / group name (optional)",
    roomNamePlaceholder: "e.g. Riverside Club – Tuesday night",
    roomNamePrompt: "Room / group name:",
    courtNamePrompt: "Court name (e.g. Court 5, VIP). Leave empty for default:",
    renameCourt: "Rename court",
    qrDesc: "Players can scan this QR code with their phone to join the match list.",
    goToDashboard: "Go to dashboard",
    joinMatch: "Join Match",
    pinLabel: "Room PIN",
    pinPlaceholder: "e.g., 123456",
    yourNameLabel: "Your Display Name",
    namePlaceholder: "Enter name...",
    skillLabel: "Self-assessed Skill Level",
    joinBtn: "Join Court List",
    cancelBtn: "Cancel",
    guestSettingsWarning: "Host Area",
    guestSettingsDesc: "System settings are restricted to the room manager.",
    hostRoleBadge: "Host",
    guestRoleBadge: "Guest",
    guestWaitingDraft: "Waiting for host to arrange match...",
    guestActiveTag: "Playing",
    guestScoringTag: "Waiting for result…",
    hostExitWarning: "⚠️ YOU ARE THE HOST!\n\nIf you exit, this room will be DELETED and all Guests will be disconnected.\nAre you sure you want to exit and close the room?",
    roomDeletedTitle: "Room Closed",
    roomDeletedAlert: "The host has ended the event and closed this room. Thank you for participating!",
    sidebar: {
      login: "Login",
      loginDesc: "Save members and statistics to the cloud.",
      exitRoom: "Exit Room",
      exitRoomDesc: "Return to main menu and disconnect.",
      scrollTop: "Back to QR Code",
      scrollTopDesc: "Show the room QR code again",
      contact: "Contact Support",
      contactDesc: "Report an issue or suggest features",
      share: "Share App",
      shareDesc: "Send this app link to friends",
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      version: "Version 3.2"
    }
  }
};

const skillEnMap: Record<SkillLevel, string> = {
  'Mới chơi': 'Beginner', 'Yếu-': 'Weak-', 'Yếu': 'Weak', 'Yếu+': 'Weak+',
  'Trung bình-': 'Average-', 'Trung bình': 'Average', 'Trung bình+': 'Average+',
  'Khá-': 'Good-', 'Khá': 'Good', 'Khá+': 'Good+'
};
const ALL_SKILLS: SkillLevel[] = ['Mới chơi', 'Yếu-', 'Yếu', 'Yếu+', 'Trung bình-', 'Trung bình', 'Trung bình+', 'Khá-', 'Khá', 'Khá+'];

// Thời điểm hiện tại (ms) — chỉ gọi trong hàm xử lý sự kiện, không gọi khi render
const nowMs = () => Date.now();
// Số trận dùng cho thuật toán: số trận thật + phần tính sẵn của người vào muộn
const fairCount = (p: { playCount: number; baseCount?: number }) => p.playCount + (p.baseCount || 0);

// Hồ sơ người chơi lưu trên máy (tên, trình độ, giới tính) để lần sau điền sẵn
const PROFILE_KEY = 'badRallyProfile';
const COURT_LAYOUT_KEY = 'badRallyCourtLayout';

const DEFAULT_SETTINGS: GameSettings = {
  totalCourts: 4,
  shuffleMode: "Manual",
  trackMatchResults: true,
  weights: { playCountFairness: 100, waitTimePriority: 80, avoidSamePartner: 70, avoidSameOpponents: 55, skillBalance: 0, keepPreviousPair: 0 }
};

// Bản ghi PocketBase ⇄ Player
const toPlayer = (r: RecordModel): Player => ({
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

const toFields = (p: Partial<Player>) => {
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

const renderGenderIcon = (gender?: Gender) => {
    if (gender === 'F') return <span className="text-pink-500 font-black ml-1 drop-shadow-[1px_1px_0_#fff]">♀</span>;
    return <span className="text-blue-500 font-black ml-1 drop-shadow-[1px_1px_0_#fff]">♂</span>; 
};


export default function ModernApp() {
  const router = useRouter();
  const [currentScreen, setCurrentScreen] = useState<"launcher" | "role_select" | "host_setup" | "guest_join" | "app">("launcher");
  const [activeTab, setActiveTab] = useState<"courts" | "ranking" | "players" | "settings">("courts");

  const [lang, setLang] = useState<"VI" | "EN">("VI");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const t = dict[lang];
  const tSkill = (s: SkillLevel) => lang === "VI" ? s : skillEnMap[s];

  const [userRole, setUserRole] = useState<UserRole>('host');
  const [roomPin, setRoomPin] = useState<string>("");
  const [roomName, setRoomName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestSkill, setGuestSkill] = useState<SkillLevel>("Trung bình");
  const [guestGender, setGuestGender] = useState<Gender>('M');
  const [isBusy, setIsBusy] = useState(false);
  // Máy được cấp quyền chủ sân (qua link/QR chủ sân) mới thấy nút Tạo phòng
  const [canHost, setCanHost] = useState(false);
  const [myUserId, setMyUserId] = useState(""); // tài khoản (ẩn danh) của máy này
  const [calledAlert, setCalledAlert] = useState(false); // khách vừa được gọi vào sân
  const [scannerOpen, setScannerOpen] = useState(false); // quét QR bằng camera trong app
  // Kết quả trận vừa ghi (chủ sân) → cho phép hoàn tác khi bấm nhầm
  const [lastResult, setLastResult] = useState<{ courtId: number; court: CourtData; players: Record<string, Partial<Player>>; at: number; addedHistory: boolean; winningTeam: 1 | 2 | 0 | -1 } | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  // Cách bày sân ở dạng lưới: tự xuống dòng, hoặc dàn ngang 1 hàng vuốt trái/phải (nhớ theo từng máy)
  const [courtLayout, setCourtLayout] = useState<"wrap" | "row">("wrap");
  const [sheetCourtId, setSheetCourtId] = useState<number | null>(null); // sân đang mở tấm trượt xếp trận (chủ sân)
  useMotionFlag();

  const [players, setPlayers] = useState<Player[]>([]);
  const [courtData, setCourtData] = useState<CourtData[]>([]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Sân chỉ lưu id người chơi; ghép với danh sách người chơi mới nhất để hiển thị
  const courts: Court[] = courtData.map(c => ({
    ...c,
    players: (c.playerIds || []).map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p),
  }));

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerSkill, setNewPlayerSkill] = useState<SkillLevel>("Trung bình");
  const [newPlayerGender, setNewPlayerGender] = useState<Gender>('M');

  const [playerFilter, setPlayerFilter] = useState<"all" | "waiting" | "playing" | "break">("all");
  const [sortOption, setSortOption] = useState<"status" | "name" | "games">("status");
  const [isWeightsExpanded, setIsWeightsExpanded] = useState(true);
  const [linkingPlayerId, setLinkingPlayerId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [isKickedModalOpen, setIsKickedModalOpen] = useState(false);

  const hostSettingsLoaded = useRef(false);
  const myUserIdRef = useRef("");
  // Bản mới nhất của dữ liệu cho các hàm xử lý (tránh đọc dữ liệu cũ khi thao tác liên tiếp nhanh)
  const playersRef = useRef<Player[]>([]);
  const courtRef = useRef<CourtData[]>([]);
  const historyRef = useRef<MatchRecord[]>([]); // lịch sử trận (chỉ dùng cho thuật toán, không hiển thị)
  const applyPlayers = (next: Player[]) => { playersRef.current = next; setPlayers(next); };
  const applyCourts = (next: CourtData[]) => { courtRef.current = next; setCourtData(next); };
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingWrites = useRef(0);
  const missedRealtime = useRef(false);
  // Đang có lệnh ghi chưa xong → tín hiệu realtime có thể là trạng thái cũ hơn trên máy, tạm bỏ qua
  const shouldDeferRealtime = () => { if (pendingWrites.current > 0) { missedRealtime.current = true; return true; } return false; };
  const reloadRoomRef = useRef<() => Promise<void>>(async () => {});
  const roomId = roomPin ? roomIdFromPin(roomPin) : "";

  // SỬ DỤNG CAPACITOR PREFERENCES THAY CHO LOCALSTORAGE
  useEffect(() => {
    if (typeof window !== "undefined") {
        // Khách mở link từ QR (?pin=123456) → điền sẵn PIN và vào màn hình tham gia
        // Trình duyệt chỉ cho phát tiếng sau khi người dùng chạm vào trang
        window.addEventListener('pointerdown', unlockAudio);
        const params = new URLSearchParams(window.location.search);
        const urlPin = params.get('pin')?.trim();
        const hostCode = params.get('host')?.trim();
        if (urlPin || hostCode) window.history.replaceState(null, '', window.location.pathname);

        // Mở link/QR chủ sân (?host=MÃ) → cấp quyền chủ sân cho máy này
        if (hostCode) {
            redeemHostCode(hostCode)
                .then(() => { setCanHost(true); setCurrentScreen('role_select'); alert(dict.VI.hostGranted); })
                .catch((e: ClientResponseError) => alert(dict.VI.hostRedeemError + (e?.response?.message ? ': ' + e.response.message : '')));
        }

        const initSession = async () => {
            try {
                const { value } = await Preferences.get({ key: 'badRallySession' });
                const saved = value ? JSON.parse(value) : null;
                setCanHost(isHostAccount());
                try { if (localStorage.getItem(COURT_LAYOUT_KEY) === 'row') setCourtLayout('row'); } catch { /* bộ nhớ bị chặn */ }
                try {
                    const prof = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
                    if (prof?.name) setGuestName(prof.name);
                    if (ALL_SKILLS.includes(prof?.skill)) setGuestSkill(prof.skill);
                    if (prof?.gender === 'M' || prof?.gender === 'F') setGuestGender(prof.gender);
                } catch { /* chưa có hồ sơ */ }
                if (urlPin && /^\d{6}$/.test(urlPin) && saved?.pin !== urlPin) {
                    setRoomPin(urlPin);
                    setCurrentScreen('guest_join');
                    return;
                }
                if (saved) {
                    const { role, pin, screen } = saved;
                    if (pin && role) {
                        setUserRole(role);
                        setRoomPin(pin);
                        setCurrentScreen(screen || 'app');
                        if (role === 'guest') setActiveTab('players');
                    }
                }
            } catch (e) {
                console.error("Lỗi đọc session cũ:", e);
                await Preferences.remove({ key: 'badRallySession' });
            }
        };
        initSession();
    }
  }, []);

  useEffect(() => {
    if (!lastResult) return;
    const timer = setTimeout(() => setLastResult(null), 60000);
    return () => clearTimeout(timer);
  }, [lastResult]);

  // Kết quả quét QR trong app: mã chủ sân (?host=) → cấp quyền; mã phòng (?pin= hoặc 6 số) → điền sẵn PIN
  const handleScanResult = useCallback((text: string) => {
      setScannerOpen(false);
      let params: URLSearchParams | null = null;
      try { params = new URL(text.trim()).searchParams; } catch { /* không phải link */ }
      // Mã QR của giải đấu (/giai?code=…) → mở trang giải
      const tournamentCode = params?.get('code')?.trim();
      if (tournamentCode && /^\d{6}$/.test(tournamentCode) && /\/giai\/?$/.test(new URL(text.trim()).pathname)) {
          router.push('/giai?code=' + tournamentCode);
          return;
      }
      const hostCode = params?.get('host')?.trim();
      const pin = params?.get('pin')?.trim() || (/^\d{6}$/.test(text.trim()) ? text.trim() : '');
      if (hostCode) {
          redeemHostCode(hostCode)
              .then(() => { setCanHost(true); setCurrentScreen('role_select'); alert(dict.VI.hostGranted); })
              .catch((e: ClientResponseError) => alert(dict.VI.hostRedeemError + (e?.response?.message ? ': ' + e.response.message : '')));
      } else if (pin && /^\d{6}$/.test(pin)) {
          setRoomPin(pin);
          setCurrentScreen('guest_join');
      } else if (params) {
          alert(dict[lang].scanAppQr);
      } else {
          alert(dict[lang].scanUnknown);
      }
  }, [lang, router]);
  const closeScanner = useCallback(() => setScannerOpen(false), []);

  const changeCourtLayout = (layout: "wrap" | "row") => {
      setCourtLayout(layout);
      try { localStorage.setItem(COURT_LAYOUT_KEY, layout); } catch { /* bộ nhớ bị chặn */ }
  };

  const saveSession = async (role: UserRole, pin: string, screen: string) => {
      await Preferences.set({ key: 'badRallySession', value: JSON.stringify({ role, pin, screen }) });
  }

  // Tải phòng + người chơi và lắng nghe realtime
  useEffect(() => {
    if (!roomPin || currentScreen !== 'app') return;
    const rid = roomIdFromPin(roomPin);
    let cancelled = false;
    const unsubs: UnsubscribeFunc[] = [];

    const applyRoom = (room: RecordModel) => {
        applyCourts((room.courts as CourtData[]) || []);
        setRoomName(room.name || '');
        historyRef.current = (room.history as MatchRecord[]) || [];
        if (userRole === 'guest' || !hostSettingsLoaded.current) {
            setSettings({ ...DEFAULT_SETTINGS, ...(room.settings || {}) });
            hostSettingsLoaded.current = true;
        }
    };
    const onRoomGone = async () => {
        if (cancelled) return;
        setIsKickedModalOpen(true);
        await Preferences.remove({ key: 'badRallySession' });
    };
    // Khách vừa chuyển sang "đang đánh" → rung + chuông + màn hình báo
    const checkCalled = (userId: string | undefined, id: string, status: string) => {
        if (!userId || userId !== myUserIdRef.current || status !== 'playing') return;
        const prev = playersRef.current.find(x => x.id === id);
        if (prev && prev.status !== 'playing') {
            setCalledAlert(true);
            alertCalledToCourt('🔔 ' + dict.VI.calledTitle);
        }
    };
    const load = async () => {
        try {
            const uid = await ensureAuth();
            myUserIdRef.current = uid;
            setMyUserId(uid);
            const [room, list] = await Promise.all([
                pb.collection('rooms').getOne(rid),
                pb.collection('players').getFullList({ filter: pb.filter('room = {:rid}', { rid }), sort: 'created' }),
            ]);
            if (cancelled) return;
            applyRoom(room);
            // Điện thoại vừa mở lại mà đã được gọi vào sân trong lúc khóa màn hình → vẫn báo
            list.forEach(r => checkCalled(r.user, r.id, r.status));
            applyPlayers(list.map(toPlayer));
        } catch (e) {
            if ((e as ClientResponseError)?.status === 404) onRoomGone();
            else console.error("Lỗi tải phòng:", e);
        }
    };
    reloadRoomRef.current = load;

    (async () => {
        try {
            await ensureAuth();
            unsubs.push(await pb.collection('rooms').subscribe(rid, (e) => {
                if (e.action === 'delete') onRoomGone(); else if (!shouldDeferRealtime()) applyRoom(e.record);
            }));
            unsubs.push(await pb.collection('players').subscribe('*', (e) => {
                if (e.action !== 'delete') checkCalled(e.record.user, e.record.id, e.record.status);
                if (shouldDeferRealtime()) return;
                const p = toPlayer(e.record);
                const prev = playersRef.current;
                if (e.action === 'delete') applyPlayers(prev.filter(x => x.id !== p.id));
                else applyPlayers(prev.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]);
            }, { filter: pb.filter('room = {:rid}', { rid }) }));
            // Kết nối lại (mạng chập chờn / điện thoại vừa thức dậy) → tải lại để không lỡ cập nhật
            unsubs.push(await pb.realtime.subscribe('PB_CONNECT', () => { load(); }));
            if (cancelled) { unsubs.forEach(u => u()); return; }
            // Tải lần đầu SAU khi đã đăng ký realtime → không sót thay đổi xảy ra ở giữa
            await load();
        } catch (e) { console.error("Lỗi kết nối realtime:", e); load(); }
    })();

    // Mở lại app (sau khi khóa màn hình / chuyển app) hoặc có mạng lại → tải lại ngay, không chờ realtime tự nối
    let lastWake = 0;
    const onWake = () => {
        if (document.visibilityState !== 'visible' || nowMs() - lastWake < 2000) return;
        lastWake = nowMs();
        if (pendingWrites.current > 0) missedRealtime.current = true; else load();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    window.addEventListener('pageshow', onWake);

    return () => {
        cancelled = true; unsubs.forEach(u => u());
        document.removeEventListener('visibilitychange', onWake);
        window.removeEventListener('online', onWake);
        window.removeEventListener('pageshow', onWake);
    };
  }, [roomPin, currentScreen, userRole]);

  // Chủ sân ghi nhiều thay đổi trong 1 giao dịch (batch): hoặc tất cả thành công, hoặc không gì cả
  // Ghi lần lượt theo hàng đợi: lệnh sau luôn tới server sau lệnh trước → không bị ghi đè sai thứ tự
  const commit = (updates: Record<string, Partial<Player>>, newCourts?: CourtData[], newSettings?: GameSettings, newHistory?: MatchRecord[]) => {
      if (userRole !== 'host' || !roomId) return;
      const ids = Object.keys(updates);
      applyPlayers(playersRef.current.map(p => updates[p.id] ? { ...p, ...updates[p.id] } : p));
      if (newCourts) applyCourts(newCourts);
      if (newHistory) historyRef.current = newHistory;
      if (ids.length === 0 && !newCourts && !newSettings && !newHistory) return;
      const rid = roomId;
      pendingWrites.current++;
      writeQueue.current = writeQueue.current.then(async () => {
          try {
              const batch = pb.createBatch();
              ids.forEach(id => batch.collection('players').update(id, toFields(updates[id])));
              if (newCourts || newSettings || newHistory) {
                  batch.collection('rooms').update(rid, { ...(newCourts ? { courts: newCourts } : {}), ...(newSettings ? { settings: newSettings } : {}), ...(newHistory ? { history: newHistory } : {}) });
              }
              await batch.send();
          } catch (e) {
              console.error("Lỗi đồng bộ:", e);
              alert(t.syncError);
              missedRealtime.current = true;
          } finally {
              // Hết lệnh chờ → tải lại 1 lần nếu trong lúc ghi đã bỏ qua tín hiệu realtime
              if (--pendingWrites.current === 0 && missedRealtime.current) {
                  missedRealtime.current = false;
                  reloadRoomRef.current();
              }
          }
      });
  };

  const generateRoomPin = () => Math.floor(100000 + Math.random() * 900000).toString();

  const handleCreateRoom = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
        const uid = await ensureAuth();
        if (!isHostAccount()) { setCanHost(false); setCurrentScreen('guest_join'); alert(t.noHostPermission); return; }
        const initialCourts: CourtData[] = Array.from({ length: settings.totalCourts }, (_, i) => ({ id: i + 1, status: 'available', playerIds: [], matchType: '2v2' }));
        let pin = "";
        for (let attempt = 0; attempt < 5 && !pin; attempt++) {
            const candidate = generateRoomPin();
            try {
                await pb.collection('rooms').create({ id: roomIdFromPin(candidate), pin: candidate, host: uid, settings, courts: initialCourts });
                pin = candidate;
            } catch (e) {
                // Chỉ thử PIN khác khi lỗi là trùng mã phòng; lỗi khác thì báo luôn
                const data = (e as ClientResponseError)?.response?.data || {};
                if ((e as ClientResponseError)?.status !== 400 || !(data.id || data.pin)) throw e;
            }
        }
        if (!pin) throw new Error("Không tạo được mã phòng");

        hostSettingsLoaded.current = false;
        setUserRole('host');
        setRoomPin(pin);
        setCurrentScreen('host_setup');
        await saveSession('host', pin, 'host_setup');
    } catch (err) { console.error(err); alert(t.createRoomError); }
    finally { setIsBusy(false); }
  };

  const handleJoinRoom = async () => {
    const pin = roomPin.trim();
    if (guestName.trim() === "") { alert(t.alertNeedName); return; }
    if (!/^\d{6}$/.test(pin)) { alert(t.alertInvalidPin); return; }
    if (isBusy) return;
    setIsBusy(true);
    try {
        const uid = await ensureAuth();
        const rid = roomIdFromPin(pin);
        try { await pb.collection('rooms').getOne(rid); }
        catch { alert(t.alertRoomNotFound); return; }

        const profile = { name: guestName.trim(), skill: guestSkill, gender: guestGender };
        // Vào lại phòng cũ (vd. đổi máy/tải lại trang) → cập nhật bản ghi cũ thay vì tạo trùng
        const existing = await pb.collection('players')
            .getFirstListItem(pb.filter('room = {:rid} && user = {:uid}', { rid, uid }))
            .catch(() => null);
        if (existing) {
            // Đang đánh dở trận thì không được tự sửa hồ sơ → giữ bản ghi cũ, vẫn cho vào phòng
            // Giữ trình độ cũ: chủ sân có thể đã chỉnh lại cho đúng thực lực
            if (existing.status !== 'playing') await pb.collection('players').update(existing.id, { name: profile.name, gender: profile.gender });
        }
        else await pb.collection('players').create({ ...profile, room: rid, user: uid, status: 'waiting', wait_since: nowMs() });

        try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* bộ nhớ bị chặn */ }
        setRoomPin(pin);
        setUserRole('guest');
        setCurrentScreen('app');
        setActiveTab('players');
        await saveSession('guest', pin, 'app');
    } catch (err) { console.error(err); alert(t.joinRoomError + ((err as Error)?.message ? `: ${(err as Error).message}` : "")); }
    finally { setIsBusy(false); }
  };

  const leaveToLauncher = async () => {
      await Preferences.remove({ key: 'badRallySession' });
      setRoomPin("");
      applyPlayers([]);
      applyCourts([]);
      setRoomName("");
      setIsSidebarOpen(false);
      setIsKickedModalOpen(false);
      hostSettingsLoaded.current = false;
      setCurrentScreen('launcher');
  };

  const handleExitRoom = async () => {
      if (userRole === 'host') {
          if (!window.confirm(t.hostExitWarning)) return;
          if (roomId) {
              try { await pb.collection('rooms').delete(roomId); }
              catch (e) { console.error("Lỗi xóa phòng:", e); }
          }
      } else {
          // Khách rời phòng → tự gỡ tên khỏi danh sách (trừ khi đang đánh dở trận)
          const me = playersRef.current.find(p => p.userId && p.userId === pb.authStore.record?.id);
          if (me && me.status !== 'playing') {
              try { await pb.collection('players').delete(me.id); } catch (e) { console.error(e); }
          }
      }
      await leaveToLauncher();
  };

  const myPlayer = () => playersRef.current.find(p => p.userId && p.userId === myUserIdRef.current);

  // Khách tự bật/tắt nghỉ (server không cho khách đổi trạng thái khi đang đánh)
  const handleGuestToggleBreak = async () => {
      const mine = myPlayer();
      if (!mine || mine.status === 'playing') return;
      const next: Partial<Player> = mine.status === 'break' ? { status: 'waiting', waitSince: nowMs() } : { status: 'break' };
      applyPlayers(playersRef.current.map(p => p.id === mine.id ? { ...p, ...next } : p));
      try { await pb.collection('players').update(mine.id, toFields(next)); }
      catch (e) { console.error(e); alert(t.syncError); reloadRoomRef.current(); }
  };

  const handleGuestLeave = async () => {
      if (!window.confirm(t.confirmLeave)) return;
      await handleExitRoom();
  };

  const dismissCalled = () => {
      setCalledAlert(false);
      stopTitleFlash();
      setActiveTab('courts');
  };

  const handleGoToDashboard = async () => {
      setCurrentScreen('app');
      await saveSession('host', roomPin, 'app');
  }

  const handleShare = async () => {
      const url = roomPin ? `${PUBLIC_APP_URL}/?pin=${roomPin}` : PUBLIC_APP_URL;
      try {
          if (navigator.share) await navigator.share({ title: 'Bad Rally', text: roomPin ? `${roomName ? roomName + ' – ' : ''}${t.roomPinLabel} ${roomPin}` : t.tagline, url });
          else { await navigator.clipboard.writeText(url); alert(url); }
      } catch { /* người dùng hủy chia sẻ */ }
  };

  const handleCloseKickedModal = async () => {
      await leaveToLauncher();
  }

  const newPlayerFields = (name: string, skill: SkillLevel, gender: Gender) => ({
      room: roomId, name, skill, gender, status: 'waiting', play_count: 0, wins: 0, wait_since: nowMs(),
  });

  const handleAddPlayer = async () => {
    if (newPlayerName.trim() === "" || userRole !== 'host') return;
    const name = newPlayerName.trim();
    setNewPlayerName("");
    try { await pb.collection('players').create(newPlayerFields(name, newPlayerSkill, newPlayerGender)); }
    catch (e) { console.error(e); alert(t.syncError); setNewPlayerName(name); }
  };

  const handleAddGuests = async () => {
    if (userRole !== 'host') return;
    try {
        const batch = pb.createBatch();
        for (let i = 0; i < 8; i++) {
            batch.collection('players').create(newPlayerFields(`${t.guestPrefix} ${playersRef.current.length + i + 1}`, 'Trung bình', i % 2 === 0 ? 'M' : 'F'));
        }
        await batch.send();
    } catch (e) { console.error(e); alert(t.syncError); }
  };

  const handleRemovePlayer = async (id: string) => {
      if (userRole !== 'host') return;
      const target = playersRef.current.find(p => p.id === id);
      try {
          const batch = pb.createBatch();
          batch.collection('players').delete(id);
          if (target?.partnerId && playersRef.current.some(p => p.id === target.partnerId)) batch.collection('players').update(target.partnerId, { partner: '' });
          if (courtRef.current.some(c => c.playerIds.includes(id))) {
              batch.collection('rooms').update(roomId, { courts: courtRef.current.map(c => ({ ...c, playerIds: c.playerIds.filter(pid => pid !== id) })) });
          }
          await batch.send();
      } catch (e) { console.error(e); alert(t.syncError); reloadRoomRef.current(); }
  };

  const handleRemoveAllPlayers = async () => {
      if (userRole !== 'host' || !window.confirm(t.confirmDeleteAll)) return;
      try {
          const ids = playersRef.current.map(p => p.id);
          for (let i = 0; i < ids.length || i === 0; i += 90) {
              const batch = pb.createBatch();
              ids.slice(i, i + 90).forEach(id => batch.collection('players').delete(id));
              if (i === 0) batch.collection('rooms').update(roomId, { courts: courtRef.current.map(c => ({ ...c, status: 'available', playerIds: [] })) });
              await batch.send();
          }
      } catch (e) { console.error(e); alert(t.syncError); reloadRoomRef.current(); }
  };

  const handleLinkClick = (playerId: string) => {
    if (userRole === 'guest') return;
    const player = playersRef.current.find(p => p.id === playerId);
    if (!player) return;

    if (player.partnerId) {
        const updates: Record<string, Partial<Player>> = { [playerId]: { partnerId: undefined } };
        if (playersRef.current.some(p => p.id === player.partnerId)) updates[player.partnerId] = { partnerId: undefined };
        commit(updates);
        if (linkingPlayerId === playerId) setLinkingPlayerId(null);
        return;
    }

    if (linkingPlayerId) {
        if (linkingPlayerId === playerId) setLinkingPlayerId(null);
        else {
            commit({ [playerId]: { partnerId: linkingPlayerId }, [linkingPlayerId]: { partnerId: playerId } });
            setLinkingPlayerId(null);
        }
    } else setLinkingPlayerId(playerId);
  };

  const handleChangeSkill = (p: Player, skill: SkillLevel) => {
      if (userRole !== 'host' || skill === p.skill) return;
      commit({ [p.id]: { skill } });
  };

  const handleToggleBreak = (p: Player) => {
      if (userRole !== 'host' || p.status === 'playing') return;
      commit({ [p.id]: p.status === 'break' ? { status: 'waiting', waitSince: nowMs() } : { status: 'break' } });
  };

  function updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) { setSettings(prev => ({ ...prev, [key]: value })); }
  const updateWeight = (key: keyof GameSettings['weights'], value: number) => { setSettings(prev => ({ ...prev, weights: { ...prev.weights, [key]: value } })); }

  const handleApplySettings = () => {
      const newCourts = Array.from({ length: settings.totalCourts }, (_, i) => courtRef.current[i] || { id: i + 1, status: 'available' as const, playerIds: [], matchType: '2v2' as const });
      // Sân bị bớt đi mà đang có người → trả họ về hàng chờ
      const freed = courtRef.current.slice(settings.totalCourts).flatMap(c => c.status === 'active' || c.status === 'scoring' ? c.playerIds : []);
      const updates: Record<string, Partial<Player>> = {};
      freed.forEach(id => { if (playersRef.current.some(p => p.id === id)) updates[id] = { status: 'waiting', waitSince: nowMs() }; });
      commit(updates, newCourts, settings);
      alert(t.settingsSaved);
  };

  const handleChangeMatchType = (courtId: number, type: '1v1' | '1v2' | '2v2') => {
      if(userRole === 'guest') return;
      commit({}, courtRef.current.map(c => c.id === courtId ? { ...c, matchType: type, playerIds: c.status === 'drafting' ? [] : c.playerIds } : c));
  };

  const handleRenameCourt = (court: CourtData) => {
      if (userRole !== 'host') return;
      const input = window.prompt(t.courtNamePrompt, court.name || courtName(court));
      if (input === null) return;
      const name = input.trim().slice(0, 20);
      commit({}, courtRef.current.map(c => c.id === court.id ? { ...c, name: name && name !== `${t.court} ${c.id}` ? name : undefined } : c));
  };

  const saveRoomName = async (name: string) => {
      if (userRole !== 'host' || !roomId) return;
      const clean = name.trim().slice(0, 60);
      setRoomName(clean);
      try { await pb.collection('rooms').update(roomId, { name: clean }); }
      catch (e) { console.error(e); alert(t.syncError); }
  };

  const handleRenameRoom = () => {
      if (userRole !== 'host') return;
      const input = window.prompt(t.roomNamePrompt, roomName);
      if (input !== null) saveRoomName(input);
  };

  const handleChangeCategory = (courtId: number, category: MatchCategory) => {
      if (userRole === 'guest') return;
      commit({}, courtRef.current.map(c => c.id === courtId ? { ...c, category, playerIds: c.status === 'drafting' ? [] : c.playerIds } : c));
  };

  const handleShuffleModeChange = (mode: ShuffleMode) => {
    updateSetting('shuffleMode', mode);
    switch (mode) {
      case 'Equal Rotation': setSettings(prev => ({ ...prev, weights: { playCountFairness: 100, waitTimePriority: 80, avoidSamePartner: 70, avoidSameOpponents: 55, skillBalance: 0, keepPreviousPair: 0 } })); break;
      case 'Skill Based': setSettings(prev => ({ ...prev, weights: { playCountFairness: 35, waitTimePriority: 10, avoidSamePartner: 85, avoidSameOpponents: 75, skillBalance: 100, keepPreviousPair: 0 } })); break;
      case 'Social Mix': setSettings(prev => ({ ...prev, weights: { playCountFairness: 10, waitTimePriority: 10, avoidSamePartner: 100, avoidSameOpponents: 90, skillBalance: 0, keepPreviousPair: 0 } })); break;
      case 'Fixed Pairs': setSettings(prev => ({ ...prev, weights: { playCountFairness: 100, waitTimePriority: 50, avoidSamePartner: 0, avoidSameOpponents: 90, skillBalance: 0, keepPreviousPair: 100 } })); break;
    }
  };

  const neededFor = (matchType: Court['matchType']) => matchType === '1v1' ? 2 : matchType === '1v2' ? 3 : 4;

  const handleGenerateNextGame = (specificCourtId?: number) => {
    if(userRole === 'guest') return;
    const courtIndex = specificCourtId ? courtRef.current.findIndex(c => c.id === specificCourtId) : courtRef.current.findIndex(c => c.status === 'available');
    if (courtIndex === -1) { alert(t.alertCourtFull); return; }

    const courtToFill = courtRef.current[courtIndex];
    const neededPlayers = neededFor(courtToFill.matchType);
    const availablePlayers = playersRef.current.filter(p => p.status === 'waiting');

    const category = effectiveCategory(courtToFill.matchType, courtToFill.category);
    if (availablePlayers.length < neededPlayers) { alert(t.alertNotEnoughPlayers.replace('{n}', neededPlayers.toString()).replace('{type}', courtToFill.matchType).replace('{m}', availablePlayers.length.toString())); return; }

    // Chấm điểm mọi cách xếp trong nhóm ưu tiên theo trọng số của chế độ trộn đang chọn
    const picked = pickMatch(
        availablePlayers.map(p => ({ id: p.id, playCount: fairCount(p), waitSince: p.waitSince, partnerId: p.partnerId, skill: ALL_SKILLS.indexOf(p.skill), gender: p.gender })),
        courtToFill.matchType, settings.weights, historyRef.current, nowMs(), category);
    if (!picked) {
        // Không đủ người đúng giới tính cho thể loại đã chọn
        const men = availablePlayers.filter(p => genderOf(p) === 'M').length;
        alert(t.alertCategoryNotEnough.replace('{cat}', t.categories[category]).replace('{need}', t.categoryNeed[category]).replace('{m}', String(men)).replace('{f}', String(availablePlayers.length - men)));
        return;
    }
    const selectedIds = [...picked[0], ...picked[1]].map(p => p.id);

    const newCourts = courtRef.current.map((c, i) => i === courtIndex ? { ...c, status: 'active' as const, playerIds: selectedIds } : c);
    const updates: Record<string, Partial<Player>> = {};
    selectedIds.forEach(id => { updates[id] = { status: 'playing' }; });
    commit(updates, newCourts);
  };

  const handleStartDrafting = (courtId: number) => {
    if(userRole === 'guest') return;
    commit({}, courtRef.current.map(c => c.id === courtId ? { ...c, status: 'drafting' as const, playerIds: [] } : c));
  };

  const handleCancelDrafting = (courtId: number) => {
    if(userRole === 'guest') return;
    commit({}, courtRef.current.map(c => c.id === courtId ? { ...c, status: 'available' as const, playerIds: [] } : c));
  };

  const handleToggleDraftPlayer = (courtId: number, player: Player) => {
    if(userRole === 'guest') return;
    commit({}, courtRef.current.map(c => {
        if (c.id !== courtId) return c;
        if (c.playerIds.includes(player.id)) return { ...c, playerIds: c.playerIds.filter(id => id !== player.id) };
        if (c.playerIds.length >= neededFor(c.matchType)) return c;
        const category = effectiveCategory(c.matchType, c.category);
        if (!fitsCategory(player, category)) return c;
        if (category === 'XD') {
            const sameGender = c.playerIds.filter(id => { const p = playersRef.current.find(x => x.id === id); return p && genderOf(p) === genderOf(player); }).length;
            if (sameGender >= 2) { alert(t.alertXDTeams); return c; }
        }
        return { ...c, playerIds: [...c.playerIds, player.id] };
    }));
  };

  const handleStartManualMatch = (courtId: number) => {
    if(userRole === 'guest') return;
    const court = courtRef.current.find(c => c.id === courtId);
    if (!court) return;
    const needed = neededFor(court.matchType);
    // Người đã được chọn nhưng vừa bị xếp sân khác / nghỉ / bị xóa thì không tính
    const validIds = court.playerIds.filter(id => playersRef.current.find(p => p.id === id)?.status === 'waiting');
    if (validIds.length !== needed) {
        alert(t.alertNeedPlayers.replace('{n}', needed.toString()));
        if (validIds.length !== court.playerIds.length) commit({}, courtRef.current.map(c => c.id === courtId ? { ...c, playerIds: validIds } : c));
        return;
    }
    let orderedIds = validIds;
    const category = effectiveCategory(court.matchType, court.category);
    const chosen = validIds.map(id => playersRef.current.find(p => p.id === id)!);
    if (category === 'XD') {
        // Tự sắp lại thành 2 đội, mỗi đội 1 nam + 1 nữ
        const men = chosen.filter(p => genderOf(p) === 'M'), women = chosen.filter(p => genderOf(p) === 'F');
        if (men.length !== 2 || women.length !== 2) { alert(t.alertXDTeams); return; }
        orderedIds = [men[0].id, women[0].id, men[1].id, women[1].id];
    } else if (!teamFitsCategory(chosen, category)) {
        alert(t.alertCategoryNotEnough.replace('{cat}', t.categories[category]).replace('{need}', t.categoryNeed[category]).replace(/ (.*)/, ''));
        return;
    }
    const updates: Record<string, Partial<Player>> = {};
    orderedIds.forEach(id => { updates[id] = { status: 'playing' }; });
    commit(updates, courtRef.current.map(c => c.id === courtId ? { ...c, status: 'active' as const, playerIds: orderedIds } : c));
  };

  const handleFinishMatch = (courtId: number) => {
    if (userRole === 'guest') return;
    if (settings.trackMatchResults) commit({}, courtRef.current.map(c => c.id === courtId ? { ...c, status: 'scoring' as const } : c));
    else handleMatchResult(courtId, -1);
  };

  // winningTeam: 1/2 = đội thắng, -1 = kết thúc không ghi điểm (vẫn tính trận), 0 = hủy trận (không tính)
  const handleMatchResult = (courtId: number, winningTeam: 1 | 2 | 0 | -1) => {
    if(userRole === 'guest') return;
    const court = courtRef.current.find(c => c.id === courtId);
    if (!court) return;

    const topCount = court.matchType === '2v2' ? 2 : 1;
    const team1Ids = court.playerIds.slice(0, topCount);
    const now = nowMs();

    const updates: Record<string, Partial<Player>> = {};
    for (const id of court.playerIds) {
        const p = playersRef.current.find(x => x.id === id);
        if (!p) continue;
        if (winningTeam === 0) { updates[id] = { status: 'waiting', waitSince: now }; continue; }
        const isWinner = (winningTeam === 1 && team1Ids.includes(id)) || (winningTeam === 2 && !team1Ids.includes(id));
        updates[id] = { status: 'waiting', waitSince: now, playCount: p.playCount + 1, wins: p.wins + (isWinner ? 1 : 0) };
    }
    // Trận có diễn ra (không phải hủy) → lưu lịch sử ghép cặp, giữ 300 trận gần nhất
    const newHistory = winningTeam === 0 ? undefined
        : [...historyRef.current, { t1: team1Ids, t2: court.playerIds.slice(topCount), at: now }].slice(-300);
    // Ghi nhớ trạng thái trước đó để hoàn tác nếu bấm nhầm
    const before: Record<string, Partial<Player>> = {};
    for (const id of Object.keys(updates)) {
        const p = playersRef.current.find(x => x.id === id)!;
        before[id] = { status: p.status, waitSince: p.waitSince, playCount: p.playCount, wins: p.wins };
    }
    setLastResult({ courtId, court, players: before, at: now, addedHistory: !!newHistory, winningTeam });
    commit(updates, courtRef.current.map(c => c.id === courtId ? { ...c, status: 'available' as const, playerIds: [] } : c), undefined, newHistory);
  };

  // Trả sân và người chơi về đúng như trước khi ghi kết quả (chỉ khi sân còn trống và mọi người chưa bị xếp đi chỗ khác)
  const handleUndoResult = () => {
    if (userRole !== 'host' || !lastResult) return;
    const { courtId, court, players: before, at, addedHistory } = lastResult;
    const current = courtRef.current.find(c => c.id === courtId);
    const ids = Object.keys(before);
    const stillFree = current && current.status === 'available' && current.playerIds.length === 0
        && ids.every(id => playersRef.current.find(p => p.id === id)?.status === 'waiting');
    setLastResult(null);
    if (!stillFree) { alert(t.undoUnavailable); return; }
    commit(before, courtRef.current.map(c => c.id === courtId ? court : c), undefined,
        addedHistory ? historyRef.current.filter(h => h.at !== at) : undefined);
  };

  const handleResetCounts = () => {
      if (userRole !== 'host' || !confirm(t.confirmResetCounts)) return;
      const now = nowMs();
      const updates: Record<string, Partial<Player>> = {};
      // Giữ nguyên trạng thái nghỉ và số trận thắng (kết quả đã lưu), chỉ đặt lại số trận + thứ tự chờ
      playersRef.current.forEach((p, i) => { updates[p.id] = { playCount: 0, baseCount: 0, status: p.status === 'break' ? 'break' : 'waiting', waitSince: now + i }; });
      // Đặt lại cả lịch sử ghép cặp (như mô tả của nút)
      commit(updates, courtRef.current.map(c => ({ ...c, status: 'available' as const, playerIds: [] })), undefined, []);
  };

  const handleResetEvent = async () => {
      if (userRole !== 'host' || !window.confirm(t.confirmResetEvent)) return;
      try { if (roomId) await pb.collection('rooms').delete(roomId); }
      catch (e) { console.error(e); }
      await leaveToLauncher();
  };

  // Nhãn thể loại trận đôi (trống nếu tự do / không phải 2v2)
  const courtName = (c: CourtData) => c.name?.trim() || `${t.court} ${c.id}`;
  const courtNameById = (id: number) => { const c = courts.find(x => x.id === id); return c ? courtName(c) : `${t.court} ${id}`; };
  const catLabel = (c: CourtData) => { const cat = effectiveCategory(c.matchType, c.category); return cat === 'any' ? '' : t.categories[cat]; };
  const CATEGORY_OPTIONS: MatchCategory[] = ['any', 'MD', 'WD', 'XD'];

  // Thẻ "Của tôi" (khách)
  const me = userRole === 'guest' && myUserId ? players.find(p => p.userId === myUserId) : undefined;
  const myCourt = me ? courts.find(c => (c.status === 'active' || c.status === 'scoring') && c.playerIds.includes(me.id)) : undefined;
  let myTeammates: Player[] = [];
  let myOpponents: Player[] = [];
  if (me && myCourt) {
      const top = myCourt.matchType === '2v2' ? 2 : 1;
      const team1 = myCourt.players.slice(0, top), team2 = myCourt.players.slice(top);
      const mine = team1.some(p => p.id === me.id) ? team1 : team2;
      myTeammates = mine.filter(p => p.id !== me.id);
      myOpponents = mine === team1 ? team2 : team1;
  }
  // Ước tính vị trí hàng chờ theo cùng thứ tự ưu tiên của thuật toán (ít trận trước, chờ lâu trước)
  const inPlayCount = courts.filter(c => c.status === 'active' || c.status === 'scoring').length;
  const waitingQueue = players.filter(p => p.status === 'waiting').sort((a, b) => fairCount(a) - fairCount(b) || (a.waitSince || 0) - (b.waitSince || 0));
  const myQueuePos = me && me.status === 'waiting' ? waitingQueue.findIndex(p => p.id === me.id) + 1 : 0;
  const nextRoundSlots = 4 * Math.max(1, courts.filter(c => c.status === 'available').length);
  const myEtaText = myQueuePos === 0 ? '' : myQueuePos <= nextRoundSlots ? t.myEtaNext : t.myEtaLater.replace('{n}', String(Math.ceil((myQueuePos - nextRoundSlots) / 4)));

  const partnerNames: Record<string, string> = Object.fromEntries(players.map(p => [p.id, p.name]));

  const filteredPlayers = players
    .filter(p => playerFilter === 'all' ? true : p.status === playerFilter)
    .sort((a, b) => {
      if (sortOption === "name") return a.name.localeCompare(b.name);
      else if (sortOption === "games") return b.playCount - a.playCount;
      else {
        const statusOrder = { playing: 1, waiting: 2, break: 3 };
        if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
        return a.playCount - b.playCount;
      }
    });

  const handleMouseMove = (e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 40;
    const y = (e.clientY / window.innerHeight - 0.5) * 40;
    setMousePos({ x, y });
  };

  // ==========================================
  // GIAO DIỆN KHỞI ĐỘNG (LAUNCHER CHÍNH): nền tối, sân phối cảnh, quả cầu bay qua lại
  // ==========================================
  const langPill = (
    <div className="absolute top-4 right-4 z-50 flex gap-2">
      <button onClick={() => setUiChoice('classic')} title={t.uiClassicDesc} className="rounded-full bg-white/[0.08] hover:bg-white/15 border border-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
        <i className="fa-solid fa-palette mr-1.5 text-slate-400"></i>{t.uiClassic}
      </button>
      <button onClick={() => setLang(lang === 'VI' ? 'EN' : 'VI')} className="rounded-full bg-white/[0.08] hover:bg-white/15 border border-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
        <i className="fa-solid fa-globe mr-1.5 text-slate-400"></i>{lang}
      </button>
    </div>
  );
  const glows = (
    <>
      <div className="pointer-events-none absolute w-[520px] h-[520px] rounded-full bg-blue-600/30 blur-[110px] -top-48 -right-40 br-glow" style={{ transform: `translate(${mousePos.x}px, ${mousePos.y}px)` }}></div>
      <div className="pointer-events-none absolute w-[440px] h-[440px] rounded-full bg-lime-400/15 blur-[110px] -bottom-48 -left-40 br-glow" style={{ transform: `translate(${-mousePos.x}px, ${-mousePos.y}px)` }}></div>
    </>
  );

  if (currentScreen === "launcher") {
    return (
      <div className="relative w-full h-screen overflow-clip z-10 bg-[#0b0f1a] text-white flex flex-col" onMouseMove={handleMouseMove}>
        {glows}
        {langPill}

        {/* SÂN CẦU LÔNG PHỐI CẢNH + QUẢ CẦU ĐANG RALLY */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[58vh] flex justify-center [perspective:900px]">
          <div className="relative w-[min(92vw,560px)] h-[120%] origin-bottom [transform:rotateX(62deg)] border-2 border-lime-400/40 rounded-sm bg-gradient-to-t from-lime-400/[0.07] to-transparent">
            <div className="absolute inset-y-0 left-[8%] border-l border-lime-400/25"></div>
            <div className="absolute inset-y-0 right-[8%] border-r border-lime-400/25"></div>
            <div className="absolute inset-y-0 left-1/2 border-l border-lime-400/25"></div>
            <div className="absolute inset-x-0 top-[34%] border-t border-lime-400/25"></div>
            <div className="absolute inset-x-0 bottom-[34%] border-t border-lime-400/25"></div>
            <div className="absolute inset-x-0 top-1/2 h-[3px] -mt-px bg-white/70 shadow-[0_0_18px_rgba(255,255,255,0.6)]"></div>
          </div>
        </div>
        <div className="pointer-events-none absolute left-1/2 bottom-[10vh] z-10">
          <div className="br-rally-x"><div className="br-rally-y"><div className="br-rally-flip"><div className="br-rally-spin">
            <Shuttle className="w-12 h-12 -ml-6 drop-shadow-[0_0_14px_rgba(163,230,53,0.55)]" />
          </div></div></div></div>
        </div>

        <div className="relative z-20 flex-1 flex flex-col items-center justify-center text-center px-6 pb-[22vh]" style={{ transform: `translate(${mousePos.x * 0.3}px, ${mousePos.y * 0.3}px)` }}>
          <span className="br-fade inline-flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-slate-300 backdrop-blur">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse"></span>{t.tagline}
          </span>
          <h1 className="mt-5 text-[64px] sm:text-8xl md:text-9xl font-black tracking-[-0.04em] leading-[0.9]">
            {"BAD".split("").map((c, i) => <span key={`b${i}`} className="br-letter" style={{ animationDelay: `${150 + i * 60}ms` }}>{c}</span>)}
            <br className="sm:hidden" /><span className="hidden sm:inline"> </span>
            {"RALLY".split("").map((c, i) => <span key={`r${i}`} className="br-letter text-lime-400" style={{ animationDelay: `${330 + i * 60}ms` }}>{c}</span>)}
          </h1>
          <p className="br-fade mt-5 max-w-md text-sm sm:text-base text-slate-400 leading-relaxed [animation-delay:700ms]" dangerouslySetInnerHTML={{__html: t.desc}}></p>
          <div className="br-rise mt-6 flex flex-wrap justify-center gap-2 [animation-delay:850ms]">
            {[['fa-scale-balanced', t.featFair], ['fa-qrcode', t.featQr], ['fa-bell', t.featCall]].map(([ic, label]) => (
              <span key={label} className="rounded-full bg-white/[0.05] border border-white/[0.08] px-3 py-1 text-xs text-slate-300"><i className={`fa-solid ${ic} mr-1.5 text-lime-400`}></i>{label}</span>
            ))}
          </div>
          <div className="br-rise mt-8 flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto [animation-delay:1000ms]">
            <button onClick={() => { buzz(); setCurrentScreen(canHost ? "role_select" : "guest_join"); }} className="rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold text-base px-9 py-4 shadow-[0_0_40px_rgba(163,230,53,0.35)] active:scale-[0.97] transition">
              {t.startBtn} <i className="fa-solid fa-arrow-right ml-2"></i>
            </button>
            {/* Lối vào chế độ Giải đấu (trang riêng /giai) */}
            <Link href="/giai" className="rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 font-semibold text-base px-7 py-4 backdrop-blur active:scale-[0.97] transition">
              <i className="fa-solid fa-trophy text-amber-400 mr-2"></i>{t.tournamentBtn}
            </Link>
          </div>
        </div>

        {/* THẺ BẢN QUYỀN IDEAN Ở TRANG CHỦ */}
        <div className="absolute bottom-4 inset-x-0 z-30 text-center text-[11px] text-slate-500">
          © {new Date().getFullYear()} by <span className="text-slate-300 font-semibold">iDean</span>
        </div>
      </div>
    );
  }

  // Khung chung cho các màn trước khi vào phòng
  const preScreen = (children: React.ReactNode) => (
    <div className="relative w-full min-h-screen flex items-center justify-center bg-[#0b0f1a] text-slate-100 overflow-clip px-4 py-10 [color-scheme:dark]" onMouseMove={handleMouseMove}>
      {glows}
      {langPill}
      <div className="br-rise relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
  const logo = <div className="font-black text-2xl tracking-tight text-center">BAD <span className="text-lime-400">RALLY</span></div>;

  // ==========================================
  // GIAO DIỆN CHỌN VAI TRÒ (MULTI-TENANT)
  // ==========================================
  if (currentScreen === "role_select") {
    return preScreen(
      <div className="flex flex-col gap-3">
        {logo}
        <p className="text-center text-slate-400 mb-3">{t.roleSelectTitle}</p>
        <button onClick={() => { buzz(); handleCreateRoom(); }} className="group text-left rounded-3xl bg-[#131a2b] border border-slate-800 hover:border-blue-500/60 p-5 flex items-center gap-4 transition active:scale-[0.98]">
          <span className="w-14 h-14 shrink-0 rounded-2xl bg-blue-500/15 text-blue-300 inline-flex items-center justify-center text-2xl group-hover:scale-110 transition"><i className="fa-solid fa-house-laptop"></i></span>
          <span className="flex-1">
            <span className="block font-bold text-lg">{t.hostRole}</span>
            <span className="block text-sm text-slate-400 mt-0.5">{t.hostDesc}</span>
          </span>
          <i className="fa-solid fa-chevron-right text-slate-600 group-hover:text-blue-300"></i>
        </button>
        <button onClick={() => { buzz(); setCurrentScreen('guest_join'); }} className="group text-left rounded-3xl bg-[#131a2b] border border-slate-800 hover:border-lime-400/60 p-5 flex items-center gap-4 transition active:scale-[0.98]">
          <span className="w-14 h-14 shrink-0 rounded-2xl bg-lime-400/15 text-lime-300 inline-flex items-center justify-center text-2xl group-hover:scale-110 transition"><i className="fa-solid fa-mobile-screen-button"></i></span>
          <span className="flex-1">
            <span className="block font-bold text-lg">{t.guestRole}</span>
            <span className="block text-sm text-slate-400 mt-0.5">{t.guestDesc}</span>
          </span>
          <i className="fa-solid fa-chevron-right text-slate-600 group-hover:text-lime-300"></i>
        </button>
        <button onClick={() => setCurrentScreen('launcher')} className="text-slate-500 hover:text-slate-200 text-sm font-semibold mt-3"><i className="fa-solid fa-arrow-left mr-1.5"></i>{t.backBtn}</button>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN CHỦ SÂN TẠO PHÒNG (MÃ QR ĐỘNG)
  // ==========================================
  if (currentScreen === "host_setup") {
    const linkToJoin = `${PUBLIC_APP_URL}/?pin=${roomPin}`;

    return preScreen(
      <div className="rounded-3xl bg-[#131a2b] border border-slate-800 p-6 flex flex-col items-center gap-5">
        <div className="text-center">
          <DPill tone="lime">{t.roomCreated}</DPill>
          <p className="text-xs text-slate-400 mt-4 mb-1">{t.roomPinLabel}</p>
          <div className="flex gap-1.5 justify-center">
            {roomPin.split("").map((d, i) => (
              <span key={i} style={{ animationDelay: `${200 + i * 70}ms` }} className="br-pop w-10 h-14 rounded-xl bg-[#0e1422] border border-slate-700 inline-flex items-center justify-center text-3xl font-bold text-lime-400 tabular-nums">{d}</span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-3 shadow-[0_0_50px_rgba(163,230,53,0.2)]">
          <QrCode value={linkToJoin} size={192} className="w-48 h-48" />
        </div>
        <p className="text-sm text-center text-slate-400 -mt-1">{t.qrDesc}</p>

        <div className="w-full">
          <label className={DLB}>{t.roomNameLabel}</label>
          <input type="text" maxLength={60} value={roomName} placeholder={t.roomNamePlaceholder} onChange={e => setRoomName(e.target.value)} onBlur={e => saveRoomName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={DIN} />
        </div>

        <button onClick={() => { buzz([10, 30, 10]); handleGoToDashboard(); }} className="w-full rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold py-4 active:scale-[0.98] transition">{t.goToDashboard} <i className="fa-solid fa-arrow-right ml-1.5"></i></button>
        {/* THẺ BẢN QUYỀN IDEAN Ở TRANG QUÉT QR */}
        <p className="text-[11px] text-slate-500 -mt-2">Powered by <span className="text-slate-300 font-semibold">iDean</span></p>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN KHÁCH NHẬP MÃ VÀO PHÒNG
  // ==========================================
  if (currentScreen === "guest_join") {
    return preScreen(
      <>
      <div className="rounded-3xl bg-[#131a2b] border border-slate-800 p-6 flex flex-col gap-4">
        <div className="text-center">
          {logo}
          <p className="text-slate-400 text-sm mt-1">{t.joinMatch}</p>
        </div>

        <div>
          <label className={DLB}>{t.pinLabel}</label>
          <input type="text" inputMode="numeric" maxLength={6} placeholder={t.pinPlaceholder} className="w-full rounded-2xl bg-[#0e1422] border border-slate-700 py-3.5 text-3xl tracking-[0.35em] text-center font-bold text-lime-400 placeholder:text-slate-600 placeholder:text-xl placeholder:tracking-normal focus:outline-none focus:border-lime-400" value={roomPin} onChange={e => setRoomPin(e.target.value)} />
          <button onClick={() => setScannerOpen(true)} className="mt-2 w-full rounded-full bg-white/[0.08] hover:bg-white/[0.14] py-2.5 text-sm font-semibold"><i className="fa-solid fa-qrcode mr-2 text-lime-400"></i>{t.scanQr}</button>
        </div>

        <div>
          <label className={DLB}>{t.yourNameLabel}</label>
          <input type="text" placeholder={t.namePlaceholder} className={`${DIN} mb-2`} value={guestName} onChange={e => setGuestName(e.target.value)} />
          <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1 text-sm font-semibold">
            <button onClick={() => setGuestGender('M')} className={`rounded-full py-2 transition ${guestGender === 'M' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}>♂ {t.male}</button>
            <button onClick={() => setGuestGender('F')} className={`rounded-full py-2 transition ${guestGender === 'F' ? 'bg-pink-500 text-white' : 'text-slate-400'}`}>♀ {t.female}</button>
          </div>
        </div>

        <div>
          <label className={DLB}>{t.skillLabel}</label>
          <select className={`${DIN} cursor-pointer`} value={guestSkill} onChange={e => setGuestSkill(e.target.value as SkillLevel)}>
            {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
          </select>
        </div>

        <button onClick={() => { buzz([10, 30, 10]); handleJoinRoom(); }} className="w-full rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold py-4 mt-1 active:scale-[0.98] transition">{t.joinBtn} <i className="fa-solid fa-arrow-right ml-1.5"></i></button>
        <button onClick={() => setCurrentScreen(canHost ? 'role_select' : 'launcher')} className="text-slate-500 hover:text-slate-200 text-sm font-semibold">{t.cancelBtn}</button>
      </div>
      {scannerOpen && <QrScanner onResult={handleScanResult} onClose={closeScanner} labels={{ title: t.scanTitle, hint: t.scanHint, cancel: t.scanCancel, noCamera: t.scanNoCamera }} />}
      </>
    );
  }

  // ==========================================
  // GIAO DIỆN APP CHÍNH (HOST HOẶC GUEST)
  // ==========================================
  return (
    <div className="flex flex-col h-screen w-full bg-transparent z-50 absolute inset-0 overflow-hidden">
      
      {/* BÁO KHÁCH ĐƯỢC GỌI VÀO SÂN: toàn màn hình, vòng sóng lan ra, tên sân chữ thật to */}
      {calledAlert && (
          <div className="br-fade fixed inset-0 z-[110] bg-[#0b0f1a]/95 backdrop-blur-sm flex items-center justify-center p-5 overflow-hidden" onClick={dismissCalled}>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {[0, 1, 2].map(i => <span key={i} className="br-ring absolute w-64 h-64 rounded-full border-2 border-lime-400/60" style={{ animationDelay: `${i * 0.6}s` }}></span>)}
              </div>
              <div className="pointer-events-none absolute w-[480px] h-[480px] rounded-full bg-lime-400/20 blur-[100px] br-glow"></div>
              <div className="br-pop relative max-w-sm w-full text-center text-white" onClick={e => e.stopPropagation()}>
                  <Shuttle className="w-16 h-16 mx-auto br-bob" />
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-lime-400 text-slate-950 px-4 py-1.5 text-sm font-bold"><span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse"></span>{t.calledTitle}</div>
                  {myCourt && <p className="text-6xl font-black tracking-tight mt-4 leading-none">{courtName(myCourt)}</p>}
                  {myCourt && (
                      <div className="mt-6 rounded-3xl bg-white/[0.06] border border-white/10 p-4 text-left space-y-2.5">
                          {myTeammates.length > 0 && <div className="flex items-center gap-3"><span className="w-1 self-stretch rounded-full bg-blue-500"></span><div><div className="text-[11px] uppercase tracking-wider text-blue-300 font-semibold">{t.myTeammate}</div><div className="font-bold text-lg">{myTeammates.map(p => p.name).join(', ')}</div></div></div>}
                          <div className="flex items-center gap-3"><span className="w-1 self-stretch rounded-full bg-rose-500"></span><div><div className="text-[11px] uppercase tracking-wider text-rose-300 font-semibold">{t.myOpponents}</div><div className="font-bold text-lg">{myOpponents.map(p => p.name).join(', ')}</div></div></div>
                      </div>
                  )}
                  <button onClick={dismissCalled} className="mt-6 w-full rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold py-4 text-lg shadow-[0_0_40px_rgba(163,230,53,0.4)] active:scale-[0.97] transition">{t.calledOk}</button>
              </div>
          </div>
      )}

      {/* MODAL THÔNG BÁO BỊ ĐUỔI KHỎI PHÒNG (THAY CHO ALERT) */}
      {isKickedModalOpen && (
          <div className="br-fade fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-5">
              <div className="br-pop rounded-3xl bg-[#131a2b] border border-slate-800 p-7 max-w-sm w-full text-center text-slate-100">
                  <div className="w-16 h-16 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto mb-4 text-2xl">
                      <i className="fa-solid fa-person-walking-arrow-right"></i>
                  </div>
                  <h2 className="text-xl font-bold mb-2">{t.roomDeletedTitle}</h2>
                  <p className="text-sm text-slate-400 mb-6">{t.roomDeletedAlert}</p>
                  <button onClick={handleCloseKickedModal} className="w-full rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold py-3.5">OK</button>
              </div>
          </div>
      )}

      {/* MENU BÊN PHẢI (NÚT ⋮) */}
      <div className={`fixed inset-0 z-[60] ${isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsSidebarOpen(false)}></div>
          <div className={`absolute top-0 right-0 w-[320px] max-w-[86vw] h-full bg-[#0f1524] text-slate-100 border-l border-white/10 shadow-[-20px_0_60px_rgba(0,0,0,0.5)] transform transition-transform duration-300 ease-out flex flex-col overflow-clip ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
              <div className="pointer-events-none absolute w-64 h-64 rounded-full bg-blue-600/20 blur-[80px] -top-24 -right-20"></div>
              <div className="relative flex items-center justify-between px-5 pt-5 pb-4">
                  <span className="font-black text-lg tracking-tight">BAD <span className="text-lime-400">RALLY</span></span>
                  <button onClick={() => setIsSidebarOpen(false)} aria-label="close" className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/15 inline-flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="relative mx-5 rounded-2xl bg-white/[0.05] border border-white/10 p-3.5 flex items-center gap-3">
                  <span className={`w-10 h-10 rounded-xl inline-flex items-center justify-center ${userRole === 'host' ? 'bg-blue-500/15 text-blue-300' : 'bg-lime-400/15 text-lime-300'}`}><i className={`fa-solid ${userRole === 'host' ? 'fa-house-laptop' : 'fa-mobile-screen-button'}`}></i></span>
                  <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{roomName || `PIN ${roomPin}`}</span>
                      <span className="block text-xs text-slate-400">{userRole === 'host' ? t.hostRoleBadge : t.guestRoleBadge}{userRole === 'host' && <> · PIN <span className="text-lime-300 font-semibold tracking-wider">{roomPin}</span></>}</span>
                  </span>
              </div>

              <div className="relative px-3 py-4 flex flex-col gap-1 overflow-y-auto no-scrollbar flex-1">
                  {[
                      ...(userRole === 'host' ? [{ icon: 'fa-qrcode', tint: 'text-blue-300 bg-blue-500/15', title: t.sidebar.scrollTop, desc: t.sidebar.scrollTopDesc, onClick: () => { setIsSidebarOpen(false); setCurrentScreen('host_setup'); } }] : []),
                      { icon: 'fa-share-nodes', tint: 'text-lime-300 bg-lime-400/15', title: t.sidebar.share, desc: t.sidebar.shareDesc, onClick: handleShare },
                      { icon: 'fa-headset', tint: 'text-slate-300 bg-white/[0.08]', title: t.sidebar.contact, desc: t.sidebar.contactDesc, onClick: undefined },
                      { icon: 'fa-palette', tint: 'text-amber-300 bg-amber-400/15', title: t.uiClassic, desc: t.uiClassicDesc, onClick: () => { setIsSidebarOpen(false); setUiChoice('classic'); } },
                  ].map(it => (
                      <button key={it.icon} onClick={it.onClick} className="group w-full text-left rounded-2xl px-3 py-3 hover:bg-white/[0.05] flex gap-3 items-center transition">
                          <span className={`w-10 h-10 shrink-0 rounded-xl inline-flex items-center justify-center group-hover:scale-110 transition ${it.tint}`}><i className={`fa-solid ${it.icon}`}></i></span>
                          <span className="flex-1 min-w-0">
                              <span className="block font-semibold text-sm">{it.title}</span>
                              <span className="block text-xs text-slate-500 mt-0.5">{it.desc}</span>
                          </span>
                          <i className="fa-solid fa-chevron-right text-[10px] text-slate-600"></i>
                      </button>
                  ))}

                  <button onClick={handleExitRoom} className="group mt-auto w-full text-left rounded-2xl px-3 py-3 bg-rose-500/[0.07] hover:bg-rose-500/[0.14] border border-rose-500/20 flex gap-3 items-center transition">
                      <span className="w-10 h-10 shrink-0 rounded-xl bg-rose-500/15 text-rose-400 inline-flex items-center justify-center group-hover:scale-110 transition"><i className="fa-solid fa-right-from-bracket"></i></span>
                      <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-sm text-rose-300">{t.sidebar.exitRoom}</span>
                          <span className="block text-xs text-rose-400/70 mt-0.5">{t.sidebar.exitRoomDesc}</span>
                      </span>
                  </button>
              </div>

              <div className="relative px-5 pt-3 pb-8 border-t border-white/[0.06] space-y-2.5">
                  <button className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200"><span><i className="fa-regular fa-file-lines w-5"></i>{t.sidebar.terms}</span><i className="fa-solid fa-chevron-right text-[10px]"></i></button>
                  <button className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200"><span><i className="fa-solid fa-shield-halved w-5"></i>{t.sidebar.privacy}</span><i className="fa-solid fa-chevron-right text-[10px]"></i></button>
                  <div className="pt-3 text-center text-[11px] text-slate-600">
                      {t.sidebar.version}
                      {/* THẺ BẢN QUYỀN IDEAN Ở TRONG SIDEBAR */}
                      <div className="mt-0.5">© {new Date().getFullYear()} by <span className="text-slate-400 font-semibold">iDean</span></div>
                  </div>
              </div>
          </div>
      </div>

      {/* ĐẦU TRANG: nền tối, số to (đếm nhảy) */}
      <div className="relative bg-[#0b0f1a] text-white sticky top-0 z-30 w-full px-4 pt-3 pb-4 overflow-clip border-b border-white/[0.06]">
        <div className="pointer-events-none absolute w-72 h-72 rounded-full bg-blue-600/30 blur-[80px] -top-36 -right-20 br-glow"></div>
        <div className="relative flex items-center gap-2">
          <button onClick={handleExitRoom} aria-label="Thoát" className="w-9 h-9 shrink-0 rounded-full bg-white/[0.08] hover:bg-white/15 inline-flex items-center justify-center"><i className="fa-solid fa-arrow-left"></i></button>
          <div className="flex-1 min-w-0 leading-tight">
            <button onClick={handleRenameRoom} disabled={userRole !== 'host'} className="block max-w-full truncate text-left font-bold text-[15px] disabled:cursor-default">
              {roomName || <><span className="text-white">BAD</span> <span className="text-lime-400">RALLY</span></>}
              {userRole === 'host' && <i className="fa-solid fa-pen text-[9px] ml-1.5 text-white/30"></i>}
            </button>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {userRole === 'host' ? <>PIN <span className="text-slate-200 font-semibold tracking-wider">{roomPin}</span></> : t.guestRoleBadge}
            </div>
          </div>
          {activeTab === "courts" && (
            <button onClick={() => setViewMode(prev => prev === 'grid' ? 'table' : 'grid')} className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] hover:bg-white/15 px-3 py-1.5 text-xs font-semibold">
              <i className={`fa-solid ${viewMode === 'grid' ? 'fa-table-list' : 'fa-border-all'}`}></i> {viewMode === 'grid' ? t.tableView : t.gridView}
            </button>
          )}
          <div className="hidden md:flex items-center text-xs font-semibold rounded-full bg-white/[0.08]">
            <button onClick={() => setZoomLevel(p => Math.max(0.5, p - 0.1))} className="px-2.5 py-1.5 hover:bg-white/10 rounded-l-full">-</button>
            <button onClick={() => setZoomLevel(1)} title={t.resetLayout} className="w-11 text-center">{Math.round(zoomLevel * 100)}%</button>
            <button onClick={() => setZoomLevel(p => Math.min(2, p + 0.1))} className="px-2.5 py-1.5 hover:bg-white/10 rounded-r-full">+</button>
          </div>
          <button onClick={() => setLang(lang === 'VI' ? 'EN' : 'VI')} className="hidden sm:inline-flex rounded-full bg-white/[0.08] hover:bg-white/15 px-2.5 py-1.5 text-xs font-semibold">{lang}</button>
          <button onClick={() => setIsSidebarOpen(true)} aria-label="Menu" className="w-9 h-9 shrink-0 rounded-full hover:bg-white/10 inline-flex items-center justify-center"><i className="fa-solid fa-ellipsis-vertical text-lg"></i></button>
        </div>
        {players.length > 0 && (
          <div className="relative flex items-end gap-6 mt-3">
            <div>
              <div className="text-[34px] font-bold leading-none tabular-nums tracking-tight"><AnimNum value={inPlayCount} /><span className="text-slate-600">/{courts.length}</span></div>
              <div className="text-[11px] text-slate-400 mt-1">{t.statPlaying}</div>
            </div>
            <div>
              <div className="text-[34px] font-bold leading-none tabular-nums tracking-tight text-lime-400"><AnimNum value={waitingQueue.length} /></div>
              <div className="text-[11px] text-slate-400 mt-1">{t.statWaiting}</div>
            </div>
            <div>
              <div className="text-[34px] font-bold leading-none tabular-nums tracking-tight text-slate-500"><AnimNum value={players.filter(p => p.status === 'break').length} /></div>
              <div className="text-[11px] text-slate-400 mt-1">{t.statBreak}</div>
            </div>
          </div>
        )}
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-auto no-scrollbar p-3 sm:p-4 pb-36 bg-[#0b0f1a]">
        {/* THẺ "CỦA TÔI" CHO KHÁCH: trạng thái, vị trí hàng chờ, sân đang đánh + nút Nghỉ / Sẵn sàng / Về */}
        {userRole === 'guest' && (
          <div className="br-rise max-w-2xl mx-auto mb-4 rounded-2xl bg-[#131a2b] text-slate-100 border border-lime-400/25 overflow-hidden">
            <div className="px-4 pt-3 flex justify-between items-center gap-2">
              <span className="text-sm font-bold truncate">{t.myCardTitle}{me ? ` · ${me.name}` : ''}</span>
              {me && <span className="text-xs text-slate-400 shrink-0 tabular-nums">{me.playCount} {t.matchLabel} · {me.wins} {t.winLabel}</span>}
            </div>
            <div className="p-4 pt-2 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                {!me && <p className="text-sm text-slate-400">{t.myNotInList}</p>}
                {me && myCourt && (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <DPill tone={myCourt.status === 'scoring' ? 'amber' : 'live'}>{myCourt.status === 'scoring' ? t.guestScoringTag : t.guestActiveTag}</DPill>
                      <span className="font-bold text-lg leading-tight">{t.myPlaying.replace('{court}', courtName(myCourt))}</span>
                      {catLabel(myCourt) && <DPill tone="blue">{catLabel(myCourt)}</DPill>}
                    </div>
                    {myTeammates.length > 0 && <p className="text-sm text-slate-400 mt-1.5">{t.myTeammate}: <span className="font-semibold text-blue-300">{myTeammates.map(p => p.name).join(', ')}</span></p>}
                    <p className="text-sm text-slate-400">{t.myOpponents}: <span className="font-semibold text-rose-300">{myOpponents.map(p => p.name).join(', ')}</span></p>
                  </>
                )}
                {me && !myCourt && me.status === 'waiting' && (
                  <>
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-bold leading-none tabular-nums text-lime-400">#{myQueuePos}</span>
                      <span className="text-sm text-slate-400 pb-0.5">/ {waitingQueue.length} {t.statWaiting}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-lime-400 transition-all duration-700" style={{ width: `${Math.max(6, 100 - ((myQueuePos - 1) / Math.max(1, waitingQueue.length)) * 100)}%` }}></div></div>
                    <p className="text-sm text-slate-400 mt-1.5">{myEtaText}</p>
                  </>
                )}
                {me && !myCourt && me.status === 'break' && <p className="font-bold text-lg text-slate-400 leading-tight"><i className="fa-solid fa-mug-hot mr-1.5"></i>{t.myOnBreak}</p>}
                {me && !myCourt && me.status === 'playing' && <p className="font-bold text-lg text-lime-400 leading-tight"><i className="fa-solid fa-person-running mr-1.5"></i>{t.playing}</p>}
              </div>
              {me && (
                <div className="flex gap-2 shrink-0">
                  {me.status !== 'playing' && (
                    <button onClick={() => { buzz(); handleGuestToggleBreak(); }} className={`rounded-full px-4 py-2 text-sm font-semibold active:scale-[0.97] transition ${me.status === 'break' ? 'bg-lime-400 text-slate-950' : 'bg-white/[0.08] text-slate-100'}`}><i className={`fa-solid ${me.status === 'break' ? 'fa-play' : 'fa-mug-hot'} mr-1.5`}></i>{me.status === 'break' ? t.btnReady : t.btnBreak}</button>
                  )}
                  <button onClick={handleGuestLeave} className="rounded-full px-4 py-2 text-sm font-semibold bg-rose-500/15 text-rose-300 active:scale-[0.97] transition"><i className="fa-solid fa-right-from-bracket mr-1.5"></i>{t.btnLeave}</button>
                </div>
              )}
            </div>
          </div>
        )}
        <div style={{ zoom: zoomLevel }} className="w-full min-h-full">

            {/* TAB: SÂN (COURTS) */}
            {activeTab === "courts" && (
              <div className="w-full h-full text-slate-100">
                {players.length === 0 ? (
                    <div className="flex items-center justify-center h-full mt-16" style={{ zoom: zoomLevel ? 1 / zoomLevel : 1 }}>
                        <div className="br-rise rounded-3xl bg-[#131a2b] border border-slate-800 p-6 max-w-[300px] w-full text-center flex flex-col items-center">
                            <Shuttle className="w-14 h-14 mb-2 -rotate-12" />
                            <h3 className="font-bold mb-1">{t.setupNeeded}</h3>
                            <p className="text-sm text-slate-400 mb-4">{t.setupNeededDesc.replace('{pin}', roomPin)}</p>
                            {userRole === 'host' && <button onClick={() => setActiveTab('players')} className="w-full rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-semibold text-sm py-3">{t.manualAddBtn}</button>}
                        </div>
                    </div>
                ) : viewMode === 'grid' ? (
                    // DẠNG LƯỚI (GRID): thẻ sân nền tối, chọn người trong tấm trượt
                    <>
                    <div className="flex justify-between items-center gap-2 mb-3 max-w-6xl mx-auto" style={{ zoom: zoomLevel ? 1 / zoomLevel : 1 }}>
                      <span className="text-sm font-bold">{t.navCourts} <span className="text-slate-500 font-semibold">({courts.length})</span></span>
                      <div className="inline-flex rounded-full bg-white/[0.06] p-0.5 text-xs font-semibold">
                        <button onClick={() => changeCourtLayout('wrap')} className={`rounded-full px-3 py-1 ${courtLayout === 'wrap' ? 'bg-white text-slate-950' : 'text-slate-400'}`}><i className="fa-solid fa-border-all mr-1"></i>{t.layoutWrap}</button>
                        <button onClick={() => changeCourtLayout('row')} className={`rounded-full px-3 py-1 ${courtLayout === 'row' ? 'bg-white text-slate-950' : 'text-slate-400'}`}><i className="fa-solid fa-left-right mr-1"></i>{t.layoutRow}</button>
                      </div>
                    </div>
                    <div className={courtLayout === 'row'
                      ? "flex flex-nowrap gap-3 items-stretch overflow-x-auto snap-x snap-mandatory pb-2 max-w-6xl mx-auto [scrollbar-width:thin]"
                      : "grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 items-start max-w-6xl mx-auto"}>
                      {courts.map((court, idx) => {
                        const topCount = court.matchType === '2v2' ? 2 : 1;
                        const bottomCount = court.matchType === '1v1' ? 1 : 2;
                        const neededPlayers = topCount + bottomCount;
                        const inPlay = court.status === 'active' || court.status === 'scoring';
                        const teamRow = (team: Player[], color: 'blue' | 'rose', label: string) => (
                          <div className="flex items-center gap-3 rounded-xl bg-[#0e1422] px-3 py-2.5">
                            <span className={`w-1 self-stretch rounded-full ${color === 'blue' ? 'bg-blue-500' : 'bg-rose-500'}`}></span>
                            <div className="flex-1 min-w-0">
                              <div className={`text-[10px] font-semibold uppercase tracking-wider ${color === 'blue' ? 'text-blue-400' : 'text-rose-400'}`}>{label}</div>
                              <div className="font-bold text-[15px] leading-snug truncate">
                                {team.map((p, i) => <span key={p.id}>{i > 0 && <span className="text-slate-600 font-normal"> · </span>}{p.name} {renderGenderIcon(p.gender)}</span>)}
                              </div>
                            </div>
                          </div>
                        );

                        return (
                          <div key={court.id} style={{ animationDelay: `${idx * 70}ms` }} className={`br-rise shrink-0 snap-center ${courtLayout === 'row' ? 'w-[280px]' : ''} rounded-2xl overflow-hidden flex flex-col ${court.status === 'available' ? 'border border-dashed border-slate-700' : court.status === 'drafting' ? 'bg-[#131a2b] border border-amber-400/50' : 'bg-[#131a2b] border border-slate-800'}`}>
                            {/* Đầu thẻ: tên sân + trạng thái */}
                            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                              <button onClick={() => handleRenameCourt(court)} disabled={userRole !== 'host'} title={userRole === 'host' ? t.renameCourt : undefined} className="font-bold truncate text-left disabled:cursor-default">
                                {courtName(court)}{userRole === 'host' && <i className="fa-solid fa-pen text-[9px] ml-1.5 text-slate-600"></i>}
                              </button>
                              <span className="text-[11px] font-semibold text-slate-500 shrink-0">{court.matchType}</span>
                              <span className="flex-1"></span>
                              {catLabel(court) && <DPill tone="blue">{catLabel(court)}</DPill>}
                              {court.status === 'available' && <DPill tone="green">{t.courtFree}</DPill>}
                              {court.status === 'drafting' && <DPill tone="amber">{t.draftTitle}</DPill>}
                              {court.status === 'active' && <DPill tone="live">{t.guestActiveTag}</DPill>}
                              {court.status === 'scoring' && <DPill tone="amber">{userRole === 'host' ? t.waitingResult : t.guestScoringTag}</DPill>}
                              {inPlay && userRole === 'host' && (
                                <button onClick={() => handleMatchResult(court.id, 0)} title={t.cancelMatch} aria-label={t.cancelMatch} className="w-7 h-7 shrink-0 rounded-full text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 inline-flex items-center justify-center"><i className="fa-solid fa-trash-can text-xs"></i></button>
                              )}
                            </div>

                            <div key={court.status} className="br-pop px-4 pb-4 flex flex-col gap-2.5">
                              {/* SÂN TRỐNG */}
                              {court.status === 'available' && (userRole === 'host' ? (
                                <button onClick={() => { buzz(); setSheetCourtId(court.id); }} className="rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-semibold text-sm py-3 active:scale-[0.98] transition"><i className="fa-solid fa-plus mr-1.5"></i>{t.arrangeMatch}</button>
                              ) : (
                                <p className="text-xs text-slate-500 italic">{t.guestWaitingDraft}</p>
                              ))}

                              {/* XẾP TAY: chọn trong tấm trượt, thẻ chỉ tóm tắt */}
                              {court.status === 'drafting' && (
                                <>
                                  <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                                    {court.players.length === 0 && <span className="text-xs text-slate-500">{t.draftSelected} (0/{neededPlayers})</span>}
                                    {court.players.map(p => <span key={p.id} className="rounded-full bg-blue-500/20 text-blue-200 px-2.5 py-1 text-xs font-semibold">{p.name}</span>)}
                                  </div>
                                  {userRole === 'host' && (
                                    <button onClick={() => setSheetCourtId(court.id)} className="rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm py-2.5"><i className="fa-solid fa-hand-pointer mr-1.5"></i>{t.continuePicking} ({court.players.length}/{neededPlayers})</button>
                                  )}
                                </>
                              )}

                              {/* ĐANG ĐÁNH / CHỜ KẾT QUẢ */}
                              {inPlay && (
                                <>
                                  {teamRow(court.players.slice(0, topCount), 'blue', t.team1Label)}
                                  {teamRow(court.players.slice(topCount, topCount + bottomCount), 'rose', t.team2Label)}
                                  {court.status === 'active' && userRole === 'host' && (
                                    <button onClick={() => { buzz(); handleFinishMatch(court.id); }} className="rounded-full bg-white/[0.08] hover:bg-white/[0.14] font-semibold text-sm py-2.5 active:scale-[0.98] transition mt-0.5"><i className="fa-solid fa-flag-checkered mr-1.5 text-lime-400"></i>{t.finishMatch}</button>
                                  )}
                                  {court.status === 'scoring' && settings.trackMatchResults && userRole === 'host' && (
                                    <>
                                      <div className="grid grid-cols-2 gap-2 mt-0.5">
                                        <button onClick={() => { buzz([10, 40, 10]); handleMatchResult(court.id, 1); }} className="rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm py-2.5 active:scale-[0.98] transition"><i className="fa-solid fa-trophy text-amber-300 mr-1.5"></i>{t.team1Win}</button>
                                        <button onClick={() => { buzz([10, 40, 10]); handleMatchResult(court.id, 2); }} className="rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm py-2.5 active:scale-[0.98] transition"><i className="fa-solid fa-trophy text-amber-200 mr-1.5"></i>{t.team2Win}</button>
                                      </div>
                                      <button onClick={() => handleMatchResult(court.id, 0)} className="text-xs font-semibold text-slate-500 hover:text-slate-300 py-1">{t.cancelResult}</button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* HÀNG CHỜ */}
                    {waitingQueue.length > 0 && (
                      <div className="br-rise max-w-6xl mx-auto mt-4 rounded-2xl bg-[#131a2b] border border-slate-800 p-4" style={{ zoom: zoomLevel ? 1 / zoomLevel : 1, animationDelay: `${courts.length * 70}ms` }}>
                        <div className="flex justify-between items-center mb-2.5">
                          <span className="text-sm font-bold">{t.queueTitle} <span className="text-slate-500 font-semibold">({waitingQueue.length})</span></span>
                          <span className="text-[11px] text-slate-500"><span className="inline-block w-2 h-2 rounded-full bg-lime-400 mr-1"></span>{t.queueNext}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {waitingQueue.map((p, i) => (
                            <span key={p.id} className={`rounded-full pl-1 pr-2.5 py-0.5 text-xs font-semibold inline-flex items-center gap-1.5 ${i < nextRoundSlots ? 'bg-lime-400/10 text-lime-200' : 'bg-white/[0.05] text-slate-400'}`}>
                              <span className={`w-5 h-5 rounded-full text-[10px] inline-flex items-center justify-center tabular-nums ${i < nextRoundSlots ? 'bg-lime-400 text-slate-950' : 'bg-white/10 text-slate-400'}`}>{i + 1}</span>
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    </>
                ) : (
                    // DẠNG BẢNG (TABLE VIEW): mỗi sân một hàng; xếp trận / chọn người mở tấm trượt như dạng lưới
                    <div className="br-fade w-full max-w-6xl mx-auto rounded-2xl bg-[#131a2b] border border-slate-800 overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[760px]">
                            <thead>
                                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                                    <th className="px-4 py-3 w-36">{t.court}</th>
                                    <th className="px-4 py-3 w-40">{t.status}</th>
                                    <th className="px-4 py-3">{t.players}</th>
                                    <th className="px-4 py-3 text-right w-64">{t.action}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.05]">
                                {courts.map(court => {
                                    const top = court.matchType === '2v2' ? 2 : 1;
                                    const neededPlayers = top + (court.matchType === '1v1' ? 1 : 2);
                                    const names = (ps: Player[], color: string) => <span className={`inline-flex items-center gap-2 font-semibold ${color}`}>{ps.map(p => p.name).join(' · ')}</span>;
                                    return (
                                    <tr key={court.id} className={`transition-colors ${court.status === 'drafting' ? 'bg-amber-400/[0.05]' : 'hover:bg-white/[0.03]'}`}>
                                        <td className="px-4 py-3.5">
                                            <button onClick={() => handleRenameCourt(court)} disabled={userRole !== 'host'} className="font-bold text-left disabled:cursor-default">{courtName(court)}</button>
                                            <div className="text-[11px] text-slate-500">{court.matchType}{catLabel(court) && ` · ${catLabel(court)}`}</div>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            {court.status === 'available' && <DPill tone="green">{t.courtFree}</DPill>}
                                            {court.status === 'drafting' && <DPill tone="amber">{t.draftTitle}</DPill>}
                                            {court.status === 'active' && <DPill tone="live">{t.guestActiveTag}</DPill>}
                                            {court.status === 'scoring' && <DPill tone="amber">{userRole === 'host' ? t.waitingResult : t.guestScoringTag}</DPill>}
                                        </td>
                                        <td className="px-4 py-3.5 text-sm">
                                            {(court.status === 'active' || court.status === 'scoring') ? (
                                                <span className="flex items-center gap-3">
                                                    <span className="w-1 h-5 rounded-full bg-blue-500"></span>{names(court.players.slice(0, top), 'text-slate-100')}
                                                    <span className="text-slate-600 text-xs font-semibold">VS</span>
                                                    <span className="w-1 h-5 rounded-full bg-rose-500"></span>{names(court.players.slice(top), 'text-slate-100')}
                                                </span>
                                            ) : court.status === 'drafting' ? (
                                                <span className="text-slate-300">{court.players.map(p => p.name).join(', ') || '—'} <span className="text-slate-500">({court.players.length}/{neededPlayers})</span></span>
                                            ) : <span className="text-slate-600">—</span>}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            {userRole === 'host' && (
                                                <div className="flex gap-2 justify-end">
                                                    {court.status === 'available' && <button onClick={() => { buzz(); setSheetCourtId(court.id); }} className="rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-semibold text-sm px-4 py-2"><i className="fa-solid fa-plus mr-1.5"></i>{t.arrangeMatch}</button>}
                                                    {court.status === 'drafting' && <button onClick={() => setSheetCourtId(court.id)} className="rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm px-4 py-2">{t.continuePicking}</button>}
                                                    {court.status === 'active' && <>
                                                        <button onClick={() => { buzz(); handleFinishMatch(court.id); }} className="rounded-full bg-white/[0.08] hover:bg-white/[0.14] font-semibold text-sm px-4 py-2"><i className="fa-solid fa-flag-checkered mr-1.5 text-lime-400"></i>{t.finishMatch}</button>
                                                        <button onClick={() => handleMatchResult(court.id, 0)} title={t.cancelMatch} aria-label={t.cancelMatch} className="w-9 h-9 rounded-full text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"><i className="fa-solid fa-trash-can text-xs"></i></button>
                                                    </>}
                                                    {court.status === 'scoring' && settings.trackMatchResults && <>
                                                        <button onClick={() => { buzz([10, 40, 10]); handleMatchResult(court.id, 1); }} className="rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-3.5 py-2">{t.team1Win}</button>
                                                        <button onClick={() => { buzz([10, 40, 10]); handleMatchResult(court.id, 2); }} className="rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm px-3.5 py-2">{t.team2Win}</button>
                                                        <button onClick={() => handleMatchResult(court.id, 0)} title={t.cancelResult} aria-label={t.cancelResult} className="w-9 h-9 rounded-full text-slate-500 hover:text-slate-200 hover:bg-white/10"><i className="fa-solid fa-xmark"></i></button>
                                                    </>}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
              </div>
            )}

            {/* TAB: NGƯỜI CHƠI (PLAYERS) */}
            {activeTab === "players" && (
                <div className="br-fade max-w-6xl mx-auto w-full text-slate-100 [color-scheme:dark]">
                    <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-xl font-bold whitespace-nowrap">{t.navPlayers} <span className="text-slate-500">({players.length})</span></h2>
                        <DPill tone="lime">{players.filter(p => p.status !== 'break').length} {t.active}</DPill>
                        <span className="flex-1"></span>
                        {userRole === 'host' && <button onClick={handleRemoveAllPlayers} className="text-rose-400 hover:text-rose-300 font-semibold text-sm whitespace-nowrap"><i className="fa-solid fa-trash-can mr-1.5"></i>{t.deleteAll}</button>}
                    </div>

                    {userRole === 'host' && (
                        <div className="rounded-2xl bg-[#131a2b] border border-slate-800 p-4 mb-4 flex flex-col gap-3">
                            <div className="flex flex-col md:flex-row gap-2">
                                <input type="text" className={`${DIN} flex-1`} placeholder={t.playerNamePlaceholder} value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} />
                                <div className="flex gap-2">
                                    <select className={`${DIN} flex-1 md:w-40 cursor-pointer`} value={newPlayerSkill} onChange={e => setNewPlayerSkill(e.target.value as SkillLevel)}>
                                        {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
                                    </select>
                                    <button onClick={() => { buzz(); handleAddPlayer(); }} aria-label={t.addPlayersMenu} className="shrink-0 w-11 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-lg font-bold"><i className="fa-solid fa-plus"></i></button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1 max-w-[240px] text-xs font-semibold">
                                <button onClick={() => setNewPlayerGender('M')} className={`rounded-full py-1.5 transition ${newPlayerGender === 'M' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}>♂ {t.male}</button>
                                <button onClick={() => setNewPlayerGender('F')} className={`rounded-full py-1.5 transition ${newPlayerGender === 'F' ? 'bg-pink-500 text-white' : 'text-slate-400'}`}>♀ {t.female}</button>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 mb-4">
                        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                            {([['all', t.all, players.length], ['waiting', t.waiting, players.filter(p => p.status === 'waiting').length], ['playing', t.playing, players.filter(p => p.status === 'playing').length], ['break', t.onBreak, players.filter(p => p.status === 'break').length]] as const).map(([id, label, n]) => (
                                <button key={id} onClick={() => setPlayerFilter(id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${playerFilter === id ? 'bg-white text-slate-950' : 'bg-white/[0.06] text-slate-300 hover:bg-white/10'}`}>{label} <span className="opacity-60">{n}</span></button>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-400">
                            <i className="fa-solid fa-arrow-down-short-wide"></i>{t.sortBy}
                            <select value={sortOption} onChange={e => setSortOption(e.target.value as "status" | "name" | "games")} className="rounded-full bg-white/[0.06] border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-100 outline-none cursor-pointer">
                                <option value="status">{t.sortStatus}</option><option value="name">{t.sortName}</option><option value="games">{t.sortGames}</option>
                            </select>
                        </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                        {filteredPlayers.map((p, idx) => (
                            <div key={p.id} style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }} className={`br-rise rounded-2xl p-3 flex items-center gap-3 border transition ${p.status === 'playing' ? 'bg-lime-400/[0.07] border-lime-400/40' : p.status === 'break' ? 'bg-[#131a2b]/60 border-slate-800 opacity-70' : 'bg-[#131a2b] border-slate-800'}`}>
                                <div className={`w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center font-bold ${genderOf(p) === 'F' ? 'bg-pink-500/15 text-pink-300' : 'bg-blue-500/15 text-blue-300'}`}>{p.name.trim().charAt(0).toUpperCase()}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold truncate flex items-center gap-1.5">
                                        {p.name} {renderGenderIcon(p.gender)}
                                        {p.status === 'playing' && <DPill tone="lime">{t.playing}</DPill>}
                                        {p.status === 'break' && <i className="fa-solid fa-mug-hot text-xs text-slate-500"></i>}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        {userRole === 'host' ? (
                                            // Chủ sân chạm vào trình độ để sửa (khách tự khai có thể chưa đúng)
                                            <span className="relative inline-flex items-center">
                                                <select value={p.skill} onChange={e => handleChangeSkill(p, e.target.value as SkillLevel)} title={t.editSkill} className="appearance-none rounded-full bg-amber-400/15 text-amber-300 text-[11px] font-semibold pl-2 pr-5 py-0.5 cursor-pointer outline-none">
                                                    {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
                                                </select>
                                                <i className="fa-solid fa-caret-down text-[9px] text-amber-300 absolute right-2 pointer-events-none"></i>
                                            </span>
                                        ) : <span className="rounded-full bg-amber-400/15 text-amber-300 text-[11px] font-semibold px-2 py-0.5">{tSkill(p.skill)}</span>}
                                        <span className="text-[11px] text-slate-500 tabular-nums">{p.playCount} {t.matchLabel} · {p.wins} {t.winLabel}</span>
                                        {p.partnerId && partnerNames[p.partnerId] !== undefined && (
                                            <button className="rounded-full bg-emerald-400/15 text-emerald-300 text-[11px] font-semibold px-2 py-0.5 hover:bg-rose-500/15 hover:text-rose-300" title={t.linkCancel} onClick={() => { if (userRole === 'host') handleLinkClick(p.id); }}>
                                                <i className="fa-solid fa-link text-[9px] mr-1"></i>{partnerNames[p.partnerId]}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {userRole === 'host' && (
                                    <div className="flex gap-0.5 text-slate-500 shrink-0">
                                        <button title={t.onBreak} onClick={() => handleToggleBreak(p)} className={`w-8 h-8 rounded-full hover:bg-white/10 ${p.status === 'break' ? 'text-amber-300' : 'hover:text-slate-200'}`}><i className="fa-solid fa-mug-hot text-xs"></i></button>
                                        <button title={p.partnerId ? t.linkCancel : linkingPlayerId === p.id ? t.linking : t.linkFixed} onClick={() => handleLinkClick(p.id)} className={`w-8 h-8 rounded-full hover:bg-white/10 ${p.partnerId ? 'text-emerald-400' : linkingPlayerId === p.id ? 'text-lime-300 animate-pulse' : 'hover:text-slate-200'}`}><i className="fa-solid fa-link text-xs"></i></button>
                                        <button aria-label="delete" onClick={() => handleRemovePlayer(p.id)} className="w-8 h-8 rounded-full hover:bg-rose-500/10 hover:text-rose-400"><i className="fa-regular fa-trash-can text-xs"></i></button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {filteredPlayers.length === 0 && <div className="col-span-full text-center py-12 text-slate-500">{t.noPlayers}</div>}
                    </div>
                </div>
            )}

            {/* TAB: XẾP HẠNG (RANKING): bục 3 người đầu + danh sách */}
            {activeTab === "ranking" && (() => {
                const ranked = [...players].filter(p => p.playCount > 0).sort((a, b) => b.wins - a.wins || a.playCount - b.playCount);
                const medal = ['from-amber-300 to-amber-500 text-amber-950', 'from-slate-200 to-slate-400 text-slate-900', 'from-orange-300 to-orange-600 text-orange-950'];
                const podium = [1, 0, 2].map(i => ranked[i] && { p: ranked[i], i }).filter(Boolean) as { p: Player; i: number }[];
                return (
               <div className="br-fade max-w-2xl mx-auto w-full text-slate-100">
                    <div className="flex items-center gap-2.5 mb-4">
                        <i className="fa-solid fa-trophy text-amber-400 text-xl"></i><h2 className="text-xl font-bold">{t.leaderboard}</h2>
                    </div>
                    {ranked.length === 0 ? (
                        <div className="rounded-3xl bg-[#131a2b] border border-slate-800 py-14 text-center text-slate-400">
                            <Shuttle className="w-12 h-12 mx-auto mb-2 -rotate-12 opacity-80" />{t.noMatchResults}
                        </div>
                    ) : (
                        <>
                        <div className="grid grid-cols-3 gap-2 items-end mb-4">
                            {podium.map(({ p, i }) => (
                                <div key={p.id} style={{ animationDelay: `${(i === 0 ? 2 : i === 1 ? 1 : 3) * 120}ms` }} className="br-rise flex flex-col items-center text-center">
                                    <div className={`rounded-full bg-gradient-to-b ${medal[i]} inline-flex items-center justify-center font-bold ${i === 0 ? 'w-16 h-16 text-2xl shadow-[0_0_30px_rgba(251,191,36,0.35)]' : 'w-12 h-12 text-lg'}`}>{p.name.trim().charAt(0).toUpperCase()}</div>
                                    <div className="font-bold text-sm mt-1.5 truncate max-w-full">{p.name}</div>
                                    <div className="text-[11px] text-slate-400 tabular-nums">{p.wins} {t.winLabel} · {p.playCount} {t.matchLabel}</div>
                                    <div className={`mt-2 w-full rounded-t-2xl bg-gradient-to-b ${medal[i]} font-bold text-xl inline-flex items-center justify-center ${i === 0 ? 'h-20' : i === 1 ? 'h-14' : 'h-10'}`}>{i + 1}</div>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-2xl bg-[#131a2b] border border-slate-800 divide-y divide-white/[0.05] overflow-hidden">
                            {ranked.map((p, index) => {
                                const rate = Math.round((p.wins / p.playCount) * 100);
                                return (
                                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                                    <span className={`w-6 text-center font-bold tabular-nums ${index < 3 ? 'text-amber-300' : 'text-slate-500'}`}>{index + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold truncate">{p.name} {renderGenderIcon(p.gender)}</div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="h-1 flex-1 max-w-[120px] rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-lime-400" style={{ width: `${rate}%` }}></div></div>
                                            <span className="text-[11px] text-slate-500 tabular-nums">{rate}%</span>
                                        </div>
                                    </div>
                                    <div className="text-right tabular-nums">
                                        <div className="font-bold text-lg leading-none text-lime-400">{p.wins}<span className="text-xs font-semibold text-slate-500"> {t.winLabel}</span></div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">{p.playCount} {t.matchLabel}</div>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                        </>
                    )}
               </div>
                );
            })()}

            {/* TAB: CÀI ĐẶT (SETTINGS) */}
            {activeTab === "settings" && (
               <div className="br-fade max-w-[460px] mx-auto w-full space-y-3 text-slate-100 [color-scheme:dark]">
                   {userRole === 'guest' ? (
                       <div className="rounded-3xl bg-[#131a2b] border border-amber-400/30 p-6 text-center">
                           <div className="w-12 h-12 rounded-full bg-amber-400/15 text-amber-300 inline-flex items-center justify-center text-xl mb-3"><i className="fa-solid fa-lock"></i></div>
                           <h3 className="font-bold text-lg">{t.guestSettingsWarning}</h3>
                           <p className="text-sm text-slate-400 mt-1">{t.guestSettingsDesc}</p>
                       </div>
                   ) : (
                    <>
                  <div className="rounded-2xl bg-[#131a2b] border border-slate-800 p-4 space-y-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.gameSettings}</div>
                      <div><label className={DLB}>{t.roomNameLabel}</label><input type="text" maxLength={60} placeholder={t.roomNamePlaceholder} className={DIN} value={roomName} onChange={(e) => setRoomName(e.target.value)} onBlur={(e) => saveRoomName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></div>
                      <div className="flex items-center justify-between">
                          <label className="text-sm font-semibold">{t.totalCourts}</label>
                          <div className="flex items-center gap-1 rounded-full bg-white/[0.06] p-1">
                              <button onClick={() => updateSetting('totalCourts', Math.max(1, settings.totalCourts - 1))} className="w-8 h-8 rounded-full hover:bg-white/10 font-bold">−</button>
                              <span className="font-bold text-lg w-8 text-center tabular-nums">{settings.totalCourts}</span>
                              <button onClick={() => updateSetting('totalCourts', settings.totalCourts + 1)} className="w-8 h-8 rounded-full bg-lime-400 text-slate-950 font-bold">+</button>
                          </div>
                      </div>
                      <div>
                          <label className={DLB}>{t.shuffleMode}</label>
                          <select className={`${DIN} cursor-pointer`} value={settings.shuffleMode} onChange={(e) => handleShuffleModeChange(e.target.value as ShuffleMode)}>
                              <option value="Equal Rotation">{t.shuffleModes["Equal Rotation"]}</option><option value="Skill Based">{t.shuffleModes["Skill Based"]}</option><option value="Social Mix">{t.shuffleModes["Social Mix"]}</option><option value="Fixed Pairs">{t.shuffleModes["Fixed Pairs"]}</option><option value="Manual">{t.shuffleModes["Manual"]}</option>
                          </select>
                          <p className="text-xs text-slate-500 mt-1.5">{t.shuffleDescs[settings.shuffleMode]}</p>
                      </div>
                      <div className="rounded-xl bg-[#0e1422] border border-slate-800">
                          <button className="w-full flex justify-between items-center px-3 py-2.5 text-sm font-semibold" onClick={() => setIsWeightsExpanded(!isWeightsExpanded)}>
                              {t.shuffleWeights}<i className={`fa-solid fa-chevron-${isWeightsExpanded ? 'up' : 'down'} text-xs text-slate-500`}></i>
                          </button>
                          {isWeightsExpanded && (
                            <div className="br-fade space-y-3.5 px-3 pb-3">
                              {[
                                { id: 'playCountFairness', label: t.weights.playCountFairness }, { id: 'waitTimePriority', label: t.weights.waitTimePriority },
                                { id: 'avoidSamePartner', label: t.weights.avoidSamePartner }, { id: 'avoidSameOpponents', label: t.weights.avoidSameOpponents },
                                { id: 'skillBalance', label: t.weights.skillBalance }, { id: 'keepPreviousPair', label: t.weights.keepPreviousPair },
                              ].map((w) => (
                                <div key={w.id}>
                                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-300">{w.label}</span><span className="font-semibold tabular-nums text-lime-300">{settings.weights[w.id as keyof GameSettings['weights']]}</span></div>
                                    <input type="range" disabled={settings.shuffleMode !== 'Manual'} className={`w-full accent-lime-400 ${settings.shuffleMode === 'Manual' ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`} min="0" max="100" value={settings.weights[w.id as keyof GameSettings['weights']]} onChange={(e) => updateWeight(w.id as keyof GameSettings['weights'], parseInt(e.target.value))} />
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                      <div className="flex justify-between items-center">
                          <label className="text-sm font-semibold">{t.trackResults}</label>
                          <button role="switch" aria-checked={settings.trackMatchResults} onClick={() => updateSetting('trackMatchResults', !settings.trackMatchResults)} className={`w-12 h-7 rounded-full relative transition-colors ${settings.trackMatchResults ? 'bg-lime-400' : 'bg-slate-700'}`}>
                              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${settings.trackMatchResults ? 'left-6' : 'left-1'}`}></span>
                          </button>
                      </div>
                      <button onClick={() => { buzz(); handleApplySettings(); }} className="w-full rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-semibold py-3 active:scale-[0.98] transition">
                          <i className="fa-solid fa-cloud-arrow-up mr-2"></i>{t.applyChanges}
                      </button>
                  </div>

                  <div className="rounded-2xl bg-[#131a2b] border border-slate-800 p-4 space-y-3">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.addPlayersMenu}</div>
                      <input type="text" className={DIN} placeholder={t.playerNamePlaceholder} value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} />
                      <div className="grid grid-cols-2 gap-1 rounded-full bg-white/[0.06] p-1 text-xs font-semibold">
                          <button onClick={() => setNewPlayerGender('M')} className={`rounded-full py-1.5 transition ${newPlayerGender === 'M' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}>♂ {t.male}</button>
                          <button onClick={() => setNewPlayerGender('F')} className={`rounded-full py-1.5 transition ${newPlayerGender === 'F' ? 'bg-pink-500 text-white' : 'text-slate-400'}`}>♀ {t.female}</button>
                      </div>
                      <div className="flex gap-2">
                          <select className={`${DIN} flex-1 cursor-pointer`} value={newPlayerSkill} onChange={e => setNewPlayerSkill(e.target.value as SkillLevel)}>
                              {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
                          </select>
                          <button onClick={() => { buzz(); handleAddPlayer(); }} aria-label={t.addPlayersMenu} className="shrink-0 w-11 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-lg font-bold"><i className="fa-solid fa-plus"></i></button>
                      </div>
                      <button onClick={handleAddGuests} className="w-full rounded-full bg-white/[0.08] hover:bg-white/[0.14] font-semibold text-sm py-2.5">
                          <i className="fa-solid fa-user-plus mr-2"></i>{t.quickAddGuests}
                      </button>
                      <div>
                          <div className="text-xs text-slate-500 mb-2">{t.navPlayers} ({players.length})</div>
                          <div className="rounded-xl bg-[#0e1422] border border-slate-800 max-h-[200px] overflow-y-auto divide-y divide-white/[0.05]">
                              {players.map(p => (
                                  <div key={p.id} className="px-3 py-2 flex justify-between items-center gap-2">
                                      <span className="text-sm font-semibold truncate">{p.name} {renderGenderIcon(p.gender)}</span>
                                      <span className="flex items-center gap-2 shrink-0">
                                          <span className="text-[11px] text-slate-500">{tSkill(p.skill)} · {p.playCount} {t.matchLabel}</span>
                                          <button onClick={() => handleRemovePlayer(p.id)} aria-label="delete" className="w-7 h-7 rounded-full text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"><i className="fa-regular fa-trash-can text-xs"></i></button>
                                      </span>
                                  </div>
                              ))}
                              {players.length === 0 && <p className="text-sm text-slate-500 text-center py-5">{t.noPlayers}</p>}
                          </div>
                      </div>
                  </div>

                  <div className="rounded-2xl bg-[#131a2b] border border-slate-800 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t.resetCountsTitle}</div>
                      <p className="text-sm text-slate-400 mb-3">{t.resetCountsDesc}</p>
                      <button onClick={handleResetCounts} className="w-full rounded-full bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 font-semibold text-sm py-2.5">{t.resetCountsBtn}</button>
                  </div>

                  <div className="rounded-2xl bg-rose-500/[0.06] border border-rose-500/30 p-4 mb-10">
                      <div className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-3"><i className="fa-solid fa-triangle-exclamation mr-1.5"></i>{t.dangerZone}</div>
                      <button onClick={handleResetEvent} className="w-full rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm py-2.5">{t.resetEventBtn}</button>
                  </div>
                  </>
                  )}
               </div>
            )}
        </div>
      </div>

      {/* TẤM TRƯỢT XẾP TRẬN (chủ sân): sân trống → chọn kiểu + tự động / tự chọn; đang xếp tay → chọn người */}
      {(() => {
        const sc = userRole === 'host' && sheetCourtId !== null ? courts.find(c => c.id === sheetCourtId) : undefined;
        if (!sc || (sc.status !== 'available' && sc.status !== 'drafting')) return null;
        const needed = (sc.matchType === '2v2' ? 2 : 1) + (sc.matchType === '1v1' ? 1 : 2);
        const close = () => setSheetCourtId(null);
        const free = players.filter(p => p.status === 'waiting' && !sc.players.some(cp => cp.id === p.id) && fitsCategory(p, effectiveCategory(sc.matchType, sc.category)));
        return (
          <div className="fixed inset-0 z-[90] flex items-end justify-center">
            <div className="br-fade absolute inset-0 bg-black/60" onClick={close}></div>
            <div className="br-sheet relative w-full max-w-lg bg-[#131a2b] text-slate-100 rounded-t-[28px] border-t border-white/10 px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[85vh] flex flex-col">
              <div className="w-10 h-1 rounded-full bg-slate-600 mx-auto mb-3"></div>
              <div className="flex items-center gap-2 mb-4">
                <span className="font-bold text-lg flex-1 truncate">{t.arrangeTitle.replace('{court}', courtName(sc))}</span>
                <span className="text-xs text-slate-400">{sc.matchType}{catLabel(sc) && ` · ${catLabel(sc)}`}</span>
                <button onClick={close} aria-label="close" className="w-8 h-8 rounded-full bg-white/[0.08] inline-flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
              </div>

              {sc.status === 'available' ? (
                <div className="flex flex-col gap-3">
                  <div className="text-xs font-semibold text-slate-400">{t.matchTypeTitle}</div>
                  <div className="grid grid-cols-3 rounded-full bg-white/[0.06] p-1 text-sm font-semibold">
                    {(['1v1', '1v2', '2v2'] as const).map(mt => (
                      <button key={mt} onClick={() => { buzz(8); handleChangeMatchType(sc.id, mt); }} className={`rounded-full py-2 transition ${sc.matchType === mt ? 'bg-white text-slate-950' : 'text-slate-400'}`}>{mt}</button>
                    ))}
                  </div>
                  {sc.matchType === '2v2' && (
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORY_OPTIONS.map(cat => (
                        <button key={cat} onClick={() => { buzz(8); handleChangeCategory(sc.id, cat); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${(sc.category || 'any') === cat ? 'bg-blue-500 text-white' : 'bg-white/[0.06] text-slate-300'}`}>{t.categories[cat]}</button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => { buzz([10, 30, 10]); close(); handleGenerateNextGame(sc.id); }} className="mt-2 rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-semibold py-3.5 active:scale-[0.98] transition"><i className="fa-solid fa-shuffle mr-2"></i>{t.autoFair}</button>
                  <button onClick={() => { buzz(); handleStartDrafting(sc.id); }} className="rounded-full bg-white/[0.08] hover:bg-white/[0.14] font-semibold py-3.5 active:scale-[0.98] transition"><i className="fa-solid fa-hand-pointer mr-2"></i>{t.pickManual}</button>
                </div>
              ) : (
                <>
                  <div className="text-xs font-semibold text-slate-400 mb-2">{t.draftSelected} ({sc.players.length}/{needed})</div>
                  <div className="flex flex-wrap gap-1.5 min-h-[34px] mb-3">
                    {sc.players.map(p => (
                      <button key={p.id} onClick={() => { buzz(8); handleToggleDraftPlayer(sc.id, p); }} className="br-pop rounded-full bg-blue-500 text-white pl-3 pr-2.5 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5">{p.name} {renderGenderIcon(p.gender)}<i className="fa-solid fa-xmark text-[10px] opacity-70"></i></button>
                    ))}
                  </div>
                  <div className="text-xs font-semibold text-slate-400 mb-2 border-t border-white/[0.06] pt-3">{t.draftWaiting} ({free.length})</div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-wrap content-start gap-1.5 pb-2">
                    {free.map(p => (
                      <button key={p.id} onClick={() => { buzz(8); handleToggleDraftPlayer(sc.id, p); }} disabled={sc.players.length >= needed} className="rounded-full bg-white/[0.06] hover:bg-lime-400/20 text-slate-200 px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40">{p.name} {renderGenderIcon(p.gender)}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_2fr] gap-2 pt-3">
                    <button onClick={() => { close(); handleCancelDrafting(sc.id); }} className="rounded-full bg-white/[0.08] font-semibold py-3.5">{t.draftCancel}</button>
                    <button onClick={() => { buzz([10, 30, 10]); close(); handleStartManualMatch(sc.id); }} disabled={sc.players.length !== needed} className="rounded-full bg-lime-400 text-slate-950 font-semibold py-3.5 disabled:opacity-30 disabled:cursor-not-allowed">{t.draftStart}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* THANH HOÀN TÁC KẾT QUẢ VỪA GHI */}
      {userRole === 'host' && lastResult && (
        <div className="br-rise fixed bottom-[86px] left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-md z-[55] bg-[#1c2438] border border-white/10 text-white rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.45)] flex items-center gap-2 px-3.5 py-2.5">
          <span className="flex-1 min-w-0 text-sm truncate"><i className="fa-solid fa-circle-check text-lime-400 mr-1.5"></i>{t.undoLabel.replace('{court}', courtNameById(lastResult.courtId))}: {lastResult.winningTeam === 1 ? t.team1Win : lastResult.winningTeam === 2 ? t.team2Win : lastResult.winningTeam === 0 ? t.cancelMatch : t.undoFinished}</span>
          <button onClick={handleUndoResult} className="shrink-0 rounded-full bg-white text-slate-950 px-3 py-1 text-xs font-semibold"><i className="fa-solid fa-rotate-left mr-1"></i>{t.undoBtn}</button>
          <button onClick={() => setLastResult(null)} className="shrink-0 text-slate-500 hover:text-white px-1" aria-label="close"><i className="fa-solid fa-xmark"></i></button>
        </div>
      )}

      {/* THANH ĐIỀU HƯỚNG: kính nổi, nút xếp trận ở giữa (chủ sân) */}
      <div className="fixed bottom-0 inset-x-0 z-50 px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-md h-[62px] rounded-[31px] bg-[rgba(22,30,48,0.78)] backdrop-blur-xl border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center px-1.5">
          {[
              { id: "courts", icon: "fa-table-cells-large", label: t.navCourts },
              { id: "ranking", icon: "fa-trophy", label: t.navRanking },
              { id: "__next" },
              { id: "players", icon: "fa-users", label: t.navPlayers },
              { id: "settings", icon: "fa-gear", label: t.navSettings }
          ].map((tab) => tab.id === "__next" ? (userRole === 'host' && (
            <button key={tab.id} onClick={() => { buzz([10, 30, 10]); setActiveTab('courts'); handleGenerateNextGame(); }} aria-label={t.nextGame} title={t.nextGame}
              className="shrink-0 w-[50px] h-[50px] mx-1 rounded-full bg-lime-400 hover:bg-lime-300 text-slate-950 inline-flex items-center justify-center text-xl shadow-[0_0_24px_rgba(163,230,53,0.35)] active:scale-90 transition">
              <i className="fa-solid fa-plus"></i>
            </button>
          )) : (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} className={`relative flex-1 h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${activeTab === tab.id ? "text-lime-300" : "text-slate-500 hover:text-slate-300"}`}>
              <i className={`fa-solid ${tab.icon} text-[17px]`}></i>
              <span className="text-[10px] font-semibold">{tab.label}</span>
              {activeTab === tab.id && <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-lime-300"></span>}
            </button>
          ))}
        </div>
      </div>

      <RoomIntro title={roomName || (userRole === 'host' ? `PIN ${roomPin}` : undefined)} />
    </div>
  );
}
// KẾT THÚC FILE