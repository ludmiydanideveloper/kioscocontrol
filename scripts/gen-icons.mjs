// Genera los iconos PWA a partir de un SVG inline. Correr: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(pub, { recursive: true });

const STORE = `
  <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
  <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
  <path d="M2 7h20"/>
  <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>`;

const svg = (scale, tx) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="#1A1A1A"/>
  <g transform="translate(${tx} ${tx}) scale(${scale})" fill="none" stroke="#F9F9F7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${STORE}</g>
</svg>`;

const normal = svg(0.72, 3.36);   // margen ~14%
const maskable = svg(0.58, 5.04); // zona segura para Android

// favicon SVG (para la pestaña del navegador)
writeFileSync(join(pub, 'favicon.svg'), normal);

const jobs = [
  ['pwa-192.png', normal, 192],
  ['pwa-512.png', normal, 512],
  ['pwa-maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', normal, 180],
  ['favicon-32.png', normal, 32],
];

for (const [name, src, size] of jobs) {
  await sharp(Buffer.from(src)).resize(size, size).png().toFile(join(pub, name));
  console.log('  ✓', name);
}
console.log('Iconos generados en public/');
