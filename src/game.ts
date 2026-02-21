import { Tower } from './tower';
import { Bullet } from './bullet';
import { ParticleSystem } from './particles';
import { VictoryArrows } from './victory';
import { TOWER_COLORS } from './colors';
import { dist, angleBetween, randomRange } from './utils';
import { t } from './i18n';

export type GameState = 'WAITING' | 'PLACING' | 'COUNTDOWN' | 'BATTLE' | 'WINNER' | 'BLACK';

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;

  state: GameState = 'WAITING';
  towers: Tower[] = [];
  bullets: Bullet[] = [];
  particles = new ParticleSystem();
  victoryArrows: VictoryArrows | null = null;

  elapsed = 0;
  countdownStart = 0;
  countdownDuration = 3;
  battleStartTime = 0;
  winnerTime = 0;
  lastCannonEscalation = 0;
  guidedMissileActive = false;
  guidedMissileTimer = 0;
  blackScreenTime = 0;

  nextTowerId = 0;
  activeTouches = new Map<number, number>(); // touchId -> towerId
  deathCounter = 0;
  mouseClickCounter = 0;

  textPulse = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    this.bindEvents();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handleTouchStart(e);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.handleTouchMove(e);
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.handleTouchEnd(e);
    }, { passive: false });

    this.canvas.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      this.handleTouchEnd(e);
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      this.handleMouseDown(e);
    });
    this.canvas.addEventListener('mouseup', () => {
      this.handleMouseUp();
    });
  }

  handleTouchStart(e: TouchEvent) {
    // WINNER/BLACK: reset and immediately place the new fingers as towers
    if (this.state === 'WINNER' || this.state === 'BLACK') {
      this.reset();
      // Fall through to place fingers below
    }

    // During battle: re-associate fingers with nearby dormant towers
    if (this.state === 'BATTLE') {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        let nearest: Tower | null = null;
        let nearestDist = 100;
        for (const tower of this.towers) {
          if (!tower.alive || tower.hasFinger) continue;
          const d = dist(touch.clientX, touch.clientY, tower.x, tower.y);
          if (d < nearestDist) {
            nearest = tower;
            nearestDist = d;
          }
        }
        if (nearest) {
          nearest.fingerRestored();
          this.activeTouches.set(touch.identifier, nearest.id);
        }
      }
      return;
    }

    // Place all new fingers at once
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.addTower(touch.identifier, touch.clientX, touch.clientY);
    }

    this.state = 'PLACING';
    this.countdownStart = this.elapsed;
  }

  handleTouchMove(e: TouchEvent) {
    // Only track finger positions before battle
    if (this.state === 'BATTLE' || this.state === 'WINNER') return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const towerId = this.activeTouches.get(touch.identifier);
      if (towerId !== undefined) {
        const tower = this.towers.find(t => t.id === towerId);
        if (tower) {
          tower.x = touch.clientX;
          tower.y = touch.clientY;
        }
      }
    }
  }

  handleTouchEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const towerId = this.activeTouches.get(touch.identifier);
      this.activeTouches.delete(touch.identifier);

      // During battle: tower starts withdrawing
      if (this.state === 'BATTLE' && towerId !== undefined) {
        const tower = this.towers.find(t => t.id === towerId);
        if (tower && tower.alive) {
          tower.fingerRemoved();
        }
      }

      // Before battle: remove the tower when finger lifts
      if ((this.state === 'PLACING' || this.state === 'COUNTDOWN') && towerId !== undefined) {
        const idx = this.towers.findIndex(t => t.id === towerId);
        if (idx !== -1) {
          this.towers.splice(idx, 1);
        }
      }
    }

    // Screen goes black if all fingers removed during PLACING/COUNTDOWN
    if ((this.state === 'PLACING' || this.state === 'COUNTDOWN') && this.activeTouches.size === 0) {
      if (this.towers.length === 0) {
        this.state = 'BLACK';
        this.blackScreenTime = this.elapsed;
      }
    }
  }

  handleMouseDown(e: MouseEvent) {
    if (this.state === 'WINNER' || this.state === 'BLACK') {
      this.reset();
    }
    if (this.state === 'BATTLE') return;

    const fakeId = 10000 + this.mouseClickCounter++;
    this.addTower(fakeId, e.clientX, e.clientY);
    this.state = 'PLACING';
    this.countdownStart = this.elapsed;
  }

  handleMouseUp() {
    // Towers persist after mouse lift (can't track individual mouse buttons)
  }

  addTower(touchId: number, x: number, y: number) {
    if (this.activeTouches.has(touchId)) return;
    const id = this.nextTowerId++;
    const colorIdx = this.towers.length % TOWER_COLORS.length;
    const tower = new Tower(id, x, y, TOWER_COLORS[colorIdx]);
    tower.spawnTime = this.elapsed;
    this.towers.push(tower);
    this.activeTouches.set(touchId, id);
  }

  reset() {
    this.state = 'WAITING';
    this.towers = [];
    this.bullets = [];
    this.particles = new ParticleSystem();
    this.victoryArrows = null;
    this.nextTowerId = 0;
    this.activeTouches.clear();
    this.guidedMissileActive = false;
    this.guidedMissileTimer = 0;
    this.lastCannonEscalation = 0;
    this.deathCounter = 0;
    this.mouseClickCounter = 0;
  }

  startBattle() {
    this.state = 'BATTLE';
    this.battleStartTime = this.elapsed;
    this.lastCannonEscalation = this.elapsed;
    this.guidedMissileActive = false;
    this.guidedMissileTimer = 0;
    this.deathCounter = 0;

    if (this.towers.length === 1) {
      this.towers[0].invincible = true;
    }

    for (const tower of this.towers) {
      tower.startBattle(this.elapsed);
    }
  }

  fireGuidedMissile(tower: Tower) {
    const enemies = this.towers.filter(t => t.alive && t.id !== tower.id && !t.invincible);
    if (enemies.length === 0) return;
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    const c = tower.cannons.length > 0 ? tower.cannons[Math.floor(Math.random() * tower.cannons.length)] : null;
    const fireX = c ? tower.x + Math.cos(c.orbitAngle) * tower.radius : tower.x;
    const fireY = c ? tower.y + Math.sin(c.orbitAngle) * tower.radius : tower.y;
    const aimAngle = angleBetween(fireX, fireY, target.x, target.y);
    const bullet = new Bullet(fireX, fireY, aimAngle, tower.color, tower.id, true);
    bullet.setTarget(target.x, target.y);
    this.bullets.push(bullet);
  }

  update(dt: number) {
    this.elapsed += dt;
    this.textPulse += dt;

    // State transitions
    if (this.state === 'PLACING' || this.state === 'COUNTDOWN') {
      if (this.towers.length >= 2) {
        const timeSinceLast = this.elapsed - this.countdownStart;
        if (timeSinceLast >= this.countdownDuration) {
          this.startBattle();
        } else {
          this.state = 'COUNTDOWN';
        }
      }
    }

    if (this.state === 'BATTLE') {
      const battleTime = this.elapsed - this.battleStartTime;

      if (this.elapsed - this.lastCannonEscalation >= 3) {
        this.lastCannonEscalation = this.elapsed;
        for (const tower of this.towers) {
          if (tower.alive && tower.withdrawScale > 0.5) {
            tower.addCannon(this.elapsed);
          }
        }
      }

      if (battleTime >= 10 && !this.guidedMissileActive) {
        this.guidedMissileActive = true;
        this.guidedMissileTimer = 0;
      }

      if (this.guidedMissileActive) {
        this.guidedMissileTimer -= dt;
        if (this.guidedMissileTimer <= 0) {
          this.guidedMissileTimer = 1.5;
          for (const tower of this.towers) {
            if (tower.alive && tower.withdrawScale > 0.5) {
              this.fireGuidedMissile(tower);
            }
          }
        }
      }
    }

    // Update towers
    for (const tower of this.towers) {
      if (!tower.alive) continue;
      const wasAlive = tower.alive;
      const result = tower.update(dt, this.elapsed);

      if (wasAlive && !tower.alive) {
        this.deathCounter++;
        tower.lastDeathOrder = this.deathCounter;
        this.particles.burst(tower.x, tower.y, tower.color, 70);
      }

      if (this.state === 'BATTLE') {
        for (const fire of result.fires) {
          this.bullets.push(new Bullet(fire.x, fire.y, fire.angle, tower.color, tower.id));
        }
      }
    }

    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];

      if (bullet.guided) {
        const enemies = this.towers.filter(t => t.alive && t.id !== bullet.sourceId && !t.invincible);
        if (enemies.length > 0) {
          let nearest = enemies[0];
          let nearestDist = dist(bullet.x, bullet.y, nearest.x, nearest.y);
          for (let j = 1; j < enemies.length; j++) {
            const d = dist(bullet.x, bullet.y, enemies[j].x, enemies[j].y);
            if (d < nearestDist) {
              nearest = enemies[j];
              nearestDist = d;
            }
          }
          bullet.setTarget(nearest.x, nearest.y);
        } else {
          // No targets left — go straight, stop homing
          bullet.guided = false;
        }
      }

      bullet.update(dt, this.width, this.height);

      if (!bullet.alive) {
        this.bullets.splice(i, 1);
        continue;
      }

      let hitSomething = false;
      for (const tower of this.towers) {
        if (!tower.alive || tower.id === bullet.sourceId) continue;
        if (tower.invincible) continue;
        if (tower.withdrawScale < 0.3) continue;
        const d = dist(bullet.x, bullet.y, tower.x + tower.shakeX, tower.y + tower.shakeY);
        if (d < tower.radius * tower.scale * tower.withdrawScale + bullet.radius) {
          const wasHit = tower.hit();
          if (wasHit) {
            bullet.alive = false;
            if (!tower.alive) {
              this.deathCounter++;
              tower.lastDeathOrder = this.deathCounter;
              this.particles.burst(tower.x, tower.y, tower.color, 70);
            }
            hitSomething = true;
          }
          break;
        }
      }

      if (hitSomething) {
        this.bullets.splice(i, 1);
      }
    }

    this.particles.update(dt);

    if (this.victoryArrows) {
      this.victoryArrows.update(dt);
    }

    // Check for winner
    if (this.state === 'BATTLE') {
      const aliveTowers = this.towers.filter(t => t.alive);
      if (aliveTowers.length <= 1) {
        this.state = 'WINNER';
        this.winnerTime = this.elapsed;
        let winner: Tower;
        if (aliveTowers.length === 1) {
          winner = aliveTowers[0];
        } else {
          winner = this.towers.reduce((a, b) => a.lastDeathOrder > b.lastDeathOrder ? a : b);
          winner.alive = true;
          winner.hp = 1;
        }
        // Winner is invincible — can't disappear
        winner.invincible = true;
        winner.withdrawing = false;
        winner.withdrawScale = 1;
        winner.hasFinger = true;
        this.victoryArrows = new VictoryArrows(winner.x, winner.y, winner.color, this.width, this.height);
        this.particles.celebrationBurst(winner.x, winner.y, 80);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const s = t();

    // BLACK state
    if (this.state === 'BLACK') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const fadeIn = Math.min(1, (this.elapsed - this.blackScreenTime) / 1.0);
      ctx.fillStyle = `rgba(255,255,255,${fadeIn * 0.3})`;
      ctx.font = '20px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.tapAgain, w / 2, h / 2);
      return;
    }

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Victory arrows (behind towers)
    if (this.victoryArrows) {
      this.victoryArrows.draw(ctx);
    }

    // Draw towers
    for (const tower of this.towers) {
      if (!tower.alive) continue;
      tower.draw(ctx);
    }

    // Draw bullets
    for (const bullet of this.bullets) {
      bullet.draw(ctx);
    }

    // Draw particles
    this.particles.draw(ctx);

    // Countdown ring
    if (this.state === 'COUNTDOWN') {
      const progress = (this.elapsed - this.countdownStart) / this.countdownDuration;
      for (const tower of this.towers) {
        if (!tower.alive) continue;
        const endAngle = -Math.PI / 2 + (1 - progress) * Math.PI * 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, tower.radius + 15, -Math.PI / 2, endAngle);
        ctx.stroke();
      }
    }

    // Battle HUD
    if (this.state === 'BATTLE') {
      const battleTime = this.elapsed - this.battleStartTime;
      const cannonCount = this.towers.find(t => t.alive)?.cannons.length ?? 0;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${s.cannons}: ${cannonCount}`, 10, 25);

      if (battleTime >= 8 && !this.guidedMissileActive) {
        const warn = Math.sin(this.elapsed * 6) > 0 ? 0.8 : 0.2;
        ctx.fillStyle = `rgba(255,100,100,${warn})`;
        ctx.font = 'bold 16px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.missilesIncoming, w / 2, 25);
      }
      if (this.guidedMissileActive) {
        ctx.fillStyle = 'rgba(255,50,50,0.6)';
        ctx.font = 'bold 14px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.missilesActive, w / 2, 25);
      }
    }

    // UI Text
    if (this.state === 'WAITING') {
      const alpha = 0.5 + Math.sin(this.textPulse * 2) * 0.3;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.font = 'bold 28px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.placeFingers, w / 2, h / 2);
    }

    if (this.state === 'PLACING' && this.towers.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '20px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.needPlayers, w / 2, 40);
    }

    if (this.state === 'WINNER') {
      const aliveTowers = this.towers.filter(t => t.alive);
      const fadeIn = Math.min(1, (this.elapsed - this.winnerTime) / 0.5);
      ctx.fillStyle = `rgba(255,255,255,${fadeIn * 0.8})`;
      ctx.font = 'bold 36px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.winner, w / 2, 60);
      ctx.font = '18px -apple-system, sans-serif';
      ctx.fillStyle = `rgba(255,255,255,${fadeIn * 0.4})`;
      ctx.fillText(s.tapAgain, w / 2, h - 40);

      if (aliveTowers.length === 1 && Math.random() < 0.03) {
        const winner = aliveTowers[0];
        this.particles.celebrationBurst(
          winner.x + randomRange(-50, 50),
          winner.y + randomRange(-50, 50),
          10
        );
      }
    }
  }
}
