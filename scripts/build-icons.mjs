// Tạo bộ icon Font Awesome rút gọn: chỉ giữ các icon thật sự dùng trong mã nguồn.
// Thay cho all.min.css (~75 KB CSS + ~180 KB font) → vài KB. Tự chạy trước `npm run dev` / `npm run build`.
// Dùng icon mới: chỉ cần viết class "fa-solid fa-ten-icon" trong .tsx như bình thường, script sẽ tự thêm.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import postcss from "postcss";
import subsetFont from "subset-font";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const faDir = dirname(require.resolve("@fortawesome/fontawesome-free/package.json"));
const outDir = join(root, "app", "fa");

// Tên icon ghép động trong mã (vd. `fa-chevron-${open ? 'up' : 'down'}`) → khai báo thêm ở đây
const EXTRA = ["fa-chevron-up", "fa-chevron-down"];
// Lớp nền luôn giữ
const BASE = new Set(["fa", "fa-solid", "fa-regular", "fas", "far", "fa-classic"]);

// 1) Gom mọi tên fa-* xuất hiện trong mã nguồn
const used = new Set(EXTRA);
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "fa" && name !== "node_modules") walk(p); continue; }
    if (!/\.(tsx?|jsx?)$/.test(name)) continue;
    for (const m of readFileSync(p, "utf8").matchAll(/\bfa-[a-z0-9]+(?:-[a-z0-9]+)*/g)) used.add(m[0]);
  }
};
walk(join(root, "app"));
walk(join(root, "lib"));

// 2) Lọc CSS: giữ luật nền + luật của icon đang dùng
const classesOf = (sel) => [...sel.matchAll(/\.(-?[a-z0-9_-]+)/gi)].map((m) => m[1]);
const keepSelector = (sel) => {
  const cls = classesOf(sel);
  if (cls.length === 0) return /^(:root|:host)/.test(sel.trim());
  return cls.every((c) => BASE.has(c) || used.has(c));
};
const codepoints = new Set();
const filterCss = (css) => {
  const ast = postcss.parse(css);
  ast.walkComments((c) => { if (!c.text.startsWith("!")) c.remove(); });
  ast.walkAtRules((at) => { if (at.name === "keyframes" || at.name === "media") at.remove(); });
  ast.walkRules((rule) => {
    const sels = rule.selectors.filter(keepSelector);
    if (sels.length === 0) { rule.remove(); return; }
    rule.selectors = sels;
    rule.walkDecls("--fa", (d) => {
      const m = d.value.match(/\\([0-9a-f]+)/i);
      if (m) codepoints.add(parseInt(m[1], 16));
    });
  });
  ast.walkAtRules("font-face", (ff) => ff.walkDecls("src", (d) => {
    d.value = d.value.replace(/url\(\.\.\/webfonts\/(fa-(?:solid-900|regular-400))\.woff2\) format\("woff2"\),url\([^)]*\) format\("truetype"\)/, 'url(./$1.woff2) format("woff2")');
  }));
  return ast.toString();
};

const css = ["fontawesome.min.css", "solid.min.css", "regular.min.css"]
  .map((f) => filterCss(readFileSync(join(faDir, "css", f), "utf8")))
  .join("\n");

// 3) Cắt font chỉ còn các ký tự icon đang dùng
mkdirSync(outDir, { recursive: true });
const text = String.fromCodePoint(...codepoints);
for (const font of ["fa-solid-900", "fa-regular-400"]) {
  const buf = await subsetFont(readFileSync(join(faDir, "webfonts", `${font}.ttf`)), text, { targetFormat: "woff2" });
  writeFileSync(join(outDir, `${font}.woff2`), buf);
}
writeFileSync(join(outDir, "icons.css"), `/* TỰ ĐỘNG TẠO bởi scripts/build-icons.mjs — đừng sửa tay */\n${css}\n`);
console.log(`Font Awesome: ${codepoints.size} icon → app/fa/`);
