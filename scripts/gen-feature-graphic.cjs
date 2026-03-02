const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const W = 1024;
const H = 500;
const OUT = path.join(__dirname, '..', 'store', 'feature-graphic.png');

const BG_COLOR = '#1a1a2e';
const TEXT_COLOR = '#FF3B3B';
const ARROW_COLOR_RGB = [255, 59, 59];

// Subset of tower colors for decorative circles
const TOWER_COLORS = ['#FF3333', '#33BBFF', '#88EE33', '#AA33FF', '#FFE033'];

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// Background
ctx.fillStyle = BG_COLOR;
ctx.fillRect(0, 0, W, H);

// Text setup
const fontSize = Math.round(W * 0.09);
ctx.font = `bold ${fontSize}px sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

const text = 'Chwazam';
const textX = W / 2;
const textY = H / 2;

// Measure letter positions for arrow targeting (same algorithm as gen-splash.cjs)
const letterPositions = [];
const metrics = ctx.measureText(text);
const totalWidth = metrics.width;
let curX = textX - totalWidth / 2;

for (let i = 0; i < text.length; i++) {
  const charWidth = ctx.measureText(text[i]).width;
  letterPositions.push({ x: curX + charWidth / 2, y: textY });
  curX += charWidth;
}

// Draw tower circles around the text
const towerRadius = Math.round(W * 0.035);
const towerPositions = [
  { x: W * 0.12, y: H * 0.30 },
  { x: W * 0.88, y: H * 0.35 },
  { x: W * 0.15, y: H * 0.75 },
  { x: W * 0.85, y: H * 0.72 },
  { x: W * 0.50, y: H * 0.88 },
];

for (let i = 0; i < towerPositions.length; i++) {
  const tp = towerPositions[i];
  const color = TOWER_COLORS[i];
  // Add to letter positions so arrows also point at towers
  letterPositions.push({ x: tp.x, y: tp.y });

  // Glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = towerRadius * 0.8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tp.x, tp.y, towerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Solid circle on top
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tp.x, tp.y, towerRadius, 0, Math.PI * 2);
  ctx.fill();
}

// Draw arrows grid (adapted from gen-splash.cjs lines 62-117)
const spacing = Math.round(W * 0.035);
const arrowSize = Math.round(W * 0.010);
const textClearance = fontSize * 1.2;

for (let gx = spacing; gx < W; gx += spacing) {
  for (let gy = spacing; gy < H; gy += spacing) {
    // Skip if too close to text center
    const dx = gx - textX;
    const dy = gy - textY;
    if (Math.abs(dx) < totalWidth / 2 + spacing && Math.abs(dy) < textClearance / 2) {
      continue;
    }

    // Skip if too close to any tower
    let tooClose = false;
    for (const tp of towerPositions) {
      const d = Math.sqrt((gx - tp.x) ** 2 + (gy - tp.y) ** 2);
      if (d < towerRadius * 2) { tooClose = true; break; }
    }
    if (tooClose) continue;

    // Find nearest target (letter or tower)
    let nearestDist = Infinity;
    let nearestTarget = letterPositions[0];
    for (const lp of letterPositions) {
      const d = Math.sqrt((gx - lp.x) ** 2 + (gy - lp.y) ** 2);
      if (d < nearestDist) {
        nearestDist = d;
        nearestTarget = lp;
      }
    }

    const angle = Math.atan2(nearestTarget.y - gy, nearestTarget.x - gx);
    const maxDist = Math.sqrt(W * W + H * H) / 2;
    const distRatio = nearestDist / maxDist;
    const alpha = 0.10 + (1 - distRatio) * 0.22;

    const jx = gx + (Math.random() - 0.5) * spacing * 0.2;
    const jy = gy + (Math.random() - 0.5) * spacing * 0.2;
    const s = arrowSize + Math.random() * arrowSize * 0.3;

    ctx.save();
    ctx.translate(jx, jy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(${ARROW_COLOR_RGB[0]}, ${ARROW_COLOR_RGB[1]}, ${ARROW_COLOR_RGB[2]}, ${alpha})`;

    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, -s * 0.5);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(-s * 0.6, s * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// Draw text with glow
ctx.shadowColor = 'rgba(255, 59, 59, 0.6)';
ctx.shadowBlur = fontSize * 0.3;
ctx.fillStyle = TEXT_COLOR;
ctx.font = `bold ${fontSize}px sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(text, textX, textY);

// Second pass for stronger text
ctx.shadowBlur = 0;
ctx.fillText(text, textX, textY);

// Write PNG
const dir = path.dirname(OUT);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(OUT, canvas.toBuffer('image/png'));
console.log(`  ${OUT} (${W}x${H})`);
