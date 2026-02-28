import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, lerp, randomRange } from './utils';

type GrowingPhase = 'GROWING' | 'SHRINK_WINNER';

const SHRINK_DUR = 1.0;

export class GrowingAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: GrowingPhase = 'GROWING';
  phaseTime = 0;
  finished = false;

  // All competing towers (including winner) with their growing radii
  growers: { tower: Tower; radius: number; alive: boolean }[];

  // Winner shrink state
  winnerPeakRadius = 0;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    winner.invincible = true;

    // All towers participate in growing — start at their current drawn radius
    this.growers = allTowers.map(t => ({
      tower: t,
      radius: t.radius * t.scale,
      alive: true,
    }));
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'GROWING':
        this.updateGrowing(dt);
        break;
      case 'SHRINK_WINNER':
        this.updateShrinkWinner(dt);
        break;
    }
  }

  private updateGrowing(dt: number) {
    // Double diameter every second → radius grows by factor 2^dt per frame
    const growthFactor = Math.pow(2, dt);

    for (const g of this.growers) {
      if (!g.alive) continue;
      g.radius *= growthFactor;
    }

    // Check collisions between all alive growers
    const alive = this.growers.filter(g => g.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        if (!a.alive || !b.alive) continue;

        const d = dist(a.tower.x, a.tower.y, b.tower.x, b.tower.y);
        if (d < a.radius + b.radius) {
          // Collision! One explodes randomly — but winner never dies
          let loser: typeof a;
          if (a.tower.id === this.winner.id) {
            loser = b;
          } else if (b.tower.id === this.winner.id) {
            loser = a;
          } else {
            loser = Math.random() < 0.5 ? a : b;
          }

          loser.alive = false;
          loser.tower.alive = false;
          loser.tower.hp = 0;
          this.particles.burst(loser.tower.x, loser.tower.y, loser.tower.color, 70);
        }
      }
    }

    // Check if only winner remains
    const remaining = this.growers.filter(g => g.alive);
    if (remaining.length <= 1) {
      const winnerGrower = this.growers.find(g => g.tower.id === this.winner.id);
      this.winnerPeakRadius = winnerGrower ? winnerGrower.radius : this.winner.radius;
      this.phase = 'SHRINK_WINNER';
      this.phaseTime = 0;
    }
  }

  private updateShrinkWinner(_dt: number) {
    const t = Math.min(1, this.phaseTime / SHRINK_DUR);

    // Shrink winner back to normal radius
    const winnerGrower = this.growers.find(g => g.tower.id === this.winner.id);
    if (winnerGrower) {
      winnerGrower.radius = lerp(this.winnerPeakRadius, this.winner.radius, t);
    }

    // Celebration particles
    if (Math.random() < 0.15) {
      this.particles.celebrationBurst(
        this.winner.x + randomRange(-60, 60),
        this.winner.y + randomRange(-60, 60),
        8,
      );
    }

    if (this.phaseTime >= SHRINK_DUR) {
      this.finished = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Draw growing disks on top of normal tower drawing
    // We override the tower visual radius by drawing larger colored disks
    for (const g of this.growers) {
      if (!g.alive) continue;

      const tower = g.tower;
      const r = g.radius;

      // Only draw override if radius differs significantly from tower's normal drawn radius
      const normalR = tower.radius * tower.scale * tower.withdrawScale;
      if (r <= normalR * 1.05) continue;

      const { r: cr, g: cg, b: cb } = hexToRgbLocal(tower.color);

      // Shadow
      ctx.fillStyle = `rgba(0,0,0,0.3)`;
      ctx.beginPath();
      ctx.arc(tower.x + 3, tower.y + 3, r, 0, Math.PI * 2);
      ctx.fill();

      // Disk with gradient
      const grad = ctx.createRadialGradient(
        tower.x - r * 0.3, tower.y - r * 0.3, 0,
        tower.x, tower.y, r,
      );
      grad.addColorStop(0, `rgba(${Math.min(255, cr + 60)},${Math.min(255, cg + 60)},${Math.min(255, cb + 60)},1)`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},1)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(tower.x, tower.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Invincible shield on winner
      if (tower.invincible) {
        ctx.strokeStyle = `rgba(255,255,255,0.6)`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, r + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
  }
}

// Local hex parser to avoid circular import issues
function hexToRgbLocal(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 255, g: 255, b: 255 };
}
