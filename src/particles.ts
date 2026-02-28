import { hexToRgb, rgbString } from './colors';
import { randomRange } from './utils';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

export class ParticleSystem {
  particles: Particle[] = [];

  // Optional gravity attractor (used by black hole)
  attractorX = 0;
  attractorY = 0;
  attractorStrength = 0; // 0 = normal gravity, >0 = attract toward point

  burst(x: number, y: number, color: string, count = 60) {
    const { r, g, b } = hexToRgb(color);
    for (let i = 0; i < count; i++) {
      const angle = randomRange(0, Math.PI * 2);
      const speed = randomRange(50, 350);
      const life = randomRange(0.5, 1.2);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: randomRange(2, 8),
        r, g, b,
      });
    }
  }

  nukeBurst(x: number, y: number, count = 120) {
    const colors = ['#FF6600', '#FF8800', '#CC4400', '#FFB347', '#8B4513', '#FFD700'];
    for (let i = 0; i < count; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const { r, g, b } = hexToRgb(color);
      const angle = randomRange(0, Math.PI * 2);
      // Bias upward: reduce vy
      const speed = randomRange(40, 250);
      const life = randomRange(1, 3);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - randomRange(50, 200),
        life,
        maxLife: life,
        size: randomRange(4, 15),
        r, g, b,
      });
    }
  }

  celebrationBurst(x: number, y: number, count = 30) {
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#FFEAA7', '#FF8C42'];
    for (const color of colors) {
      this.burst(x, y, color, Math.floor(count / colors.length));
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (this.attractorStrength > 0) {
        // Attract toward point — dampen outward velocity so particles spiral inward
        const dx = this.attractorX - p.x;
        const dy = this.attractorY - p.y;
        const d = Math.max(10, Math.sqrt(dx * dx + dy * dy));
        const force = this.attractorStrength / (d * d);
        p.vx += (dx / d) * force * dt;
        p.vy += (dy / d) * force * dt;
        // Strong drag to kill outward burst velocity
        p.vx *= 0.93;
        p.vy *= 0.93;
      } else {
        p.vy += 200 * dt; // normal gravity
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (this.attractorStrength <= 0) p.vx *= 0.98;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      const size = p.size * alpha;
      ctx.fillStyle = rgbString(p.r, p.g, p.b, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  get active(): boolean {
    return this.particles.length > 0;
  }
}
