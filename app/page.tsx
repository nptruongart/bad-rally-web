"use client";
// Bộ điều khiển chính của Bad Rally: giữ trạng thái phòng, đồng bộ realtime với PocketBase và xử lý thao tác.
// Phần giao diện nằm trong app/components/*.
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ClientResponseError, RecordModel, UnsubscribeFunc } from "pocketbase";
import { Preferences } from '@capacitor/preferences'; // Bộ nhớ chuẩn Native App
import { pb, ensureAuth, roomIdFromPin, PUBLIC_APP_URL, isHostAccount, redeemHostCode } from "../lib/pb";
import { unlockAudio, alertCalledToCourt, stopTitleFlash } from "../lib/alerts";
import { pickMatch, genderOf, effectiveCategory, fitsCategory, teamFitsCategory, type MatchRecord, type MatchCategory } from "../lib/matchmaking";
import { dict, translateSkill, type Lang } from "../lib/i18n";
import {
  ALL_SKILLS, COURT_LAYOUT_KEY, DEFAULT_SETTINGS, PROFILE_KEY, SESSION_KEY, SHUFFLE_PRESETS,
  fairCount, neededFor, nowMs, samePlayer, toFields, toPlayer, topCountOf,
  type Court, type CourtData, type GameSettings, type Gender, type LastResult, type MatchOutcome, type MatchType,
  type Player, type Screen, type ShuffleMode, type SkillLevel, type Tab, type UserRole, type WeightKey,
} from "../lib/types";
import { useStableHandlers } from "./hooks/useStableHandlers";
import Launcher from "./components/Launcher";
import { GuestJoin, HostSetup, RoleSelect } from "./components/EntryScreens";
import { AppHeader, BottomNav, CalledModal, KickedModal, MyStatusCard, NextGameFab, Sidebar, UndoBar, splitTeams } from "./components/AppChrome";
import { CourtCard, CourtRow, CourtsTable, EmptyRoom } from "./components/Courts";
import { GuestSettingsNotice, PlayersTab, RankingTab, SettingsTab, type NewPlayerForm } from "./components/Tabs";

const EMPTY: Player[] = [];

