"use client";
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

// --- CÁC KIỂU DỮ LIỆU ---
type SkillLevel = 'Mới chơi' | 'Yếu-' | 'Yếu' | 'Yếu+' | 'Trung bình-' | 'Trung bình' | 'Trung bình+' | 'Khá-' | 'Khá' | 'Khá+';
type ShuffleMode = 'Equal Rotation' | 'Skill Based' | 'Social Mix' | 'Fixed Pairs' | 'Manual';
type PlayerStatus = 'waiting' | 'playing' | 'break';
type UserRole = 'host' | 'guest';

interface Player {
  id: string;
  name: string;
  skill: SkillLevel;
  playCount: number;
  wins: number;
  status: PlayerStatus;
  partnerId?: string; 
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

interface Court {
  id: number;
  status: 'available' | 'drafting' | 'active' | 'scoring'; 
  players: Player[];
  matchType: '1v1' | '1v2' | '2v2';
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
    gameSettings: "Cài đặt trận đấu",
    eventName: "Tên sự kiện",
    totalCourts: "Tổng số sân",
    layout: "Bố cục",
    cols: "Cột",
    rows: "Hàng",
    cells: "ô",
    courtsTxt: "sân",
    shuffleMode: "Chế độ trộn",
    shuffleModes: { "Equal Rotation": "Xoay vòng đều", "Skill Based": "Dựa trên kỹ năng", "Social Mix": "Trộn xã hội", "Fixed Pairs": "Cặp cố định", "Manual": "Thủ công" },
    shuffleDesc: "Ưu tiên sự công bằng về số trận và thời gian chờ.",
    shuffleWeights: "Trọng số xếp trận",
    weights: { playCountFairness: "Công bằng số trận", waitTimePriority: "Ưu tiên thời gian chờ", avoidSamePartner: "Tránh trùng đồng đội", avoidSameOpponents: "Tránh trùng đối thủ", skillBalance: "Cân bằng kỹ năng", keepPreviousPair: "Giữ cặp trận trước" },
    trackResults: "Ghi nhận điểm số (Thắng/Thua)",
    applyChanges: "LƯU TRÊN CLOUD",
    addPlayersMenu: "Thêm người chơi",
    resetCountsTitle: "Đặt lại số trận?",
    resetCountsDesc: "Bắt đầu phiên mới bằng cách đặt lại số trận, thứ tự chờ và lịch sử ghép cặp. Các sân sẽ bị xóa và bộ đếm thời gian dừng lại. Thành viên, cặp cố định, trạng thái nghỉ, cài đặt sân và kết quả đã lưu sẽ được giữ nguyên.",
    resetCountsBtn: "Đặt lại số trận",
    dangerZone: "Khu vực nguy hiểm",
    resetEventBtn: "Đóng Phòng (Xóa Cloud)",
    alertCourtFull: "Đang full sân!",
    alertNotEnoughPlayers: "Không đủ {n} người chờ để xếp trận {type}! (Đang có {m} người rảnh)",
    alertNeedPlayers: "Vui lòng chọn đủ {n} người chơi!",
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
    sidebar: {
      login: "Đăng nhập",
      loginDesc: "Lưu trữ thành viên và số liệu thống kê lên đám mây.",
      exitRoom: "Thoát phòng",
      exitRoomDesc: "Quay lại màn hình chính",
      scrollTop: "Trở lại đầu trang",
      scrollTopDesc: "Quay lại màn hình tiêu đề",
      contact: "Liên hệ với chúng tôi",
      contactDesc: "Hãy liên hệ với chúng tôi",
      share: "Chia sẻ",
      shareDesc: "Chia sẻ ứng dụng với bạn bè",
      terms: "Điều khoản dịch vụ",
      privacy: "Chính sách bảo mật",
      version: "Phiên bản 2.1 (Auto QR Host)"
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
    gameSettings: "Game Settings",
    eventName: "Event Name",
    totalCourts: "Total Courts",
    layout: "Layout",
    cols: "Cols",
    rows: "Rows",
    cells: "cells",
    courtsTxt: "courts",
    shuffleMode: "Shuffle Mode",
    shuffleModes: { "Equal Rotation": "Equal Rotation", "Skill Based": "Skill Based", "Social Mix": "Social Mix", "Fixed Pairs": "Fixed Pairs", "Manual": "Manual" },
    shuffleDesc: "Prioritizes fairness in play counts and wait times.",
    shuffleWeights: "Shuffle Weights",
    weights: { playCountFairness: "Play count fairness", waitTimePriority: "Wait time priority", avoidSamePartner: "Avoid same partner", avoidSameOpponents: "Avoid same opponents", skillBalance: "Skill balance", keepPreviousPair: "Keep previous pair" },
    trackResults: "Track Match Results (Win/Loss)",
    applyChanges: "SAVE TO CLOUD",
    addPlayersMenu: "Add Players",
    resetCountsTitle: "Reset Game Counts?",
    resetCountsDesc: "Start a new session by resetting game counts, waiting order, and pairing history. Courts will be cleared and the timer stopped. Members, fixed pairs, break status, court settings, and recorded results will be kept.",
    resetCountsBtn: "Reset game counts",
    dangerZone: "Danger Zone",
    resetEventBtn: "Close Room (Wipe Cloud)",
    alertCourtFull: "Courts are full!",
    alertNotEnoughPlayers: "Not enough {n} waiting players for {type} match! ({m} available)",
    alertNeedPlayers: "Please select {n} players!",
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
    sidebar: {
      login: "Login",
      loginDesc: "Save members and statistics to the cloud.",
      exitRoom: "Exit Room",
      exitRoomDesc: "Return to the main screen",
      scrollTop: "Return to Title",
      scrollTopDesc: "Go back to the launcher screen",
      contact: "Contact Us",
      contactDesc: "Get in touch with our team",
      share: "Share",
      shareDesc: "Share the app with friends",
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      version: "Version 2.1 (Auto QR Host)"
    }
  }
};

const skillEnMap: Record<SkillLevel, string> = {
  'Mới chơi': 'Beginner', 'Yếu-': 'Weak-', 'Yếu': 'Weak', 'Yếu+': 'Weak+',
  'Trung bình-': 'Average-', 'Trung bình': 'Average', 'Trung bình+': 'Average+',
  'Khá-': 'Good-', 'Khá': 'Good', 'Khá+': 'Good+'
};
const ALL_SKILLS: SkillLevel[] = ['Mới chơi', 'Yếu-', 'Yếu', 'Yếu+', 'Trung bình-', 'Trung bình', 'Trung bình+', 'Khá-', 'Khá', 'Khá+'];

// Hàm sinh ID cứng thay thế Date.now() để tránh trùng lặp
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<"launcher" | "role_select" | "host_setup" | "guest_join" | "app">("launcher");
  const [activeTab, setActiveTab] = useState<"courts" | "ranking" | "players" | "settings">("courts");

