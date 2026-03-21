import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, lerp, randomRange } from './utils';

type LightningPhase = 'STORM' | 'SETTLE';

const SETTLE_DUR = 1.0;
const STRIKE_INTERVAL = 1.0; // one strike per second
const FLASH_DUR = 0.15;
const RAIN_COUNT = 150;

interface Raindrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  alpha: number;
}

interface LightningBolt {
  branches: { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }[];
  alpha: number;
  targetX: number;
  targetY: number;
}

export class LightningAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: LightningPhase = 'STORM';
  phaseTime = 0;
  finished = false;

  raindrops: Raindrop[] = [];
  bolts: LightningBolt[] = [];
  strikeTimer: number;
  screenFlashAlpha = 0;
  ambientFlashAlpha = 0;
  ambientFlashTimer = 0;

  // Enemies in random order for sequential strikes
  strikeOrder: Tower[];
  strikeIndex = 0;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    winner.invincible = true;

    // Randomize strike order
    this.strikeOrder = [...this.enemies];
    for (let i = this.strikeOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.strikeOrder[i], this.strikeOrder[j]] = [this.strikeOrder[j], this.strikeOrder[i]];
    }

    // First strike after a short delay
    this.strikeTimer = 0.5;

    // Initialize rain
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.raindrops.push(this.spawnRaindrop());
    }
  }

  private spawnRaindrop(): Raindrop {
    const windAngle = randomRange(0.05, 0.2);
    const speed = randomRange(600, 1000);
    return {
      x: randomRange(-50, this.canvasW + 50),
      y: randomRange(-this.canvasH, this.canvasH),
      vx: Math.sin(windAngle) * speed,
      vy: Math.cos(windAngle) * speed,
      length: randomRange(10, 22),
      alpha: randomRange(0.2, 0.5),
    };
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    // Update rain
    for (const drop of this.raindrops) {
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      if (drop.y > this.canvasH + 20 || drop.x > this.canvasW + 60) {
        Object.assign(drop, this.spawnRaindrop());
      }
    }

    // Fade bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].alpha -= dt * 3;
      if (this.bolts[i].alpha <= 0) this.bolts.splice(i, 1);
    }

    // Fade flashes
    this.screenFlashAlpha = Math.max(0, this.screenFlashAlpha - dt / FLASH_DUR);

    // Ambient flashes (random dim blinks between strikes)
    this.ambientFlashAlpha = Math.max(0, this.ambientFlashAlpha - dt * 5);
    this.ambientFlashTimer -= dt;
    if (this.ambientFlashTimer <= 0 && this.phase === 'STORM') {
      this.ambientFlashTimer = randomRange(0.3, 0.8);
      this.ambientFlashAlpha = randomRange(0.05, 0.15);
    }

    switch (this.phase) {
      case 'STORM':
        this.updateStorm(dt);
        break;
      case 'SETTLE':
        if (this.phaseTime >= SETTLE_DUR) {
          this.particles.celebrationBurst(this.winner.x, this.winner.y, 80);
          this.finished = true;
        }
        break;
    }
  }

  private updateStorm(dt: number) {
    this.strikeTimer -= dt;

    if (this.strikeTimer <= 0 && this.strikeIndex < this.strikeOrder.length) {
      const target = this.strikeOrder[this.strikeIndex];
      this.strikeIndex++;
      this.strikeTimer = STRIKE_INTERVAL;

      // Generate lightning bolt from sky to target
      this.generateBolt(target.x, target.y);

      // Screen flash
      this.screenFlashAlpha = 1;

      // Kill tower
      target.alive = false;
      target.hp = 0;
      this.particles.burst(target.x, target.y, target.color, 80);

      // Check if all enemies dead
      if (this.strikeIndex >= this.strikeOrder.length) {
        // Small delay before settle
        setTimeout(() => {}, 0);
        this.phase = 'SETTLE';
        this.phaseTime = 0;
      }
    }
  }

  private generateBolt(tx: number, ty: number) {
    const bolt: LightningBolt = {
      branches: [],
      alpha: 1,
      targetX: tx,
      targetY: ty,
    };

    // Main bolt from random top position to target
    const sx = tx + randomRange(-80, 80);
    const sy = -10;
    this.traceBolt(bolt, sx, sy, tx, ty, 4);

    this.bolts.push(bolt);
  }

  private traceBolt(
    bolt: LightningBolt,
    x1: number, y1: number, x2: number, y2: number,
    depth: number,
  ) {
    if (depth <= 0) return;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(3, Math.floor(len / 30));

    let cx = x1, cy = y1;
    for (let i = 0; i < segments; i++) {
      const t = (i + 1) / segments;
      // Target point along the line, with jitter
      const nx = x1 + dx * t + randomRange(-20, 20);
      const ny = y1 + dy * t + randomRange(-10, 10);
      // Midpoint with extra jitter for curve
      const mx = (cx + nx) / 2 + randomRange(-15, 15);
      const my = (cy + ny) / 2 + randomRange(-10, 10);

      bolt.branches.push({ x1: cx, y1: cy, x2: mx, y2: my, x3: nx, y3: ny });

      // Random sub-branches
      if (depth > 1 && Math.random() < 0.3) {
        const bAngle = Math.atan2(ny - cy, nx - cx) + randomRange(-1.2, 1.2);
        const bLen = randomRange(30, 80);
        const bx = nx + Math.cos(bAngle) * bLen;
        const by = ny + Math.sin(bAngle) * bLen;
        this.traceBolt(bolt, nx, ny, bx, by, depth - 1);
      }

      cx = nx;
      cy = ny;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Darken scene (storm atmosphere)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,10,0.3)';
    ctx.fillRect(0, 0, this.canvasW, this.canvasH);
    ctx.restore();

    // Rain
    ctx.save();
    for (const drop of this.raindrops) {
      if (drop.y < -20 || drop.y > this.canvasH + 20) continue;
      ctx.strokeStyle = `rgba(170,195,220,${drop.alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - drop.vx * 0.012, drop.y - drop.vy * 0.012);
      ctx.stroke();
    }
    ctx.restore();

    // Lightning bolts
    for (const bolt of this.bolts) {
      if (bolt.alpha <= 0) continue;

      // Glow
      ctx.save();
      ctx.globalAlpha = bolt.alpha * 0.3;
      ctx.strokeStyle = '#88aaff';
      ctx.lineWidth = 8;
      for (const b of bolt.branches) {
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.quadraticCurveTo(b.x2, b.y2, b.x3, b.y3);
        ctx.stroke();
      }
      ctx.restore();

      // Core
      ctx.save();
      ctx.globalAlpha = bolt.alpha;
      ctx.strokeStyle = '#ddeeff';
      ctx.lineWidth = 2.5;
      for (const b of bolt.branches) {
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.quadraticCurveTo(b.x2, b.y2, b.x3, b.y3);
        ctx.stroke();
      }
      ctx.restore();

      // Impact glow at target
      if (bolt.alpha > 0.3) {
        ctx.save();
        ctx.globalAlpha = bolt.alpha * 0.5;
        const grad = ctx.createRadialGradient(bolt.targetX, bolt.targetY, 0, bolt.targetX, bolt.targetY, 60);
        grad.addColorStop(0, 'rgba(200,220,255,0.8)');
        grad.addColorStop(1, 'rgba(100,150,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bolt.targetX, bolt.targetY, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Screen flash (strike)
    if (this.screenFlashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.screenFlashAlpha * 0.5;
      ctx.fillStyle = '#cce0ff';
      ctx.fillRect(0, 0, this.canvasW, this.canvasH);
      ctx.restore();
    }

    // Ambient blink
    if (this.ambientFlashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.ambientFlashAlpha;
      ctx.fillStyle = '#8899bb';
      ctx.fillRect(0, 0, this.canvasW, this.canvasH);
      ctx.restore();
    }
  }
}
