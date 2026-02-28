import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, lerp, randomRange, angleBetween } from './utils';
import { hexToRgb } from './colors';

type LaserPhase = 'CHARGE' | 'FIRE' | 'EXPLODE';

const CHARGE_DUR = 0.8;
const FIRE_DUR = 1.0;
const EXPLODE_DUR = 1.2;
const BARREL_LEN = 18;

interface Beam {
  enemy: Tower;
  angle: number;
  emitDist: number;   // from winner center to cannon tip
  perimDist: number;   // from cannon tip to enemy perimeter
  centerDist: number;  // from cannon tip to enemy center
  borderDist: number;  // from cannon tip to screen border
}

export class LaserAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: LaserPhase = 'CHARGE';
  phaseTime = 0;
  finished = false;

  beams: Beam[];
  enemiesKilled = false;

  // Winner glow
  glowRadius = 0;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    winner.invincible = true;

    const emitDist = winner.radius * winner.scale + BARREL_LEN;

    this.beams = this.enemies.map(enemy => {
      const angle = angleBetween(winner.x, winner.y, enemy.x, enemy.y);
      const sx = winner.x + Math.cos(angle) * emitDist;
      const sy = winner.y + Math.sin(angle) * emitDist;
      const d = dist(sx, sy, enemy.x, enemy.y);
      const enemyR = enemy.radius * enemy.scale;
      return {
        enemy,
        angle,
        emitDist,
        perimDist: Math.max(0, d - enemyR),
        centerDist: d,
        borderDist: Math.max(canvasW, canvasH) * 1.5,
      };
    });
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'CHARGE':
        this.updateCharge(dt);
        break;
      case 'FIRE':
        this.updateFire(dt);
        break;
      case 'EXPLODE':
        this.updateExplode(dt);
        break;
    }
  }

  private nextPhase(next: LaserPhase) {
    this.phase = next;
    this.phaseTime = 0;
  }

  private updateCharge(_dt: number) {
    const t = Math.min(1, this.phaseTime / CHARGE_DUR);
    this.glowRadius = lerp(this.winner.radius, this.winner.radius * 2.5, t);

    if (this.phaseTime >= CHARGE_DUR) {
      this.nextPhase('FIRE');
    }
  }

  private updateFire(_dt: number) {
    this.glowRadius = this.winner.radius * 2.5;

    // Kill enemies at 0.5s into fire phase (beam reaches center)
    if (this.phaseTime >= 0.5 && !this.enemiesKilled) {
      this.enemiesKilled = true;
      for (const enemy of this.enemies) {
        if (enemy.alive) {
          enemy.alive = false;
          enemy.hp = 0;
          this.particles.burst(enemy.x, enemy.y, enemy.color, 70);
        }
      }
    }

    if (this.phaseTime >= FIRE_DUR) {
      this.nextPhase('EXPLODE');
    }
  }

  private updateExplode(_dt: number) {
    const t = Math.min(1, this.phaseTime / EXPLODE_DUR);

    // Glow fades
    this.glowRadius = lerp(this.winner.radius * 2.5, this.winner.radius, t);

    // Celebration particles
    if (Math.random() < 0.15) {
      this.particles.celebrationBurst(
        this.winner.x + randomRange(-60, 60),
        this.winner.y + randomRange(-60, 60),
        8,
      );
    }

    if (this.phaseTime >= EXPLODE_DUR) {
      this.finished = true;
    }
  }

  /** Compute how far the beam tip extends from the cannon tip. */
  private beamTipDist(beam: Beam): number {
    if (this.phase === 'CHARGE') {
      // Beam instantly reaches enemy perimeter
      return beam.perimDist;
    } else if (this.phase === 'FIRE') {
      const t = Math.min(1, this.phaseTime / FIRE_DUR);
      if (t < 0.5) {
        // Tip progresses from enemy perimeter to enemy center
        return lerp(beam.perimDist, beam.centerDist, t * 2);
      } else {
        // After explosion: beam instantly reaches screen border
        return beam.borderDist;
      }
    } else {
      // EXPLODE: full extension to border
      return beam.borderDist;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const wx = this.winner.x;
    const wy = this.winner.y;
    const { r: wr, g: wg, b: wb } = hexToRgb(this.winner.color);

    // Winner glow
    if (this.glowRadius > this.winner.radius) {
      const grad = ctx.createRadialGradient(wx, wy, this.winner.radius * 0.5, wx, wy, this.glowRadius);
      grad.addColorStop(0, `rgba(${wr},${wg},${wb},0.4)`);
      grad.addColorStop(1, `rgba(${wr},${wg},${wb},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(wx, wy, this.glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw beams
    for (const beam of this.beams) {
      this.drawBeam(ctx, beam);
    }

    // Draw laser cannons on winner surface
    const cannonFade = this.phase === 'EXPLODE'
      ? Math.max(0, 1 - this.phaseTime / EXPLODE_DUR * 2)
      : 1;
    if (cannonFade > 0) {
      for (const beam of this.beams) {
        this.drawCannon(ctx, beam, cannonFade);
      }
    }
  }

  private drawCannon(ctx: CanvasRenderingContext2D, beam: Beam, alpha: number) {
    const r = this.winner.radius * this.winner.scale;
    const cx = this.winner.x + Math.cos(beam.angle) * r;
    const cy = this.winner.y + Math.sin(beam.angle) * r;
    const barrelW = 6;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(beam.angle);
    ctx.globalAlpha = alpha;

    // Barrel
    ctx.fillStyle = '#333';
    ctx.fillRect(0, -barrelW / 2, BARREL_LEN, barrelW);
    ctx.fillStyle = '#555';
    ctx.fillRect(BARREL_LEN - 3, -barrelW / 2 - 1, 3, barrelW + 2);

    // Base mount
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Glow at tip during FIRE
    if (this.phase === 'FIRE') {
      const { r: wr, g: wg, b: wb } = hexToRgb(this.winner.color);
      ctx.fillStyle = `rgba(${wr},${wg},${wb},0.8)`;
      ctx.shadowColor = this.winner.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(BARREL_LEN, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawBeam(ctx: CanvasRenderingContext2D, beam: Beam) {
    const sx = this.winner.x + Math.cos(beam.angle) * beam.emitDist;
    const sy = this.winner.y + Math.sin(beam.angle) * beam.emitDist;
    const tipDist = this.beamTipDist(beam);
    const tx = sx + Math.cos(beam.angle) * tipDist;
    const ty = sy + Math.sin(beam.angle) * tipDist;
    const { r: wr, g: wg, b: wb } = hexToRgb(this.winner.color);

    if (this.phase === 'CHARGE') {
      // Thin flickering lines growing toward enemy
      const flicker = 0.3 + Math.random() * 0.4;
      const t = Math.min(1, this.phaseTime / CHARGE_DUR);
      const alpha = t * flicker;

      ctx.strokeStyle = `rgba(${wr},${wg},${wb},${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    } else if (this.phase === 'FIRE') {
      const t = Math.min(1, this.phaseTime / FIRE_DUR);
      const intensity = t < 0.1 ? t / 0.1 : 1;

      // Layer 1: Outer glow (wide, low alpha)
      ctx.save();
      ctx.shadowColor = `rgba(${wr},${wg},${wb},0.8)`;
      ctx.shadowBlur = 25;
      ctx.strokeStyle = `rgba(${wr},${wg},${wb},${0.2 * intensity})`;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();

      // Layer 2: Mid beam (medium width, winner color)
      ctx.strokeStyle = `rgba(${wr},${wg},${wb},${0.6 * intensity})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Layer 3: White core (thin, bright)
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * intensity})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    } else if (this.phase === 'EXPLODE') {
      // Beams fade out (still at full extension)
      const t = Math.min(1, this.phaseTime / EXPLODE_DUR);
      const fade = Math.max(0, 1 - t * 2);
      if (fade <= 0) return;

      ctx.strokeStyle = `rgba(${wr},${wg},${wb},${0.4 * fade})`;
      ctx.lineWidth = 8 * fade;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,255,255,${0.6 * fade})`;
      ctx.lineWidth = 3 * fade;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }
}
