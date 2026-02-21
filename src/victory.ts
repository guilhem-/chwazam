import { hexToRgb, rgbString } from './colors';

interface Arrow {
  x: number;
  y: number;
  baseAngle: number;
  distance: number;
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

  constructor(centerX: number, centerY: number, color: string) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.color = color;

    // Create arrows in expanding rings
    const rings = [
      { count: 8, distance: 80, size: 14 },
      { count: 12, distance: 130, size: 12 },
      { count: 16, distance: 185, size: 10 },
    ];

    for (const ring of rings) {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        this.arrows.push({
          x: centerX + Math.cos(angle) * ring.distance,
          y: centerY + Math.sin(angle) * ring.distance,
          baseAngle: Math.atan2(centerY - (centerY + Math.sin(angle) * ring.distance),
                                centerX - (centerX + Math.cos(angle) * ring.distance)),
          distance: ring.distance,
          wobbleOffset: Math.random() * Math.PI * 2,
          wobbleSpeed: 1.5 + Math.random() * 1.5,
          size: ring.size,
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
      const wobble = Math.sin(this.time * arrow.wobbleSpeed + arrow.wobbleOffset) * 0.3;
      const pointAngle = arrow.baseAngle + wobble;

      // Wobble position slightly
      const posWobble = Math.sin(this.time * 2 + arrow.wobbleOffset) * 4;
      const ax = arrow.x + Math.cos(arrow.baseAngle + Math.PI / 2) * posWobble;
      const ay = arrow.y + Math.sin(arrow.baseAngle + Math.PI / 2) * posWobble;

      const alpha = 0.5 + Math.sin(this.time * 3 + arrow.wobbleOffset) * 0.3;
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
      ctx.moveTo(s, 0);           // tip
      ctx.lineTo(-s * 0.6, -s * 0.5);
      ctx.lineTo(-s * 0.3, 0);
      ctx.lineTo(-s * 0.6, s * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }
}
