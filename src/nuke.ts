import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { easeInQuad, lerp, randomRange } from './utils';
import { hexToRgb } from './colors';

type NukePhase = 'LAUNCH' | 'DESCENT' | 'IMPACT' | 'AFTERMATH';

const LAUNCH_DUR = 1.5;
const DESCENT_DUR = 1.2;
const IMPACT_DUR = 2.0;
const AFTERMATH_DUR = 1.5;

export class NukeAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: NukePhase = 'LAUNCH';
  phaseTime = 0;
  finished = false;

  // Missile position
  missileX: number;
  missileY: number;
  missileScale = 1;
  missileAngle = -Math.PI / 2; // pointing up

  // Impact target = centroid of enemies
  impactX: number;
  impactY: number;

  // Explosion state
  flashAlpha = 0;
  shockwaveRadius = 0;
  shockwaveAlpha = 0;
  mushroomRadius = 0;
  mushroomStemH = 0;
  enemiesKilled = false;

  // Shield
  shieldAlpha = 0;
  shieldRadius: number;
  shieldPulse = 0;

  // Flame trail particles (simple array for the exhaust)
  flameTrail: { x: number; y: number; life: number; maxLife: number; size: number }[] = [];

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    // Missile starts at winner
    this.missileX = winner.x;
    this.missileY = winner.y;

    // Impact = centroid of enemies
    if (this.enemies.length > 0) {
      this.impactX = this.enemies.reduce((s, t) => s + t.x, 0) / this.enemies.length;
      this.impactY = this.enemies.reduce((s, t) => s + t.y, 0) / this.enemies.length;
    } else {
      this.impactX = canvasW / 2;
      this.impactY = canvasH / 2;
    }

    // Make winner invincible immediately
    winner.invincible = true;

    this.shieldRadius = winner.radius + 12;
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'LAUNCH':
        this.updateLaunch(dt);
        break;
      case 'DESCENT':
        this.updateDescent(dt);
        break;
      case 'IMPACT':
        this.updateImpact(dt);
        break;
      case 'AFTERMATH':
        this.updateAftermath(dt);
        break;
    }

    // Update flame trail
    for (let i = this.flameTrail.length - 1; i >= 0; i--) {
      this.flameTrail[i].life -= dt;
      if (this.flameTrail[i].life <= 0) {
        this.flameTrail.splice(i, 1);
      }
    }
  }

  private nextPhase(next: NukePhase) {
    this.phase = next;
    this.phaseTime = 0;
  }

  private updateLaunch(_dt: number) {
    const t = Math.min(1, this.phaseTime / LAUNCH_DUR);

    // Missile rises from winner to top of screen, shrinks (perspective)
    this.missileX = this.winner.x;
    this.missileY = lerp(this.winner.y, -60, t);
    this.missileScale = lerp(1, 0.3, t);
    this.missileAngle = -Math.PI / 2;

    // Add flame trail
    if (Math.random() < 0.8) {
      this.flameTrail.push({
        x: this.missileX + randomRange(-5, 5),
        y: this.missileY + 20 * this.missileScale,
        life: 0.4,
        maxLife: 0.4,
        size: randomRange(3, 8) * this.missileScale,
      });
    }

    // Shield appears on winner
    this.shieldAlpha = Math.min(0.8, t * 1.5);

    if (this.phaseTime >= LAUNCH_DUR) {
      this.nextPhase('DESCENT');
    }
  }

  private updateDescent(_dt: number) {
    const t = Math.min(1, this.phaseTime / DESCENT_DUR);
    const eased = easeInQuad(t); // accelerating

    // Missile descends from top toward impact, grows
    this.missileX = lerp(this.canvasW / 2, this.impactX, eased);
    this.missileY = lerp(-60, this.impactY, eased);
    this.missileScale = lerp(0.3, 1.5, eased);
    this.missileAngle = Math.PI / 2; // pointing down

    // Flame trail
    if (Math.random() < 0.8) {
      this.flameTrail.push({
        x: this.missileX + randomRange(-5, 5),
        y: this.missileY - 20 * this.missileScale,
        life: 0.3,
        maxLife: 0.3,
        size: randomRange(3, 10) * this.missileScale,
      });
    }

    this.shieldAlpha = 0.8;

    if (this.phaseTime >= DESCENT_DUR) {
      this.nextPhase('IMPACT');
    }
  }

  private updateImpact(dt: number) {
    const t = Math.min(1, this.phaseTime / IMPACT_DUR);

    // White flash — peaks at 0, fades over 0.5s
    if (this.phaseTime < 0.5) {
      this.flashAlpha = 1 - (this.phaseTime / 0.5);
    } else {
      this.flashAlpha = 0;
    }

    // Expanding shockwave
    const maxShockwave = Math.max(this.canvasW, this.canvasH);
    this.shockwaveRadius = t * maxShockwave;
    this.shockwaveAlpha = Math.max(0, 1 - t);

    // Mushroom cloud
    this.mushroomRadius = lerp(0, 120, Math.min(1, t * 2));
    this.mushroomStemH = lerp(0, 80, Math.min(1, t * 1.5));

    // Kill enemies at 0.3s
    if (this.phaseTime >= 0.3 && !this.enemiesKilled) {
      this.enemiesKilled = true;
      for (const enemy of this.enemies) {
        if (enemy.alive) {
          enemy.alive = false;
          enemy.hp = 0;
          this.particles.nukeBurst(enemy.x, enemy.y, 120);
        }
      }
      // Big burst at impact point
      this.particles.nukeBurst(this.impactX, this.impactY, 80);
    }

    // Shield pulses during impact
    this.shieldPulse += dt * 8;
    this.shieldAlpha = 0.6 + Math.sin(this.shieldPulse) * 0.3;

    if (this.phaseTime >= IMPACT_DUR) {
      this.nextPhase('AFTERMATH');
    }
  }

  private updateAftermath(_dt: number) {
    const t = Math.min(1, this.phaseTime / AFTERMATH_DUR);

    // Shield fades
    this.shieldAlpha = lerp(0.8, 0, t);

    // Mushroom cloud stays
    this.mushroomRadius = lerp(120, 140, t);

    // Celebration particles
    if (Math.random() < 0.15) {
      this.particles.celebrationBurst(
        this.winner.x + randomRange(-60, 60),
        this.winner.y + randomRange(-60, 60),
        8,
      );
    }

    // Flash fully gone
    this.flashAlpha = 0;
    this.shockwaveAlpha = 0;

    if (this.phaseTime >= AFTERMATH_DUR) {
      this.finished = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Shield bubble on winner (draw behind missile)
    if (this.shieldAlpha > 0) {
      this.drawShield(ctx);
    }

    // Flame trail
    for (const f of this.flameTrail) {
      const a = f.life / f.maxLife;
      const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size);
      gradient.addColorStop(0, `rgba(255,200,50,${a})`);
      gradient.addColorStop(1, `rgba(255,80,0,${a * 0.3})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Missile (during LAUNCH and DESCENT)
    if (this.phase === 'LAUNCH' || this.phase === 'DESCENT') {
      this.drawMissile(ctx);
    }

    // Mushroom cloud (during IMPACT and AFTERMATH)
    if (this.phase === 'IMPACT' || this.phase === 'AFTERMATH') {
      this.drawMushroomCloud(ctx);
    }

    // Shockwave ring
    if (this.shockwaveAlpha > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${this.shockwaveAlpha * 0.6})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.impactX, this.impactY, this.shockwaveRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // White flash overlay
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashAlpha})`;
      ctx.fillRect(0, 0, this.canvasW, this.canvasH);
    }
  }

  private drawMissile(ctx: CanvasRenderingContext2D) {
    const s = this.missileScale;
    const bodyW = 12 * s;
    const bodyH = 40 * s;

    ctx.save();
    ctx.translate(this.missileX, this.missileY);
    ctx.rotate(this.missileAngle);

    // Shadow ellipse
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(4 * s, 4 * s, bodyW * 0.6, bodyH * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body — elongated ellipse with gradient (gray metallic)
    const bodyGrad = ctx.createLinearGradient(-bodyW, 0, bodyW, 0);
    bodyGrad.addColorStop(0, '#777');
    bodyGrad.addColorStop(0.5, '#ccc');
    bodyGrad.addColorStop(1, '#888');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW * 0.5, bodyH * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Red nose cone (top = negative Y in rotated frame, but we're pointing up)
    ctx.fillStyle = '#cc2222';
    ctx.beginPath();
    ctx.moveTo(0, -bodyH * 0.5);
    ctx.lineTo(-bodyW * 0.3, -bodyH * 0.25);
    ctx.lineTo(bodyW * 0.3, -bodyH * 0.25);
    ctx.closePath();
    ctx.fill();

    // Fins at tail
    ctx.fillStyle = '#555';
    // Left fin
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.3, bodyH * 0.35);
    ctx.lineTo(-bodyW * 0.7, bodyH * 0.55);
    ctx.lineTo(-bodyW * 0.15, bodyH * 0.45);
    ctx.closePath();
    ctx.fill();
    // Right fin
    ctx.beginPath();
    ctx.moveTo(bodyW * 0.3, bodyH * 0.35);
    ctx.lineTo(bodyW * 0.7, bodyH * 0.55);
    ctx.lineTo(bodyW * 0.15, bodyH * 0.45);
    ctx.closePath();
    ctx.fill();

    // Exhaust flame (flickering)
    const flameLen = randomRange(15, 30) * s;
    const flameGrad = ctx.createLinearGradient(0, bodyH * 0.5, 0, bodyH * 0.5 + flameLen);
    flameGrad.addColorStop(0, 'rgba(255,200,50,0.9)');
    flameGrad.addColorStop(0.5, 'rgba(255,100,0,0.6)');
    flameGrad.addColorStop(1, 'rgba(255,50,0,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.25, bodyH * 0.5);
    ctx.quadraticCurveTo(randomRange(-3, 3) * s, bodyH * 0.5 + flameLen * 0.7, 0, bodyH * 0.5 + flameLen);
    ctx.quadraticCurveTo(randomRange(-3, 3) * s, bodyH * 0.5 + flameLen * 0.7, bodyW * 0.25, bodyH * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private drawMushroomCloud(ctx: CanvasRenderingContext2D) {
    const ix = this.impactX;
    const iy = this.impactY;
    const r = this.mushroomRadius;
    const stemH = this.mushroomStemH;
    const fade = this.phase === 'AFTERMATH' ? Math.max(0.2, 1 - this.phaseTime / AFTERMATH_DUR) : 1;

    // Stem
    ctx.fillStyle = `rgba(139,69,19,${0.4 * fade})`;
    ctx.fillRect(ix - r * 0.15, iy - stemH, r * 0.3, stemH);

    // Cloud layers (bottom to top, largest to smallest)
    const layers = [
      { offset: 0, scale: 1.0, color: [60, 30, 10] },
      { offset: -stemH * 0.3, scale: 0.85, color: [139, 69, 19] },
      { offset: -stemH * 0.7, scale: 0.65, color: [255, 140, 0] },
    ];

    for (const layer of layers) {
      const ly = iy + layer.offset;
      const lr = r * layer.scale;
      const [cr, cg, cb] = layer.color;
      const grad = ctx.createRadialGradient(ix, ly, 0, ix, ly, lr);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.6 * fade})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ix, ly, lr, 0, Math.PI * 2);
      ctx.fill();
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

    // Filled semi-transparent
    ctx.fillStyle = `rgba(${r},${g},${b},${this.shieldAlpha * 0.15})`;
    ctx.beginPath();
    ctx.arc(dx, dy, sr, 0, Math.PI * 2);
    ctx.fill();

    // Stroke
    ctx.strokeStyle = `rgba(${r},${g},${b},${this.shieldAlpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dx, dy, sr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
