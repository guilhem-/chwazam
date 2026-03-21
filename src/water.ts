import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, lerp, randomRange } from './utils';

type WaterPhase = 'RISING' | 'SETTLE';

const SETTLE_DUR = 1.0;

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

interface RainSplash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

interface Raindrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  alpha: number;
}

export class WaterAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: WaterPhase = 'RISING';
  phaseTime = 0;
  finished = false;

  // Flood closes in from edges toward the winner — dry radius shrinks
  dryRadius: number;   // current dry circle radius (water is everywhere outside this)
  maxDryRadius: number; // initial (covers whole screen)

  ripples: Ripple[] = [];
  rainSplashes: RainSplash[] = [];
  raindrops: Raindrop[] = [];
  lightningTimer = 0;
  lightningBranches: { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number }[] = [];
  lightningAlpha = 0;

  // Enemies sorted by distance to winner (farthest first — drowned first)
  drowningOrder: Tower[];
  drownedSet = new Set<number>();

  riseDuration: number;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    winner.invincible = true;

    // Max dry radius: distance from winner to farthest screen corner
    this.maxDryRadius = Math.max(
      dist(winner.x, winner.y, 0, 0),
      dist(winner.x, winner.y, canvasW, 0),
      dist(winner.x, winner.y, 0, canvasH),
      dist(winner.x, winner.y, canvasW, canvasH),
    ) + 50;

    this.dryRadius = this.maxDryRadius;

    // Sort enemies by distance to winner, farthest first
    this.drowningOrder = [...this.enemies].sort(
      (a, b) => dist(b.x, b.y, winner.x, winner.y) - dist(a.x, a.y, winner.x, winner.y),
    );

    this.riseDuration = Math.max(3, this.enemies.length * 1.5);

    // Initialize rain
    for (let i = 0; i < 100; i++) {
      this.raindrops.push(this.spawnRaindrop());
    }
  }

  private spawnRaindrop(): Raindrop {
    const windAngle = randomRange(-0.15, 0.15);
    const speed = randomRange(500, 900);
    return {
      x: Math.random() * this.canvasW,
      y: randomRange(-this.canvasH, this.canvasH),
      vx: Math.sin(windAngle) * speed,
      vy: Math.cos(windAngle) * speed,
      length: randomRange(6, 16),
      alpha: randomRange(0.15, 0.4),
    };
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'RISING':
        this.updateRising();
        break;
      case 'SETTLE':
        if (this.phaseTime >= SETTLE_DUR) {
          this.particles.celebrationBurst(this.winner.x, this.winner.y, 80);
          this.finished = true;
        }
        break;
    }

    // Update raindrops
    for (const drop of this.raindrops) {
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      if (drop.y > this.canvasH + 10 || drop.x < -50 || drop.x > this.canvasW + 50) {
        Object.assign(drop, this.spawnRaindrop());
      }
    }

    // Spawn splashes at random positions on water (decoupled from drop physics)
    if (this.rainSplashes.length < 40 && this.dryRadius < this.maxDryRadius) {
      for (let i = 0; i < 3; i++) {
        const x = Math.random() * this.canvasW;
        const y = Math.random() * this.canvasH;
        if (dist(x, y, this.winner.x, this.winner.y) > this.dryRadius + 10) {
          this.rainSplashes.push({
            x, y, radius: 0,
            maxRadius: randomRange(5, 14), life: 0, maxLife: randomRange(0.3, 0.6),
          });
        }
      }
    }

    // Update rain splashes
    for (let i = this.rainSplashes.length - 1; i >= 0; i--) {
      const s = this.rainSplashes[i];
      s.life += dt;
      s.radius = (s.life / s.maxLife) * s.maxRadius;
      if (s.life >= s.maxLife) this.rainSplashes.splice(i, 1);
    }

    // Update ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life += dt;
      r.radius = (r.life / r.maxLife) * r.maxRadius;
      if (r.life >= r.maxLife) this.ripples.splice(i, 1);
    }

    // Lightning: random flashes
    this.lightningAlpha = Math.max(0, this.lightningAlpha - dt * 4);
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0 && this.phase === 'RISING') {
      this.lightningTimer = randomRange(1.5, 4.0);
      this.lightningAlpha = 1;
      this.lightningBranches = [];
      // Generate a branching lightning bolt
      const sx = randomRange(0, this.canvasW);
      const sy = randomRange(0, this.canvasH * 0.3);
      this.generateLightning(sx, sy, randomRange(-0.5, 0.5) + Math.PI / 2, randomRange(100, 250), 3);
    }
  }

  private generateLightning(x: number, y: number, angle: number, length: number, depth: number) {
    if (depth <= 0 || length < 15) return;
    const segments = Math.floor(length / 20);
    let cx = x, cy = y;
    for (let i = 0; i < segments; i++) {
      const jitter = randomRange(-0.6, 0.6);
      const a = angle + jitter;
      const segLen = randomRange(15, 30);
      const nx = cx + Math.cos(a) * segLen;
      const ny = cy + Math.sin(a) * segLen;
      // Store as quadratic curve (with a jittered midpoint)
      const mx = (cx + nx) / 2 + randomRange(-8, 8);
      const my = (cy + ny) / 2 + randomRange(-8, 8);
      this.lightningBranches.push({ x1: cx, y1: cy, x2: mx, y2: my, x3: nx, y3: ny });
      cx = nx;
      cy = ny;
      // Random branch
      if (Math.random() < 0.3) {
        const branchAngle = angle + randomRange(-1.0, 1.0);
        this.generateLightning(cx, cy, branchAngle, length * 0.5, depth - 1);
      }
    }
  }

  private updateRising() {
    const t = Math.min(1, this.phaseTime / this.riseDuration);
    const ease = t * t;
    // Target: dry radius shrinks to just around the winner
    const targetRadius = this.winner.radius + 10;
    this.dryRadius = lerp(this.maxDryRadius, targetRadius, ease);

    // Drown enemies when water reaches them
    for (const enemy of this.drowningOrder) {
      if (this.drownedSet.has(enemy.id)) continue;
      const d = dist(enemy.x, enemy.y, this.winner.x, this.winner.y);
      if (d + enemy.radius > this.dryRadius) {
        this.drownedSet.add(enemy.id);
        enemy.alive = false;
        enemy.hp = 0;
        this.particles.burst(enemy.x, enemy.y, enemy.color, 40);
        // Big splash ripples
        for (let i = 0; i < 4; i++) {
          this.ripples.push({
            x: enemy.x + randomRange(-15, 15),
            y: enemy.y + randomRange(-15, 15),
            radius: 0,
            maxRadius: randomRange(20, 45),
            life: 0,
            maxLife: randomRange(0.6, 1.2),
          });
        }
      }
    }

    if (t >= 1) {
      for (const enemy of this.enemies) {
        if (enemy.alive) { enemy.alive = false; enemy.hp = 0; }
      }
      this.phase = 'SETTLE';
      this.phaseTime = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const w = this.canvasW;
    const h = this.canvasH;
    const wx = this.winner.x;
    const wy = this.winner.y;
    const time = this.phaseTime;

    // ── Water body: everything outside the wavy dry boundary ──
    ctx.save();

    const outerR = Math.sqrt(w * w + h * h);
    const STEP = 0.06;

    // Clip: outer circle CW, then wavy inner boundary CCW
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, outerR, 0, Math.PI * 2);
    // Trace wavy dry boundary counter-clockwise (= hole)
    {
      const r0 = this.waveRadiusAt(0, time);
      ctx.moveTo(wx + r0, wy);
      // CCW = go backwards
      for (let a = Math.PI * 2; a >= 0; a -= STEP) {
        const rPrev = this.waveRadiusAt(a + STEP / 2, time);
        const rCur = this.waveRadiusAt(a, time);
        const cpx = wx + Math.cos(a + STEP / 2) * rPrev;
        const cpy = wy + Math.sin(a + STEP / 2) * rPrev;
        const px = wx + Math.cos(a) * rCur;
        const py = wy + Math.sin(a) * rCur;
        ctx.quadraticCurveTo(cpx, cpy, px, py);
      }
      ctx.closePath();
    }
    ctx.clip();

    // Water base fill
    ctx.fillStyle = 'rgba(15,60,130,0.7)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, outerR, 0, Math.PI * 2);
    ctx.fill();

    // Flowing current curves (drifting bezier paths across surface)
    ctx.strokeStyle = 'rgba(60,150,220,0.12)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 15; i++) {
      const baseX = (Math.sin(time * 0.2 + i * 1.9) * 0.5 + 0.5) * w;
      const baseY = (Math.cos(time * 0.17 + i * 2.3) * 0.5 + 0.5) * h;
      const len = 60 + Math.sin(time * 0.5 + i) * 30;
      const a = time * 0.3 + i * 0.7;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.bezierCurveTo(
        baseX + Math.cos(a) * len * 0.4, baseY + Math.sin(a) * len * 0.4 + Math.sin(time + i) * 15,
        baseX + Math.cos(a) * len * 0.7, baseY + Math.sin(a) * len * 0.7 - Math.cos(time + i) * 15,
        baseX + Math.cos(a) * len, baseY + Math.sin(a) * len,
      );
      ctx.stroke();
    }

    // Darker depth streaks (flowing, not circular)
    ctx.strokeStyle = 'rgba(5,30,80,0.08)';
    ctx.lineWidth = 8;
    for (let i = 0; i < 10; i++) {
      const baseX = (Math.cos(time * 0.12 + i * 2.7) * 0.5 + 0.5) * w;
      const baseY = (Math.sin(time * 0.15 + i * 3.1) * 0.5 + 0.5) * h;
      const a = time * 0.2 + i;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(
        baseX + Math.cos(a) * 50, baseY + Math.sin(a) * 50 + Math.sin(time * 0.7 + i) * 20,
        baseX + Math.cos(a) * 100, baseY + Math.sin(a) * 100,
      );
      ctx.stroke();
    }

    // Drowned tower shadows (dark silhouettes under water)
    for (const enemy of this.enemies) {
      if (!this.drownedSet.has(enemy.id)) continue;
      const d = dist(enemy.x, enemy.y, wx, wy);
      if (d < this.dryRadius) continue; // not yet under water
      const depthAlpha = Math.min(0.25, (d - this.dryRadius) / 200 * 0.25);
      ctx.fillStyle = `rgba(0,0,0,${depthAlpha})`;
      // Irregular blob shape instead of circle
      ctx.beginPath();
      const r = enemy.radius * 1.1;
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const wobble = Math.sin(a * 3 + time * 0.5 + enemy.id) * r * 0.15;
        const px = enemy.x + Math.cos(a) * (r + wobble);
        const py = enemy.y + Math.sin(a) * (r + wobble);
        if (a === 0) ctx.moveTo(px, py);
        else {
          const mA = a - 0.1;
          const mWobble = Math.sin(mA * 3 + time * 0.5 + enemy.id) * r * 0.15;
          ctx.quadraticCurveTo(
            enemy.x + Math.cos(mA) * (r + mWobble),
            enemy.y + Math.sin(mA) * (r + mWobble),
            px, py,
          );
        }
      }
      ctx.closePath();
      ctx.fill();
    }

    // Rain splashes (irregular expanding shapes, not circles)
    for (const s of this.rainSplashes) {
      const alpha = Math.max(0, 1 - s.life / s.maxLife) * 0.35;
      if (alpha <= 0 || s.radius < 1) continue;
      ctx.strokeStyle = `rgba(180,210,255,${alpha})`;
      ctx.lineWidth = 1;
      // Draw as irregular expanding blob
      ctx.beginPath();
      const pts = 6;
      for (let j = 0; j <= pts; j++) {
        const a = (j / pts) * Math.PI * 2;
        const wobble = Math.sin(a * 2 + s.x + s.y) * s.radius * 0.2;
        const px = s.x + Math.cos(a) * (s.radius + wobble);
        const py = s.y + Math.sin(a) * (s.radius + wobble);
        if (j === 0) ctx.moveTo(px, py);
        else {
          const mA = ((j - 0.5) / pts) * Math.PI * 2;
          const mW = Math.sin(mA * 2 + s.x + s.y) * s.radius * 0.2;
          ctx.quadraticCurveTo(
            s.x + Math.cos(mA) * (s.radius + mW),
            s.y + Math.sin(mA) * (s.radius + mW),
            px, py,
          );
        }
      }
      ctx.stroke();
    }

    // Drowning turbulence (irregular shapes at drowning points)
    for (const r of this.ripples) {
      const alpha = Math.max(0, 1 - r.life / r.maxLife) * 0.5;
      if (alpha <= 0 || r.radius < 3) continue;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 2;
      // Wobbly expanding shape
      ctx.beginPath();
      const pts = 8;
      for (let j = 0; j <= pts; j++) {
        const a = (j / pts) * Math.PI * 2;
        const wobble = Math.sin(a * 3 + r.x * 0.1) * r.radius * 0.25;
        const px = r.x + Math.cos(a) * (r.radius + wobble);
        const py = r.y + Math.sin(a) * (r.radius + wobble);
        if (j === 0) ctx.moveTo(px, py);
        else {
          const mA = ((j - 0.5) / pts) * Math.PI * 2;
          const mW = Math.sin(mA * 3 + r.x * 0.1) * r.radius * 0.25;
          ctx.quadraticCurveTo(
            r.x + Math.cos(mA) * (r.radius + mW),
            r.y + Math.sin(mA) * (r.radius + mW),
            px, py,
          );
        }
      }
      ctx.stroke();
    }

    // Lightning flash reflection on water
    if (this.lightningAlpha > 0) {
      // Screen flash
      ctx.fillStyle = `rgba(200,220,255,${this.lightningAlpha * 0.15})`;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, outerR, 0, Math.PI * 2);
      ctx.fill();
      // Lightning branches (curved, not straight)
      ctx.strokeStyle = `rgba(220,235,255,${this.lightningAlpha * 0.6})`;
      ctx.lineWidth = 2;
      for (const b of this.lightningBranches) {
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.quadraticCurveTo(b.x2, b.y2, b.x3, b.y3);
        ctx.stroke();
      }
      // Glow around branches
      ctx.strokeStyle = `rgba(180,210,255,${this.lightningAlpha * 0.2})`;
      ctx.lineWidth = 6;
      for (const b of this.lightningBranches) {
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.quadraticCurveTo(b.x2, b.y2, b.x3, b.y3);
        ctx.stroke();
      }
    }

    ctx.restore();

    // ── Wavy edge along the dry/water boundary (smooth curves) ──
    if (this.dryRadius > 5) {
      ctx.save();

      // Foam band
      ctx.fillStyle = 'rgba(200,230,255,0.25)';
      ctx.beginPath();
      this.traceWavyPath(ctx, wx, wy, time, STEP, 7);
      ctx.closePath();
      this.traceWavyPath(ctx, wx, wy, time, -STEP, 0); // inner edge reversed
      ctx.closePath();
      ctx.fill();

      // Edge line
      ctx.strokeStyle = 'rgba(100,180,240,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.traceWavyPath(ctx, wx, wy, time, STEP, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // ── Rain on top of everything ──
    this.drawRain(ctx, time);
  }

  /** Wavy radius at angle a, with optional extra offset. */
  private waveRadiusAt(a: number, time: number, extra = 0): number {
    return this.dryRadius +
      Math.sin(a * 5 + time * 1.8) * 5 +
      Math.sin(a * 9 + time * 2.5) * 3 +
      Math.cos(a * 3 + time * 1.2) * 4 +
      extra;
  }

  /** Trace a smooth wavy closed path. step > 0 = CW, step < 0 = CCW. */
  private traceWavyPath(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, time: number,
    step: number, extra: number,
  ) {
    const absStep = Math.abs(step);
    const start = step > 0 ? 0 : Math.PI * 2;
    const end = step > 0 ? Math.PI * 2 : 0;

    const r0 = this.waveRadiusAt(start, time, extra);
    ctx.moveTo(cx + Math.cos(start) * r0, cy + Math.sin(start) * r0);

    for (let a = start + step; step > 0 ? a <= end : a >= end; a += step) {
      const rMid = this.waveRadiusAt(a - step / 2, time, extra);
      const rCur = this.waveRadiusAt(a, time, extra);
      ctx.quadraticCurveTo(
        cx + Math.cos(a - step / 2) * rMid,
        cy + Math.sin(a - step / 2) * rMid,
        cx + Math.cos(a) * rCur,
        cy + Math.sin(a) * rCur,
      );
    }
  }

  private drawRain(ctx: CanvasRenderingContext2D, time: number) {
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
  }
}
