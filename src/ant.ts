import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, randomRange } from './utils';

type AntPhase = 'SAND_IN' | 'SWARMING' | 'SAND_OUT';

const SAND_DUR = 1.0;
const ANT_COUNT = 100;
const ANT_SPEED = 80;
const ANTS_TO_EXPLODE = 5;
const ANT_SIZE = 4;
const ANT_TURN_SPEED = 3; // radians/s max turn rate

interface Ant {
  x: number;
  y: number;
  angle: number;    // heading
  targetAngle: number;
  speed: number;
  settled: boolean;  // true = sitting on a tower, stopped
  towerId: number;   // id of tower this ant is on (-1 = none)
}

export class AntAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: AntPhase = 'SAND_IN';
  phaseTime = 0;
  finished = false;

  ants: Ant[] = [];
  towerAntCount = new Map<number, number>();
  explodedSet = new Set<number>();
  allTowers: Tower[];

  private sandCanvas: HTMLCanvasElement;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.allTowers = allTowers;
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    winner.invincible = true;

    // Generate sand texture
    this.sandCanvas = document.createElement('canvas');
    this.sandCanvas.width = canvasW;
    this.sandCanvas.height = canvasH;
    this.renderSandTexture();

    // Initialize ant counts
    for (const e of this.enemies) {
      this.towerAntCount.set(e.id, 0);
    }
    // Ants are spawned gradually during SWARMING phase
  }

  private spawnAnt() {
    // Pick a random point along any edge
    const edge = Math.floor(Math.random() * 4);
    let x: number, y: number;
    switch (edge) {
      case 0: x = Math.random() * this.canvasW; y = -10; break;
      case 1: x = Math.random() * this.canvasW; y = this.canvasH + 10; break;
      case 2: x = -10; y = Math.random() * this.canvasH; break;
      default: x = this.canvasW + 10; y = Math.random() * this.canvasH; break;
    }
    const angle = Math.atan2(this.canvasH / 2 - y, this.canvasW / 2 - x) + randomRange(-0.5, 0.5);
    this.ants.push({
      x, y, angle,
      targetAngle: angle,
      speed: randomRange(ANT_SPEED * 0.7, ANT_SPEED * 1.3),
      settled: false,
      towerId: -1,
    });
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'SAND_IN':
        if (this.phaseTime >= SAND_DUR) {
          this.phase = 'SWARMING';
          this.phaseTime = 0;
        }
        break;
      case 'SWARMING':
        this.updateSwarming(dt);
        break;
      case 'SAND_OUT':
        if (this.phaseTime >= SAND_DUR) {
          this.particles.celebrationBurst(this.winner.x, this.winner.y, 80);
          this.finished = true;
        }
        break;
    }
  }

  private spawnAccum = 0;

  private updateSwarming(dt: number) {
    // Spawn ants gradually — ~20 per second until we reach ANT_COUNT
    if (this.ants.length < ANT_COUNT) {
      this.spawnAccum += dt * 20;
      while (this.spawnAccum >= 1 && this.ants.length < ANT_COUNT) {
        this.spawnAccum -= 1;
        this.spawnAnt();
      }
    }

    for (const ant of this.ants) {
      if (ant.settled) continue;

      // Steer toward target angle with some turning speed
      let angleDiff = ant.targetAngle - ant.angle;
      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      ant.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), ANT_TURN_SPEED * dt);

      // Move
      ant.x += Math.cos(ant.angle) * ant.speed * dt;
      ant.y += Math.sin(ant.angle) * ant.speed * dt;

      // Random direction changes
      if (Math.random() < dt * 2) {
        ant.targetAngle = ant.angle + randomRange(-1.5, 1.5);
      }

      // Bounce off screen edges
      const margin = 20;
      if (ant.x < margin) { ant.targetAngle = randomRange(-0.5, 0.5); }
      if (ant.x > this.canvasW - margin) { ant.targetAngle = Math.PI + randomRange(-0.5, 0.5); }
      if (ant.y < margin) { ant.targetAngle = Math.PI / 2 + randomRange(-0.5, 0.5); }
      if (ant.y > this.canvasH - margin) { ant.targetAngle = -Math.PI / 2 + randomRange(-0.5, 0.5); }

      // Check if ant reached a non-winner, non-exploded enemy tower
      for (const enemy of this.enemies) {
        if (this.explodedSet.has(enemy.id)) continue;
        if (!enemy.alive) continue;
        if (dist(ant.x, ant.y, enemy.x, enemy.y) < enemy.radius * 0.9) {
          ant.settled = true;
          ant.towerId = enemy.id;
          const count = (this.towerAntCount.get(enemy.id) ?? 0) + 1;
          this.towerAntCount.set(enemy.id, count);

          // Explode when enough ants settle
          if (count >= ANTS_TO_EXPLODE) {
            this.explodeTower(enemy);
          }
          break;
        }
      }
    }

    // Check if all enemies are dead
    if (this.enemies.every(e => !e.alive)) {
      this.phase = 'SAND_OUT';
      this.phaseTime = 0;
    }
  }

  private explodeTower(tower: Tower) {
    this.explodedSet.add(tower.id);
    tower.alive = false;
    tower.hp = 0;
    this.particles.burst(tower.x, tower.y, tower.color, 60);

    // Release ants that were on this tower — they scatter
    for (const ant of this.ants) {
      if (ant.towerId === tower.id) {
        ant.settled = false;
        ant.towerId = -1;
        ant.angle = randomRange(0, Math.PI * 2);
        ant.targetAngle = ant.angle;
        // Push away from explosion
        const dx = ant.x - tower.x;
        const dy = ant.y - tower.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        ant.x += (dx / d) * 30;
        ant.y += (dy / d) * 30;
      }
    }
  }

  private get sandAlpha(): number {
    if (this.phase === 'SAND_IN') return Math.min(1, this.phaseTime / SAND_DUR);
    if (this.phase === 'SAND_OUT') return Math.max(0, 1 - this.phaseTime / SAND_DUR);
    return 1;
  }

  /** Draw sand background — call BEFORE towers. */
  drawSand(ctx: CanvasRenderingContext2D) {
    const alpha = this.sandAlpha;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sandCanvas, 0, 0);
    ctx.restore();
  }

  /** Draw ants — call AFTER towers. */
  draw(ctx: CanvasRenderingContext2D) {
    if (this.phase === 'SAND_IN') return; // no ants during sand fade-in
    for (const ant of this.ants) {
      this.drawAnt(ctx, ant);
    }
  }

  private renderSandTexture() {
    const ctx = this.sandCanvas.getContext('2d')!;
    const w = this.canvasW;
    const h = this.canvasH;
    const SAND_COLORS = ['#C2B280', '#D2C49A', '#E8D5A3', '#B8A472', '#A89060', '#D4C090'];

    ctx.fillStyle = '#C8B878';
    ctx.fillRect(0, 0, w, h);

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

  private drawAnt(ctx: CanvasRenderingContext2D, ant: Ant) {
    const { x, y, angle } = ant;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Body: 3 segments (head, thorax, abdomen) — ellipses
    // Abdomen (back, largest)
    ctx.fillStyle = '#1a0a00';
    ctx.beginPath();
    ctx.ellipse(-ANT_SIZE * 0.8, 0, ANT_SIZE * 1.0, ANT_SIZE * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Thorax (middle)
    ctx.fillStyle = '#2a1500';
    ctx.beginPath();
    ctx.ellipse(ANT_SIZE * 0.2, 0, ANT_SIZE * 0.6, ANT_SIZE * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head (front, small)
    ctx.fillStyle = '#1a0a00';
    ctx.beginPath();
    ctx.ellipse(ANT_SIZE * 0.9, 0, ANT_SIZE * 0.45, ANT_SIZE * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (3 pairs, simple curves)
    ctx.strokeStyle = '#2a1500';
    ctx.lineWidth = 0.8;
    for (let side = -1; side <= 1; side += 2) {
      for (let leg = 0; leg < 3; leg++) {
        const lx = -ANT_SIZE * 0.4 + leg * ANT_SIZE * 0.5;
        const wobble = ant.settled ? 0 : Math.sin(this.phaseTime * 12 + leg * 2 + side) * 2;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.quadraticCurveTo(
          lx + ANT_SIZE * 0.3, side * (ANT_SIZE * 1.0 + wobble),
          lx + ANT_SIZE * 0.6, side * (ANT_SIZE * 1.5 + wobble),
        );
        ctx.stroke();
      }
    }

    // Antennae (2 curves from head)
    ctx.strokeStyle = '#1a0a00';
    ctx.lineWidth = 0.7;
    const antWobble = ant.settled ? 0 : Math.sin(this.phaseTime * 8) * 1.5;
    ctx.beginPath();
    ctx.moveTo(ANT_SIZE * 1.1, -ANT_SIZE * 0.2);
    ctx.quadraticCurveTo(ANT_SIZE * 1.6, -ANT_SIZE * 0.8 + antWobble, ANT_SIZE * 2.0, -ANT_SIZE * 1.0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ANT_SIZE * 1.1, ANT_SIZE * 0.2);
    ctx.quadraticCurveTo(ANT_SIZE * 1.6, ANT_SIZE * 0.8 - antWobble, ANT_SIZE * 2.0, ANT_SIZE * 1.0);
    ctx.stroke();

    ctx.restore();
  }
}
