// Báo cho người chơi khi được gọi vào sân: rung + chuông + nháy tiêu đề tab.
// Trình duyệt chỉ cho phát âm thanh sau khi người dùng đã chạm vào trang → mở khóa âm thanh ở lần chạm đầu tiên.

let audioCtx: AudioContext | null = null;
let titleTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle = '';

export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* không có âm thanh vẫn dùng được */ }
}

// 3 tiếng "ting" lên giọng
function playChime() {
  if (!audioCtx) return;
  const start = audioCtx.currentTime + 0.05;
  [880, 1175, 1568].forEach((freq, i) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t = start + i * 0.22;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(audioCtx!.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

export function alertCalledToCourt(title: string) {
  try { navigator.vibrate?.([400, 150, 400, 150, 800]); } catch { /* iPhone không hỗ trợ rung từ web */ }
  try { playChime(); } catch { /* bỏ qua */ }
  // Nháy tiêu đề tab (khi người chơi đang ở tab/app khác)
  stopTitleFlash();
  originalTitle = document.title;
  let on = false;
  titleTimer = setInterval(() => { on = !on; document.title = on ? title : originalTitle; }, 900);
}

export function stopTitleFlash() {
  if (titleTimer) { clearInterval(titleTimer); titleTimer = null; }
  if (originalTitle) document.title = originalTitle;
}
