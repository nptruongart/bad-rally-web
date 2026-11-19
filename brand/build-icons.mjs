// Xuất toàn bộ icon Bad Rally từ SVG gốc. Chạy: node brand/build-icons.mjs
import sharp from 'sharp';
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { variants } from './_parts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
for (const [name, s] of Object.entries(variants)) writeFileSync(join(here, `${name}.svg`), s);

const png = (name, size, out) => sharp(Buffer.from(variants[name]), { density: Math.max(72, size * 72 / 120 * 4) })
  .resize(size, size).png({ compressionLevel: 9 }).toFile(out);

const web = join(root, 'public', 'icons');
writeFileSync(join(web, 'icon.svg'), variants.icon);
await png('icon', 192, join(web, 'icon-192.png'));
await png('icon', 512, join(web, 'icon-512.png'));
await png('icon-maskable', 512, join(web, 'maskable-512.png'));
await png('icon-square', 180, join(web, 'apple-touch-icon.png'));

// favicon.ico: 16/32/48 dùng bản rút gọn, 256 dùng bản đầy đủ
const ico = [];
for (const [name, size] of [['icon-small', 16], ['icon-small', 32], ['icon-small', 48], ['icon', 256]]) {
  ico.push({ size, buf: await sharp(Buffer.from(variants[name]), { density: 600 }).resize(size, size).png().toBuffer() });
}
const head = Buffer.alloc(6 + 16 * ico.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(ico.length, 4);
let off = head.length;
ico.forEach(({ size, buf }, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12); off += buf.length;
});
writeFileSync(join(root, 'app', 'favicon.ico'), Buffer.concat([head, ...ico.map(x => x.buf)]));

// Android (thư mục android/ do Capacitor tạo; bỏ qua nếu chưa có)
const res = join(root, 'android', 'app', 'src', 'main', 'res');
if (existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = join(res, `mipmap-${d}`);
    await png('icon-square', 48 * k, join(dir, 'ic_launcher.png'));
    await png('icon-round', 48 * k, join(dir, 'ic_launcher_round.png'));
    await png('icon-foreground', 108 * k, join(dir, 'ic_launcher_foreground.png'));
  }
  writeFileSync(join(res, 'values', 'ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0F1A</color>\n</resources>\n');
}
console.log('done');
