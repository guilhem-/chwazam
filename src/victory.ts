import { hexToRgb, rgbString } from './colors';
import { angleBetween } from './utils';

interface Arrow {
  x: number;
  y: number;
  wobbleOffset: number;
  wobbleSpeed: number;
  size: number;
}

export class VictoryArrows {
  arrows: Arrow[] = [];
  centerX: number;
  centerY: number;
  color: string;
  time = 0;

  constructor(centerX: number, centerY: number, color: string, screenW: number, screenH: number) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.color = color;

    // Fill entire screen with arrows on a grid
    const spacing = 50;
    const margin = 20;
    for (let gx = margin; gx < screenW - margin; gx += spacing) {
      for (let gy = margin; gy < screenH - margin; gy += spacing) {
        // Skip arrows too close to the winner (leave room for the disk)
        const dx = gx - centerX;
        const dy = gy - centerY;
        if (Math.sqrt(dx * dx + dy * dy) < 60) continue;

        this.arrows.push({
          x: gx + (Math.random() - 0.5) * 15,
          y: gy + (Math.random() - 0.5) * 15,
          wobbleOffset: Math.random() * Math.PI * 2,
          wobbleSpeed: 1.5 + Math.random() * 1.5,
          size: 10 + Math.random() * 4,
        });
      }
    }
  }

  update(dt: number) {
    this.time += dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { r, g, b } = hexToRgb(this.color);

    for (const arrow of this.arrows) {
      const baseAngle = angleBetween(arrow.x, arrow.y, this.centerX, this.centerY);
      const wobble = Math.sin(this.time * arrow.wobbleSpeed + arrow.wobbleOffset) * 0.3;
      const pointAngle = baseAngle + wobble;

      // Wobble position slightly
      const posWobble = Math.sin(this.time * 2 + arrow.wobbleOffset) * 4;
      const ax = arrow.x + Math.cos(baseAngle + Math.PI / 2) * posWobble;
      const ay = arrow.y + Math.sin(baseAngle + Math.PI / 2) * posWobble;

      // Fade based on distance from center
      const dx = arrow.x - this.centerX;
      const dy = arrow.y - this.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distAlpha = Math.min(1, dist / 200) * 0.6;
      const alpha = (0.3 + Math.sin(this.time * 3 + arrow.wobbleOffset) * 0.2) * distAlpha;
      const s = arrow.size;

      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(pointAngle);

      // Glow
      ctx.shadowColor = rgbString(r, g, b, 0.8);
      ctx.shadowBlur = 10;

      // Arrow body
      ctx.fillStyle = rgbString(r, g, b, alpha);
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
}
