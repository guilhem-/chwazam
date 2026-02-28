import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { easeInQuad, lerp, randomRange } from './utils';
import { hexToRgb } from './colors';

type BlackHolePhase = 'FORMING' | 'PULLING' | 'COLLAPSE';

const FORMING_DUR = 0.8;
const PULLING_DUR = 1.5;
const COLLAPSE_DUR = 0.7;

interface StarParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  blue: boolean;
}

export class BlackHoleAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: BlackHolePhase = 'FORMING';
  phaseTime = 0;
  finished = false;

  // Black hole
  holeRadius = 0;
  holeMaxRadius = 60;
  rotationAngle = 0;

  // Star particles attracted to center
  stars: StarParticle[] = [];

  // Shield
  shieldAlpha = 0;
  shieldRadius: number;
  shieldPulse = 0;

  // Flash
  flashAlpha = 0;

  // Enemy starting positions (for lerp)
  enemyStarts: { id: number; x: number; y: number }[];

  enemiesKilled = false;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    winner.invincible = true;
    this.shieldRadius = winner.radius + 12;

    this.enemyStarts = this.enemies.map(e => ({ id: e.id, x: e.x, y: e.y }));

    // Activate particle attractor toward winner
    particles.attractorX = winner.x;
    particles.attractorY = winner.y;
    particles.attractorStrength = 24000;
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;
    this.rotationAngle += dt * 3;

    switch (this.phase) {
      case 'FORMING':
        this.updateForming(dt);
        break;
      case 'PULLING':
        this.updatePulling(dt);
        break;
      case 'COLLAPSE':
        this.updateCollapse(dt);
        break;
    }

    // Update star particles
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      // Gravity toward winner
      const dx = this.winner.x - s.x;
      const dy = this.winner.y - s.y;
      const d = Math.max(10, Math.sqrt(dx * dx + dy * dy));
      // 1/r force so distant stars still feel strong pull
      const force = 20000 / d;
      s.vx += (dx / d) * force * dt;
      s.vy += (dy / d) * force * dt;
      s.vx *= 0.96;
      s.vy *= 0.96;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;

      if (s.life <= 0 || d < 15) {
        this.stars.splice(i, 1);
      }
    }
  }

  private nextPhase(next: BlackHolePhase) {
    this.phase = next;
    this.phaseTime = 0;
  }

  private updateForming(_dt: number) {
    const t = Math.min(1, this.phaseTime / FORMING_DUR);
    this.holeRadius = lerp(0, this.holeMaxRadius, t);
    this.shieldAlpha = Math.min(0.8, t * 1.5);

    // Spawn a few star particles
    if (Math.random() < 0.4) {
      this.spawnStar();
    }

    if (this.phaseTime >= FORMING_DUR) {
      this.nextPhase('PULLING');
    }
  }

  private updatePulling(dt: number) {
    const t = Math.min(1, this.phaseTime / PULLING_DUR);
    const eased = easeInQuad(t);

    // Pull enemies toward black hole center
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const start = this.enemyStarts.find(s => s.id === enemy.id)!;
      enemy.x = lerp(start.x, this.winner.x, eased);
      enemy.y = lerp(start.y, this.winner.y, eased);
      enemy.withdrawScale = Math.max(0, 1 - eased);

      if (enemy.withdrawScale <= 0 && !this.enemiesKilled) {
        enemy.alive = false;
        enemy.hp = 0;
        this.particles.burst(enemy.x, enemy.y, enemy.color, 70);
      }
    }

    // Kill all enemies at end of pull
    if (t >= 0.95 && !this.enemiesKilled) {
      this.enemiesKilled = true;
      for (const enemy of this.enemies) {
        if (enemy.alive) {
          enemy.alive = false;
          enemy.hp = 0;
          this.particles.burst(enemy.x, enemy.y, enemy.color, 70);
        }
      }
    }

    // Spawn star particles
    if (Math.random() < 0.6) {
      this.spawnStar();
    }

    this.shieldAlpha = 0.8;
    this.shieldPulse += dt * 6;

    if (this.phaseTime >= PULLING_DUR) {
      this.nextPhase('COLLAPSE');
    }
  }

  private updateCollapse(_dt: number) {
    const t = Math.min(1, this.phaseTime / COLLAPSE_DUR);

    // Black hole contracts
    this.holeRadius = lerp(this.holeMaxRadius, 0, t);

    // Flash at start
    if (t < 0.3) {
      this.flashAlpha = (1 - t / 0.3) * 0.8;
    } else {
      this.flashAlpha = 0;
    }

    // Shield fades
    this.shieldAlpha = lerp(0.8, 0, t);

    // Celebration particles
    if (Math.random() < 0.15) {
      this.particles.celebrationBurst(
        this.winner.x + randomRange(-60, 60),
        this.winner.y + randomRange(-60, 60),
        8,
      );
    }

    if (this.phaseTime >= COLLAPSE_DUR) {
      this.particles.attractorStrength = 0;
      this.finished = true;
    }
  }

  private spawnStar() {
    const angle = randomRange(0, Math.PI * 2);
    const d = randomRange(150, Math.max(this.canvasW, this.canvasH) * 0.6);
    // Tangential velocity for spiral effect
    const tangent = angle + Math.PI / 2;
    const speed = randomRange(40, 100);
    this.stars.push({
      x: this.winner.x + Math.cos(angle) * d,
      y: this.winner.y + Math.sin(angle) * d,
      vx: Math.cos(tangent) * speed,
      vy: Math.sin(tangent) * speed,
      life: 3,
      size: randomRange(1, 3),
      blue: Math.random() > 0.5,
    });
  }

  draw(ctx: CanvasRenderingContext2D) {
    const wx = this.winner.x;
    const wy = this.winner.y;

    // Star particles
    for (const s of this.stars) {
      const alpha = Math.min(1, s.life);
      ctx.fillStyle = s.blue
        ? `rgba(150,180,255,${alpha})`
        : `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Accretion disc (rotating gradient ring)
    if (this.holeRadius > 5) {
      const discRadius = this.holeRadius * 1.8;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(this.rotationAngle);

      // Outer glow ring
      ctx.strokeStyle = `rgba(120,50,200,0.3)`;
      ctx.lineWidth = this.holeRadius * 0.4;
      ctx.shadowColor = 'rgba(150,80,255,0.5)';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, discRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner ring
      ctx.strokeStyle = `rgba(200,100,255,0.4)`;
      ctx.lineWidth = this.holeRadius * 0.2;
      ctx.beginPath();
      ctx.arc(0, 0, discRadius * 0.7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();

      // Black hole center
      const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, this.holeRadius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.7, 'rgba(10,0,20,0.9)');
      grad.addColorStop(1, 'rgba(40,10,60,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(wx, wy, this.holeRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shield on winner
    if (this.shieldAlpha > 0) {
      this.drawShield(ctx);
    }

    // Flash overlay
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(200,150,255,${this.flashAlpha})`;
      ctx.fillRect(0, 0, this.canvasW, this.canvasH);
    }
  }

  private drawShield(ctx: CanvasRenderingContext2D) {
    const { r, g, b } = hexToRgb(this.winner.color);
    const dx = this.winner.x + this.winner.shakeX;
    const dy = this.winner.y + this.winner.shakeY;
    const pulse = 1 + Math.sin(this.shieldPulse) * 0.05;
    const sr = this.shieldRadius * pulse;

    ctx.save();
    ctx.shadowColor = this.winner.color;
    ctx.shadowBlur = 20;

    ctx.fillStyle = `rgba(${r},${g},${b},${this.shieldAlpha * 0.15})`;
    ctx.beginPath();
    ctx.arc(dx, dy, sr, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(${r},${g},${b},${this.shieldAlpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dx, dy, sr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
