import { hexToRgb, rgbString } from './colors';
import { randomRange, easeOutBack } from './utils';
import type { PRNG } from './prng';

export interface Cannon {
  // Global: position on the circle perimeter
  orbitAngle: number;
  orbitSpeed: number;
  // Local: oscillation phase for aim (±90° from tangent)
  oscillatePhase: number;
  oscillateSpeed: number;
  // Firing
  fireTimer: number;
  fireInterval: number;
  spawnTime: number;
  scale: number;
}

/** Compute the world-space aim angle for a cannon given its orbit angle. */
function cannonWorldAim(c: Cannon): number {
  // Outward radial direction = orbitAngle (points away from disk center)
  // Oscillate ±90° around outward: sweeps between the two tangent directions
  // sin=-1 → tangent one way, sin=0 → straight out, sin=+1 → tangent other way
  // Never aims inward (toward own disk)
  const outward = c.orbitAngle;
  const oscillation = Math.sin(c.oscillatePhase) * (Math.PI / 2);
  return outward + oscillation;
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

  // Finger tracking
  hasFinger = true;
  withdrawScale = 1;       // 1=full, shrinks to 0 over 1s when finger removed
  withdrawing = false;

  // Cannons
  cannons: Cannon[] = [];
  cannonVisible = false;

  // Hit effect
  flashTimer = 0;
  shakeTimer = 0;
  shakeX = 0;
  shakeY = 0;

  // Death order tracking (for no-draw rule)
  lastDeathOrder = 0;

  constructor(id: number, x: number, y: number, color: string) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.color = color;
  }

  addCannon(elapsed: number, prng?: PRNG) {
    const rr = prng ? prng.randomRange.bind(prng) : randomRange;
    const rf = prng ? prng.random.bind(prng) : Math.random;
    const n = this.cannons.length;
    const cannon: Cannon = {
      orbitAngle: n === 0
        ? rr(0, Math.PI * 2)
        : this.cannons[n - 1].orbitAngle + Math.PI * 2 / (n + 1),
      orbitSpeed: rr(1.5, 3.0) * (rf() > 0.5 ? 1 : -1),
      oscillatePhase: rr(0, Math.PI * 2),
      oscillateSpeed: rr(2, 4),
      fireTimer: rr(0.1, 0.8),
      fireInterval: rr(0.4, 1.0),
      spawnTime: elapsed,
      scale: 0,
    };
    this.cannons.push(cannon);
  }

  startBattle(elapsed: number, prng?: PRNG) {
    this.cannonVisible = true;
    this.addCannon(elapsed, prng);
  }

  fingerRemoved() {
    this.hasFinger = false;
    this.withdrawing = true;
  }

  fingerRestored() {
    this.hasFinger = true;
    this.withdrawing = false;
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

    // Withdraw: shrink over 1 second when finger removed during battle
    if (this.withdrawing) {
      this.withdrawScale = Math.max(0, this.withdrawScale - dt);
      if (this.withdrawScale <= 0) {
        // Fully disappeared — tower dies
        this.alive = false;
      }
    } else if (this.withdrawScale < 1) {
      // Restore when finger comes back
      this.withdrawScale = Math.min(1, this.withdrawScale + dt * 2);
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

    const canFire = this.withdrawScale > 0.5;

    // Update cannons
    for (const c of this.cannons) {
      // Spawn animation
      if (c.scale < 1) {
        const t = Math.min(1, (elapsed - c.spawnTime) / 0.4);
        c.scale = easeOutBack(t);
      }

      // Orbit: update position on circle
      c.orbitAngle += c.orbitSpeed * dt;

      // Oscillate local aim
      c.oscillatePhase += c.oscillateSpeed * dt;

      // Fire logic
      if (c.scale >= 1 && canFire) {
        c.fireTimer -= dt;
        if (c.fireTimer <= 0) {
          c.fireTimer = c.fireInterval;
          // Position: on the perimeter at orbitAngle
          const cx = this.x + Math.cos(c.orbitAngle) * this.radius;
          const cy = this.y + Math.sin(c.orbitAngle) * this.radius;
          // Aim: tangent ± 90° oscillation
          fires.push({ x: cx, y: cy, angle: cannonWorldAim(c) });
        }
      }
    }

    return { fires };
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.withdrawScale <= 0) return;

    const effectiveScale = this.scale * this.withdrawScale;
    const dx = this.x + this.shakeX;
    const dy = this.y + this.shakeY;
    const r = this.radius * effectiveScale;

    if (r <= 0) return;

    const { r: cr, g: cg, b: cb } = hexToRgb(this.color);
    const baseAlpha = this.withdrawScale;

    // Disk shadow
    ctx.fillStyle = `rgba(0,0,0,${0.3 * baseAlpha})`;
    ctx.beginPath();
    ctx.arc(dx + 3, dy + 3, r, 0, Math.PI * 2);
    ctx.fill();

    // Disk
    const grad = ctx.createRadialGradient(dx - r * 0.3, dy - r * 0.3, 0, dx, dy, r);
    grad.addColorStop(0, rgbString(Math.min(255, cr + 60), Math.min(255, cg + 60), Math.min(255, cb + 60), baseAlpha));
    grad.addColorStop(1, rgbString(cr, cg, cb, baseAlpha));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();

    // Invincible shield
    if (this.invincible) {
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * baseAlpha})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(dx, dy, r + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // HP indicator
    if (!this.invincible) {
      for (let i = 0; i < this.maxHp; i++) {
        const segAngle = (Math.PI * 2) / this.maxHp;
        const startA = -Math.PI / 2 + i * segAngle + 0.05;
        const endA = -Math.PI / 2 + (i + 1) * segAngle - 0.05;
        ctx.strokeStyle = i < this.hp
          ? `rgba(255,255,255,${baseAlpha})`
          : `rgba(255,255,255,${0.15 * baseAlpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(dx, dy, r + 5, startA, endA);
        ctx.stroke();
      }
    }

    // Cannons
    if (this.cannonVisible && this.withdrawScale > 0.3) {
      for (const c of this.cannons) {
        if (c.scale <= 0) continue;
        const cs = c.scale * this.withdrawScale;
        // Global position on perimeter
        const cx = dx + Math.cos(c.orbitAngle) * r;
        const cy = dy + Math.sin(c.orbitAngle) * r;
        // Global aim = tangent + oscillation
        const worldAim = cannonWorldAim(c);

        const barrelLen = 20 * cs;
        const barrelW = 6 * cs;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(worldAim);
        ctx.globalAlpha = baseAlpha;

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

        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // Flash overlay
    if (this.flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashTimer / 0.1 * 0.6 * baseAlpha})`;
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
