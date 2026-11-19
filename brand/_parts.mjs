// Các phần dùng chung của logo Bad Rally (phương án C1: sân 4 ô + đường cầu bay lên + quả cầu lông)
export const NAVY = '#0b0f1a', LIME = '#a3e635', BLUE = '#3b82f6', RED = '#f43f5e';

export const shuttle = `
<g>
<path d="M-7 -6 L-13.5 -29 Q-7 -33.5 0 -34 Q7 -33.5 13.5 -29 L7 -6 Z" fill="#cbd5e1"/>
<g fill="#f8fafc" stroke="#94a3b8" stroke-width=".7" stroke-linejoin="round">
<path d="M-5.6 -6 L-13.6 -28 Q-10.5 -33.5 -7.4 -28.6 L-2.6 -6 Z"/>
<path d="M5.6 -6 L13.6 -28 Q10.5 -33.5 7.4 -28.6 L2.6 -6 Z"/>
<path d="M-3.4 -6 L-8.2 -29 Q-5.2 -34 -2.2 -29 L-0.8 -6 Z"/>
<path d="M3.4 -6 L8.2 -29 Q5.2 -34 2.2 -29 L0.8 -6 Z"/>
<path d="M-1.4 -6 L-2.9 -29.3 Q0 -34.2 2.9 -29.3 L1.4 -6 Z" fill="#ffffff"/>
</g>
<path d="M-4 -6 L-10.5 -31 M-2 -6 L-5.2 -31.5 M0 -6 V-32 M2 -6 L5.2 -31.5 M4 -6 L10.5 -31" stroke="#94a3b8" stroke-width=".5"/>
<path d="M-8.7 -12 Q0 -9.8 8.7 -12 M-10.7 -19 Q0 -16.8 10.7 -19" fill="none" stroke="#334155" stroke-width="1.4"/>
<rect x="-7.6" y="-7.2" width="15.2" height="3.4" rx="1" fill="${LIME}" stroke="#3f6212" stroke-width=".6"/>
<path d="M-7.5 -3.8 H7.5 C7.5 3 4 7.5 0 7.5 C-4 7.5 -7.5 3 -7.5 -3.8 Z" fill="#f5f0e6" stroke="#a8a29e" stroke-width=".7"/>
<path d="M-4.5 -1.5 C-4.5 2 -2.8 4.5 -1 5.3" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
</g>`;

// Hình chính trong khung 120×120 (tâm 60,60)
export const art = `
<rect x="22" y="22" width="34" height="34" rx="8" fill="${BLUE}"/>
<rect x="64" y="22" width="34" height="34" rx="8" fill="${BLUE}"/>
<rect x="22" y="64" width="34" height="34" rx="8" fill="${RED}"/>
<rect x="64" y="64" width="34" height="34" rx="8" fill="${RED}"/>
<path d="M16 96 C 24 58, 48 38, 78 32" fill="none" stroke="${LIME}" stroke-width="6" stroke-linecap="round"/>
<g transform="translate(100 26) rotate(-105) scale(0.82)">${shuttle}</g>`;

// Bản rút gọn cho cỡ rất nhỏ (favicon 16–48px): khối to, không chi tiết lông
export const artSmall = `
<rect x="16" y="16" width="40" height="40" rx="8" fill="${BLUE}"/>
<rect x="64" y="16" width="40" height="40" rx="8" fill="${BLUE}"/>
<rect x="16" y="64" width="40" height="40" rx="8" fill="${RED}"/>
<rect x="64" y="64" width="40" height="40" rx="8" fill="${RED}"/>
<path d="M14 100 C 22 60, 46 40, 76 34" fill="none" stroke="${LIME}" stroke-width="11" stroke-linecap="round"/>
<g transform="translate(98 26) rotate(-105)">
<path d="M-8 -5 L-15 -30 L15 -30 L8 -5 Z" fill="#ffffff" stroke="${NAVY}" stroke-width="3" stroke-linejoin="round"/>
<path d="M-8.5 -5 H8.5 C8.5 3 4.5 8 0 8 C-4.5 8 -8.5 3 -8.5 -5 Z" fill="${LIME}" stroke="${NAVY}" stroke-width="3" stroke-linejoin="round"/>
</g>`;

export const svg = (body, vb = '0 0 120 120') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>\n`;
const scaled = (inner, s, cx = 60, cy = 60) => `<g transform="translate(${cx} ${cy}) scale(${s}) translate(-60 -60)">${inner}</g>`;

export const variants = {
  // Icon chuẩn: nền bo góc (web, manifest "any", favicon lớn)
  'icon': svg(`<rect width="120" height="120" rx="26" fill="${NAVY}"/>${art}`),
  // Tràn viền vuông: hệ điều hành tự cắt góc (iPhone, Android cũ)
  'icon-square': svg(`<rect width="120" height="120" fill="${NAVY}"/>${art}`),
  // Maskable: thu hình vào vùng an toàn 80% để Android cắt tròn/giọt nước không mất góc
  'icon-maskable': svg(`<rect width="120" height="120" fill="${NAVY}"/>${scaled(art, 0.8)}`),
  // Android icon tròn
  'icon-round': svg(`<circle cx="60" cy="60" r="60" fill="${NAVY}"/>${scaled(art, 0.82)}`),
  // Android adaptive foreground (nền trong suốt, hình nằm trong vùng an toàn 66/108)
  'icon-foreground': svg(scaled(art, 0.62, 54, 54), '0 0 108 108'),
  // Favicon cỡ nhỏ
  'icon-small': svg(`<rect width="120" height="120" rx="26" fill="${NAVY}"/>${artSmall}`),
};

// Logo kèm chữ (dùng cho tài liệu, mạng xã hội). Chữ dùng font hệ thống đậm.
const word = (fg, accent) => `<g transform="translate(0 0) scale(0.5)"><rect width="120" height="120" rx="26" fill="${NAVY}"/>${art}</g>
<text x="70" y="40" font-family="Inter, 'Segoe UI', Roboto, Arial, sans-serif" font-weight="900" font-size="30" letter-spacing="0.5" fill="${fg}">BAD <tspan fill="${accent}">RALLY</tspan></text>`;
variants['logo-dark'] = svg(`<rect width="260" height="60" fill="${NAVY}"/>${word('#f8fafc', LIME)}`, '0 0 260 60');
variants['logo-light'] = svg(word(NAVY, '#4d7c0f'), '0 0 260 60');
