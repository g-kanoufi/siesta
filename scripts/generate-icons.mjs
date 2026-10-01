import sharp from "sharp";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = (...parts) => path.join(root, "apps/mobile/assets", ...parts);
const render = async (source, destination, size) =>
  sharp(source).resize(size, size, { fit: "contain" }).png().toFile(destination);

mkdirSync(assets(), { recursive: true });

// App and Watch icons share the OG hammock silhouette on the sunset gradient.
await render(assets("siesta-master-1024.svg"), assets("icon.png"), 1024);
await render(assets("siesta-master-1024.svg"), assets("watch-icon.png"), 1024);
const generatedWatchIcon = path.join(root, "apps/mobile/targets/watch/Assets.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png");
if (existsSync(path.dirname(generatedWatchIcon))) {
  await render(assets("watch-icon.png"), generatedWatchIcon, 1024);
}

// Android adaptive icon layers stay separate so Android can apply its mask.
await render(assets("android-adaptive-background.svg"), assets("android-icon-background.png"), 1024);
await render(assets("android-adaptive-foreground.svg"), assets("android-icon-foreground.png"), 512);
await render(assets("android-adaptive-monochrome.svg"), assets("android-icon-monochrome.png"), 512);

// Splash and favicon fallbacks use the same sunset artwork.
await render(assets("siesta-master-1024.svg"), assets("splash-icon.png"), 300);
await render(path.join(root, "apps/web/public/favicon.svg"), assets("favicon.png"), 64);

const ogCard = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="dusk" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#765749"/>
      <stop offset=".42" stop-color="#6B4F47"/>
      <stop offset=".78" stop-color="#20324E"/>
      <stop offset="1" stop-color="#20252B"/>
    </linearGradient>
    <radialGradient id="glow" cx="18%" cy="10%" r="85%">
      <stop offset="0" stop-color="#F4C56C" stop-opacity=".28"/>
      <stop offset="1" stop-color="#F4C56C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#dusk)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="535" y="185" fill="#D69B6E" font-family="Arial, sans-serif" font-size="18" font-weight="600" letter-spacing="5">A NAP TIMER FOR YOUR WRIST</text>
  <text x="535" y="275" fill="#F2EEE6" font-family="Georgia, serif" font-size="72">siesta</text>
  <text x="535" y="360" fill="#F2EEE6" font-family="Georgia, serif" font-size="56">Sleep first.</text>
  <text x="535" y="424" fill="#F2EEE6" font-family="Georgia, serif" font-size="52">Count down second.</text>
  <text x="535" y="490" fill="#E0D8CE" font-family="Arial, sans-serif" font-size="23">A quiet daydream or a gentle nap.</text>
  <text x="535" y="548" fill="#B8B0A7" font-family="Arial, sans-serif" font-size="18" letter-spacing="2">APPLE WATCH  ·  IPHONE  ·  €2.99 ONCE</text>
</svg>`);
const ogIcon = await sharp(assets("icon.png")).resize(320, 320).png().toBuffer();
await sharp(ogCard)
  .composite([{ input: ogIcon, left: 130, top: 155 }])
  .png()
  .toFile(path.join(root, "apps/web/public/og.png"));

console.log("icons generated →", assets());