  const [lang, setLang] = useState<"VI" | "EN">("VI");
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  
  const t = dict[lang]; 
  const tSkill = (s: SkillLevel) => lang === "VI" ? s : skillEnMap[s];

  // Role & Room States
  const [userRole, setUserRole] = useState<UserRole>('host');
  const [roomPin, setRoomPin] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [guestSkill, setGuestSkill] = useState<SkillLevel>("Trung bình");

  // View States
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Data States
  const [players, setPlayers] = useState<Player[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [settings, setSettings] = useState<GameSettings>({
    eventName: "Saturday Training",
    totalCourts: 4,
    layoutCols: 2,
    layoutRows: 2,
    shuffleMode: "Manual",
    trackMatchResults: true,
    weights: {
      playCountFairness: 100, waitTimePriority: 80, avoidSamePartner: 70, 
      avoidSameOpponents: 55, skillBalance: 0, keepPreviousPair: 0,
    }
  });

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerSkill, setNewPlayerSkill] = useState<SkillLevel>("Trung bình");
  const [playerFilter, setPlayerFilter] = useState<"all" | "waiting" | "playing" | "break">("all");
  const [sortOption, setSortOption] = useState<"status" | "name" | "games">("status");
  const [isWeightsExpanded, setIsWeightsExpanded] = useState(true);
  const [linkingPlayerId, setLinkingPlayerId] = useState<string | null>(null); 
  const [isHostInitialized, setIsHostInitialized] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Lưu host URL gốc để sinh mã QR động
  const [hostUrl, setHostUrl] = useState<string>("");

  useEffect(() => {
    // Tự động quét lấy đường link gốc của trình duyệt (ví dụ http://192.168.1.10:3000 hoặc link Vercel)
    if (typeof window !== "undefined") {
        setHostUrl(window.location.origin);
    }
  }, []);

  // ĐỒNG BỘ CỤC BỘ KHỞI TẠO SÂN THEO SETTING
  useEffect(() => {
    setCourts(prev => {
      if (prev.length === settings.totalCourts) return prev;
      const newCourts = [...prev];
      while (newCourts.length < settings.totalCourts) {
          newCourts.push({ id: newCourts.length + 1, status: 'available', players: [], matchType: '2v2' });
      }
      if (newCourts.length > settings.totalCourts) newCourts.length = settings.totalCourts;
      return newCourts;
    });
  }, [settings.totalCourts]);

