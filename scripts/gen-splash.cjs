const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

// Splash sizes: [folder, width, height]
const PORTRAIT = [
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 1080, 1920],
  ['drawable-port-xxxhdpi', 1440, 2560],
];

const LANDSCAPE = [
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1920, 1080],
  ['drawable-land-xxxhdpi', 2560, 1440],
];

const BG_COLOR = '#1a1a2e';
const TEXT_COLOR = '#FF3B3B';
const ARROW_COLOR = '#FF3B3B';

function generateSplash(w, h, outPath) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, w, h);

  // Text setup
  const fontSize = Math.round(w * 0.09);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const text = 'Chwazam';
  const textX = w / 2;
  const textY = h / 2;

  // Measure each letter's position for arrow targeting
  const letterPositions = [];
  const metrics = ctx.measureText(text);
  const totalWidth = metrics.width;
  let curX = textX - totalWidth / 2;

  for (let i = 0; i < text.length; i++) {
    const charWidth = ctx.measureText(text[i]).width;
    letterPositions.push({
      x: curX + charWidth / 2,
      y: textY,
    });
    curX += charWidth;
  }

  // Draw arrows grid
  const spacing = Math.round(w * 0.045);
  const arrowSize = Math.round(w * 0.012);
  const textClearance = fontSize * 1.2; // don't draw arrows too close to text

  for (let gx = spacing; gx < w; gx += spacing) {
    for (let gy = spacing; gy < h; gy += spacing) {
      // Skip if too close to text center
      const dx = gx - textX;
      const dy = gy - textY;
      if (Math.abs(dx) < totalWidth / 2 + spacing && Math.abs(dy) < textClearance / 2) {
        continue;
      }

      // Find nearest letter
      let nearestDist = Infinity;
      let nearestLetter = letterPositions[0];
      for (const lp of letterPositions) {
        const d = Math.sqrt((gx - lp.x) ** 2 + (gy - lp.y) ** 2);
        if (d < nearestDist) {
          nearestDist = d;
          nearestLetter = lp;
        }
      }

      // Angle toward nearest letter
      const angle = Math.atan2(nearestLetter.y - gy, nearestLetter.x - gx);

      // Fade based on distance — closer arrows are more visible
      const maxDist = Math.sqrt(w * w + h * h) / 2;
      const distRatio = nearestDist / maxDist;
      const alpha = 0.12 + (1 - distRatio) * 0.25;

      // Slight jitter for organic feel
      const jx = gx + (Math.random() - 0.5) * spacing * 0.2;
      const jy = gy + (Math.random() - 0.5) * spacing * 0.2;

      const s = arrowSize + Math.random() * arrowSize * 0.3;

      // Draw arrow
      ctx.save();
      ctx.translate(jx, jy);
      ctx.rotate(angle);
      ctx.fillStyle = `rgba(255, 59, 59, ${alpha})`;

      // Arrow shape (like VictoryArrows)
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
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);
  console.log(`  ${outPath} (${w}x${h})`);
}

console.log('Generating splash screens...');

// Default splash (used as fallback)
generateSplash(480, 800, path.join(RES, 'drawable', 'splash.png'));

for (const [folder, w, h] of PORTRAIT) {
  generateSplash(w, h, path.join(RES, folder, 'splash.png'));
}

for (const [folder, w, h] of LANDSCAPE) {
  generateSplash(w, h, path.join(RES, folder, 'splash.png'));
}

console.log('Done!');
