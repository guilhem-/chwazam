import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, lerp, randomRange } from './utils';

type SandwormPhase = 'SAND_IN' | 'SWALLOWING' | 'SAND_OUT';

const SAND_IN_DUR = 1.0;
const SWALLOW_DUR = 1.0;
const SAND_OUT_DUR = 1.0;

const SAND_COLORS = ['#C2B280', '#D2C49A', '#E8D5A3', '#B8A472', '#A89060', '#D4C090'];
const WORM_SEGMENTS = 20;
const WORM_HEAD_R = 45;   // head radius — much bigger than towers
const WORM_BODY_R = 32;   // body segment radius

interface WormAttack {
  tower: Tower;
  startTime: number;
  done: boolean;
  exitX: number;  // where the worm dives back into sand
  exitY: number;
  burstEmitted: boolean; // sand burst at emergence
  exitBurstEmitted: boolean; // sand burst at reentry
}

export class SandwormAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: SandwormPhase = 'SAND_IN';
  phaseTime = 0;
  finished = false;

  attacks: WormAttack[] = [];
  allTowers: Tower[];

  // Static sand texture (offscreen canvas, rendered once)
  private sandCanvas: HTMLCanvasElement;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.allTowers = allTowers;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    // Generate static sand texture once
    this.sandCanvas = document.createElement('canvas');
    this.sandCanvas.width = canvasW;
    this.sandCanvas.height = canvasH;
    this.renderSandTexture();

    // Plan attacks — random order
    const shuffled = [...this.enemies];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (let i = 0; i < shuffled.length; i++) {
      const t = shuffled[i];
      const exit = this.findExitPoint(t);
      this.attacks.push({
        tower: t,
        startTime: i * SWALLOW_DUR,
        done: false,
        exitX: exit.x,
        exitY: exit.y,
        burstEmitted: false,
        exitBurstEmitted: false,
      });
    }
  }

  /** Render a static sand texture covering the whole scene. */
  private renderSandTexture() {
    const ctx = this.sandCanvas.getContext('2d')!;
    const w = this.canvasW;
    const h = this.canvasH;

    // Base sand fill
    ctx.fillStyle = '#C8B878';
    ctx.fillRect(0, 0, w, h);

    // Noise grain layer — random dots for texture
    for (let i = 0; i < w * h / 20; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = randomRange(0.5, 2.5);
      ctx.fillStyle = SAND_COLORS[Math.floor(Math.random() * SAND_COLORS.length)];
      ctx.globalAlpha = randomRange(0.3, 0.8);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Subtle dune ripples — horizontal wavy lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let y = 10; y < h; y += randomRange(15, 30)) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < w; x += 20) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + y * 0.1) * 3);
      }
      ctx.stroke();
    }
  }

  /** Find a reentry point away from all towers (max 3× tower radius distance). */
  private findExitPoint(tower: Tower): { x: number; y: number } {
    const maxDist = tower.radius * 3;
    const margin = WORM_HEAD_R;

    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const d = tower.radius * 1.5 + Math.random() * (maxDist - tower.radius * 1.5);
      const ex = tower.x + Math.cos(angle) * d;
      const ey = tower.y + Math.sin(angle) * d;

      // Must be on screen
      if (ex < margin || ex > this.canvasW - margin || ey < margin || ey > this.canvasH - margin) continue;

      // Must not overlap any tower
      let clear = true;
      for (const t of this.allTowers) {
        if (dist(ex, ey, t.x, t.y) < t.radius + WORM_HEAD_R) {
          clear = false;
          break;
        }
      }
      if (clear) return { x: ex, y: ey };
    }

    // Fallback: same location
    return { x: tower.x, y: tower.y };
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'SAND_IN':
        if (this.phaseTime >= SAND_IN_DUR) {
          this.phase = 'SWALLOWING';
          this.phaseTime = 0;
        }
        break;
      case 'SWALLOWING':
        this.updateSwallowing();
        break;
      case 'SAND_OUT':
        if (this.phaseTime >= SAND_OUT_DUR) {
          this.particles.celebrationBurst(this.winner.x, this.winner.y, 80);
          this.finished = true;
        }
        break;
    }
  }

  swallowAll() {
    for (const attack of this.attacks) {
      if (!attack.done) {
        attack.done = true;
        attack.tower.alive = false;
        attack.tower.hp = 0;
        this.particles.burst(attack.tower.x, attack.tower.y, attack.tower.color, 40);
      }
    }
    this.phase = 'SAND_OUT';
    this.phaseTime = 0;
  }

  private updateSwallowing() {
    let allDone = true;

    for (const attack of this.attacks) {
      if (attack.done) continue;

      const elapsed = this.phaseTime - attack.startTime;
      if (elapsed < 0) { allDone = false; continue; }

      const t = Math.min(1, elapsed / SWALLOW_DUR);

      // Tower disappears as soon as the worm emerges
      if (t > 0 && attack.tower.alive) {
        attack.tower.alive = false;
        attack.tower.hp = 0;
      }

      if (t >= 1) {
        attack.done = true;
      } else {
        allDone = false;
      }
    }

    if (allDone) {
      this.phase = 'SAND_OUT';
      this.phaseTime = 0;
    }
  }

  /** Sand alpha for current phase. */
  private get sandAlpha(): number {
    if (this.phase === 'SAND_IN') return Math.min(1, this.phaseTime / SAND_IN_DUR);
    if (this.phase === 'SAND_OUT') return Math.max(0, 1 - this.phaseTime / SAND_OUT_DUR);
    return 1;
  }

  /** Draw sand texture — call BEFORE towers so sand is underneath them. */
  drawSand(ctx: CanvasRenderingContext2D) {
    const alpha = this.sandAlpha;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sandCanvas, 0, 0);
    ctx.restore();
  }

  /** Draw worm overlays — call AFTER towers so worms appear on top. */
  draw(ctx: CanvasRenderingContext2D) {
    if (this.phase === 'SWALLOWING') {
      for (const attack of this.attacks) {
        if (attack.done) continue;
        const elapsed = this.phaseTime - attack.startTime;
        if (elapsed < 0) continue;
        const t = Math.min(1, elapsed / SWALLOW_DUR);
        this.drawWorm(ctx, attack, t);
      }
    }
  }

  private drawWorm(ctx: CanvasRenderingContext2D, attack: WormAttack, t: number) {
    const startX = attack.tower.x;
    const startY = attack.tower.y;
    const endX = attack.exitX;
    const endY = attack.exitY;
    const peakHeight = attack.tower.radius * 4;

    // Emit sand particle bursts via the particle system (once per event)
    if (t > 0.02 && !attack.burstEmitted) {
      attack.burstEmitted = true;
      this.particles.burst(startX, startY, '#C2B280', 60);
    }
    if (t > 0.85 && !attack.exitBurstEmitted) {
      attack.exitBurstEmitted = true;
      this.particles.burst(endX, endY, '#C2B280', 60);
    }

    ctx.save();

    // Draw segments from tail to head
    const segSpacing = 0.035;
    for (let i = WORM_SEGMENTS - 1; i >= 0; i--) {
      const segT = t - i * segSpacing;
      if (segT < 0 || segT > 1) continue;

      // Horizontal: lerp from tower to exit
      const px = lerp(startX, endX, segT);
      const py = lerp(startY, endY, segT);

      // Vertical: sinusoidal arc
      const rise = Math.sin(segT * Math.PI) * peakHeight;
      if (rise < 2) continue;

      const wobble = Math.sin(segT * Math.PI * 4 + i * 0.5) * 4;
      const sx = px + wobble;
      const sy = py - rise;

      const sizeT = 1 - i / WORM_SEGMENTS;
      const segR = i === 0 ? WORM_HEAD_R : lerp(WORM_BODY_R * 0.4, WORM_BODY_R, sizeT);

      const darkness = i === 0 ? 0.55 : lerp(0.7, 0.9, i / WORM_SEGMENTS);
      const cr = Math.round(210 * darkness);
      const cg = Math.round(160 * darkness);
      const cb = Math.round(110 * darkness);

      // Shadow on sand
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(px, py + 5, segR * 0.7, segR * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      // Segment body
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.beginPath();
      ctx.arc(sx, sy, segR, 0, Math.PI * 2);
      ctx.fill();

      // Body ridges
      if (i > 0 && i % 2 === 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, segR * 0.9, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Specular highlight
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(sx - segR * 0.25, sy - segR * 0.3, segR * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head details (mouth)
    if (t > 0 && t < 1) {
      const headPx = lerp(startX, endX, t);
      const headPy = lerp(startY, endY, t);
      const headRise = Math.sin(t * Math.PI) * peakHeight;
      if (headRise >= 2) {
        const wobble = Math.sin(t * Math.PI * 4) * 4;
        const hx = headPx + wobble;
        const hy = headPy - headRise;

        ctx.fillStyle = '#3a1800';
        ctx.beginPath();
        ctx.arc(hx, hy, WORM_HEAD_R * 0.85, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1a0800';
        ctx.beginPath();
        ctx.arc(hx, hy, WORM_HEAD_R * 0.55, 0, Math.PI * 2);
        ctx.fill();

        for (let j = 0; j < 8; j++) {
          const ta = (j / 8) * Math.PI * 2;
          const ttx = hx + Math.cos(ta) * WORM_HEAD_R * 0.68;
          const tty = hy + Math.sin(ta) * WORM_HEAD_R * 0.68;
          ctx.fillStyle = '#E8D5A3';
          ctx.beginPath();
          ctx.arc(ttx, tty, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }
}
