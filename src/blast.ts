import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, lerp, randomRange } from './utils';

type BlastPhase = 'BLAST' | 'SETTLE';

const SHOCKWAVE_SPEED = 900;   // px/s — how fast the particle wavefront expands
const TOWER_SPEED = 350;       // px/s — slower than shockwave since towers are heavier
const OFF_SCREEN_MARGIN = 100;
const SETTLE_DUR = 0.5;
const PARTICLES_PER_FRAME = 12; // spawned at wavefront each frame

interface WaveParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
}

interface FlyingTower {
  tower: Tower;
  vx: number;
  vy: number;
  hit: boolean;      // has the shockwave reached this tower?
  offScreen: boolean;
}

export class BlastAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: BlastPhase = 'BLAST';
  phaseTime = 0;
  finished = false;

  flyingTowers: FlyingTower[] = [];
  waveParticles: WaveParticle[] = [];
  shockwaveRadius = 0;
  maxRadius: number; // distance from winner to farthest screen corner

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    winner.invincible = true;

    // Max distance from winner to any screen corner
    const cx = winner.x, cy = winner.y;
    this.maxRadius = Math.max(
      dist(cx, cy, 0, 0),
      dist(cx, cy, canvasW, 0),
      dist(cx, cy, 0, canvasH),
      dist(cx, cy, canvasW, canvasH),
    );

    for (const enemy of this.enemies) {
      this.flyingTowers.push({
        tower: enemy,
        vx: 0,
        vy: 0,
        hit: false,
        offScreen: false,
      });
    }
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'BLAST':
        this.updateBlast(dt);
        break;
      case 'SETTLE':
        if (this.phaseTime >= SETTLE_DUR) {
          this.finished = true;
        }
        break;
    }

    // Update wave particles — constant speed, no friction, fade by distance
    for (let i = this.waveParticles.length - 1; i >= 0; i--) {
      const p = this.waveParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Fade based on distance from winner
      const d = dist(p.x, p.y, this.winner.x, this.winner.y);
      p.alpha = Math.max(0, 1 - d / this.maxRadius);
      // Remove if off screen and faded
      if (p.alpha <= 0 ||
          p.x < -50 || p.x > this.canvasW + 50 ||
          p.y < -50 || p.y > this.canvasH + 50) {
        this.waveParticles.splice(i, 1);
      }
    }
  }

  private updateBlast(dt: number) {
    const prevRadius = this.shockwaveRadius;
    this.shockwaveRadius += SHOCKWAVE_SPEED * dt;

    const wx = this.winner.x;
    const wy = this.winner.y;

    // Spawn particles at the expanding wavefront
    for (let i = 0; i < PARTICLES_PER_FRAME; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Spawn at current wavefront with slight spread
      const r = this.shockwaveRadius + randomRange(-15, 15);
      if (r < 0) continue;
      this.waveParticles.push({
        x: wx + Math.cos(angle) * r,
        y: wy + Math.sin(angle) * r,
        vx: Math.cos(angle) * SHOCKWAVE_SPEED,
        vy: Math.sin(angle) * SHOCKWAVE_SPEED,
        radius: randomRange(2, 6),
        alpha: 1,
        color: this.winner.color,
      });
    }

    // Check each tower: has the shockwave just reached it?
    let allGone = true;
    for (const ft of this.flyingTowers) {
      if (ft.offScreen) continue;

      if (!ft.hit) {
        const d = dist(ft.tower.x, ft.tower.y, wx, wy);
        if (this.shockwaveRadius >= d) {
          // Shockwave reached this tower — give it an impulse
          ft.hit = true;
          const dx = ft.tower.x - wx;
          const dy = ft.tower.y - wy;
          const nd = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          ft.vx = (dx / nd) * TOWER_SPEED;
          ft.vy = (dy / nd) * TOWER_SPEED;
          // Burst at impact point
          this.particles.burst(ft.tower.x, ft.tower.y, ft.tower.color, 30);
        }
      }

      if (ft.hit) {
        ft.tower.x += ft.vx * dt;
        ft.tower.y += ft.vy * dt;

        // Check off-screen
        const t = ft.tower;
        const margin = t.radius + OFF_SCREEN_MARGIN;
        if (t.x < -margin || t.x > this.canvasW + margin ||
            t.y < -margin || t.y > this.canvasH + margin) {
          ft.offScreen = true;
          t.alive = false;
          t.hp = 0;
        }
      }

      if (!ft.offScreen) allGone = false;
    }

    if (allGone) {
      this.phase = 'SETTLE';
      this.phaseTime = 0;
      this.particles.celebrationBurst(this.winner.x, this.winner.y, 80);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Screen flash at very start
    if (this.phase === 'BLAST' && this.phaseTime < 0.1) {
      const flashAlpha = (1 - this.phaseTime / 0.1) * 0.4;
      ctx.save();
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.canvasW, this.canvasH);
      ctx.restore();
    }

    // Wave particles (the shockwave itself)
    for (const p of this.waveParticles) {
      if (p.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
