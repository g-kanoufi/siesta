import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (...p) => path.join(root, "apps/mobile/assets", ...p);

const BG = "#161310";
const ACCENT = "#E8A15C";
const POST = "#7F7666";

/** The hammock mark, drawn on a 64×64 viewBox like favicon.svg. */
const mark = (size, stroke = ACCENT, post = POST) => {
  const s = size / 64;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
    <rect x="12" y="18" width="2.5" height="14" rx="1.25" fill="${post}"/>
    <rect x="49.5" y="18" width="2.5" height="14" rx="1.25" fill="${post}"/>
    <path d="M14 22 Q32 48 50 22" fill="none" stroke="${stroke}" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`);
};

const centered = async ({ size, bg, markScale, markSvg, rounded }) => {
  const markSize = Math.round(size * markScale);
  const markPng = await sharp(markSvg).resize(markSize, markSize).png().toBuffer();
  let base = sharp({ create: { width: size, height: size, channels: 4, background: bg } });
  if (rounded) {
    const r = Math.round(size * 0.22);
    const maskSvg = Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`
    );
    base = base.composite([
      { input: markPng, top: Math.round((size - markSize) / 2), left: Math.round((size - markSize) / 2) },
      { input: maskSvg, blend: "dest-in" },
    ]);
    return base.png().toBuffer();
  }
  return base
    .composite([{ input: markPng, top: Math.round((size - markSize) / 2), left: Math.round((size - markSize) / 2) }])
    .png()
    .toBuffer();
};

mkdirSync(out(), { recursive: true });

// App icon — dark rounded square, hammock centered (iOS masks corners itself;
// we still emit rounded corners so it reads correctly outside stores).
await sharp(await centered({ size: 1024, bg: BG, markScale: 0.56, markSvg: mark(1024), rounded: true }))
  .toFile(out("icon.png"));

// Android adaptive icon — foreground is the mark alone in the safe zone.
await sharp(mark(1024)).resize(512, 512).png().toFile(out("android-icon-foreground.png"));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } })
  .png()
  .toFile(out("android-icon-background.png"));
await sharp(mark(1024, "#FFFFFF", "#BFB7AA")).resize(512, 512).png().toFile(out("android-icon-monochrome.png"));

// Splash — smaller mark on transparent; app.json renders it on the dark bg.
await sharp(mark(1024)).resize(300, 300).png().toFile(out("splash-icon.png"));

// favicon.png fallback (web uses favicon.svg)
await sharp(await centered({ size: 64, bg: BG, markScale: 0.78, markSvg: mark(64), rounded: true }))
  .toFile(out("favicon.png"));

console.log("icons generated →", out());