  // LẮNG NGHE SUPABASE REALTIME
  useEffect(() => {
    if (!roomPin || currentScreen !== 'app') return;

    // Fetch dữ liệu ban đầu
    const fetchRoom = async () => {
        const { data, error } = await supabase.from('rooms').select('*').eq('id', roomPin).single();
        if (data) {
            setPlayers(data.players || []);
            setCourts(data.courts || []);
            if (userRole === 'guest') setSettings(data.settings || settings);
            else if (!isHostInitialized) { setSettings(data.settings || settings); setIsHostInitialized(true); }
        }
    };
    fetchRoom();

    // Subscribe lắng nghe thay đổi
    const channel = supabase.channel(`room_${roomPin}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomPin}` }, 
      (payload: any) => {
          const newData = payload.new;
          if(newData) {
              setPlayers(newData.players || []);
              setCourts(newData.courts || []);
              if (userRole === 'guest') setSettings(newData.settings || settings);
          } else if (payload.eventType === 'DELETE') {
              alert("Phòng đã bị chủ sân đóng!");
              setCurrentScreen('launcher');
          }
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomPin, currentScreen, userRole, isHostInitialized]);

  // HÀM ĐẨY DATA LÊN SUPABASE
  const syncData = async (newPlayers: Player[], newCourts: Court[], newSettings?: GameSettings) => {
      if (!roomPin) return;
      try {
          const updatePayload: any = { players: newPlayers, courts: newCourts };
          if (newSettings) updatePayload.settings = newSettings;
          await supabase.from('rooms').update(updatePayload).eq('id', roomPin);
      } catch (e) { console.error("Lỗi đồng bộ Supabase:", e); }
  };

  const generateRoomPin = () => Math.floor(100000 + Math.random() * 900000).toString();

  const handleCreateRoom = async () => {
    try {
        const { data: authData } = await supabase.auth.signInAnonymously();
        if (!authData?.user) throw new Error("Chưa bật Anonymous Login trong Supabase!");
        
        const pin = generateRoomPin();
        const initialCourts = Array.from({length: settings.totalCourts}, (_, i) => ({ id: i + 1, status: 'available', players: [], matchType: '2v2' })) as Court[];
        
        const { error } = await supabase.from('rooms').insert([{
            id: pin,
            host_id: authData.user.id,
            settings: settings,
            players: [],
            courts: initialCourts
        }]);

        if (error) throw error;
        
        setUserRole('host');
        setRoomPin(pin);
        setCurrentScreen('host_setup');
    } catch (err: any) {
        console.error(err);
        alert("Lỗi tạo phòng! Đảm bảo bạn đã chạy mã SQL và bật Anonymous Login trên Supabase. Chi tiết: " + err.message);
    }
  };

  const handleJoinRoom = async () => {
    if (guestName.trim() === "" || roomPin.trim() === "") { alert(t.alertNeedPlayers.replace('{n}', '1')); return; }
    try {
        const { data: roomData, error } = await supabase.from('rooms').select('*').eq('id', roomPin.trim()).single();
        if (error || !roomData) { alert("Mã phòng không tồn tại hoặc đã bị đóng!"); return; }

        const { data: authData } = await supabase.auth.signInAnonymously();
        
        // Sử dụng UUID để tránh trùng lặp
        const newGuest: Player = { id: authData?.user?.id || generateUUID(), name: guestName.trim(), skill: guestSkill, playCount: 0, wins: 0, status: 'waiting' };
        
        const newPlayers = [...(roomData.players || []), newGuest];
        await supabase.from('rooms').update({ players: newPlayers }).eq('id', roomPin.trim());
        
        setRoomPin(roomPin.trim());
        setUserRole('guest');
        setCurrentScreen('app');
        setActiveTab('players');
    } catch (err: any) { console.error(err); alert("Lỗi tham gia phòng: " + err.message); }
  };

  const handleExitRoom = () => {
      setRoomPin("");
      setIsSidebarOpen(false);
      setIsHostInitialized(false);
      setCurrentScreen('launcher');
  };

  // --- CÁC HÀM XỬ LÝ (HOST) ---
  const handleAddPlayer = () => {
    if (newPlayerName.trim() === "") return;
    const newPlayer: Player = { id: generateUUID(), name: newPlayerName.trim(), skill: newPlayerSkill, playCount: 0, wins: 0, status: 'waiting' };
    syncData([...players, newPlayer], courts);
    setNewPlayerName("");
  };

  const handleAddGuests = () => {
    const guests = Array.from({ length: 8 }, (_, i) => ({
      id: generateUUID(), name: `${t.guestPrefix} ${players.length + i + 1}`, skill: 'Trung bình' as SkillLevel, playCount: 0, wins: 0, status: 'waiting' as PlayerStatus
    }));
    syncData([...players, ...guests], courts);
  };

  const handleRemovePlayer = (id: string) => {
      const newPlayers = players.filter(p => p.id !== id).map(p => {
          if (p.partnerId === id) return { ...p, partnerId: undefined }; 
          return p;
      });
      syncData(newPlayers, courts);
  };
  
  const handleRemoveAllPlayers = () => { 
      if(confirm(t.confirmDeleteAll)) {
          const newCourts = courts.map(c => ({...c, status: 'available' as const, players: []}));
          syncData([], newCourts);
      }
  };

  const handleLinkClick = (playerId: string) => {
    if (userRole === 'guest') return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    if (player.partnerId) { 
        const newPlayers = players.map(p => {
            if (p.id === playerId || p.id === player.partnerId) return { ...p, partnerId: undefined };
            return p;
        });
        syncData(newPlayers, courts);
        if (linkingPlayerId === playerId) setLinkingPlayerId(null);
        return;
    }

    if (linkingPlayerId) { 
        if (linkingPlayerId === playerId) setLinkingPlayerId(null); 
        else {
            const newPlayers = players.map(p => { 
                if (p.id === playerId) return { ...p, partnerId: linkingPlayerId };
                if (p.id === linkingPlayerId) return { ...p, partnerId: playerId };
                return p;
            });
            syncData(newPlayers, courts);
            setLinkingPlayerId(null);
        }
    } else setLinkingPlayerId(playerId); 
  };

  function updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]) { setSettings(prev => ({ ...prev, [key]: value })); }

  const updateWeight = (key: keyof GameSettings['weights'], value: number) => { setSettings(prev => ({ ...prev, weights: { ...prev.weights, [key]: value } })); }

  const handleApplySettings = () => {
      let newCourts = [...courts];
      if (settings.totalCourts > courts.length) {
          while (newCourts.length < settings.totalCourts) newCourts.push({ id: newCourts.length + 1, status: 'available', players: [], matchType: '2v2' });
      } else if (settings.totalCourts < courts.length) newCourts.length = settings.totalCourts;
      syncData(players, newCourts, settings);
  };
  
  const handleChangeMatchType = (courtId: number, type: '1v1' | '1v2' | '2v2') => {
      if(userRole === 'guest') return; 
      const newCourts = courts.map(c => {
          if (c.id === courtId) return { ...c, matchType: type, players: c.status === 'drafting' ? [] : c.players };
          return c;
      });
      syncData(players, newCourts);
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

  const handleGenerateNextGame = (specificCourtId?: number) => {
    if(userRole === 'guest') return;
    const courtIndex = specificCourtId ? courts.findIndex(c => c.id === specificCourtId) : courts.findIndex(c => c.status === 'available');
    if (courtIndex === -1) { alert(t.alertCourtFull); return; }

    const courtToFill = courts[courtIndex];
    const neededPlayers = courtToFill.matchType === '1v1' ? 2 : courtToFill.matchType === '1v2' ? 3 : 4;
    const availablePlayers = players.filter(p => p.status === 'waiting');
    
    if (availablePlayers.length < neededPlayers) { alert(t.alertNotEnoughPlayers.replace('{n}', neededPlayers.toString()).replace('{type}', courtToFill.matchType).replace('{m}', availablePlayers.length.toString())); return; }

    const sortedPlayers = [...availablePlayers].sort((a, b) => a.playCount - b.playCount);
    const waitingPairs: Player[][] = [];
    const waitingSolos: Player[] = [];
    const processedIds = new Set<string>();

    for (const p of sortedPlayers) {
        if (processedIds.has(p.id)) continue;
        if (p.partnerId) {
            const partner = sortedPlayers.find(sp => sp.id === p.partnerId);
            if (partner) {
                waitingPairs.push([p, partner]);
                processedIds.add(p.id); processedIds.add(partner.id);
                continue;
            }
        }
        waitingSolos.push(p);
        processedIds.add(p.id);
    }

    const team1Size = courtToFill.matchType === '2v2' ? 2 : 1;
    const team2Size = courtToFill.matchType === '1v1' ? 1 : 2;
    const team1: Player[] = [];
    const team2: Player[] = [];

    const fillTeam = (team: Player[], size: number) => {
        while (team.length < size) {
            const slotsLeft = size - team.length;
            if (slotsLeft >= 2 && waitingPairs.length > 0) team.push(...waitingPairs.shift()!); 
            else if (waitingSolos.length > 0) team.push(waitingSolos.shift()!); 
            else if (waitingPairs.length > 0) {
                const pair = waitingPairs.shift()!;
                team.push(pair[0]); 
                waitingSolos.unshift(pair[1]);
            } else break;
        }
    };

    fillTeam(team1, team1Size); fillTeam(team2, team2Size);
    const selectedPlayers = [...team1, ...team2];

    const updatedCourts = [...courts];
    updatedCourts[courtIndex] = { ...updatedCourts[courtIndex], status: 'active', players: selectedPlayers };
    
    const updatedPlayers = players.map(p => selectedPlayers.find(sp => sp.id === p.id) ? { ...p, status: 'playing' as PlayerStatus } : p);
    syncData(updatedPlayers, updatedCourts);
  };

  const handleStartDrafting = (courtId: number) => {
    if(userRole === 'guest') return;
    const newCourts = courts.map(c => c.id === courtId ? { ...c, status: 'drafting' as const, players: [] } : c);
    syncData(players, newCourts);
  };

  const handleCancelDrafting = (courtId: number) => {
    if(userRole === 'guest') return;
    const newCourts = courts.map(c => c.id === courtId ? { ...c, status: 'available' as const, players: [] } : c);
    syncData(players, newCourts);
  };

  const handleToggleDraftPlayer = (courtId: number, player: Player) => {
    if(userRole === 'guest') return;
    const newCourts = courts.map(c => {
        if (c.id !== courtId) return c;
        const isSelected = c.players.some(p => p.id === player.id);
        const maxPlayers = c.matchType === '1v1' ? 2 : c.matchType === '1v2' ? 3 : 4;
        if (isSelected) return { ...c, players: c.players.filter(p => p.id !== player.id) };
        else {
            if (c.players.length < maxPlayers) return { ...c, players: [...c.players, player] };
            return c;
        }
    });
    syncData(players, newCourts);
  };

  const handleStartManualMatch = (courtId: number) => {
    if(userRole === 'guest') return;
    const court = courts.find(c => c.id === courtId);
    if (!court) return;
    const needed = court.matchType === '1v1' ? 2 : court.matchType === '1v2' ? 3 : 4;
    if (court.players.length !== needed) { alert(t.alertNeedPlayers.replace('{n}', needed.toString())); return; }

    const updatedPlayers = players.map(p => court.players.some(sp => sp.id === p.id) ? { ...p, status: 'playing' as PlayerStatus } : p );
    const updatedCourts = courts.map(c => c.id === courtId ? { ...c, status: 'active' as const } : c);
    syncData(updatedPlayers, updatedCourts);
  };

  const handleMatchResult = (courtId: number, winningTeam: 1 | 2 | 0 | -1) => {
    if(userRole === 'guest') return;
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const topCount = court.matchType === '2v2' ? 2 : 1;
    const team1Ids = court.players.slice(0, topCount).map(p => p.id);
    const team2Ids = court.players.slice(topCount).map(p => p.id);

    const updatedPlayers = players.map(p => {
        if (team1Ids.includes(p.id) || team2Ids.includes(p.id)) {
            if (winningTeam === 0) return { ...p, status: 'waiting' as PlayerStatus }; 
            let isWinner = false;
            if (winningTeam === 1 && team1Ids.includes(p.id)) isWinner = true;
            if (winningTeam === 2 && team2Ids.includes(p.id)) isWinner = true;
            return { ...p, status: 'waiting' as PlayerStatus, playCount: p.playCount + 1, wins: p.wins + (isWinner ? 1 : 0) };
        }
        return p;
    });
    const updatedCourts = courts.map(c => c.id === courtId ? { ...c, status: 'available' as const, players: [] } : c);
    syncData(updatedPlayers, updatedCourts);
  };

  const handleResetEvent = async () => {
      if(confirm(t.confirmResetEvent)) {
          if (!roomPin) return;
          try {
              await supabase.from('rooms').delete().eq('id', roomPin);
              setPlayers([]);
              handleExitRoom();
          } catch (e) { console.error(e); }
      }
  };

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
      <div className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden z-10 bg-[#f3f4f6]" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/crumpled-paper.png')" }} onMouseMove={handleMouseMove}>
        <style dangerouslySetInnerHTML={{__html: `@keyframes floatSlow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } } @keyframes floatFast { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-25px); } } .animate-float-slow { animation: floatSlow 6s ease-in-out infinite; } .animate-float-fast { animation: floatFast 4s ease-in-out infinite; }`}} />
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
          <button onClick={() => setCurrentScreen("role_select")} className="bg-yellow-400 border-[3px] border-black text-lg font-black uppercase tracking-widest py-4 px-12 shadow-[6px_6px_0_0_#000] hover:bg-yellow-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
              {t.startBtn} ➔
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN CHỌN VAI TRÒ (MULTI-TENANT)
  // ==========================================
  if (currentScreen === "role_select") {
    return (
      <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/crumpled-paper.png')" }}>
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
    // FIX: Tự động lấy đường link gốc của máy hiện tại để tạo mã QR (Ví dụ: http://192.168.1.10:3000/join/...)
    const linkToJoin = hostUrl ? `${hostUrl}?pin=${roomPin}` : `https://badrally.vercel.app?pin=${roomPin}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkToJoin)}`;

    return (
      <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/crumpled-paper.png')" }}>
         <div className="bg-white border-[4px] border-black p-8 shadow-[8px_8px_0_0_#000] max-w-sm w-full mx-4 flex flex-col items-center gap-6">
            <h2 className="font-black text-xl uppercase text-center border-b-4 border-yellow-400 pb-2">{t.roomCreated}</h2>
            
            <div className="text-center w-full">
                <p className="font-bold text-gray-500 text-xs mb-1">{t.roomPinLabel}</p>
                <div className="font-black text-5xl tracking-[0.2em] text-blue-600 bg-gray-100 py-3 border-2 border-dashed border-black">{roomPin}</div>
            </div>

            <div className="border-4 border-black p-2 bg-white relative">
                <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
                {/* Ẩn link bên dưới mã QR để dễ debug xem app có lấy đúng địa chỉ mạng LAN không */}
                <div className="absolute -bottom-4 left-0 w-full text-center text-[8px] text-gray-300 opacity-50 truncate px-1">{linkToJoin}</div>
            </div>
            <p className="text-xs font-bold text-center text-gray-500">{t.qrDesc}</p>

            <button onClick={() => setCurrentScreen('app')} className="w-full bg-[#fcd34d] border-[3px] border-black py-4 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] hover:bg-[#fbbf24] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.goToDashboard}</button>
         </div>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN KHÁCH NHẬP MÃ VÀO PHÒNG
  // ==========================================
  if (currentScreen === "guest_join") {
    return (
      <div className="relative w-full h-screen flex items-center justify-center bg-[#f3f4f6]" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/crumpled-paper.png')" }}>
         <div className="bg-white border-[4px] border-black p-6 shadow-[8px_8px_0_0_#000] max-w-sm w-full mx-4 flex flex-col gap-5">
            <h2 className="font-black text-xl uppercase text-center border-b-4 border-yellow-400 pb-2">{t.joinMatch}</h2>
            
            <div>
                <label className="text-[11px] font-black uppercase mb-1 block">{t.pinLabel}</label>
                <input type="text" maxLength={6} placeholder={t.pinPlaceholder} className="w-full border-[3px] border-black p-3 text-2xl tracking-widest text-center font-black focus:outline-none focus:bg-yellow-50" value={roomPin} onChange={e => setRoomPin(e.target.value)} />
            </div>

            <div>
                <label className="text-[11px] font-black uppercase mb-1 block">{t.yourNameLabel}</label>
                <input type="text" placeholder={t.namePlaceholder} className="w-full border-[3px] border-black p-3 text-sm font-bold focus:outline-none focus:bg-yellow-50" value={guestName} onChange={e => setGuestName(e.target.value)} />
            </div>

            <div>
                <label className="text-[11px] font-black uppercase mb-1 block">{t.skillLabel}</label>
                <select className="w-full border-[3px] border-black p-3 text-sm font-bold cursor-pointer bg-white" value={guestSkill} onChange={e => setGuestSkill(e.target.value as SkillLevel)}>
                    {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
                </select>
            </div>

            <button onClick={handleJoinRoom} className="w-full bg-[#3b82f6] text-white border-[3px] border-black py-4 text-sm font-black uppercase shadow-[4px_4px_0_0_#000] hover:bg-blue-600 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all mt-2">{t.joinBtn}</button>
            <button onClick={() => setCurrentScreen('role_select')} className="text-gray-400 font-bold hover:text-black text-sm text-center mt-2">{t.cancelBtn}</button>
         </div>
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN APP CHÍNH (HOST HOẶC GUEST)
  // ==========================================
  return (
    <div className="flex flex-col h-screen w-full bg-transparent z-50 absolute inset-0 overflow-hidden">
      
      {/* SIDEBAR */}
      <div className={`fixed inset-0 z-[60] ${isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsSidebarOpen(false)}></div>
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
                  <div className="bg-black text-white p-3 font-black text-xs uppercase flex items-center justify-between shadow-[3px_3px_0_0_#facc15]">
                      <span>Role: {userRole === 'host' ? t.hostRoleBadge : t.guestRoleBadge}</span>
                      {userRole === 'host' && <span className="bg-white text-black px-2 py-0.5 text-[9px]">PIN: {roomPin}</span>}
                  </div>

                  <button onClick={handleExitRoom} className="bg-white border-[3px] border-black rounded-lg p-3 text-left shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_0_#000] active:shadow-none transition-all flex gap-3 items-center group mt-2">
                      <div className="w-8 h-8 rounded-full border-2 border-black bg-[#bbf7d0] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><i className="fa-solid fa-right-from-bracket"></i></div>
                      <div>
                          <div className="font-black text-sm leading-tight">{t.sidebar.exitRoom}</div>
                          <div className="text-[9px] font-bold text-gray-700 mt-0.5 leading-tight">{t.sidebar.exitRoomDesc}</div>
                      </div>
                  </button>
              </div>
          </div>
      </div>

      {/* HEADER */}
      <div className="bg-white border-b-[3px] border-black flex justify-between items-center p-2 sticky top-0 z-30 shadow-sm w-full">
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
            <div className="hidden md:flex items-center text-xs font-bold mx-2 border-[2px] border-black bg-white rounded">
                <button onClick={() => setZoomLevel(p => Math.max(0.5, p - 0.1))} className="px-2 py-1 text-gray-600 hover:text-black hover:bg-gray-200">-</button>
                <span className="w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(p => Math.min(2, p + 0.1))} className="px-2 py-1 text-gray-600 hover:text-black hover:bg-gray-200">+</button>
            </div>
            <button onClick={() => setIsSidebarOpen(true)} className="hover:bg-gray-200 px-3 py-1 rounded transition-colors ml-2"><i className="fa-solid fa-ellipsis-vertical text-xl"></i></button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-auto no-scrollbar p-4 pb-32 bg-[#f3f4f6]" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/crumpled-paper.png')" }}>
        <div style={{ zoom: zoomLevel } as any} className="w-full min-h-full">

            {/* TAB: SÂN (COURTS) */}
            {activeTab === "courts" && (
              <div className="w-full h-full">
                {players.length === 0 ? (
                    <div className="flex items-center justify-center h-full mt-20" style={{ zoom: zoomLevel ? 1 / zoomLevel : 1 } as any}>
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
                                  <div className="bg-[#f8f9fa] w-full h-full border border-gray-200 flex flex-col justify-center items-center relative shadow-sm">
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
                                  <div className="bg-[#fef9c3] w-full h-full border-2 border-black flex flex-col relative shadow-sm p-3">
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"><span className="text-[120px] font-black text-yellow-500/10 leading-none select-none">{court.id}</span></div>
                                      <h4 className="text-[11px] font-black uppercase mb-3 text-center border-b-[2px] border-black pb-1 z-10">{t.draftTitle} ({court.matchType})</h4>
                                      
                                      <div className="flex flex-col gap-1 mb-2 min-h-[50px] z-10">
                                          <div className="text-[9px] font-bold text-gray-500">{t.draftSelected} ({court.players.length}/{neededPlayers}):</div>
                                          <div className="flex flex-wrap gap-1">
                                              {court.players.map(p => (
                                                  <span key={p.id} onClick={() => handleToggleDraftPlayer(court.id, p)} className="bg-[#3b82f6] text-white border-2 border-black px-2 py-1 text-[10px] font-bold cursor-pointer hover:bg-red-500 hover:line-through transition-colors flex items-center gap-1 shadow-[1px_1px_0_0_#000]">{p.name} <i className="fa-solid fa-xmark text-[8px]"></i></span>
                                              ))}
                                          </div>
                                      </div>

                                      <div className="flex-1 overflow-y-auto border-t-[2px] border-black pt-2 mb-3 custom-scrollbar z-10">
                                           <div className="text-[9px] font-bold text-gray-500 mb-1.5">{t.draftWaiting}:</div>
                                           <div className="flex flex-wrap gap-1.5">
                                               {players.filter(p => p.status === 'waiting' && !court.players.some(cp => cp.id === p.id)).map(p => (
                                                   <span key={p.id} onClick={() => handleToggleDraftPlayer(court.id, p)} className="bg-white border-2 border-black px-2 py-1 text-[10px] font-bold cursor-pointer hover:bg-green-300 transition-colors shadow-[1px_1px_0_0_#000]">{p.name}</span>
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
                                      <div className="absolute inset-2 border-2 border-white/60 pointer-events-none"></div><div className="absolute left-0 right-0 top-1/2 border-t-[3px] border-dashed border-white transform -translate-y-1/2 z-0 pointer-events-none"></div><div className="absolute top-2 bottom-2 left-1/2 w-0.5 bg-white/60 transform -translate-x-1/2 pointer-events-none"></div>
                                      {userRole === 'host' && <div className="absolute top-2 right-2 flex gap-1 bg-white neo-border p-0.5 z-20"><button onClick={() => handleMatchResult(court.id, 0)} className="hover:bg-red-100 text-red-500 px-1 text-xs" title={t.cancelMatch}><i className="fa-solid fa-trash-can"></i></button></div>}
                                      
                                      {/* NỬA TRÊN: ĐỘI 1 */}
                                      <div className="flex-1 flex flex-col items-center justify-center relative bg-blue-400/80 mx-1 mt-1 mb-0.5 border-[2px] border-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]">
                                        <span className="absolute top-1 left-2 text-[9px] font-black text-white text-stroke-1">{t.team1Label}</span>
                                        <div className={`w-full grid ${topCount === 2 ? 'grid-cols-2' : 'grid-cols-1'} items-center justify-items-center z-10 px-2 gap-2`}>
                                            {court.players.slice(0, topCount).map(p => (<div key={p.id} className="bg-white border-2 border-blue-900 px-1 py-1.5 w-full max-w-[100px] text-center truncate font-black text-[12px] text-blue-900 shadow-[2px_2px_0_0_#1e3a8a]">{p.name}</div>))}
                                        </div>
                                      </div>

                                      {/* NÚT KẾT THÚC HOẶC CHỜ KẾT QUẢ */}
                                      {court.status === 'active' && userRole === 'host' && (
                                          <button onClick={() => {
                                              if (settings.trackMatchResults) {
                                                  const newCourts = courts.map(c => c.id === court.id ? {...c, status: 'scoring' as const} : c);
                                                  syncData(players, newCourts);
                                              } else {
                                                  handleMatchResult(court.id, -1);
                                              }
                                          }} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-400 border-2 border-black px-4 py-2 font-black text-[11px] uppercase z-20 shadow-[3px_3px_0_0_#000] hover:bg-yellow-300 active:scale-95 active:shadow-none transition-all">{t.finishMatch}</button>
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
                                            {court.players.slice(topCount, topCount + bottomCount).map(p => (<div key={p.id} className="bg-white border-2 border-red-900 px-1 py-1.5 w-full max-w-[100px] text-center truncate font-black text-[12px] text-red-900 shadow-[2px_2px_0_0_#7f1d1d]">{p.name}</div>))}
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
                                                </div>
                                            )}
                                            {court.status === 'drafting' && <span className="text-[10px] font-bold text-yellow-600 uppercase bg-yellow-100 px-2 py-1 rounded-full border border-yellow-600">{t.draftTitle} ({court.matchType})</span>}
                                            {court.status === 'active' && <span className="text-[10px] font-bold text-green-600 uppercase bg-green-100 px-2 py-1 rounded-full border border-green-600">{t.playing} ({court.matchType})</span>}
                                            {court.status === 'scoring' && <span className="text-[10px] font-bold text-orange-600 uppercase bg-orange-100 px-2 py-1 rounded-full border border-orange-600">{userRole === 'host' ? t.waitingResult : t.guestScoringTag}</span>}
                                        </td>

                                        <td className="p-3">
                                            {(court.status === 'active' || court.status === 'scoring') ? (
                                                <div className="flex items-center gap-4">
                                                    <div className="font-black text-sm flex gap-2">
                                                        {court.players.slice(0, court.matchType === '2v2' ? 2 : 1).map(p => <span key={p.id} className="bg-blue-100 text-blue-900 px-2 py-1 border-2 border-blue-600 min-w-max">{p.name}</span>)}
                                                    </div>
                                                    <span className="text-gray-400 font-black italic">VS</span>
                                                    <div className="font-black text-sm flex gap-2">
                                                        {court.players.slice(court.matchType === '2v2' ? 2 : 1).map(p => <span key={p.id} className="bg-red-100 text-red-900 px-2 py-1 border-2 border-red-600 min-w-max">{p.name}</span>)}
                                                    </div>
                                                </div>
                                            ) : court.status === 'drafting' ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-gray-500">{t.draftSelected}:</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {court.players.map(p => <span key={p.id} onClick={() => handleToggleDraftPlayer(court.id, p)} className="bg-[#3b82f6] text-white border border-black px-1.5 py-0.5 text-[10px] font-bold cursor-pointer hover:bg-red-500 hover:line-through">{p.name}</span>)}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-gray-500">{t.draftWaiting}:</span>
                                                        <div className="flex flex-wrap gap-1 max-w-[400px]">
                                                            {players.filter(p => p.status === 'waiting' && !court.players.some(cp => cp.id === p.id)).map(p => <span key={p.id} onClick={() => handleToggleDraftPlayer(court.id, p)} className="bg-white border border-black px-1.5 py-0.5 text-[10px] font-bold cursor-pointer hover:bg-green-200">{p.name}</span>)}
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
                                                    <button onClick={() => {
                                                        if (settings.trackMatchResults) {
                                                            const newCourts = courts.map(c => c.id === court.id ? {...c, status: 'scoring' as const} : c);
                                                            syncData(players, newCourts);
                                                        } else {
                                                            handleMatchResult(court.id, -1);
                                                        }
                                                    }} className="bg-yellow-400 font-black uppercase border-2 border-black px-4 py-1.5 shadow-[2px_2px_0_0_#000] text-[10px] w-[120px] hover:bg-yellow-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">{t.finishMatch}</button>
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
                        <div className="flex flex-col md:flex-row gap-3 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <input type="text" className="neo-input text-sm flex-1 bg-white" placeholder={t.playerNamePlaceholder} value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} />
                            <div className="flex gap-2">
                                <select className="neo-input text-sm bg-white cursor-pointer w-auto" value={newPlayerSkill} onChange={e => setNewPlayerSkill(e.target.value as SkillLevel)}>
                                    {ALL_SKILLS.map(s => <option key={s} value={s}>{tSkill(s)}</option>)}
                                </select>
                                <button onClick={handleAddPlayer} className="bg-[#fcd34d] border-2 border-black w-8 flex items-center justify-center font-black text-lg hover:bg-[#fbbf24]">+</button>
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
                                            <i className={`fa-solid fa-mug-hot cursor-pointer ${p.status === 'break' ? 'text-black' : 'hover:text-black'}`} title={t.onBreak} onClick={() => {
                                                const newPlayers = players.map(pl => pl.id === p.id ? {...pl, status: pl.status === 'break' ? 'waiting' : 'break' as PlayerStatus} : pl);
                                                syncData(newPlayers, courts);
                                            }}></i>
                                            <i className={`fa-solid fa-link cursor-pointer text-[10px] ${p.partnerId ? 'text-green-500' : linkingPlayerId === p.id ? 'text-blue-500 animate-pulse' : 'hover:text-black'}`} title={p.partnerId ? t.linkCancel : linkingPlayerId === p.id ? t.linking : t.linkFixed} onClick={() => handleLinkClick(p.id)}></i>
                                            <i className="fa-regular fa-trash-can hover:text-red-500 cursor-pointer" onClick={() => handleRemovePlayer(p.id)}></i>
                                        </div>
                                    )}
                                </div>
                                <div className="font-black text-[15px] truncate mt-1 text-gray-800 flex items-center flex-wrap gap-1">
                                    {p.name} 
                                    {p.status === 'playing' && <span className="text-[10px] text-green-600 ml-1 italic">({t.playing})</span>}
                                    {p.partnerId && (() => {
                                        const partner = players.find(x => x.id === p.partnerId);
                                        return partner ? (
                                            <span className="text-[9px] text-green-700 bg-green-100 border border-green-400 px-1 rounded flex items-center gap-1 cursor-pointer hover:bg-red-100 hover:text-red-600 hover:border-red-400" title={t.linkCancel} onClick={() => {if(userRole==='host') handleLinkClick(p.id)}}>
                                                <i className="fa-solid fa-link text-[8px]"></i> {partner.name}
                                            </span>
                                        ) : null;
                                    })()}
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
                                                <div className="font-black text-sm">{p.name}</div>
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
                          <hr className="border-t-[2px] border-dashed border-gray-300 my-2" />
                          <div>
                              <label className="text-[10px] font-black uppercase mb-1 block">{t.shuffleMode}</label>
                              <select className="neo-input text-xs font-bold bg-white w-full border-2 border-black p-1.5" value={settings.shuffleMode} onChange={(e) => handleShuffleModeChange(e.target.value as ShuffleMode)}>
                                  <option value="Equal Rotation">{t.shuffleModes["Equal Rotation"]}</option><option value="Skill Based">{t.shuffleModes["Skill Based"]}</option><option value="Social Mix">{t.shuffleModes["Social Mix"]}</option><option value="Fixed Pairs">{t.shuffleModes["Fixed Pairs"]}</option><option value="Manual">{t.shuffleModes["Manual"]}</option>
                              </select>
                              <p className="text-[8px] text-gray-400 font-bold mt-1">{t.shuffleDesc}</p>
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
                              <input type="text" className="w-full border-2 border-black p-1.5 text-xs font-bold focus:outline-none focus:border-[3px]" placeholder={t.playerNamePlaceholder} value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPlayer()} />
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
                              <div className="border-2 border-black bg-gray-50 max-h-[180px] overflow-y-auto p-2 space-y-2 relative rounded-sm custom-scrollbar">
                                  {players.map(p => (
                                      <div key={p.id} className="border-2 border-black p-2 flex justify-between items-center bg-white rounded-md shadow-sm">
                                          <div className="flex flex-col">
                                              <div className="flex gap-1 mb-0.5">
                                                  <span className="bg-[#fcd34d] text-[8px] font-black px-1 border border-black rounded-[2px]">{tSkill(p.skill)}</span>
                                                  <span className="bg-gray-100 text-gray-500 text-[8px] font-black px-1 border border-gray-300 rounded-[2px]">{p.playCount}G</span>
                                              </div>
                                              <span className="font-black text-[11px] truncate max-w-[140px]">{p.name}</span>
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
                          <button onClick={() => {
                              if(confirm(t.confirmResetCounts)) { 
                                  const newPlayers = players.map(p => ({...p, playCount: 0, wins: 0, status: 'waiting' as PlayerStatus}));
                                  const newCourts = courts.map(c => ({...c, status: 'available' as const, players: []}));
                                  syncData(newPlayers, newCourts);
                              } 
                          }} className="w-full bg-[#fcd34d] border-2 border-black py-2.5 text-[10px] font-black uppercase shadow-[2px_2px_0_0_#000] hover:bg-[#fbbf24] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
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
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 py-3 flex flex-col items-center transition-all ${activeTab === tab.id ? "bg-yellow-300 border-t-[5px] border-black -mt-[2px]" : "text-gray-500 hover:bg-gray-100"}`}>
            <i className={`fa-solid ${tab.icon} text-xl mb-1 ${activeTab === tab.id ? "text-black" : ""}`}></i>
            <span className={`text-[10px] font-bold uppercase ${activeTab === tab.id ? "text-black" : ""}`}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
// KẾT THÚC FILE