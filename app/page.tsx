"use client";
import { useState, useEffect, useRef } from "react";
import type { ClientResponseError, RecordModel, UnsubscribeFunc } from "pocketbase";
import { Preferences } from '@capacitor/preferences'; // Bộ nhớ chuẩn Native App
import { pb, ensureAuth, roomIdFromPin, PUBLIC_APP_URL, isHostAccount, redeemHostCode } from "../lib/pb";
import QrCode from "./QrCode";
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
  eventName: string;
  totalCourts: number;
  layoutCols: number;
  layoutRows: number;
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
    home: "Trang chủ",
    tableView: "DẠNG BẢNG",
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
    start: "BẮT ĐẦU",
    manualSetup: "XẾP TAY",
    finishMatch: "KẾT THÚC TRẬN",
    waitingResult: "CHỌN ĐỘI THẮNG",
    team1Win: "Đội 1 Thắng",
    team2Win: "Đội 2 Thắng",
    cancelResult: "Hủy (Không tính điểm)",
    team1Label: "ĐỘI 1",
    team2Label: "ĐỘI 2",
    cancelMatch: "Hủy trận",
    nextGame: "TẠO TRẬN MỚI",
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
    eventName: "Tên sự kiện",
    totalCourts: "Tổng số sân",
    layout: "Bố cục",
    cols: "Cột",
    rows: "Hàng",
    cells: "ô",
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
    myPlaying: "Đang đánh ở SÂN {court}",
    myTeammate: "Đồng đội",
    myOpponents: "Đối thủ",
    myScoring: "Chờ chủ sân ghi kết quả...",
    myOnBreak: "Bạn đang nghỉ – sẽ không được xếp trận",
    myNotInList: "Bạn không còn trong danh sách phòng này.",
    btnBreak: "Nghỉ",
    btnReady: "Sẵn sàng",
    btnLeave: "Về",
    confirmLeave: "Rời phòng? Tên bạn sẽ được xóa khỏi danh sách chờ.",
    undoLabel: "SÂN {court}",
    undoFinished: "Đã kết thúc",
    undoBtn: "Hoàn tác",
    undoUnavailable: "Không hoàn tác được: sân hoặc người chơi đã được xếp trận khác.",
    calledTitle: "TỚI LƯỢT BẠN!",
    calledCourt: "SÂN {court}",
    calledOk: "OK, RA SÂN",
    hostGranted: "Máy này đã được cấp quyền Chủ sân! Giờ bạn có thể tạo phòng.",
    hostRedeemError: "Không kích hoạt được quyền chủ sân",
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
    draftTitle: "XẾP THỦ CÔNG",
    draftSelected: "Đã chọn",
    draftWaiting: "Đang rảnh",
    draftStart: "VÀO SÂN",
    draftCancel: "HỦY",
    roleSelectTitle: "Bạn muốn truy cập với tư cách nào?",
    hostRole: "Tạo Phòng (Chủ Sân)",
    hostDesc: "Sử dụng máy này để quản lý sân, xếp trận và sinh mã QR cho người khác tham gia.",
    guestRole: "Tham Gia (Khách)",
    guestDesc: "Quét mã QR hoặc nhập mã PIN phòng để đăng ký lên sân từ điện thoại của bạn.",
    backBtn: "Quay lại",
    roomCreated: "Phòng Đã Mở!",
    roomPinLabel: "Mã PIN Phòng:",
    qrDesc: "Người chơi dùng điện thoại quét mã QR này để tự đăng ký tên vào danh sách thi đấu.",
    goToDashboard: "Vào Bảng Điều Khiển ➔",
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
    guestActiveTag: "ĐANG ĐÁ",
    guestScoringTag: "CHỜ KẾT QUẢ...",
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
    home: "Home",
    tableView: "TABLE VIEW",
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
    start: "START",
    manualSetup: "MANUAL",
    finishMatch: "END MATCH",
    waitingResult: "CHOOSE WINNER",
    team1Win: "Team 1 Win",
    team2Win: "Team 2 Win",
    cancelResult: "Cancel (No Score)",
    team1Label: "TEAM 1",
    team2Label: "TEAM 2",
    cancelMatch: "Cancel Match",
    nextGame: "NEXT GAME",
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
    eventName: "Event Name",
    totalCourts: "Total Courts",
    layout: "Layout",
    cols: "Cols",
    rows: "Rows",
    cells: "cells",
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
    myPlaying: "Playing on COURT {court}",
    myTeammate: "Partner",
    myOpponents: "Opponents",
    myScoring: "Waiting for the host to record the result...",
    myOnBreak: "You are on break – you won't be scheduled",
    myNotInList: "You are no longer in this room's list.",
    btnBreak: "Break",
    btnReady: "Ready",
    btnLeave: "Leave",
    confirmLeave: "Leave the room? Your name will be removed from the queue.",
    undoLabel: "COURT {court}",
    undoFinished: "Finished",
    undoBtn: "Undo",
    undoUnavailable: "Can't undo: the court or players have already been assigned elsewhere.",
    calledTitle: "YOUR TURN!",
    calledCourt: "COURT {court}",
    calledOk: "OK, GOING",
    hostGranted: "This device now has Host access! You can create rooms.",
    hostRedeemError: "Could not activate host access",
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
    draftTitle: "MANUAL SETUP",
    draftSelected: "Selected",
    draftWaiting: "Available",
    draftStart: "START",
    draftCancel: "CANCEL",
    roleSelectTitle: "How would you like to access?",
    hostRole: "Create Room (Host)",
    hostDesc: "Use this device to manage courts, matches, and generate QR code for others.",
    guestRole: "Join (Guest)",
    guestDesc: "Scan QR code or enter Room PIN to register yourself onto the court list.",
    backBtn: "Go Back",
    roomCreated: "Room Opened!",
    roomPinLabel: "Room PIN:",
    qrDesc: "Players can scan this QR code with their phone to join the match list.",
    goToDashboard: "Go To Dashboard ➔",
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
    guestActiveTag: "PLAYING",
    guestScoringTag: "WAITING FOR RESULT...",
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