// Giữ nguyên object cũ của sân nếu nội dung không đổi → thẻ sân đã memo không phải vẽ lại
const reuseCourts = (prev: CourtData[], next: CourtData[]) =>
  next.map((c, i) => (prev[i] && JSON.stringify(prev[i]) === JSON.stringify(c) ? prev[i] : c));

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("launcher");
  const [activeTab, setActiveTab] = useState<Tab>("courts");

  const [lang, setLang] = useState<Lang>("VI");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const t = dict[lang];
  const tSkill = useCallback((s: SkillLevel) => translateSkill(lang, s), [lang]);
  const toggleLang = useCallback(() => setLang(l => (l === 'VI' ? 'EN' : 'VI')), []);

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
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  // Cách bày sân ở dạng lưới: tự xuống dòng, hoặc dàn ngang 1 hàng vuốt trái/phải (nhớ theo từng máy)
  const [courtLayout, setCourtLayout] = useState<"wrap" | "row">("wrap");

  const [players, setPlayers] = useState<Player[]>([]);
  const [courtData, setCourtData] = useState<CourtData[]>([]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  const [newPlayer, setNewPlayer] = useState<NewPlayerForm>({ name: "", skill: "Trung bình", gender: 'M' });
  const [linkingPlayerId, setLinkingPlayerId] = useState<string | null>(null);
  const [isKickedModalOpen, setIsKickedModalOpen] = useState(false);

  const isHost = userRole === 'host';
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
    // Trình duyệt chỉ cho phát tiếng sau khi người dùng chạm vào trang
    window.addEventListener('pointerdown', unlockAudio);
    // Khách mở link từ QR (?pin=123456) → điền sẵn PIN và vào màn hình tham gia
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
        const { value } = await Preferences.get({ key: SESSION_KEY });
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
        await Preferences.remove({ key: SESSION_KEY });
      }
    };
    initSession();
    return () => window.removeEventListener('pointerdown', unlockAudio);
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
  }, [lang]);
  const openScanner = useCallback(() => setScannerOpen(true), []);
  const closeScanner = useCallback(() => setScannerOpen(false), []);

  const changeCourtLayout = (layout: "wrap" | "row") => {
    setCourtLayout(layout);
    try { localStorage.setItem(COURT_LAYOUT_KEY, layout); } catch { /* bộ nhớ bị chặn */ }
  };

  const saveSession = async (role: UserRole, pin: string, screen: string) => {
    await Preferences.set({ key: SESSION_KEY, value: JSON.stringify({ role, pin, screen }) });
  };

  // Tải phòng + người chơi và lắng nghe realtime
  useEffect(() => {
    if (!roomPin || currentScreen !== 'app') return;
    const rid = roomIdFromPin(roomPin);
    let cancelled = false;
    const unsubs: UnsubscribeFunc[] = [];

    const applyRoom = (room: RecordModel) => {
      applyCourts(reuseCourts(courtRef.current, (room.courts as CourtData[]) || []));
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
      await Preferences.remove({ key: SESSION_KEY });
    };
    // Khách vừa chuyển sang "đang đánh" → rung + chuông + màn hình báo
    const checkCalled = (userId: string | undefined, status: string, prevStatus: string | undefined) => {
      if (!userId || userId !== myUserIdRef.current || status !== 'playing') return;
      if (prevStatus && prevStatus !== 'playing') {
        setCalledAlert(true);
        alertCalledToCourt('🔔 ' + dict.VI.calledTitle);
      }
    };
    // Gộp các thay đổi người chơi đến cùng lúc (vd. xếp 1 trận = 4 bản ghi) thành 1 lần vẽ lại
    const pending = new Map<string, { action: string; record: RecordModel }>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushPlayers = () => {
      flushTimer = null;
      if (cancelled || pending.size === 0) return;
      if (shouldDeferRealtime()) { pending.clear(); return; }
      const prev = playersRef.current;
      const byId = new Map(prev.map(p => [p.id, p]));
      let changed = false;
      for (const [id, { action, record }] of pending) {
        if (action === 'delete') { if (byId.delete(id)) changed = true; continue; }
        const next = toPlayer(record), old = byId.get(id);
        if (old && samePlayer(old, next)) continue;
        byId.set(id, next);
        changed = true;
      }
      pending.clear();
      if (changed) applyPlayers([...byId.values()]);
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
        const prevById = new Map(playersRef.current.map(p => [p.id, p]));
        list.forEach(r => checkCalled(r.user, r.status, prevById.get(r.id)?.status));
        applyPlayers(list.map(r => { const p = toPlayer(r), o = prevById.get(p.id); return o && samePlayer(o, p) ? o : p; }));
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
          if (e.action !== 'delete') {
            const before = pending.get(e.record.id);
            const prevStatus = before ? (before.action === 'delete' ? undefined : before.record.status) : playersRef.current.find(x => x.id === e.record.id)?.status;
            checkCalled(e.record.user, e.record.status, prevStatus);
          }
          pending.set(e.record.id, { action: e.action, record: e.record });
          if (!flushTimer) flushTimer = setTimeout(flushPlayers, 30);
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
      if (flushTimer) clearTimeout(flushTimer);
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
  const updateCourt = (courtId: number, patch: (c: CourtData) => CourtData) =>
    courtRef.current.map(c => (c.id === courtId ? patch(c) : c));

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
    await Preferences.remove({ key: SESSION_KEY });
    setRoomPin("");
    applyPlayers([]);
    applyCourts([]);
    setRoomName("");
    setIsSidebarOpen(false);
    setIsKickedModalOpen(false);
    setLastResult(null);
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
  };

  const handleShare = async () => {
    const url = roomPin ? `${PUBLIC_APP_URL}/?pin=${roomPin}` : PUBLIC_APP_URL;
    try {
      if (navigator.share) await navigator.share({ title: 'Bad Rally', text: roomPin ? `${roomName ? roomName + ' – ' : ''}${t.roomPinLabel} ${roomPin}` : t.tagline, url });
      else { await navigator.clipboard.writeText(url); alert(url); }
    } catch { /* người dùng hủy chia sẻ */ }
  };

  const newPlayerFields = (name: string, skill: SkillLevel, gender: Gender) => ({
    room: roomId, name, skill, gender, status: 'waiting', play_count: 0, wins: 0, wait_since: nowMs(),
  });

  const handleAddPlayer = async () => {
    const name = newPlayer.name.trim();
    if (name === "" || userRole !== 'host') return;
    setNewPlayer(f => ({ ...f, name: "" }));
    try { await pb.collection('players').create(newPlayerFields(name, newPlayer.skill, newPlayer.gender)); }
    catch (e) { console.error(e); alert(t.syncError); setNewPlayer(f => ({ ...f, name })); }
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
        batch.collection('rooms').update(roomId, { courts: courtRef.current.map(c => c.playerIds.includes(id) ? { ...c, playerIds: c.playerIds.filter(pid => pid !== id) } : c) });
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
  const updateWeight = (key: WeightKey, value: number) => { setSettings(prev => ({ ...prev, weights: { ...prev.weights, [key]: value } })); };

  const handleApplySettings = () => {
    const newCourts = Array.from({ length: settings.totalCourts }, (_, i) => courtRef.current[i] || { id: i + 1, status: 'available' as const, playerIds: [], matchType: '2v2' as const });
    // Sân bị bớt đi mà đang có người → trả họ về hàng chờ
    const freed = courtRef.current.slice(settings.totalCourts).flatMap(c => c.status === 'active' || c.status === 'scoring' ? c.playerIds : []);
    const updates: Record<string, Partial<Player>> = {};
    freed.forEach(id => { if (playersRef.current.some(p => p.id === id)) updates[id] = { status: 'waiting', waitSince: nowMs() }; });
    commit(updates, newCourts, settings);
    alert(t.settingsSaved);
  };

  const handleChangeMatchType = (courtId: number, type: MatchType) => {
    if (userRole === 'guest') return;
    commit({}, updateCourt(courtId, c => ({ ...c, matchType: type, playerIds: c.status === 'drafting' ? [] : c.playerIds })));
  };

  const courtName = useCallback((c: CourtData) => c.name?.trim() || `${t.court} ${c.id}`, [t]);
  // Nhãn thể loại trận đôi (trống nếu tự do / không phải 2v2)
  const catLabel = useCallback((c: CourtData) => { const cat = effectiveCategory(c.matchType, c.category); return cat === 'any' ? '' : t.categories[cat]; }, [t]);

  const handleRenameCourt = (court: CourtData) => {
    if (userRole !== 'host') return;
    const input = window.prompt(t.courtNamePrompt, court.name || courtName(court));
    if (input === null) return;
    const name = input.trim().slice(0, 20);
    commit({}, updateCourt(court.id, c => ({ ...c, name: name && name !== `${t.court} ${c.id}` ? name : undefined })));
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
    commit({}, updateCourt(courtId, c => ({ ...c, category, playerIds: c.status === 'drafting' ? [] : c.playerIds })));
  };

  const handleShuffleModeChange = (mode: ShuffleMode) => {
    const preset = SHUFFLE_PRESETS[mode];
    setSettings(prev => ({ ...prev, shuffleMode: mode, weights: preset ? { ...preset } : prev.weights }));
  };

  const handleGenerateNextGame = (specificCourtId?: number) => {
    if (userRole === 'guest') return;
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
    if (userRole === 'guest') return;
    commit({}, updateCourt(courtId, c => ({ ...c, status: 'drafting' as const, playerIds: [] })));
  };

  const handleCancelDrafting = (courtId: number) => {
    if (userRole === 'guest') return;
    commit({}, updateCourt(courtId, c => ({ ...c, status: 'available' as const, playerIds: [] })));
  };

  const handleToggleDraftPlayer = (courtId: number, player: Player) => {
    if (userRole === 'guest') return;
    commit({}, updateCourt(courtId, c => {
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
    if (userRole === 'guest') return;
    const court = courtRef.current.find(c => c.id === courtId);
    if (!court) return;
    const needed = neededFor(court.matchType);
    // Người đã được chọn nhưng vừa bị xếp sân khác / nghỉ / bị xóa thì không tính
    const validIds = court.playerIds.filter(id => playersRef.current.find(p => p.id === id)?.status === 'waiting');
    if (validIds.length !== needed) {
      alert(t.alertNeedPlayers.replace('{n}', needed.toString()));
      if (validIds.length !== court.playerIds.length) commit({}, updateCourt(courtId, c => ({ ...c, playerIds: validIds })));
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
    commit(updates, updateCourt(courtId, c => ({ ...c, status: 'active' as const, playerIds: orderedIds })));
  };

  const handleFinishMatch = (courtId: number) => {
    if (userRole === 'guest') return;
    if (settings.trackMatchResults) commit({}, updateCourt(courtId, c => ({ ...c, status: 'scoring' as const })));
    else handleMatchResult(courtId, -1);
  };

  // winningTeam: 1/2 = đội thắng, -1 = kết thúc không ghi điểm (vẫn tính trận), 0 = hủy trận (không tính)
  const handleMatchResult = (courtId: number, winningTeam: MatchOutcome) => {
    if (userRole === 'guest') return;
    const court = courtRef.current.find(c => c.id === courtId);
    if (!court) return;

    const team1Ids = court.playerIds.slice(0, topCountOf(court.matchType));
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
      : [...historyRef.current, { t1: team1Ids, t2: court.playerIds.slice(team1Ids.length), at: now }].slice(-300);
    // Ghi nhớ trạng thái trước đó để hoàn tác nếu bấm nhầm
    const before: Record<string, Partial<Player>> = {};
    for (const id of Object.keys(updates)) {
      const p = playersRef.current.find(x => x.id === id)!;
      before[id] = { status: p.status, waitSince: p.waitSince, playCount: p.playCount, wins: p.wins };
    }
    setLastResult({ courtId, court, players: before, at: now, addedHistory: !!newHistory, winningTeam });
    commit(updates, updateCourt(courtId, c => ({ ...c, status: 'available' as const, playerIds: [] })), undefined, newHistory);
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
    commit(before, updateCourt(courtId, () => court), undefined,
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

  // Hàm xử lý có địa chỉ cố định → thẻ sân / thẻ người chơi đã memo không vẽ lại vô ích
  const courtActions = useStableHandlers({
    renameCourt: handleRenameCourt, changeMatchType: handleChangeMatchType, changeCategory: handleChangeCategory,
    generate: handleGenerateNextGame, startDrafting: handleStartDrafting, cancelDrafting: handleCancelDrafting,
    toggleDraftPlayer: handleToggleDraftPlayer, startManual: handleStartManualMatch, finish: handleFinishMatch, result: handleMatchResult,
  });
  const playerActions = useStableHandlers({ changeSkill: handleChangeSkill, toggleBreak: handleToggleBreak, linkClick: handleLinkClick, remove: handleRemovePlayer });
  const ui = useStableHandlers({
    exitRoom: handleExitRoom, renameRoom: handleRenameRoom, share: handleShare, guestToggleBreak: handleGuestToggleBreak, guestLeave: handleGuestLeave,
    dismissCalled, addPlayer: handleAddPlayer, removeAll: handleRemoveAllPlayers, closeSidebar: () => setIsSidebarOpen(false), openSidebar: () => setIsSidebarOpen(true),
    showQr: () => { setIsSidebarOpen(false); setCurrentScreen('host_setup'); }, toggleView: () => setViewMode(v => (v === 'grid' ? 'table' : 'grid')),
    resetZoom: () => setZoomLevel(1), zoom: (d: number) => setZoomLevel(z => Math.round(Math.min(2, Math.max(0.5, z + d)) * 10) / 10),
    patchNewPlayer: (patch: Partial<NewPlayerForm>) => setNewPlayer(f => ({ ...f, ...patch })),
  });

  // --- DỮ LIỆU SUY RA (chỉ tính lại khi dữ liệu nguồn đổi) ---
  const playersById = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);
  // Sân chỉ lưu id người chơi; ghép với danh sách người chơi mới nhất để hiển thị
  const courts: Court[] = useMemo(() => courtData.map(c => ({
    ...c,
    players: (c.playerIds || []).map(id => playersById.get(id)).filter((p): p is Player => !!p),
  })), [courtData, playersById]);
  const waitingPlayers = useMemo(() => players.filter(p => p.status === 'waiting'), [players]);
  const draftPoolOf = (c: Court) => c.status !== 'drafting' ? EMPTY
    : waitingPlayers.filter(p => !c.playerIds.includes(p.id) && fitsCategory(p, effectiveCategory(c.matchType, c.category)));

  // Thẻ "Của tôi" (khách)
  const guestView = useMemo(() => {
    const me = userRole === 'guest' && myUserId ? players.find(p => p.userId === myUserId) : undefined;
    const myCourt = me ? courts.find(c => (c.status === 'active' || c.status === 'scoring') && c.playerIds.includes(me.id)) : undefined;
    const { teammates, opponents } = me && myCourt ? splitTeams(myCourt, me.id) : { teammates: EMPTY, opponents: EMPTY };
    // Ước tính vị trí hàng chờ theo cùng thứ tự ưu tiên của thuật toán (ít trận trước, chờ lâu trước)
    const queue = me?.status === 'waiting' ? [...waitingPlayers].sort((a, b) => fairCount(a) - fairCount(b) || (a.waitSince || 0) - (b.waitSince || 0)) : EMPTY;
    const queuePos = me && me.status === 'waiting' ? queue.findIndex(p => p.id === me.id) + 1 : 0;
    const nextRoundSlots = 4 * Math.max(1, courts.filter(c => c.status === 'available').length);
    return { me, myCourt, teammates, opponents, queuePos, queueTotal: waitingPlayers.length, nextRoundSlots };
  }, [userRole, myUserId, players, courts, waitingPlayers]);
  const etaText = guestView.queuePos === 0 ? '' : guestView.queuePos <= guestView.nextRoundSlots ? t.myEtaNext
    : t.myEtaLater.replace('{n}', String(Math.ceil((guestView.queuePos - guestView.nextRoundSlots) / 4)));

  // ==========================================
  // CÁC MÀN HÌNH TRƯỚC KHI VÀO PHÒNG
  // ==========================================
  if (currentScreen === "launcher") {
    return <Launcher t={t} lang={lang} onToggleLang={toggleLang} onStart={() => setCurrentScreen(canHost ? "role_select" : "guest_join")} />;
  }
  if (currentScreen === "role_select") {
    return <RoleSelect t={t} lang={lang} onToggleLang={toggleLang} onHost={handleCreateRoom} onGuest={() => setCurrentScreen('guest_join')} onBack={() => setCurrentScreen('launcher')} />;
  }
  if (currentScreen === "host_setup") {
    return <HostSetup t={t} roomPin={roomPin} roomName={roomName} joinUrl={`${PUBLIC_APP_URL}/?pin=${roomPin}`} onRoomNameChange={setRoomName} onRoomNameCommit={saveRoomName} onContinue={handleGoToDashboard} />;
  }
  if (currentScreen === "guest_join") {
    return (
      <GuestJoin t={t} lang={lang} onToggleLang={toggleLang} tSkill={tSkill}
        roomPin={roomPin} onRoomPinChange={v => setRoomPin(v.replace(/\D/g, '').slice(0, 6))}
        name={guestName} onNameChange={setGuestName} gender={guestGender} onGenderChange={setGuestGender} skill={guestSkill} onSkillChange={setGuestSkill}
        scannerOpen={scannerOpen} onOpenScanner={openScanner} onScanResult={handleScanResult} onCloseScanner={closeScanner}
        busy={isBusy} onJoin={handleJoinRoom} onCancel={() => setCurrentScreen(canHost ? 'role_select' : 'launcher')} />
    );
  }

  // ==========================================
  // GIAO DIỆN APP CHÍNH (HOST HOẶC GUEST)
  // ==========================================
  const { me, myCourt } = guestView;
  const unzoom = { zoom: zoomLevel ? 1 / zoomLevel : 1 };
  return (
    <div className="flex flex-col h-screen w-full bg-transparent z-50 absolute inset-0 overflow-hidden">
      {calledAlert && <CalledModal t={t} courtLabel={myCourt ? courtName(myCourt) : undefined} teammates={guestView.teammates} opponents={guestView.opponents} onDismiss={ui.dismissCalled} />}
      {isKickedModalOpen && <KickedModal t={t} onClose={leaveToLauncher} />}

      <Sidebar t={t} open={isSidebarOpen} userRole={userRole} roomPin={roomPin} onClose={ui.closeSidebar} onShowQr={ui.showQr} onShare={ui.share} onExit={ui.exitRoom} />

      <AppHeader t={t} lang={lang} userRole={userRole} roomPin={roomPin} roomName={roomName} activeTab={activeTab} viewMode={viewMode} zoomLevel={zoomLevel}
        onExit={ui.exitRoom} onRenameRoom={ui.renameRoom} onToggleView={ui.toggleView} onResetZoom={ui.resetZoom} onZoom={ui.zoom} onToggleLang={toggleLang} onOpenSidebar={ui.openSidebar} />

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-auto no-scrollbar p-4 pb-32 bg-[#f3f4f6]" style={{ backgroundImage: 'var(--paper-texture)' }}>
        {userRole === 'guest' && (
          <MyStatusCard t={t} me={me} courtLabel={myCourt ? courtName(myCourt) : undefined} courtCategory={myCourt ? catLabel(myCourt) : ''} courtScoring={myCourt?.status === 'scoring'}
            teammates={guestView.teammates} opponents={guestView.opponents} queuePos={guestView.queuePos} queueTotal={guestView.queueTotal} etaText={etaText}
            onToggleBreak={ui.guestToggleBreak} onLeave={ui.guestLeave} />
        )}
        <div style={{ zoom: zoomLevel }} className="w-full min-h-full">

          {/* TAB: SÂN (COURTS) */}
          {activeTab === "courts" && (
            <div className="w-full h-full">
              {players.length === 0 ? (
                <EmptyRoom t={t} roomPin={roomPin} isHost={isHost} zoomLevel={zoomLevel} onAddManually={() => setActiveTab('players')} />
              ) : viewMode === 'grid' ? (
                <>
                  <div className="flex justify-end gap-1 mb-2 lg:ml-8 max-w-6xl" style={unzoom}>
                    <button onClick={() => changeCourtLayout('wrap')} className={`border-2 border-black px-2 py-1 text-[10px] font-black uppercase ${courtLayout === 'wrap' ? 'bg-black text-white' : 'bg-white'}`}><i className="fa-solid fa-border-all mr-1"></i>{t.layoutWrap}</button>
                    <button onClick={() => changeCourtLayout('row')} className={`border-2 border-black px-2 py-1 text-[10px] font-black uppercase ${courtLayout === 'row' ? 'bg-black text-white' : 'bg-white'}`}><i className="fa-solid fa-left-right mr-1"></i>{t.layoutRow}</button>
                  </div>
                  <div className={courtLayout === 'row'
                    ? "flex flex-nowrap gap-4 items-start overflow-x-auto snap-x snap-mandatory border-2 border-dashed border-gray-300 p-4 rounded-md lg:ml-8 [scrollbar-width:thin]"
                    : "flex flex-wrap gap-6 items-start justify-center md:justify-start lg:ml-8 border-2 border-dashed border-gray-300 p-6 min-h-[70vh] rounded-md max-w-6xl"}>
                    {courts.map((court, i) => (
                      <CourtCard key={court.id} t={t} court={courtData[i]} players={court.players} draftPool={draftPoolOf(court)} label={courtName(court)} catLabel={catLabel(court)}
                        isHost={isHost} trackResults={settings.trackMatchResults} actions={courtActions} />
                    ))}
                  </div>
                </>
              ) : (
                <CourtsTable t={t}>
                  {courts.map((court, i) => (
                    <CourtRow key={court.id} t={t} court={courtData[i]} players={court.players} draftPool={draftPoolOf(court)} label={courtName(court)} catLabel={catLabel(court)}
                      isHost={isHost} trackResults={settings.trackMatchResults} actions={courtActions} />
                  ))}
                </CourtsTable>
              )}
            </div>
          )}

          {/* TAB: NGƯỜI CHƠI (PLAYERS) */}
          {activeTab === "players" && (
            <PlayersTab t={t} tSkill={tSkill} players={players} isHost={isHost} linkingPlayerId={linkingPlayerId} actions={playerActions}
              form={newPlayer} onFormChange={ui.patchNewPlayer} onAdd={ui.addPlayer} onRemoveAll={ui.removeAll} />
          )}

          {/* TAB: XẾP HẠNG (RANKING) */}
          {activeTab === "ranking" && <RankingTab t={t} tSkill={tSkill} players={players} />}

          {/* TAB: CÀI ĐẶT (SETTINGS) */}
          {activeTab === "settings" && (userRole === 'guest' ? <GuestSettingsNotice t={t} /> : (
            <SettingsTab t={t} tSkill={tSkill} settings={settings} roomName={roomName} players={players} form={newPlayer} onFormChange={ui.patchNewPlayer} onAdd={ui.addPlayer}
              actions={{
                setRoomName, saveRoomName, updateSetting, updateWeight, setShuffleMode: handleShuffleModeChange, apply: handleApplySettings,
                addGuests: handleAddGuests, removePlayer: handleRemovePlayer, resetCounts: handleResetCounts, resetEvent: handleResetEvent,
              }} />
          ))}
        </div>
      </div>

      {/* THANH HOÀN TÁC KẾT QUẢ VỪA GHI */}
      {isHost && lastResult && (
        <UndoBar t={t} lastResult={lastResult} courtLabel={(() => { const c = courtData.find(x => x.id === lastResult.courtId); return c ? courtName(c) : `${t.court} ${lastResult.courtId}`; })()}
          onUndo={handleUndoResult} onClose={() => setLastResult(null)} />
      )}

      {/* NÚT TẠO TRẬN MỚI TRÔI */}
      {activeTab === 'courts' && isHost && <NextGameFab t={t} onClick={() => handleGenerateNextGame()} />}

      {/* THANH ĐIỀU HƯỚNG BOTTOM */}
      <BottomNav t={t} activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
