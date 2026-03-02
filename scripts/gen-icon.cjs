const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const OUT = path.join(__dirname, '..', 'store', 'icon-512.png');

const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

// Black background
ctx.fillStyle = '#000000';
ctx.fillRect(0, 0, SIZE, SIZE);

// Three circles in triangle formation matching the adaptive icon foreground
const cx = SIZE / 2;
const cy = SIZE / 2;
const spread = SIZE * 0.18; // distance from center to each circle center
const r = SIZE * 0.155;     // circle radius

const circles = [
  { x: cx, y: cy - spread * 1.1, color: '#EE3333' },              // red (top)
  { x: cx - spread * 1.15, y: cy + spread * 0.7, color: '#00CCBB' }, // cyan (bottom-left)
  { x: cx + spread * 1.15, y: cy + spread * 0.7, color: '#EEBB00' }, // yellow (bottom-right)
];

for (const c of circles) {
  // Radial gradient for slight 3D feel
  const grad = ctx.createRadialGradient(c.x - r * 0.25, c.y - r * 0.25, r * 0.05, c.x, c.y, r);
  grad.addColorStop(0, lighten(c.color, 40));
  grad.addColorStop(0.7, c.color);
  grad.addColorStop(1, darken(c.color, 30));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Write PNG
if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, canvas.toBuffer('image/png'));
console.log(`  ${OUT} (${SIZE}x${SIZE})`);

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function lighten(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount / 100, g + (255 - g) * amount / 100, b + (255 - b) * amount / 100);
}

function darken(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount / 100), g * (1 - amount / 100), b * (1 - amount / 100));
}