const DEFAULT_SETTINGS: GameSettings = {
  eventName: "Saturday Training",
  totalCourts: 4,
  layoutCols: 2,
  layoutRows: 2,
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

const ShuttlecockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(3px 3px 0px rgba(0,0,0,1))' }}>
    <path d="M10 14L5 3L8 4L11 13" fill="white" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 14L19 3L16 4L13 13" fill="white" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 13V2" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6 7H18" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 10H16" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 22C14.2091 22 16 20.2091 16 18C16 15.7909 12 13 12 13C12 13 8 15.7909 8 18C8 20.2091 9.79086 22 12 22Z" fill="#facc15" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<"launcher" | "role_select" | "host_setup" | "guest_join" | "app">("launcher");
  const [activeTab, setActiveTab] = useState<"courts" | "ranking" | "players" | "settings">("courts");

  const [lang, setLang] = useState<"VI" | "EN">("VI");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const t = dict[lang];
  const tSkill = (s: SkillLevel) => lang === "VI" ? s : skillEnMap[s];

  const [userRole, setUserRole] = useState<UserRole>('host');
  const [roomPin, setRoomPin] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [guestSkill, setGuestSkill] = useState<SkillLevel>("Trung bình");
  const [guestGender, setGuestGender] = useState<Gender>('M');
  const [isBusy, setIsBusy] = useState(false);
  // Máy được cấp quyền chủ sân (qua link/QR chủ sân) mới thấy nút Tạo phòng
  const [canHost, setCanHost] = useState(false);
  const [myUserId, setMyUserId] = useState(""); // tài khoản (ẩn danh) của máy này
  const [calledAlert, setCalledAlert] = useState(false); // khách vừa được gọi vào sân
  // Kết quả trận vừa ghi (chủ sân) → cho phép hoàn tác khi bấm nhầm
  const [lastResult, setLastResult] = useState<{ courtId: number; court: CourtData; players: Record<string, Partial<Player>>; at: number; addedHistory: boolean; winningTeam: 1 | 2 | 0 | -1 } | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

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
            if (existing.status !== 'playing') await pb.collection('players').update(existing.id, profile);
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
          if (navigator.share) await navigator.share({ title: 'Bad Rally', text: roomPin ? `${t.roomPinLabel} ${roomPin}` : t.tagline, url });
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
  // GIAO DIỆN KHỞI ĐỘNG (LAUNCHER CHÍNH)
  // ==========================================
  if (currentScreen === "launcher") {
    return (
      <div className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden z-10 bg-[#f3f4f6]" style={{ backgroundImage: 'var(--paper-texture)' }} onMouseMove={handleMouseMove}>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes floatSlow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } } 
          @keyframes floatFast { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-25px); } } 
          .animate-float-slow { animation: floatSlow 6s ease-in-out infinite; } 
          .animate-float-fast { animation: floatFast 4s ease-in-out infinite; }
          
          /* HIỆU ỨNG QUẢ CẦU RƠI TỪ TRÊN XUỐNG VÀ TƯNG TƯNG (GÓC CHÚI XUỐNG) */
          @keyframes shuttleDrop {
            0% { transform: translateY(-120vh) rotate(15deg); opacity: 0; animation-timing-function: ease-in; }
            5% { opacity: 1; }
            35% { transform: translateY(0) rotate(-10deg); animation-timing-function: ease-out; }
            55% { transform: translateY(-20vh) rotate(5deg); animation-timing-function: ease-in; }
            70% { transform: translateY(0) rotate(-5deg); animation-timing-function: ease-out; }
            80% { transform: translateY(-5vh) rotate(0deg); animation-timing-function: ease-in; }
            90% { transform: translateY(0) rotate(0deg); opacity: 1; }
            95% { transform: translateY(0) rotate(0deg); opacity: 0; }
            100% { transform: translateY(0) rotate(0deg); opacity: 0; }
          }
        `}} />
        
        <button onClick={() => setLang(lang === 'VI' ? 'EN' : 'VI')} className="absolute top-4 right-4 z-50 bg-[#bfdbfe] border-[3px] border-black px-3 py-1 text-sm font-black shadow-[4px_4px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition-all">
            {lang === 'VI' ? '🇻🇳 VI' : '🇬🇧 EN'}
        </button>

        {/* CÁC QUẢ CẦU LÔNG SVG SIÊU NÉT RƠI TỪ TRÊN XUỐNG */}
        {[
          { left: '10%', delay: '0s', duration: '3.5s', size: 'w-10 h-10' },
          { left: '35%', delay: '1.2s', duration: '4s', size: 'w-14 h-14' },
          { left: '60%', delay: '2.5s', duration: '3.8s', size: 'w-8 h-8' },
          { left: '80%', delay: '0.5s', duration: '4.5s', size: 'w-12 h-12' },
          { left: '92%', delay: '1.8s', duration: '4.2s', size: 'w-10 h-10' }
        ].map((s, i) => (
          <div key={`drop-${i}`} className={`absolute bottom-[5%] z-0 pointer-events-none opacity-0`} style={{ left: s.left, animation: `shuttleDrop ${s.duration} infinite ${s.delay}` }}>
              <ShuttlecockIcon className={s.size} />
          </div>
        ))}

        {/* HÌNH TRANG TRÍ BAY LƠ LỬNG */}
        <div className="absolute top-[15%] right-[20%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-slow" style={{ transform: `translate(${mousePos.x * 2}px, ${mousePos.y * 2}px)` }}>
            <div className="w-28 h-28 bg-yellow-400 rounded-full border-[3px] border-black flex items-center justify-center text-center shadow-[4px_4px_0_0_#000] rotate-12">
                <span className="text-[10px] font-black uppercase leading-tight" dangerouslySetInnerHTML={{__html: t.badge}}></span>
            </div>
        </div>
        <div className="absolute top-[25%] left-[25%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-fast" style={{ transform: `translate(${mousePos.x * -1.5}px, ${mousePos.y * -1.5}px)` }}>
            <div className="w-16 h-16 bg-purple-500 border-[3px] border-black flex items-center justify-center text-white text-3xl font-black shadow-[4px_4px_0_0_#000] -rotate-12">ツ</div>
        </div>
        <div className="absolute bottom-[20%] left-[20%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-slow" style={{ transform: `translate(${mousePos.x * 3}px, ${mousePos.y * 3}px)` }}>
            <div className="w-12 h-12 bg-[#bbf7d0] rounded-full border-[3px] border-black shadow-[4px_4px_0_0_#000] flex items-center justify-center"><div className="w-6 h-1 bg-black rounded-full rotate-45 opacity-20"></div></div>
        </div>
        <div className="absolute bottom-[25%] right-[25%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-fast" style={{ transform: `translate(${mousePos.x * -2.5}px, ${mousePos.y * -2.5}px)` }}>
            <span className="text-6xl drop-shadow-[4px_4px_0_rgba(0,0,0,1)] rotate-45">🏸</span>
        </div>
        <div className="absolute bottom-[10%] left-[45%] z-0 pointer-events-none transition-transform duration-300 ease-out animate-float-slow" style={{ transform: `translate(${mousePos.x * 1}px, ${mousePos.y * -1}px)` }}>
            <div className="w-14 h-14 bg-purple-500 border-[3px] border-black flex items-center justify-center text-white text-2xl font-black shadow-[4px_4px_0_0_#000] rotate-6">ダ</div>
        </div>

        <div className="text-center z-20 transition-transform duration-300 ease-out" style={{ transform: `translate(${mousePos.x * 0.5}px, ${mousePos.y * 0.5}px)` }}>
          <h2 className="text-sm font-black bg-black text-white inline-block px-3 py-1 mb-4 uppercase tracking-widest shadow-[4px_4px_0_0_#facc15]">{t.tagline}</h2>
          <div className="flex flex-col items-center mb-8 relative">
              <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-[#3b82f6] text-stroke-3 text-shadow-hard relative z-10 -mb-6 transform -rotate-2">BAD</h1>
              <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-[#ff5e5e] text-stroke-3 text-shadow-hard relative z-20 transform rotate-2">RALLY</h1>
          </div>
          <div className="bg-white border-[3px] border-black shadow-[6px_6px_0_0_#000] p-5 max-w-sm mx-auto mb-8 relative">
              <p className="font-bold text-sm leading-relaxed" dangerouslySetInnerHTML={{__html: t.desc}}></p>
          </div>
          <button onClick={() => setCurrentScreen(canHost ? "role_select" : "guest_join")} className="bg-yellow-400 border-[3px] border-black text-lg font-black uppercase tracking-widest py-4 px-12 shadow-[6px_6px_0_0_#000] hover:bg-yellow-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
              {t.startBtn} ➔
          </button>
        </div>

        {/* THẺ BẢN QUYỀN IDEAN Ở TRANG CHỦ */}
        <div className="absolute bottom-4 z-50 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 bg-white border-2 border-black shadow-[2px_2px_0_0_#000]">
          © {new Date().getFullYear()} by <span className="text-blue-600">iDean</span>
        </div>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN CHỌN VAI TRÒ (MULTI-TENANT)
  // ==========================================
  if (currentScreen === "role_select") {
    return (
      <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={{ backgroundImage: 'var(--paper-texture)' }}>
         <button onClick={() => setLang(lang === 'VI' ? 'EN' : 'VI')} className="absolute top-4 right-4 z-50 bg-[#bfdbfe] border-[3px] border-black px-3 py-1 text-sm font-black shadow-[4px_4px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition-all">
            {lang === 'VI' ? '🇻🇳 VI' : '🇬🇧 EN'}
         </button>
         <div className="bg-white border-[4px] border-black p-8 shadow-[8px_8px_0_0_#000] max-w-md w-full mx-4 flex flex-col gap-6">
            <div className="text-center">
                <div className="flex items-center justify-center font-black text-2xl mb-2"><i className="fa-solid fa-circle-check text-yellow-400 mr-2 text-stroke-1"></i><span className="text-blue-600">BAD</span><span className="text-yellow-400">RALLY</span></div>
                <p className="font-bold text-gray-500">{t.roleSelectTitle}</p>
            </div>
            
            <button onClick={handleCreateRoom} className="bg-blue-100 border-[3px] border-blue-600 p-6 flex flex-col items-center gap-3 hover:bg-blue-200 transition-colors shadow-[4px_4px_0_0_#2563eb] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                <i className="fa-solid fa-house-laptop text-4xl text-blue-600"></i>
                <div className="text-center">
                    <h3 className="font-black text-blue-900 uppercase">{t.hostRole}</h3>
                    <p className="text-xs font-bold text-blue-700 mt-1">{t.hostDesc}</p>
                </div>
            </button>

            <button onClick={() => setCurrentScreen('guest_join')} className="bg-yellow-100 border-[3px] border-yellow-600 p-6 flex flex-col items-center gap-3 hover:bg-yellow-200 transition-colors shadow-[4px_4px_0_0_#ca8a04] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
                <i className="fa-solid fa-mobile-screen-button text-4xl text-yellow-600"></i>
                <div className="text-center">
                    <h3 className="font-black text-yellow-900 uppercase">{t.guestRole}</h3>
                    <p className="text-xs font-bold text-yellow-700 mt-1">{t.guestDesc}</p>
                </div>
            </button>
            <button onClick={() => setCurrentScreen('launcher')} className="text-gray-400 font-bold hover:text-black text-sm text-center mt-2"><i className="fa-solid fa-arrow-left mr-1"></i> {t.backBtn}</button>
         </div>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN CHỦ SÂN TẠO PHÒNG (MÃ QR ĐỘNG)
  // ==========================================
  if (currentScreen === "host_setup") {
    const linkToJoin = `${PUBLIC_APP_URL}/?pin=${roomPin}`;

    return (
      <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={{ backgroundImage: 'var(--paper-texture)' }}>
         <div className="bg-white border-[4px] border-black p-8 shadow-[8px_8px_0_0_#000] max-w-sm w-full mx-4 flex flex-col items-center gap-6">
            <h2 className="font-black text-xl uppercase text-center border-b-4 border-yellow-400 pb-2">{t.roomCreated}</h2>
            
            <div className="text-center w-full">
                <p className="font-bold text-gray-500 text-xs mb-1">{t.roomPinLabel}</p>
                <div className="font-black text-5xl tracking-[0.2em] text-blue-600 bg-gray-100 py-3 border-2 border-dashed border-black">{roomPin}</div>
            </div>

            <div className="border-4 border-black p-2 bg-white relative">
                <QrCode value={linkToJoin} size={192} className="w-48 h-48" />
            </div>
            <p className="text-xs font-bold text-center text-gray-500">{t.qrDesc}</p>
            
            {/* THẺ BẢN QUYỀN IDEAN Ở TRANG QUÉT QR */}
            <p className="text-[10px] font-black bg-yellow-300 px-3 py-1 border-2 border-black -mt-4 z-10 shadow-[2px_2px_0_0_#000]">Powered by iDean</p>

            <button onClick={handleGoToDashboard} className="w-full bg-[#fcd34d] border-[3px] border-black py-4 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] hover:bg-[#fbbf24] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.goToDashboard}</button>
         </div>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN KHÁCH NHẬP MÃ VÀO PHÒNG
  // ==========================================
  if (currentScreen === "guest_join") {
    return (
      <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={{ backgroundImage: 'var(--paper-texture)' }}>
         <button onClick={() => setLang(lang === 'VI' ? 'EN' : 'VI')} className="absolute top-4 right-4 z-50 bg-[#bfdbfe] border-[3px] border-black px-3 py-1 text-sm font-black shadow-[4px_4px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition-all">
            {lang === 'VI' ? '🇻🇳 VI' : '🇬🇧 EN'}
         </button>
         <div className="bg-white border-[4px] border-black p-6 shadow-[8px_8px_0_0_#000] max-w-sm w-full mx-4 flex flex-col gap-4">
            <h2 className="font-black text-xl uppercase text-center border-b-4 border-yellow-400 pb-2">{t.joinMatch}</h2>
            
            <div>
                <label className="text-[11px] font-black uppercase mb-1 block">{t.pinLabel}</label>
                <input type="text" maxLength={6} placeholder={t.pinPlaceholder} className="w-full border-[3px] border-black p-3 text-2xl tracking-widest text-center font-black focus:outline-none focus:bg-yellow-50" value={roomPin} onChange={e => setRoomPin(e.target.value)} />
            </div>

            <div>
                <label className="text-[11px] font-black uppercase mb-1 block">{t.yourNameLabel}</label>
                <input type="text" placeholder={t.namePlaceholder} className="w-full border-[3px] border-black p-2 text-sm font-bold focus:outline-none focus:bg-yellow-50 mb-2" value={guestName} onChange={e => setGuestName(e.target.value)} />
                
                <div className="flex gap-2">
                    <button onClick={() => setGuestGender('M')} className={`flex-1 border-[3px] border-black py-1.5 text-xs font-black uppercase transition-all flex items-center justify-center gap-1 ${guestGender === 'M' ? 'bg-blue-300 shadow-[2px_2px_0_0_#000]' : 'bg-gray-100 hover:bg-gray-200'}`}><span className="text-blue-600 text-sm">♂</span> {t.male}</button>
                    <button onClick={() => setGuestGender('F')} className={`flex-1 border-[3px] border-black py-1.5 text-xs font-black uppercase transition-all flex items-center justify-center gap-1 ${guestGender === 'F' ? 'bg-pink-300 shadow-[2px_2px_0_0_#000]' : 'bg-gray-100 hover:bg-gray-200'}`}><span className="text-pink-500 text-sm">♀</span> {t.female}</button>
                </div>
            </div>

            <div>
                <label className="text-[11px] font-black uppercase mb-1 block">{t.skillLabel}</label>
                <select className="w-full border-[3px] border-black p-2 text-sm font-bold cursor-pointer bg-white" value={guestSkill} onChange={e => setGuestSkill(e.target.value as SkillLevel)}>
                    {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
                </select>
            </div>

            <button onClick={handleJoinRoom} className="w-full bg-[#3b82f6] text-white border-[3px] border-black py-4 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] hover:bg-blue-600 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all mt-2">{t.joinBtn}</button>
            <button onClick={() => setCurrentScreen(canHost ? 'role_select' : 'launcher')} className="text-gray-400 font-bold hover:text-black text-sm text-center mt-2">{t.cancelBtn}</button>
         </div>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN APP CHÍNH (HOST HOẶC GUEST)
  // ==========================================
  return (
    <div className="flex flex-col h-screen w-full bg-transparent z-50 absolute inset-0 overflow-hidden">
      
      {/* BÁO KHÁCH ĐƯỢC GỌI VÀO SÂN */}
      {calledAlert && (
          <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4" onClick={dismissCalled}>
              <div className="bg-yellow-300 border-[4px] border-black p-8 max-w-sm w-full text-center shadow-[8px_8px_0_0_#000]">
                  <div className="text-5xl mb-2">🏸</div>
                  <h2 className="text-3xl font-black uppercase">{t.calledTitle}</h2>
                  {myCourt && <p className="text-5xl font-black text-blue-700 my-3">{t.calledCourt.replace('{court}', String(myCourt.id))}</p>}
                  {myCourt && myTeammates.length > 0 && <p className="text-sm font-bold">{t.myTeammate}: {myTeammates.map(p => p.name).join(', ')}</p>}
                  {myCourt && <p className="text-sm font-bold">{t.myOpponents}: {myOpponents.map(p => p.name).join(', ')}</p>}
                  <button onClick={dismissCalled} className="mt-6 w-full bg-white border-[3px] border-black py-3 font-black uppercase shadow-[4px_4px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.calledOk}</button>
              </div>
          </div>
      )}

      {/* MODAL THÔNG BÁO BỊ ĐUỔI KHỎI PHÒNG (THAY CHO ALERT) */}
      {isKickedModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
              <div className="bg-white border-[4px] border-black p-8 max-w-sm w-full text-center shadow-[8px_8px_0_0_#facc15] animate-bounce-short">
                  <div className="w-16 h-16 bg-red-100 border-[3px] border-black rounded-full flex items-center justify-center mx-auto mb-4">
                      <i className="fa-solid fa-person-walking-arrow-right text-red-600 text-3xl"></i>
                  </div>
                  <h2 className="text-xl font-black uppercase mb-2 text-red-600">{t.roomDeletedTitle}</h2>
                  <p className="text-sm font-bold text-gray-700 mb-6">{t.roomDeletedAlert}</p>
                  <button onClick={handleCloseKickedModal} className="w-full bg-yellow-400 border-[3px] border-black py-3 font-black uppercase shadow-[4px_4px_0_0_#000] hover:bg-yellow-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                      OK
                  </button>
              </div>
          </div>
      )}

      {/* SIDEBAR BẢN ĐẦY ĐỦ */}
      <div className={`fixed inset-0 z-[60] ${isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsSidebarOpen(false)}></div>
          <div className={`absolute top-0 right-0 w-[320px] max-w-[85vw] h-full bg-[#f8f9fa] border-l-[3px] border-black transform transition-transform duration-300 ease-out flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
              <div className="flex items-center justify-between p-4 border-b-[3px] border-black bg-white">
                  <div className="flex items-center border-2 border-black rounded-full px-3 py-1 bg-yellow-100">
                      <i className="fa-solid fa-circle-check text-yellow-500 mr-1 text-xs"></i>
                      <span className="font-black text-xs text-blue-600">BAD</span><span className="font-black text-xs text-yellow-500">RALLY</span>
                  </div>
                  <div className="flex gap-3 items-center">
                      <button onClick={() => setIsSidebarOpen(false)} className="text-xl font-black hover:text-red-500 transition-colors"><i className="fa-solid fa-xmark"></i></button>
                  </div>
              </div>
              
              <div className="p-4 flex flex-col gap-3 overflow-y-auto no-scrollbar flex-1">
                  <div className="bg-black text-white p-3 font-black text-xs uppercase flex items-center justify-between shadow-[3px_3px_0_0_#facc15] mb-2">
                      <span>Role: {userRole === 'host' ? t.hostRoleBadge : t.guestRoleBadge}</span>
                      {userRole === 'host' && <span className="bg-white text-black px-2 py-0.5 text-[9px]">PIN: {roomPin}</span>}
                  </div>

                  {userRole === 'host' && (
                      <button onClick={() => { setIsSidebarOpen(false); setCurrentScreen('host_setup'); }} className="bg-white border-[3px] border-black rounded-lg p-3 text-left shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:shadow-none transition-all flex gap-3 items-center group">
                          <div className="w-8 h-8 rounded-full border-2 border-black bg-[#bfdbfe] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><i className="fa-solid fa-qrcode"></i></div>
                          <div>
                              <div className="font-black text-sm leading-tight">{t.sidebar.scrollTop}</div>
                              <div className="text-[9px] font-bold text-gray-700 mt-0.5 leading-tight">{t.sidebar.scrollTopDesc}</div>
                          </div>
                      </button>
                  )}

                  <button onClick={handleShare} className="bg-white border-[3px] border-black rounded-lg p-3 text-left shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:shadow-none transition-all flex gap-3 items-center group">
                      <div className="w-8 h-8 rounded-full border-2 border-black bg-[#fef08a] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><i className="fa-solid fa-share-nodes"></i></div>
                      <div>
                          <div className="font-black text-sm leading-tight">{t.sidebar.share}</div>
                          <div className="text-[9px] font-bold text-gray-700 mt-0.5 leading-tight">{t.sidebar.shareDesc}</div>
                      </div>
                  </button>

                  <button className="bg-white border-[3px] border-black rounded-lg p-3 text-left shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:shadow-none transition-all flex gap-3 items-center group">
                      <div className="w-8 h-8 rounded-full border-2 border-black bg-[#e5e7eb] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><i className="fa-solid fa-headset"></i></div>
                      <div>
                          <div className="font-black text-sm leading-tight">{t.sidebar.contact}</div>
                          <div className="text-[9px] font-bold text-gray-700 mt-0.5 leading-tight">{t.sidebar.contactDesc}</div>
                      </div>
                  </button>

                  <button onClick={handleExitRoom} className="bg-red-50 border-[3px] border-red-600 rounded-lg p-3 text-left shadow-[3px_3px_0_0_#dc2626] hover:bg-red-100 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#dc2626] active:shadow-none transition-all flex gap-3 items-center group mt-auto">
                      <div className="w-8 h-8 rounded-full border-2 border-red-600 bg-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><i className="fa-solid fa-right-from-bracket text-red-600"></i></div>
                      <div>
                          <div className="font-black text-sm leading-tight text-red-700">{t.sidebar.exitRoom}</div>
                          <div className="text-[9px] font-bold text-red-600 mt-0.5 leading-tight">{t.sidebar.exitRoomDesc}</div>
                      </div>
                  </button>
              </div>

              <div className="p-4 border-t-2 border-dashed border-gray-300 space-y-3 pb-8">
                  <button className="flex items-center justify-between w-full text-[11px] font-bold text-gray-600 hover:text-black transition-colors"><span><i className="fa-regular fa-file-alt w-5 text-center"></i> {t.sidebar.terms}</span><i className="fa-solid fa-chevron-right text-[10px]"></i></button>
                  <button className="flex items-center justify-between w-full text-[11px] font-bold text-gray-600 hover:text-black transition-colors"><span><i className="fa-solid fa-shield-halved w-5 text-center"></i> {t.sidebar.privacy}</span><i className="fa-solid fa-chevron-right text-[10px]"></i></button>
                  <div className="pt-4 flex flex-col items-center justify-center gap-1 opacity-60">
                      <div className="flex items-center border border-black rounded px-2 py-0.5 bg-yellow-100">
                          <i className="fa-solid fa-circle-check text-yellow-500 mr-1 text-[8px]"></i>
                          <span className="font-black text-[8px] text-blue-600">BAD</span><span className="font-black text-[8px] text-yellow-500">RALLY</span>
                      </div>
                      <span className="text-[9px] font-bold">{t.sidebar.version}</span>
                      
                      {/* THẺ BẢN QUYỀN IDEAN Ở TRONG SIDEBAR */}
                      <span className="text-[9px] font-black mt-1 uppercase text-gray-400 tracking-widest">© {new Date().getFullYear()} by iDean</span>
                  </div>
              </div>
          </div>
      </div>

      {/* HEADER BẢN ĐẦY ĐỦ (CÓ NÚT LANG, ZOOM, MENU) */}
      <div className="bg-white border-b-[3px] border-black flex justify-between items-center p-2 sticky top-0 z-30 shadow-xs w-full">
        <button onClick={handleExitRoom} className="neo-btn bg-white px-3 py-1 text-sm rounded flex items-center shadow-[2px_2px_0_0_#000] border-2 border-black font-black"><i className="fa-solid fa-arrow-left mr-2"></i> Thoát</button>
        
        <div className="font-black text-lg flex items-center absolute left-1/2 transform -translate-x-1/2 flex-col leading-none mt-1">
            <div className="flex items-center"><i className="fa-solid fa-circle-check text-yellow-400 mr-1 text-stroke-1"></i><span className="text-blue-600 tracking-tighter">BAD</span><span className="text-yellow-400 tracking-tighter ml-1">RALLY</span></div>
            {userRole === 'host' && <span className="text-[8px] bg-yellow-400 px-1 border border-black mt-1">PIN: {roomPin}</span>}
            {userRole === 'guest' && <span className="text-[8px] bg-blue-200 text-blue-800 px-1 border border-blue-600 mt-1">Mode: Guest</span>}
        </div>
        
        <div className="flex items-center gap-2">
            {activeTab === "courts" && (
                <button onClick={() => setViewMode(prev => prev === 'grid' ? 'table' : 'grid')} className="bg-white neo-border px-2 py-1 text-[10px] font-bold flex items-center gap-1 hover:bg-gray-100 hidden md:flex">
                    <i className={`fa-solid ${viewMode === 'grid' ? 'fa-table-list' : 'fa-border-all'}`}></i> {viewMode === 'grid' ? t.tableView : t.gridView}
                </button>
            )}
            
            <button onClick={() => setZoomLevel(1)} className="bg-white neo-border px-2 py-1 text-[10px] font-bold flex items-center gap-1 hover:bg-gray-100 hidden md:flex">
                <i className="fa-solid fa-rotate-left"></i> {t.resetLayout}
            </button>
            
            <div className="hidden md:flex items-center text-xs font-bold mx-2 border-[2px] border-black bg-white rounded">
                <button onClick={() => setZoomLevel(p => Math.max(0.5, p - 0.1))} className="px-2 py-1 text-gray-600 hover:text-black hover:bg-gray-200">-</button>
                <span className="w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(p => Math.min(2, p + 0.1))} className="px-2 py-1 text-gray-600 hover:text-black hover:bg-gray-200">+</button>
            </div>
            
            <button onClick={() => setLang(lang === 'VI' ? 'EN' : 'VI')} className="bg-[#bfdbfe] border-2 border-black px-2 py-1 text-[10px] font-black shadow-[2px_2px_0_0_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all hidden sm:block">
                {lang === 'VI' ? '🇻🇳 VI' : '🇬🇧 EN'}
            </button>

            <button onClick={() => setIsSidebarOpen(true)} className="hover:bg-gray-200 px-3 py-1 rounded transition-colors ml-2"><i className="fa-solid fa-ellipsis-vertical text-xl"></i></button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-auto no-scrollbar p-4 pb-32 bg-[#f3f4f6]" style={{ backgroundImage: 'var(--paper-texture)' }}>
        {/* THẺ "CỦA TÔI" CHO KHÁCH: trạng thái, vị trí hàng chờ, sân đang đánh + nút Nghỉ / Sẵn sàng / Về */}
        {userRole === 'guest' && (
          <div className="max-w-2xl mx-auto mb-4 bg-white border-[3px] border-black shadow-[4px_4px_0_0_#000]">
            <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider flex justify-between items-center gap-2">
              <span className="truncate"><i className="fa-solid fa-user mr-1"></i>{t.myCardTitle}{me ? ` · ${me.name}` : ''}</span>
              {me && <span className="text-yellow-300 shrink-0">{me.playCount} {t.matchLabel} · {me.wins} {t.winLabel}</span>}
            </div>
            <div className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                {!me && <p className="text-sm font-bold text-gray-500">{t.myNotInList}</p>}
                {me && myCourt && (
                  <>
                    <p className="font-black text-green-700 text-lg leading-tight"><i className="fa-solid fa-person-running mr-1"></i>{t.myPlaying.replace('{court}', String(myCourt.id))}{catLabel(myCourt) && <span className="ml-2 text-[10px] bg-pink-300 text-black border-2 border-black px-1.5 align-middle">{catLabel(myCourt)}</span>}</p>
                    {myTeammates.length > 0 && <p className="text-xs font-bold text-gray-700 mt-1">{t.myTeammate}: <span className="text-blue-700">{myTeammates.map(p => p.name).join(', ')}</span></p>}
                    <p className="text-xs font-bold text-gray-700">{t.myOpponents}: <span className="text-red-600">{myOpponents.map(p => p.name).join(', ')}</span></p>
                    {myCourt.status === 'scoring' && <p className="text-[10px] font-bold text-orange-600 mt-1">{t.myScoring}</p>}
                  </>
                )}
                {me && !myCourt && me.status === 'waiting' && (
                  <>
                    <p className="font-black text-lg leading-tight"><i className="fa-solid fa-hourglass-half mr-1 text-yellow-500"></i>{t.myWaiting.replace('{pos}', String(myQueuePos)).replace('{total}', String(waitingQueue.length))}</p>
                    <p className="text-xs font-bold text-gray-500 mt-1">{myEtaText}</p>
                  </>
                )}
                {me && !myCourt && me.status === 'break' && <p className="font-black text-lg text-gray-500 leading-tight"><i className="fa-solid fa-mug-hot mr-1"></i>{t.myOnBreak}</p>}
                {me && !myCourt && me.status === 'playing' && <p className="font-black text-lg text-green-700 leading-tight"><i className="fa-solid fa-person-running mr-1"></i>{t.playing}</p>}
              </div>
              {me && (
                <div className="flex gap-2 shrink-0">
                  {me.status !== 'playing' && (
                    <button onClick={handleGuestToggleBreak} className={`border-2 border-black px-3 py-2 text-xs font-black uppercase shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ${me.status === 'break' ? 'bg-green-300' : 'bg-white'}`}><i className={`fa-solid ${me.status === 'break' ? 'fa-play' : 'fa-mug-hot'} mr-1`}></i>{me.status === 'break' ? t.btnReady : t.btnBreak}</button>
                  )}
                  <button onClick={handleGuestLeave} className="border-2 border-black px-3 py-2 text-xs font-black uppercase bg-red-100 text-red-700 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><i className="fa-solid fa-right-from-bracket mr-1"></i>{t.btnLeave}</button>
                </div>
              )}
            </div>
          </div>
        )}
        <div style={{ zoom: zoomLevel }} className="w-full min-h-full">

            {/* TAB: SÂN (COURTS) */}
            {activeTab === "courts" && (
              <div className="w-full h-full">
                {players.length === 0 ? (
                    <div className="flex items-center justify-center h-full mt-20" style={{ zoom: zoomLevel ? 1 / zoomLevel : 1 }}>
                        <div className="bg-white neo-border neo-shadow p-6 max-w-[280px] w-full text-center relative flex flex-col items-center">
                            <i className="fa-solid fa-users-slash text-gray-400 text-3xl mb-2 text-stroke-1"></i>
                            <h3 className="font-black text-sm uppercase mb-4 tracking-wide">{t.setupNeeded}</h3>
                            <p className="text-[10px] font-bold text-gray-500 mb-4">{t.setupNeededDesc.replace('{pin}', roomPin)}</p>
                            {userRole === 'host' && <button onClick={() => setActiveTab('players')} className="w-full bg-yellow-400 border-2 border-black font-black uppercase text-[10px] py-2 shadow-[2px_2px_0_0_#000]">{t.manualAddBtn}</button>}
                        </div>
                    </div>
                ) : viewMode === 'grid' ? (
                    // DẠNG LƯỚI (GRID)
                    <div className="flex flex-wrap gap-6 items-start justify-center md:justify-start lg:ml-8 border-2 border-dashed border-gray-300 p-6 min-h-[70vh] rounded-md max-w-6xl">
                      {courts.map(court => {
                        const topCount = court.matchType === '2v2' ? 2 : 1;
                        const bottomCount = court.matchType === '1v1' ? 1 : (court.matchType === '1v2' ? 2 : 2);
                        const neededPlayers = topCount + bottomCount;

                        return (
                          <div key={court.id} className="relative flex flex-col gap-2 w-[256px]">
                            <div className="h-[380px] w-full bg-white neo-border p-1 relative flex flex-col shadow-md">
                              
                              {/* SÂN TRỐNG */}
                              {court.status === 'available' && (
                                  <div className="bg-[#f8f9fa] w-full h-full border border-gray-200 flex flex-col justify-center items-center relative shadow-xs">
                                      {userRole === 'host' && (
                                          <div className="absolute top-2 right-2 flex gap-1 z-20"><button className="p-1.5 bg-white border border-black hover:bg-gray-100 cursor-pointer"><i className="fa-solid fa-grip-vertical text-xs"></i></button><button className="p-1.5 bg-white border border-black text-red-500 hover:bg-red-50 cursor-pointer"><i className="fa-solid fa-trash-can text-xs"></i></button></div>
                                      )}
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"><span className="text-[160px] font-black text-gray-200/60 leading-none select-none">{court.id}</span></div>
                                      <div className="text-center z-10 mb-6 mt-12"><h3 className="text-gray-400 font-bold tracking-[0.2em] text-[13px] leading-tight uppercase" dangerouslySetInnerHTML={{__html: t.courtEmpty}}></h3></div>
                                      
                                      <div className="flex gap-1.5 z-10 mb-4">
                                          <button onClick={() => handleChangeMatchType(court.id, '1v1')} disabled={userRole==='guest'} className={`flex items-center gap-1 px-2 py-1 border-2 border-black text-[10px] font-bold ${court.matchType === '1v1' ? 'bg-[#3b82f6] text-white shadow-[2px_2px_0_0_#000]' : 'bg-white text-gray-600'} ${userRole==='guest' ? 'opacity-50 cursor-not-allowed' : ''}`}><i className="fa-regular fa-user"></i> 1v1</button>
                                          <button onClick={() => handleChangeMatchType(court.id, '1v2')} disabled={userRole==='guest'} className={`flex items-center gap-1 px-2 py-1 border-2 border-black text-[10px] font-bold ${court.matchType === '1v2' ? 'bg-[#3b82f6] text-white shadow-[2px_2px_0_0_#000]' : 'bg-white text-gray-600'} ${userRole==='guest' ? 'opacity-50 cursor-not-allowed' : ''}`}><i className="fa-solid fa-user-group"></i> 1v2</button>
                                          <button onClick={() => handleChangeMatchType(court.id, '2v2')} disabled={userRole==='guest'} className={`flex items-center gap-1 px-2 py-1 border-2 border-black text-[10px] font-bold ${court.matchType === '2v2' ? 'bg-[#3b82f6] text-white shadow-[2px_2px_0_0_#000]' : 'bg-white text-gray-600'} ${userRole==='guest' ? 'opacity-50 cursor-not-allowed' : ''}`}><i className="fa-solid fa-users"></i> 2v2</button>
                                      </div>
                                      {court.matchType === '2v2' && (
                                          <div className="flex gap-1 z-10 -mt-2 mb-4">
                                              {CATEGORY_OPTIONS.map(cat => (
                                                  <button key={cat} onClick={() => handleChangeCategory(court.id, cat)} disabled={userRole==='guest'} className={`px-1.5 py-0.5 border-2 border-black text-[9px] font-bold ${(court.category || 'any') === cat ? 'bg-pink-300 text-black shadow-[1px_1px_0_0_#000]' : 'bg-white text-gray-600'} ${userRole==='guest' ? 'opacity-50 cursor-not-allowed' : ''}`}>{t.categories[cat]}</button>
                                              ))}
                                          </div>
                                      )}
                                      {userRole === 'host' ? (
                                        <div className="w-[85%] flex flex-col gap-2 z-10">
                                            <button onClick={() => handleGenerateNextGame(court.id)} className="w-full bg-[#3b82f6] text-white font-black tracking-wide border-2 border-black py-2 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all hover:bg-blue-500 text-[11px]">{t.start}</button>
                                            <button onClick={() => handleStartDrafting(court.id)} className="w-full bg-yellow-300 text-black font-black tracking-wide border-2 border-black py-1.5 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all hover:bg-yellow-200 text-[10px]"><i className="fa-solid fa-hand-pointer mr-1"></i>{t.manualSetup}</button>
                                        </div>
                                      ) : (
                                        <p className="text-[9px] font-bold text-gray-400 z-10 mt-4 italic">{t.guestWaitingDraft}</p>
                                      )}
                                  </div>
                              )}

                              {/* GIAO DIỆN XẾP TAY */}
                              {court.status === 'drafting' && (
                                  <div className="bg-[#fef9c3] w-full h-full border-2 border-black flex flex-col relative shadow-xs p-3">
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"><span className="text-[120px] font-black text-yellow-500/10 leading-none select-none">{court.id}</span></div>
                                      <h4 className="text-[11px] font-black uppercase mb-3 text-center border-b-[2px] border-black pb-1 z-10">{t.draftTitle} ({court.matchType}{catLabel(court) && ` · ${catLabel(court)}`})</h4>
                                      
                                      <div className="flex flex-col gap-1 mb-2 min-h-[50px] z-10">
                                          <div className="text-[9px] font-bold text-gray-500">{t.draftSelected} ({court.players.length}/{neededPlayers}):</div>
                                          <div className="flex flex-wrap gap-1">
                                              {court.players.map(p => (
                                                  <span key={p.id} onClick={() => handleToggleDraftPlayer(court.id, p)} className="bg-[#3b82f6] text-white border-2 border-black px-2 py-1 text-[10px] font-bold cursor-pointer hover:bg-red-500 hover:line-through transition-colors flex items-center gap-1 shadow-[1px_1px_0_0_#000]">{p.name} {renderGenderIcon(p.gender)} <i className="fa-solid fa-xmark text-[8px] ml-1"></i></span>
                                              ))}
                                          </div>
                                      </div>

                                      <div className="flex-1 overflow-y-auto border-t-[2px] border-black pt-2 mb-3 custom-scrollbar z-10">
                                           <div className="text-[9px] font-bold text-gray-500 mb-1.5">{t.draftWaiting}:</div>
                                           <div className="flex flex-wrap gap-1.5">
                                               {players.filter(p => p.status === 'waiting' && !court.players.some(cp => cp.id === p.id) && fitsCategory(p, effectiveCategory(court.matchType, court.category))).map(p => (
                                                   <span key={p.id} onClick={() => handleToggleDraftPlayer(court.id, p)} className="bg-white border-2 border-black px-2 py-1 text-[10px] font-bold cursor-pointer hover:bg-green-300 transition-colors shadow-[1px_1px_0_0_#000]">{p.name} {renderGenderIcon(p.gender)}</span>
                                               ))}
                                           </div>
                                      </div>

                                      <div className="flex gap-2 mt-auto z-10">
                                          <button onClick={() => handleCancelDrafting(court.id)} className="flex-1 bg-white border-2 border-black py-2 text-[10px] font-black uppercase hover:bg-red-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all shadow-[2px_2px_0_0_#000]">{t.draftCancel}</button>
                                          <button onClick={() => handleStartManualMatch(court.id)} className={`flex-1 border-2 border-black py-2 text-[10px] font-black uppercase active:translate-x-[2px] active:translate-y-[2px] transition-all shadow-[2px_2px_0_0_#000] ${court.players.length === neededPlayers ? 'bg-green-400 hover:bg-green-500 text-black active:shadow-none' : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none active:translate-x-0 active:translate-y-0'}`}>{t.draftStart}</button>
                                      </div>
                                  </div>
                              )}

                              {/* ĐANG ĐÁ (ACTIVE) & CHỜ KẾT QUẢ (SCORING) */}
                              {(court.status === 'active' || court.status === 'scoring') && (
                                  <div className="bg-[#428259] w-full h-full border-2 border-black relative overflow-hidden flex flex-col py-1">
                                      {catLabel(court) && <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 bg-pink-300 border-2 border-t-0 border-black px-2 text-[9px] font-black uppercase whitespace-nowrap">{catLabel(court)}</div>}
                                      <div className="absolute inset-2 border-2 border-white/60 pointer-events-none"></div><div className="absolute left-0 right-0 top-1/2 border-t-[3px] border-dashed border-white transform -translate-y-1/2 z-0 pointer-events-none"></div><div className="absolute top-2 bottom-2 left-1/2 w-0.5 bg-white/60 transform -translate-x-1/2 pointer-events-none"></div>
                                      {userRole === 'host' && <div className="absolute top-2 right-2 flex gap-1 bg-white neo-border p-0.5 z-20"><button onClick={() => handleMatchResult(court.id, 0)} className="hover:bg-red-100 text-red-500 px-1 text-xs" title={t.cancelMatch}><i className="fa-solid fa-trash-can"></i></button></div>}
                                      
                                      {/* NỬA TRÊN: ĐỘI 1 */}
                                      <div className="flex-1 flex flex-col items-center justify-center relative bg-blue-400/80 mx-1 mt-1 mb-0.5 border-[2px] border-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]">
                                        <span className="absolute top-1 left-2 text-[9px] font-black text-white text-stroke-1">{t.team1Label}</span>
                                        <div className={`w-full grid ${topCount === 2 ? 'grid-cols-2' : 'grid-cols-1'} items-center justify-items-center z-10 px-2 gap-2`}>
                                            {court.players.slice(0, topCount).map(p => (<div key={p.id} className="bg-white border-2 border-blue-900 px-1 py-1.5 w-full max-w-[100px] text-center truncate font-black text-[12px] text-blue-900 shadow-[2px_2px_0_0_#1e3a8a]">{p.name} {renderGenderIcon(p.gender)}</div>))}
                                        </div>
                                      </div>

                                      {/* NÚT KẾT THÚC HOẶC CHỜ KẾT QUẢ */}
                                      {court.status === 'active' && userRole === 'host' && (
                                          <button onClick={() => handleFinishMatch(court.id)} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-400 border-2 border-black px-4 py-2 font-black text-[11px] uppercase z-20 shadow-[3px_3px_0_0_#000] hover:bg-yellow-300 active:scale-95 active:shadow-none transition-all">{t.finishMatch}</button>
                                      )}
                                      {court.status === 'scoring' && (
                                          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white border-2 border-black px-3 py-1 font-black text-[10px] uppercase z-20 shadow-[2px_2px_0_0_#000]">{userRole === 'host' ? t.waitingResult : t.guestScoringTag}</div>
                                      )}
                                      {court.status === 'active' && userRole === 'guest' && (
                                          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white border-2 border-black px-3 py-1 font-black text-[10px] uppercase z-20 shadow-[2px_2px_0_0_#000]">{t.guestActiveTag}</div>
                                      )}

                                      {/* NỬA DƯỚI: ĐỘI 2 */}
                                      <div className="flex-1 flex flex-col items-center justify-center relative bg-red-400/80 mx-1 mt-0.5 mb-1 border-[2px] border-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]">
                                        <span className="absolute bottom-1 right-2 text-[9px] font-black text-white text-stroke-1">{t.team2Label}</span>
                                        <div className={`w-full grid ${bottomCount === 2 ? 'grid-cols-2' : 'grid-cols-1'} items-center justify-items-center z-10 px-2 gap-2`}>
                                            {court.players.slice(topCount, topCount + bottomCount).map(p => (<div key={p.id} className="bg-white border-2 border-red-900 px-1 py-1.5 w-full max-w-[100px] text-center truncate font-black text-[12px] text-red-900 shadow-[2px_2px_0_0_#7f1d1d]">{p.name} {renderGenderIcon(p.gender)}</div>))}
                                        </div>
                                      </div>
                                  </div>
                              )}
                            </div>

                            {/* CHỌN ĐỘI THẮNG */}
                            {court.status === 'scoring' && settings.trackMatchResults && userRole === 'host' && (
                              <div className="flex flex-col gap-1.5 w-full mt-1">
                                  <div className="flex gap-1.5">
                                      <button onClick={() => handleMatchResult(court.id, 1)} className="flex-1 bg-blue-600 text-white rounded py-2 text-[10px] font-black border-[2px] border-black hover:bg-blue-500 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><i className="fa-solid fa-trophy text-yellow-300 mr-1"></i> {t.team1Win}</button>
                                      <button onClick={() => handleMatchResult(court.id, 2)} className="flex-1 bg-red-500 text-white rounded py-2 text-[10px] font-black border-[2px] border-black hover:bg-red-400 shadow-[2px_2px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><i className="fa-solid fa-trophy text-yellow-300 mr-1"></i> {t.team2Win}</button>
                                  </div>
                                  <button onClick={() => handleMatchResult(court.id, 0)} className="w-full bg-gray-200 text-gray-700 rounded py-1.5 text-[9px] font-bold border border-gray-400 hover:bg-gray-300">{t.cancelResult}</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                ) : (
                    // DẠNG BẢNG (TABLE VIEW)
                    <div className="w-full max-w-6xl mx-auto bg-white border-[3px] border-black shadow-[6px_6px_0_0_#000] p-4 mt-6 overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="border-b-[3px] border-black text-xs font-black uppercase text-gray-700 bg-gray-100">
                                    <th className="p-3 w-16 text-center">{t.court}</th>
                                    <th className="p-3 w-32">{t.status}</th>
                                    <th className="p-3">{t.players}</th>
                                    <th className="p-3 text-center w-48">{t.action}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {courts.map(court => {
                                    const neededPlayers = (court.matchType === '2v2' ? 2 : 1) + (court.matchType === '1v1' ? 1 : 2);
                                    
                                    return (
                                    <tr key={court.id} className={`border-b-[2px] border-dashed border-gray-300 transition-colors ${court.status === 'drafting' ? 'bg-[#fef9c3]' : court.status === 'scoring' ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                                        <td className="p-3 text-center font-black text-xl">{court.id}</td>
                                        
                                        <td className="p-3">
                                            {court.status === 'available' && (
                                                <div className="flex flex-col gap-2">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.courtEmptyTable}</span>
                                                    <div className="flex gap-1">
                                                        <button disabled={userRole==='guest'} onClick={() => handleChangeMatchType(court.id, '1v1')} className={`px-2 py-0.5 border-2 border-black text-[9px] font-bold ${court.matchType === '1v1' ? 'bg-[#3b82f6] text-white' : 'bg-white text-gray-600'} ${userRole==='guest' ? 'opacity-50' : ''}`}>1v1</button>
                                                        <button disabled={userRole==='guest'} onClick={() => handleChangeMatchType(court.id, '1v2')} className={`px-2 py-0.5 border-2 border-black text-[9px] font-bold ${court.matchType === '1v2' ? 'bg-[#3b82f6] text-white' : 'bg-white text-gray-600'} ${userRole==='guest' ? 'opacity-50' : ''}`}>1v2</button>
                                                        <button disabled={userRole==='guest'} onClick={() => handleChangeMatchType(court.id, '2v2')} className={`px-2 py-0.5 border-2 border-black text-[9px] font-bold ${court.matchType === '2v2' ? 'bg-[#3b82f6] text-white' : 'bg-white text-gray-600'} ${userRole==='guest' ? 'opacity-50' : ''}`}>2v2</button>
                                                    </div>
                                                    {court.matchType === '2v2' && (
                                                        <div className="flex gap-1">
                                                            {CATEGORY_OPTIONS.map(cat => (
                                                                <button key={cat} disabled={userRole==='guest'} onClick={() => handleChangeCategory(court.id, cat)} className={`px-1.5 py-0.5 border-2 border-black text-[9px] font-bold ${(court.category || 'any') === cat ? 'bg-pink-300 text-black' : 'bg-white text-gray-600'} ${userRole==='guest' ? 'opacity-50' : ''}`}>{t.categories[cat]}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {court.status === 'drafting' && <span className="text-[10px] font-bold text-yellow-600 uppercase bg-yellow-100 px-2 py-1 rounded-full border border-yellow-600">{t.draftTitle} ({court.matchType}{catLabel(court) && ` · ${catLabel(court)}`})</span>}
                                            {court.status === 'active' && <span className="text-[10px] font-bold text-green-600 uppercase bg-green-100 px-2 py-1 rounded-full border border-green-600">{t.playing} ({court.matchType}{catLabel(court) && ` · ${catLabel(court)}`})</span>}
                                            {court.status === 'scoring' && <span className="text-[10px] font-bold text-orange-600 uppercase bg-orange-100 px-2 py-1 rounded-full border border-orange-600">{userRole === 'host' ? t.waitingResult : t.guestScoringTag}</span>}
                                        </td>

                                        <td className="p-3">
                                            {(court.status === 'active' || court.status === 'scoring') ? (
                                                <div className="flex items-center gap-4">
                                                    <div className="font-black text-sm flex gap-2">
                                                        {court.players.slice(0, court.matchType === '2v2' ? 2 : 1).map(p => <span key={p.id} className="bg-blue-100 text-blue-900 px-2 py-1 border-2 border-blue-600 min-w-max">{p.name} {renderGenderIcon(p.gender)}</span>)}
                                                    </div>
                                                    <span className="text-gray-400 font-black italic">VS</span>
                                                    <div className="font-black text-sm flex gap-2">
                                                        {court.players.slice(court.matchType === '2v2' ? 2 : 1).map(p => <span key={p.id} className="bg-red-100 text-red-900 px-2 py-1 border-2 border-red-600 min-w-max">{p.name} {renderGenderIcon(p.gender)}</span>)}
                                                    </div>
                                                </div>
                                            ) : court.status === 'drafting' ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-gray-500">{t.draftSelected}:</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {court.players.map(p => <span key={p.id} onClick={() => handleToggleDraftPlayer(court.id, p)} className="bg-[#3b82f6] text-white border border-black px-1.5 py-0.5 text-[10px] font-bold cursor-pointer hover:bg-red-500 hover:line-through">{p.name} {renderGenderIcon(p.gender)}</span>)}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-gray-500">{t.draftWaiting}:</span>
                                                        <div className="flex flex-wrap gap-1 max-w-[400px]">
                                                            {players.filter(p => p.status === 'waiting' && !court.players.some(cp => cp.id === p.id) && fitsCategory(p, effectiveCategory(court.matchType, court.category))).map(p => <span key={p.id} onClick={() => handleToggleDraftPlayer(court.id, p)} className="bg-white border border-black px-1.5 py-0.5 text-[10px] font-bold cursor-pointer hover:bg-green-200">{p.name} {renderGenderIcon(p.gender)}</span>)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic text-sm">-</span>
                                            )}
                                        </td>

                                        <td className="p-3 text-center">
                                            {court.status === 'available' && userRole === 'host' && (
                                                <div className="flex flex-col gap-1 items-center">
                                                    <button onClick={() => handleGenerateNextGame(court.id)} className="bg-[#3b82f6] text-white font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[100px] hover:bg-blue-500 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.start}</button>
                                                    <button onClick={() => handleStartDrafting(court.id)} className="bg-yellow-300 text-black font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[100px] hover:bg-yellow-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.manualSetup}</button>
                                                </div>
                                            )}
                                            {court.status === 'drafting' && userRole === 'host' && (
                                                <div className="flex flex-col gap-1 items-center">
                                                    <button onClick={() => handleStartManualMatch(court.id)} className={`font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[100px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all ${court.players.length === neededPlayers ? 'bg-green-400 text-black' : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'}`}>{t.draftStart}</button>
                                                    <button onClick={() => handleCancelDrafting(court.id)} className="bg-white text-black font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[100px] hover:bg-red-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.draftCancel}</button>
                                                </div>
                                            )}
                                            {court.status === 'active' && userRole === 'host' && (
                                                <div className="flex flex-col gap-1 items-center justify-center">
                                                    <button onClick={() => handleFinishMatch(court.id)} className="bg-yellow-400 font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[120px] hover:bg-yellow-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.finishMatch}</button>
                                                    <button onClick={() => handleMatchResult(court.id, 0)} className="w-[120px] bg-gray-100 text-red-500 rounded py-1 mt-1 text-[9px] font-bold border border-gray-300 hover:bg-red-100">{t.cancelMatch}</button>
                                                </div>
                                            )}
                                            {court.status === 'scoring' && settings.trackMatchResults && userRole === 'host' && (
                                                <div className="flex flex-col gap-1 items-center justify-center w-[150px]">
                                                    <div className="flex gap-1 w-full">
                                                        <button onClick={() => handleMatchResult(court.id, 1)} className="flex-1 bg-blue-600 text-white text-[9px] font-black py-1.5 border-2 border-black shadow-[1px_1px_0_0_#000] hover:bg-blue-500 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">{t.team1Win}</button>
                                                        <button onClick={() => handleMatchResult(court.id, 2)} className="flex-1 bg-red-500 text-white text-[9px] font-black py-1.5 border-2 border-black shadow-[1px_1px_0_0_#000] hover:bg-red-400 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">{t.team2Win}</button>
                                                    </div>
                                                    <button onClick={() => handleMatchResult(court.id, 0)} className="w-full bg-gray-100 text-gray-500 rounded py-1 mt-1 text-[9px] font-bold border border-gray-300 hover:bg-gray-200">{t.cancelResult}</button>
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
                <div className="max-w-6xl mx-auto w-full bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 mb-4">
                        <div className="flex items-center gap-3 mb-2 md:mb-0">
                            <h2 className="text-xl font-black uppercase">{t.members} ({players.length})</h2>
                            <span className="bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full text-xs border border-green-300">{players.filter(p => p.status !== 'break').length} {t.active}</span>
                        </div>
                        {userRole === 'host' && <button onClick={handleRemoveAllPlayers} className="text-red-500 hover:text-red-700 font-bold text-sm flex items-center"><i className="fa-solid fa-trash-can mr-1"></i> {t.deleteAll}</button>}
                    </div>

                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setPlayerFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-bold border ${playerFilter==='all' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>{t.all} ({players.length})</button>
                            <button onClick={() => setPlayerFilter('waiting')} className={`px-4 py-1.5 rounded-full text-xs font-bold border ${playerFilter==='waiting' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>{t.waiting} ({players.filter(p=>p.status==='waiting').length})</button>
                            <button onClick={() => setPlayerFilter('playing')} className={`px-4 py-1.5 rounded-full text-xs font-bold border ${playerFilter==='playing' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>{t.playing} ({players.filter(p=>p.status==='playing').length})</button>
                            <button onClick={() => setPlayerFilter('break')} className={`px-4 py-1.5 rounded-full text-xs font-bold border ${playerFilter==='break' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>{t.onBreak} ({players.filter(p=>p.status==='break').length})</button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-arrow-down-short-wide text-gray-400"></i><span className="text-sm font-bold text-gray-500">{t.sortBy}</span>
                            <select value={sortOption} onChange={e => setSortOption(e.target.value as "status" | "name" | "games")} className="border-2 border-black rounded px-3 py-1 text-sm font-bold outline-none cursor-pointer">
                                <option value="status">{t.sortStatus}</option><option value="name">{t.sortName}</option><option value="games">{t.sortGames}</option>
                            </select>
                        </div>
                    </div>

                    {userRole === 'host' && (
                        <div className="flex flex-col gap-3 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <div className="flex flex-col md:flex-row gap-2">
                                <input type="text" className="neo-input text-sm flex-1 bg-white" placeholder={t.playerNamePlaceholder} value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} />
                                <div className="flex gap-2 w-full md:w-auto">
                                    <select className="neo-input text-sm bg-white cursor-pointer w-auto flex-1 md:flex-none" value={newPlayerSkill} onChange={e => setNewPlayerSkill(e.target.value as SkillLevel)}>
                                        {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
                                    </select>
                                    <button onClick={handleAddPlayer} className="bg-[#fcd34d] border-2 border-black w-10 flex items-center justify-center font-black text-lg hover:bg-[#fbbf24]">+</button>
                                </div>
                            </div>
                            {/* CHỌN GIỚI TÍNH BÊN HOST - TAB NGƯỜI CHƠI */}
                            <div className="flex gap-2 max-w-[200px]">
                                <button onClick={() => setNewPlayerGender('M')} className={`flex-1 border-[3px] border-black p-1.5 text-xs font-black uppercase transition-all flex items-center justify-center gap-1 ${newPlayerGender === 'M' ? 'bg-blue-300 shadow-[2px_2px_0_0_#000]' : 'bg-gray-100 hover:bg-gray-200'}`}><span className="text-blue-600 text-sm">♂</span> {t.male}</button>
                                <button onClick={() => setNewPlayerGender('F')} className={`flex-1 border-[3px] border-black p-1.5 text-xs font-black uppercase transition-all flex items-center justify-center gap-1 ${newPlayerGender === 'F' ? 'bg-pink-300 shadow-[2px_2px_0_0_#000]' : 'bg-gray-100 hover:bg-gray-200'}`}><span className="text-pink-500 text-sm">♀</span> {t.female}</button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {filteredPlayers.map(p => (
                            <div key={p.id} className={`bg-white rounded-lg p-3 flex flex-col justify-between border-[3px] transition-all ${p.status === 'playing' ? 'border-green-500 bg-green-50' : 'border-black'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex gap-1 items-center">
                                        <span className="bg-[#fcd34d] text-black text-[10px] font-bold px-1.5 py-0.5 border border-black rounded-[4px]">{tSkill(p.skill)}</span>
                                        <span className="bg-gray-200 text-gray-500 text-[10px] font-bold px-1.5 py-0.5 border border-gray-300 rounded-[4px]">{p.playCount}G</span>
                                    </div>
                                    {userRole === 'host' && (
                                        <div className="flex gap-2 text-gray-400 text-xs">
                                            <i className={`fa-solid fa-mug-hot cursor-pointer ${p.status === 'break' ? 'text-black' : 'hover:text-black'}`} title={t.onBreak} onClick={() => handleToggleBreak(p)}></i>
                                            <i className={`fa-solid fa-link cursor-pointer text-[10px] ${p.partnerId ? 'text-green-500' : linkingPlayerId === p.id ? 'text-blue-500 animate-pulse' : 'hover:text-black'}`} title={p.partnerId ? t.linkCancel : linkingPlayerId === p.id ? t.linking : t.linkFixed} onClick={() => handleLinkClick(p.id)}></i>
                                            <i className="fa-regular fa-trash-can hover:text-red-500 cursor-pointer" onClick={() => handleRemovePlayer(p.id)}></i>
                                        </div>
                                    )}
                                </div>
                                <div className="font-black text-[15px] truncate mt-1 text-gray-800 flex items-center flex-wrap gap-1">
                                    {p.name} {renderGenderIcon(p.gender)}
                                    {p.status === 'playing' && <span className="text-[10px] text-green-600 ml-1 italic">({t.playing})</span>}
                                    {p.partnerId && partnerNames[p.partnerId] !== undefined && (
                                        <span className="text-[9px] text-green-700 bg-green-100 border border-green-400 px-1 rounded flex items-center gap-1 cursor-pointer hover:bg-red-100 hover:text-red-600 hover:border-red-400" title={t.linkCancel} onClick={() => {if(userRole==='host') handleLinkClick(p.id)}}>
                                            <i className="fa-solid fa-link text-[8px]"></i> {partnerNames[p.partnerId]}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                        {filteredPlayers.length === 0 && <div className="col-span-full text-center py-10 text-gray-400 font-bold">{t.noPlayers}</div>}
                    </div>
                </div>
            )}

            {/* TAB: XẾP HẠNG (RANKING) */}
            {activeTab === "ranking" && (
               <div className="max-w-2xl mx-auto w-full">
                   <div className="bg-white neo-border neo-shadow p-6">
                        <div className="flex items-center gap-3 mb-6 border-b pb-4">
                            <i className="fa-solid fa-trophy text-yellow-400 text-3xl text-stroke-1"></i><h2 className="text-2xl font-black uppercase tracking-tight">{t.leaderboard}</h2>
                        </div>
                        {players.filter(p => p.playCount > 0).length === 0 ? (
                            <p className="text-center font-bold text-gray-500 py-10">{t.noMatchResults}</p>
                        ) : (
                            <div className="space-y-2">
                                {[...players].filter(p => p.playCount > 0).sort((a, b) => b.wins - a.wins || a.playCount - b.playCount).map((p, index) => (
                                    <div key={p.id} className="flex justify-between items-center bg-gray-50 p-3 neo-border">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black border-2 border-black ${index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-gray-300' : index === 2 ? 'bg-[#cd7f32] text-white' : 'bg-white'}`}>{index + 1}</div>
                                            <div>
                                                <div className="font-black text-sm flex items-center">{p.name} {renderGenderIcon(p.gender)}</div>
                                                <div className="text-[10px] uppercase font-bold text-gray-500">{tSkill(p.skill)}</div>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-4">
                                            <div className="flex flex-col items-center"><span className="text-xs font-bold text-gray-500">{t.matchLabel}</span><span className="font-black">{p.playCount}</span></div>
                                            <div className="flex flex-col items-center"><span className="text-xs font-bold text-yellow-600">{t.winLabel}</span><span className="font-black text-lg text-yellow-500">{p.wins}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                   </div>
               </div>
            )}

            {/* TAB: CÀI ĐẶT (SETTINGS) */}
            {activeTab === "settings" && (
               <div className="max-w-[420px] mx-auto w-full space-y-5">
                   {userRole === 'guest' ? (
                       <div className="bg-yellow-50 border-[3px] border-yellow-500 p-6 text-center shadow-[4px_4px_0_0_#ca8a04]">
                           <i className="fa-solid fa-lock text-3xl text-yellow-500 mb-2"></i>
                           <h3 className="font-black text-lg text-yellow-700">{t.guestSettingsWarning}</h3>
                           <p className="text-xs font-bold text-yellow-600 mt-2">{t.guestSettingsDesc}</p>
                       </div>
                   ) : (
                    <>
                  <div className="bg-white border-[3px] border-black flex flex-col mt-4">
                      <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider">{t.gameSettings}</div>
                      <div className="p-4 space-y-4">
                          <div><label className="text-[10px] font-black uppercase mb-1 block">{t.eventName}</label><input type="text" className="neo-input text-xs font-bold w-full p-2 border-2 border-black" value={settings.eventName} onChange={(e) => updateSetting('eventName', e.target.value)} /></div>
                          <div>
                              <label className="text-[10px] font-black uppercase mb-1 block">{t.totalCourts}</label>
                              <div className="flex items-center gap-2"><button onClick={() => updateSetting('totalCourts', Math.max(1, settings.totalCourts - 1))} className="bg-[#fcd34d] border-2 border-black w-6 h-6 flex justify-center items-center font-black text-xs">-</button><span className="font-black text-sm w-4 text-center">{settings.totalCourts}</span><button onClick={() => updateSetting('totalCourts', settings.totalCourts + 1)} className="bg-[#fcd34d] border-2 border-black w-6 h-6 flex justify-center items-center font-black text-xs">+</button></div>
                          </div>
                          <div>
                              <label className="text-[10px] font-black uppercase mb-1 block">{t.layout}</label>
                              <div className="flex items-center text-[10px] font-black gap-2">
                                  <span>{t.cols}</span><span className="text-base mx-1">{settings.layoutCols}</span>
                                  <div className="flex flex-col"><button onClick={() => updateSetting('layoutCols', settings.layoutCols + 1)} className="bg-[#fcd34d] border-2 border-black border-b w-4 h-[12px] flex justify-center items-center leading-none text-[8px]">+</button><button onClick={() => updateSetting('layoutCols', Math.max(1, settings.layoutCols - 1))} className="bg-[#fcd34d] border-2 border-black w-4 h-[12px] flex justify-center items-center leading-none text-[8px]">-</button></div>
                                  <span className="mx-2 font-normal text-gray-500">x</span>
                                  <span>{t.rows}</span><span className="text-base mx-1">{settings.layoutRows}</span>
                                  <div className="flex flex-col"><button onClick={() => updateSetting('layoutRows', settings.layoutRows + 1)} className="bg-[#fcd34d] border-2 border-black border-b w-4 h-[12px] flex justify-center items-center leading-none text-[8px]">+</button><button onClick={() => updateSetting('layoutRows', Math.max(1, settings.layoutRows - 1))} className="bg-[#fcd34d] border-2 border-black w-4 h-[12px] flex justify-center items-center leading-none text-[8px]">-</button></div>
                              </div>
                              <p className="text-[9px] text-gray-400 font-bold mt-1">{settings.layoutCols * settings.layoutRows} {t.cells} / {settings.totalCourts} {t.courtsTxt}</p>
                          </div>
                          <hr className="border-t-[2px] border-dashed border-gray-300" />
                          <div>
                              <label className="text-[10px] font-black uppercase mb-1 block">{t.shuffleMode}</label>
                              <select className="neo-input text-xs font-bold bg-white w-full border-2 border-black p-1.5" value={settings.shuffleMode} onChange={(e) => handleShuffleModeChange(e.target.value as ShuffleMode)}>
                                  <option value="Equal Rotation">{t.shuffleModes["Equal Rotation"]}</option><option value="Skill Based">{t.shuffleModes["Skill Based"]}</option><option value="Social Mix">{t.shuffleModes["Social Mix"]}</option><option value="Fixed Pairs">{t.shuffleModes["Fixed Pairs"]}</option><option value="Manual">{t.shuffleModes["Manual"]}</option>
                              </select>
                              <p className="text-[8px] text-gray-400 font-bold mt-1">{t.shuffleDescs[settings.shuffleMode]}</p>
                          </div>
                          <hr className="border-t-[2px] border-dashed border-gray-300" />
                          <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsWeightsExpanded(!isWeightsExpanded)}>
                              <label className="text-[10px] font-black uppercase cursor-pointer">{t.shuffleWeights}</label><i className={`fa-solid fa-chevron-${isWeightsExpanded ? 'up' : 'down'} text-[10px]`}></i>
                          </div>
                          {isWeightsExpanded && (
                            <div className="space-y-4 mt-2">
                              {[
                                { id: 'playCountFairness', label: t.weights.playCountFairness }, { id: 'waitTimePriority', label: t.weights.waitTimePriority },
                                { id: 'avoidSamePartner', label: t.weights.avoidSamePartner }, { id: 'avoidSameOpponents', label: t.weights.avoidSameOpponents },
                                { id: 'skillBalance', label: t.weights.skillBalance }, { id: 'keepPreviousPair', label: t.weights.keepPreviousPair },
                              ].map((w) => (
                                <div key={w.id}>
                                    <div className="flex justify-between text-[9px] font-bold mb-1"><span>{w.label}</span><span>{settings.weights[w.id as keyof GameSettings['weights']]}</span></div>
                                    <input type="range" disabled={settings.shuffleMode !== 'Manual'} className={`w-full h-1 rounded-lg appearance-none outline-none ${settings.shuffleMode === 'Manual' ? 'bg-black cursor-pointer' : 'bg-gray-300 cursor-not-allowed opacity-50'}`} min="0" max="100" value={settings.weights[w.id as keyof GameSettings['weights']]} onChange={(e) => updateWeight(w.id as keyof GameSettings['weights'], parseInt(e.target.value))} />
                                </div>
                              ))}
                            </div>
                          )}
                          <hr className="border-t-[2px] border-dashed border-gray-300" />
                          <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase">{t.trackResults}</label>
                              <div className={`w-8 h-4 border-2 border-black rounded-full relative cursor-pointer ${settings.trackMatchResults ? 'bg-yellow-400' : 'bg-gray-200'}`} onClick={() => updateSetting('trackMatchResults', !settings.trackMatchResults)}>
                                  <div className={`w-3 h-3 bg-black rounded-full absolute top-0.5 transition-all ${settings.trackMatchResults ? 'left-[16px]' : 'left-0.5'}`}></div>
                              </div>
                          </div>
                          
                          <button onClick={handleApplySettings} className="w-full bg-[#fcd34d] border-[2px] border-black py-2.5 text-[11px] font-black uppercase shadow-[2px_2px_0_0_#000] hover:bg-[#fbbf24] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all flex items-center justify-center gap-2 mt-4">
                              <i className="fa-solid fa-cloud-arrow-up"></i> {t.applyChanges}
                          </button>
                      </div>
                  </div>

                  <div className="bg-white border-[3px] border-black flex flex-col">
                      <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider">{t.addPlayersMenu}</div>
                      <div className="p-4 space-y-4">
                          <div>
                              <label className="text-[10px] font-black uppercase mb-1 block">{t.sortName}</label>
                              <input type="text" className="w-full border-2 border-black p-1.5 text-xs font-bold focus:outline-none focus:border-[3px] mb-2" placeholder={t.playerNamePlaceholder} value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} />
                              
                              {/* CHỌN GIỚI TÍNH BÊN HOST - TAB CÀI ĐẶT */}
                              <div className="flex gap-2 mb-2">
                                  <button onClick={() => setNewPlayerGender('M')} className={`flex-1 border-[3px] border-black p-1.5 text-xs font-black uppercase transition-all flex justify-center items-center gap-1 ${newPlayerGender === 'M' ? 'bg-blue-300 shadow-[2px_2px_0_0_#000]' : 'bg-gray-100 hover:bg-gray-200'}`}><span className="text-blue-600 text-sm">♂</span> {t.male}</button>
                                  <button onClick={() => setNewPlayerGender('F')} className={`flex-1 border-[3px] border-black p-1.5 text-xs font-black uppercase transition-all flex justify-center items-center gap-1 ${newPlayerGender === 'F' ? 'bg-pink-300 shadow-[2px_2px_0_0_#000]' : 'bg-gray-100 hover:bg-gray-200'}`}><span className="text-pink-500 text-sm">♀</span> {t.female}</button>
                              </div>
                          </div>

                          <div className="flex gap-2">
                              <select className="flex-1 border-2 border-black p-1.5 text-xs font-bold bg-white cursor-pointer" value={newPlayerSkill} onChange={e => setNewPlayerSkill(e.target.value as SkillLevel)}>
                                  {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
                              </select>
                              <button onClick={handleAddPlayer} className="bg-[#fcd34d] border-2 border-black w-8 flex items-center justify-center font-black text-lg hover:bg-[#fbbf24]">+</button>
                          </div>
                          <button onClick={handleAddGuests} className="w-full bg-white border-2 border-black py-2 text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-gray-50">
                              <i className="fa-solid fa-user-plus"></i> {t.quickAddGuests}
                          </button>
                          <div className="pt-2">
                              <label className="text-[10px] font-black uppercase mb-2 block">{t.navPlayers} ({players.length})</label>
                              <div className="border-2 border-black bg-gray-50 max-h-[180px] overflow-y-auto p-2 space-y-2 relative rounded-xs custom-scrollbar">
                                  {players.map(p => (
                                      <div key={p.id} className="border-2 border-black p-2 flex justify-between items-center bg-white rounded-md shadow-xs">
                                          <div className="flex flex-col">
                                              <div className="flex gap-1 mb-0.5">
                                                  <span className="bg-[#fcd34d] text-[8px] font-black px-1 border border-black rounded-[2px]">{tSkill(p.skill)}</span>
                                                  <span className="bg-gray-100 text-gray-500 text-[8px] font-black px-1 border border-gray-300 rounded-[2px]">{p.playCount}G</span>
                                              </div>
                                              <span className="font-black text-[11px] truncate max-w-[140px]">{p.name} {renderGenderIcon(p.gender)}</span>
                                          </div>
                                          <div className="flex gap-2.5 text-gray-300 pr-1">
                                              <i className="fa-regular fa-trash-can hover:text-red-500 cursor-pointer text-[10px]" onClick={() => handleRemovePlayer(p.id)}></i>
                                          </div>
                                      </div>
                                  ))}
                                  {players.length === 0 && <p className="text-[10px] text-gray-400 font-bold text-center py-4">{t.noPlayers}</p>}
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="bg-white border-[3px] border-black flex flex-col">
                      <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider">{t.resetCountsTitle}</div>
                      <div className="p-4">
                          <p className="text-[9px] font-bold text-gray-500 mb-3 leading-relaxed">{t.resetCountsDesc}</p>
                          <button onClick={handleResetCounts} className="w-full bg-[#fcd34d] border-2 border-black py-2.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_#000] hover:bg-[#fbbf24] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                              {t.resetCountsBtn}
                          </button>
                      </div>
                  </div>

                  <div className="bg-white border-[3px] border-black flex flex-col mb-10">
                      <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 uppercase tracking-wider bg-red-500 text-white">{t.dangerZone}</div>
                      <div className="p-4">
                          <button onClick={handleResetEvent} className="w-full bg-[#ff5e5e] text-white border-2 border-black py-2.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_#000] hover:bg-red-500 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
                              {t.resetEventBtn}
                          </button>
                      </div>
                  </div>
                  </>
                  )}
               </div>
            )}
        </div>
      </div>

      {/* THANH HOÀN TÁC KẾT QUẢ VỪA GHI */}
      {userRole === 'host' && lastResult && (
        <div className="fixed bottom-[152px] left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-md z-[55] bg-black text-white border-[3px] border-black shadow-[4px_4px_0_0_#facc15] flex items-center gap-2 px-3 py-2">
          <span className="flex-1 min-w-0 text-xs font-bold truncate"><i className="fa-solid fa-check text-green-400 mr-1"></i>{t.undoLabel.replace('{court}', String(lastResult.courtId))}: {lastResult.winningTeam === 1 ? t.team1Win : lastResult.winningTeam === 2 ? t.team2Win : lastResult.winningTeam === 0 ? t.cancelMatch : t.undoFinished}</span>
          <button onClick={handleUndoResult} className="shrink-0 bg-yellow-300 text-black border-2 border-white px-2 py-1 text-[11px] font-black uppercase"><i className="fa-solid fa-rotate-left mr-1"></i>{t.undoBtn}</button>
          <button onClick={() => setLastResult(null)} className="shrink-0 text-gray-400 hover:text-white px-1" aria-label="close"><i className="fa-solid fa-xmark"></i></button>
        </div>
      )}

      {/* NÚT TẠO TRẬN MỚI TRÔI */}
      {activeTab === 'courts' && userRole === 'host' && (
          <div className="fixed bottom-24 right-8 flex flex-col gap-3 z-40">
              <button onClick={() => handleGenerateNextGame()} className="bg-[#facc15] border-2 border-black font-black px-6 py-3 rounded-full shadow-[4px_4px_0_0_#000] flex items-center justify-center gap-2 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] transition-all">
                  <i className="fa-solid fa-shuffle"></i> {t.nextGame}
              </button>
          </div>
      )}

      {/* THANH ĐIỀU HƯỚNG BOTTOM */}
      <div className="bg-white border-t-[3px] border-black fixed bottom-0 w-full flex z-50">
        {[
            { id: "courts", icon: "fa-table-cells-large", label: t.navCourts }, 
            { id: "ranking", icon: "fa-trophy", label: t.navRanking }, 
            { id: "players", icon: "fa-users", label: t.navPlayers }, 
            { id: "settings", icon: "fa-gear", label: t.navSettings }
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} className={`flex-1 py-3 flex flex-col items-center transition-all ${activeTab === tab.id ? "bg-yellow-300 border-t-[5px] border-black -mt-[2px]" : "text-gray-500 hover:bg-gray-100"}`}>
            <i className={`fa-solid ${tab.icon} text-xl mb-1 ${activeTab === tab.id ? "text-black" : ""}`}></i>
            <span className={`text-[10px] font-bold uppercase ${activeTab === tab.id ? "text-black" : ""}`}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
// KẾT THÚC FILE