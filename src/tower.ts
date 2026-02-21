import { hexToRgb, rgbString } from './colors';
import { randomRange, easeOutBack } from './utils';

export interface Cannon {
  orbitAngle: number;   // position on the circle perimeter
  orbitSpeed: number;   // radians per second
  aimAngle: number;     // direction the barrel points (visual spin)
  aimSpeed: number;     // barrel spin speed
  fireTimer: number;
  fireInterval: number;
  spawnTime: number;
  scale: number;
}

export class Tower {
  id: number;
  x: number;
  y: number;
  color: string;
  radius = 40;
  hp = 3;
  maxHp = 3;
  alive = true;
  invincible = false;

  // Animation
  spawnTime = 0;
  spawnDuration = 0.2;
  scale = 0;

  // Cannons (multiple, orbiting perimeter)
  cannons: Cannon[] = [];
  cannonVisible = false;
  lastCannonAddTime = 0;

  // Hit effect
  flashTimer = 0;
  shakeTimer = 0;
  shakeX = 0;
  shakeY = 0;

  constructor(id: number, x: number, y: number, color: string) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.color = color;
  }

  addCannon(elapsed: number) {
    const cannon: Cannon = {
      orbitAngle: this.cannons.length === 0
        ? randomRange(0, Math.PI * 2)
        : this.cannons[this.cannons.length - 1].orbitAngle + Math.PI * 2 / (this.cannons.length + 1),
      orbitSpeed: randomRange(1.5, 3.0) * (Math.random() > 0.5 ? 1 : -1),
      aimAngle: randomRange(0, Math.PI * 2),
      aimSpeed: randomRange(2, 5) * Math.PI * 2,
      fireTimer: randomRange(0.1, 0.8),
      fireInterval: randomRange(0.4, 1.0),
      spawnTime: elapsed,
      scale: 0,
    };
    this.cannons.push(cannon);
    this.lastCannonAddTime = elapsed;
  }

  startBattle(elapsed: number) {
    this.cannonVisible = true;
    this.addCannon(elapsed);
  }

  hit(): boolean {
    if (this.invincible) return false;
    this.hp--;
    this.flashTimer = 0.1;
    this.shakeTimer = 0.2;
    if (this.hp <= 0) {
      this.alive = false;
    }
    return true;
  }

  update(dt: number, elapsed: number): { fires: { x: number; y: number; angle: number }[] } {
    const fires: { x: number; y: number; angle: number }[] = [];

    // Spawn animation
    if (this.scale < 1) {
      const t = Math.min(1, (elapsed - this.spawnTime) / this.spawnDuration);
      this.scale = easeOutBack(t);
    }

    // Hit flash
    if (this.flashTimer > 0) this.flashTimer -= dt;

    // Shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      this.shakeX = randomRange(-4, 4) * (this.shakeTimer / 0.2);
      this.shakeY = randomRange(-4, 4) * (this.shakeTimer / 0.2);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    // Update each cannon
    for (const c of this.cannons) {
      // Cannon spawn animation
      if (c.scale < 1) {
        const t = Math.min(1, (elapsed - c.spawnTime) / 0.4);
        c.scale = easeOutBack(t);
      }

      // Orbit around the perimeter
      c.orbitAngle += c.orbitSpeed * dt;

      // Barrel spin (visual)
      c.aimAngle += c.aimSpeed * dt;

      // Fire logic
      if (c.scale >= 1) {
        c.fireTimer -= dt;
        if (c.fireTimer <= 0) {
          c.fireTimer = c.fireInterval;
          // Fire position is on the perimeter
          const cx = this.x + Math.cos(c.orbitAngle) * this.radius;
          const cy = this.y + Math.sin(c.orbitAngle) * this.radius;
          fires.push({ x: cx, y: cy, angle: c.aimAngle });
        }
      }
    }

    return { fires };
  }

  draw(ctx: CanvasRenderingContext2D) {
    const dx = this.x + this.shakeX;
    const dy = this.y + this.shakeY;
    const r = this.radius * this.scale;

    if (r <= 0) return;

    const { r: cr, g: cg, b: cb } = hexToRgb(this.color);

    // Disk shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(dx + 3, dy + 3, r, 0, Math.PI * 2);
    ctx.fill();

    // Disk
    const grad = ctx.createRadialGradient(dx - r * 0.3, dy - r * 0.3, 0, dx, dy, r);
    grad.addColorStop(0, rgbString(Math.min(255, cr + 60), Math.min(255, cg + 60), Math.min(255, cb + 60)));
    grad.addColorStop(1, this.color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();

    // Invincible shield glow
    if (this.invincible) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(dx, dy, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // HP indicator (ring segments) — only if not invincible
    if (!this.invincible) {
      for (let i = 0; i < this.maxHp; i++) {
        const segAngle = (Math.PI * 2) / this.maxHp;
        const startA = -Math.PI / 2 + i * segAngle + 0.05;
        const endA = -Math.PI / 2 + (i + 1) * segAngle - 0.05;
        ctx.strokeStyle = i < this.hp ? '#ffffff' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(dx, dy, r + 5, startA, endA);
        ctx.stroke();
      }
    }

    // Cannons orbiting the perimeter
    if (this.cannonVisible) {
      for (const c of this.cannons) {
        if (c.scale <= 0) continue;
        const cs = c.scale;
        const cx = dx + Math.cos(c.orbitAngle) * r;
        const cy = dy + Math.sin(c.orbitAngle) * r;
        const barrelLen = 20 * cs;
        const barrelW = 6 * cs;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(c.aimAngle);

        // Barrel
        ctx.fillStyle = '#333';
        ctx.fillRect(0, -barrelW / 2, barrelLen, barrelW);
        ctx.fillStyle = '#555';
        ctx.fillRect(barrelLen - 3, -barrelW / 2 - 1, 3, barrelW + 2);

        // Base
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(0, 0, 7 * cs, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(0, 0, 4 * cs, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    // Flash overlay on hit
    if (this.flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashTimer / 0.1 * 0.6})`;
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
