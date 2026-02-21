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

  celebrationBurst(x: number, y: number, count = 30) {
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#FFEAA7', '#FF8C42'];
    for (const color of colors) {
      this.burst(x, y, color, Math.floor(count / colors.length));
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // gravity
      p.vx *= 0.98;
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
