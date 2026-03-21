import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, lerp } from './utils';
import { hexToRgb } from './colors';

type SolarPhase = 'GROW' | 'WHITEOUT' | 'RESTORE';

const GROW_DUR = 6.0;
const WHITEOUT_DUR = 0.8;
const RESTORE_DUR = 2.0;
const MAX_SCALE = 6;
const LIGHT_SCALE = 10;  // downscale factor for light map resolution
const LIGHT_SAMPLES = 6; // points sampled on the winner disk perimeter

export class SolarAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: SolarPhase = 'GROW';
  phaseTime = 0;
  totalTime = 0; // continuous timer for smooth growth across phases
  finished = false;
  winnerBaseScale: number;

  // Raytraced light map (offscreen, reduced resolution)
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private lightW: number;
  private lightH: number;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    winner.invincible = true;
    this.winnerBaseScale = winner.scale;

    this.lightW = Math.ceil(canvasW / LIGHT_SCALE);
    this.lightH = Math.ceil(canvasH / LIGHT_SCALE);
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = this.lightW;
    this.lightCanvas.height = this.lightH;
    this.lightCtx = this.lightCanvas.getContext('2d')!;
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;
    this.totalTime += dt;

    switch (this.phase) {
      case 'GROW':
      case 'WHITEOUT': {
        // Grow continuously through GROW and WHITEOUT
        const growDur = GROW_DUR + WHITEOUT_DUR;
        const growT = Math.min(1, this.totalTime / growDur);
        this.winner.scale = this.winnerBaseScale * lerp(1, MAX_SCALE, Math.pow(growT, 1.5));

        if (this.phase === 'GROW' && this.phaseTime >= GROW_DUR) {
          this.phase = 'WHITEOUT';
          this.phaseTime = 0;
        } else if (this.phase === 'WHITEOUT' && this.phaseTime >= WHITEOUT_DUR) {
          // Fully white — reset to original size, kill enemies
          this.winner.scale = this.winnerBaseScale;
          for (const enemy of this.enemies) {
            if (enemy.alive) { enemy.alive = false; enemy.hp = 0; }
          }
          this.phase = 'RESTORE';
          this.phaseTime = 0;
        }
        break;
      }
      case 'RESTORE':
        if (this.phaseTime >= RESTORE_DUR) {
          this.particles.celebrationBurst(this.winner.x, this.winner.y, 80);
          this.finished = true;
        }
        break;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    switch (this.phase) {
      case 'GROW':
        this.drawGrow(ctx);
        break;
      case 'WHITEOUT':
        this.drawWhiteout(ctx);
        break;
      case 'RESTORE':
        this.drawRestore(ctx);
        break;
    }
  }

  private drawGrow(ctx: CanvasRenderingContext2D) {
    const t = Math.min(1, this.phaseTime / GROW_DUR);
    const intensity = Math.pow(t, 1.5);
    const wx = this.winner.x;
    const wy = this.winner.y;
    const wr = this.winner.radius * this.winner.scale;

    // 1. Raytrace light map for current winner size
    this.computeLightMap(intensity, wr);
    ctx.drawImage(this.lightCanvas, 0, 0, this.canvasW, this.canvasH);

    // 2. Corona glow around winner
    const glowRadius = wr * 1.8;
    const { r, g, b } = hexToRgb(this.winner.color);
    const grad = ctx.createRadialGradient(wx, wy, wr * 0.5, wx, wy, glowRadius);
    grad.addColorStop(0, `rgba(255,255,255,${intensity * 0.6})`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},${intensity * 0.4})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(wx, wy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Solarized winner on top
    this.drawSolarWinner(ctx, intensity);
  }

  /** Draw the winner tower with solar glow overlay. */
  private drawSolarWinner(ctx: CanvasRenderingContext2D, intensity: number) {
    const wr = this.winner.radius * this.winner.scale;
    this.winner.draw(ctx);
    ctx.save();
    ctx.globalAlpha = Math.min(1, intensity * 0.4);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.winner.x, this.winner.y, wr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Raytrace the light map for the current frame.
   * Samples multiple points on the growing winner disk — as the disk grows,
   * shadows soften (more of the disk visible from behind occluders) and
   * enemies swallowed by the disk stop casting shadows.
   */
  private computeLightMap(intensity: number, winnerRadius: number) {
    const w = this.lightW;
    const h = this.lightH;
    const imgData = this.lightCtx.createImageData(w, h);
    const data = imgData.data;

    const wx = this.winner.x;
    const wy = this.winner.y;
    const maxDist = Math.max(this.canvasW, this.canvasH);

    const { r: cr, g: cg, b: cb } = hexToRgb(this.winner.color);
    const lr = Math.round(lerp(cr, 255, 0.7));
    const lg = Math.round(lerp(cg, 255, 0.7));
    const lb = Math.round(lerp(cb, 255, 0.7));

    // Light sample points: center + N points on disk perimeter
    const sampleRadius = winnerRadius * 0.7;
    const samplesX = [wx];
    const samplesY = [wy];
    for (let i = 0; i < LIGHT_SAMPLES; i++) {
      const angle = (i / LIGHT_SAMPLES) * Math.PI * 2;
      samplesX.push(wx + Math.cos(angle) * sampleRadius);
      samplesY.push(wy + Math.sin(angle) * sampleRadius);
    }
    const totalSamples = samplesX.length;

    // Collect active enemy occluders (skip those swallowed by the growing sun)
    const ex: number[] = [];
    const ey: number[] = [];
    const er: number[] = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const eRadius = e.radius * e.scale * e.withdrawScale;
      if (eRadius <= 0) continue;
      if (dist(e.x, e.y, wx, wy) + eRadius < winnerRadius) continue; // inside sun
      ex.push(e.x);
      ey.push(e.y);
      er.push(eRadius);
    }
    const numEnemies = ex.length;

    for (let py = 0; py < h; py++) {
      const worldY = py * LIGHT_SCALE + LIGHT_SCALE / 2;
      for (let px = 0; px < w; px++) {
        const worldX = px * LIGHT_SCALE + LIGHT_SCALE / 2;

        // Pixel inside the winner disk — fully lit
        const dToCenter = dist(worldX, worldY, wx, wy);
        if (dToCenter < winnerRadius) {
          const falloff = Math.max(0, 1 - dToCenter / maxDist);
          const light = falloff * intensity;
          if (light > 0.001) {
            const idx = (py * w + px) * 4;
            data[idx] = Math.round(lr * light);
            data[idx + 1] = Math.round(lg * light);
            data[idx + 2] = Math.round(lb * light);
            data[idx + 3] = Math.round(180 * light);
          }
          continue;
        }

        // Count visible light samples from this pixel
        let visible = 0;
        for (let s = 0; s < totalSamples; s++) {
          let blocked = false;
          for (let e = 0; e < numEnemies; e++) {
            if (rayHitsCircle(worldX, worldY, samplesX[s], samplesY[s], ex[e], ey[e], er[e])) {
              blocked = true;
              break;
            }
          }
          if (!blocked) visible++;
        }

        if (visible > 0) {
          const visibility = visible / totalSamples;
          const falloff = Math.max(0, 1 - dToCenter / maxDist);
          const light = visibility * falloff * intensity;
          if (light > 0.001) {
            const idx = (py * w + px) * 4;
            data[idx] = Math.round(lr * light);
            data[idx + 1] = Math.round(lg * light);
            data[idx + 2] = Math.round(lb * light);
            data[idx + 3] = Math.round(180 * light);
          }
        }
      }
    }

    this.lightCtx.putImageData(imgData, 0, 0);
  }

  /** Bright tint of winner color for the overlay. */
  private get overlayColor(): string {
    const { r, g, b } = hexToRgb(this.winner.color);
    return `rgb(${Math.round(lerp(r, 255, 0.8))},${Math.round(lerp(g, 255, 0.8))},${Math.round(lerp(b, 255, 0.8))})`;
  }

  private drawWhiteout(ctx: CanvasRenderingContext2D) {
    this.drawSolarWinner(ctx, 1);
    const t = Math.min(1, this.phaseTime / WHITEOUT_DUR);
    const alpha = lerp(0.5, 1, t);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.overlayColor;
    ctx.fillRect(0, 0, this.canvasW, this.canvasH);
    ctx.restore();
  }

  private drawRestore(ctx: CanvasRenderingContext2D) {
    // Winner at original size, revealed as overlay fades
    this.winner.draw(ctx);
    const t = Math.min(1, this.phaseTime / RESTORE_DUR);
    const alpha = 1 - t * t;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.overlayColor;
    ctx.fillRect(0, 0, this.canvasW, this.canvasH);
    ctx.restore();
  }
}

/** Test if line segment AB intersects circle (cx,cy,r). */
function rayHitsCircle(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number, r: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 0.001) return false;
  const halfB = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = halfB * halfB - a * c;
  if (disc < 0) return false;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-halfB - sqrtDisc) / a;
  const t2 = (-halfB + sqrtDisc) / a;
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}
