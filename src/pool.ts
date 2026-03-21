import { Tower } from './tower';
import { ParticleSystem } from './particles';
import { dist, lerp } from './utils';

type PoolPhase = 'FADE_WHITE' | 'SETTLING' | 'SHOOTING' | 'RETURN' | 'SLIDE_HOME' | 'TOWER_FADEIN';

interface PoolBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  originalColor: string;
  originalX: number;
  originalY: number;
  radius: number;
  alive: boolean;
  isWhite: boolean;
  towerId: number;
  pocketed: boolean;
  // Pocket fall animation
  falling: boolean;
  fallTime: number;
  fallDuration: number;  // varies with entry speed
  fallPocketX: number;
  fallPocketY: number;
  fallStartX: number;
  fallStartY: number;
}

interface Pocket {
  x: number;
  y: number;
  radius: number;
}

const CUSHION = 50;
const POCKET_R = 55;
const CORNER_POCKET_R = Math.round(POCKET_R * 1.1);
const FRICTION = 0.9965;
const RESTITUTION_BALL = 0.96;
const RESTITUTION_CUSHION = 0.75;
const MIN_SPEED = 3;
const SHOT_SPEED = 1300;
const FADE_DUR = 0.5;
const SUB_STEPS = 4;
const FIXED_DT = 1 / 60; // game uses fixed timestep

// Minimal ball state for deterministic physics (shared by simulation + recording)
interface PhysBall {
  x: number; y: number; vx: number; vy: number;
  radius: number; alive: boolean; isWhite: boolean;
}

interface BallSnapshot { x: number; y: number }

interface PocketEvent {
  tick: number;           // frame index when pocketing occurs
  recordingIndex: number; // index into ShotRecording.ballIndices
  entrySpeed: number;
  pocketX: number; pocketY: number;
  ballX: number;   ballY: number;
}

interface ShotRecording {
  ballIndices: number[];        // maps recording index → this.balls index
  frames: BallSnapshot[][];     // frames[tick][recordingIndex]
  pocketEvents: PocketEvent[];
}

export class PoolAnimation {
  winner: Tower;
  enemies: Tower[];
  canvasW: number;
  canvasH: number;
  particles: ParticleSystem;

  phase: PoolPhase = 'FADE_WHITE';
  phaseTime = 0;
  finished = false;

  // Table bounds (playing surface inside cushions)
  tableL: number;
  tableT: number;
  tableR: number;
  tableB: number;

  pockets: Pocket[] = [];
  balls: PoolBall[] = [];
  whiteBall!: PoolBall;

  // Pre-computed rendering geometry
  cushionPolys: number[][][] = [];   // parallelogram vertices per segment
  diamondPositions: [number, number][] = [];

  // Shot tracking
  allSettled = false;
  settleDelay = 0;
  returnDone = false;
  lastRemainingCount = -1;
  missStreak = 0;
  physicsAccum = 0; // frame-rate independent accumulator
  currentRecording: ShotRecording | null = null;
  replayTick = 0;

  constructor(winner: Tower, allTowers: Tower[], canvasW: number, canvasH: number, particles: ParticleSystem) {
    this.winner = winner;
    this.enemies = allTowers.filter(t => t.id !== winner.id);
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = particles;

    this.tableL = CUSHION;
    this.tableT = CUSHION;
    this.tableR = canvasW - CUSHION;
    this.tableB = canvasH - CUSHION;

    // 6 pockets: 4 corners + 2 mid on longer edges
    // Pockets sit at the table edge, offset outward so they don't overflow the felt
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const co = CUSHION - 4; // pocket center sits ~one cushion depth behind felt corner
    this.pockets = [
      { x: this.tableL - co, y: this.tableT - co, radius: CORNER_POCKET_R },
      { x: this.tableR + co, y: this.tableT - co, radius: CORNER_POCKET_R },
      { x: this.tableL - co, y: this.tableB + co, radius: CORNER_POCKET_R },
      { x: this.tableR + co, y: this.tableB + co, radius: CORNER_POCKET_R },
    ];
    // Mid pockets: tangent to felt boundary (circle touches but doesn't overflow)
    if (canvasW >= canvasH) {
      this.pockets.push({ x: cx, y: this.tableT - POCKET_R, radius: POCKET_R });
      this.pockets.push({ x: cx, y: this.tableB + POCKET_R, radius: POCKET_R });
    } else {
      this.pockets.push({ x: this.tableL - POCKET_R, y: cy, radius: POCKET_R });
      this.pockets.push({ x: this.tableR + POCKET_R, y: cy, radius: POCKET_R });
    }

    // Create balls from towers — keep original tower radius
    for (const t of allTowers) {
      const isWinner = t.id === winner.id;
      const ball: PoolBall = {
        x: t.x, y: t.y,
        vx: 0, vy: 0,
        color: t.color,
        originalColor: t.color,
        originalX: t.x,
        originalY: t.y,
        radius: t.radius,
        alive: true,
        falling: false, fallTime: 0, fallDuration: 0.5, fallPocketX: 0, fallPocketY: 0, fallStartX: 0, fallStartY: 0,
        isWhite: isWinner,
        towerId: t.id,
        pocketed: false,
      };
      this.balls.push(ball);
      if (isWinner) this.whiteBall = ball;
    }

    // Hide all towers — pool draws balls instead
    for (const t of allTowers) {
      t.cannonVisible = false;
      t.cannons = [];
      t.alive = false;
    }

    this.precomputeGeometry();
  }

  /** Pre-compute all rendering geometry: cushion parallelograms + diamond positions. */
  private precomputeGeometry() {
    const w = this.canvasW, h = this.canvasH;

    // ── Compute pocket-border intersections ──
    interface BPt { pos: number; pocketIdx: number; x: number; y: number }
    const borders: Record<string, BPt[]> = { top: [], bottom: [], left: [], right: [] };

    for (let pi = 0; pi < this.pockets.length; pi++) {
      const p = this.pockets[pi];
      // Top border y=0
      const dtop = p.y;
      if (dtop < p.radius) {
        const dx = Math.sqrt(p.radius * p.radius - dtop * dtop);
        borders.top.push({ pos: p.x - dx, pocketIdx: pi, x: p.x - dx, y: 0 });
        borders.top.push({ pos: p.x + dx, pocketIdx: pi, x: p.x + dx, y: 0 });
      }
      // Bottom border y=h
      const dbot = h - p.y;
      if (dbot < p.radius) {
        const dx = Math.sqrt(p.radius * p.radius - dbot * dbot);
        borders.bottom.push({ pos: p.x - dx, pocketIdx: pi, x: p.x - dx, y: h });
        borders.bottom.push({ pos: p.x + dx, pocketIdx: pi, x: p.x + dx, y: h });
      }
      // Left border x=0
      const dleft = p.x;
      if (dleft < p.radius) {
        const dy = Math.sqrt(p.radius * p.radius - dleft * dleft);
        borders.left.push({ pos: p.y - dy, pocketIdx: pi, x: 0, y: p.y - dy });
        borders.left.push({ pos: p.y + dy, pocketIdx: pi, x: 0, y: p.y + dy });
      }
      // Right border x=w
      const dright = w - p.x;
      if (dright < p.radius) {
        const dy = Math.sqrt(p.radius * p.radius - dright * dright);
        borders.right.push({ pos: p.y - dy, pocketIdx: pi, x: w, y: p.y - dy });
        borders.right.push({ pos: p.y + dy, pocketIdx: pi, x: w, y: p.y + dy });
      }
    }

    // Sort each border by position
    for (const key of Object.keys(borders)) {
      borders[key].sort((a, b) => a.pos - b.pos);
    }

    // ── Build cushion parallelograms ──
    // For each border, find spans between different pockets → cushion segments
    // Each segment has an outer edge (on screen border) and inner edge (on felt boundary)
    // with 45° angled ends → parallelogram shape per jaw

    // Left border + top-left corner already render correctly.
    // All others use the same logic: 45° offset always goes AWAY from each pocket
    // (exit point shifts +cushionH along border, entry point shifts -cushionH).
    const buildSegments = (
      borderPts: BPt[],
      outerCoord: number,       // fixed coordinate on screen border
      innerCoord: number,       // fixed coordinate on felt boundary
      isHorizontal: boolean,    // true=top/bottom, false=left/right
    ) => {
      // Group consecutive same-pocket points into openings
      const openings: { exit: BPt; entry: BPt }[] = [];
      for (let i = 0; i < borderPts.length - 1; i++) {
        if (borderPts[i].pocketIdx === borderPts[i + 1].pocketIdx) {
          openings.push({ entry: borderPts[i], exit: borderPts[i + 1] });
        }
      }

      const cushionH = Math.abs(innerCoord - outerCoord);

      // Between consecutive openings, build cushion parallelogram
      for (let i = 0; i < openings.length - 1; i++) {
        const exitPt = openings[i].exit;   // edge of left/top pocket (higher pos)
        const entryPt = openings[i + 1].entry; // edge of right/bottom pocket (lower pos side)

        if (isHorizontal) {
          const x1 = exitPt.pos;
          const x2 = entryPt.pos;
          // 45° always: exit shifts right (+), entry shifts left (-)
          const ix1 = x1 + cushionH;
          const ix2 = x2 - cushionH;
          this.cushionPolys.push([
            [x1, outerCoord], [x2, outerCoord],
            [ix2, innerCoord], [ix1, innerCoord],
          ]);
        } else {
          const y1 = exitPt.pos;
          const y2 = entryPt.pos;
          // 45° always: exit shifts down (+), entry shifts up (-)
          const iy1 = y1 + cushionH;
          const iy2 = y2 - cushionH;
          this.cushionPolys.push([
            [outerCoord, y1], [outerCoord, y2],
            [innerCoord, iy2], [innerCoord, iy1],
          ]);
        }
      }
    };

    buildSegments(borders.top, 0, this.tableT, true);
    buildSegments(borders.bottom, h, this.tableB, true);
    buildSegments(borders.left, 0, this.tableL, false);
    buildSegments(borders.right, w, this.tableR, false);

    // ── Pre-compute diamond positions: 3 per cushion, evenly spaced on centerline ──
    for (const poly of this.cushionPolys) {
      // poly: [outer1, outer2, inner2, inner1]
      const [o1, o2, i2, i1] = poly;
      for (const t of [0.25, 0.5, 0.75]) {
        // Lerp along outer and inner edges, then take midpoint
        const ox = o1[0] + (o2[0] - o1[0]) * t;
        const oy = o1[1] + (o2[1] - o1[1]) * t;
        const ix = i1[0] + (i2[0] - i1[0]) * t;
        const iy = i1[1] + (i2[1] - i1[1]) * t;
        this.diamondPositions.push([(ox + ix) / 2, (oy + iy) / 2]);
      }
    }
  }

  update(dt: number) {
    if (this.finished) return;
    this.phaseTime += dt;

    switch (this.phase) {
      case 'FADE_WHITE':
        this.updateFadeWhite();
        break;
      case 'SETTLING':
        this.updateSettling(dt);
        break;
      case 'SHOOTING':
        this.updateShooting(dt);
        break;
      case 'RETURN':
        this.updateReturn(dt);
        break;
      case 'SLIDE_HOME':
        this.updateSlideHome(dt);
        break;
      case 'TOWER_FADEIN':
        this.updateTowerFadeIn();
        break;
    }
  }

  // ── FADE_WHITE phase ──────────────────────────────────────────────

  private updateFadeWhite() {
    const t = Math.min(1, this.phaseTime / FADE_DUR);
    // Interpolate winner ball color toward white
    const orig = hexToRgb(this.whiteBall.originalColor);
    const r = Math.round(lerp(orig.r, 255, t));
    const g = Math.round(lerp(orig.g, 255, t));
    const b = Math.round(lerp(orig.b, 255, t));
    this.whiteBall.color = `rgb(${r},${g},${b})`;

    if (this.phaseTime >= FADE_DUR) {
      this.whiteBall.color = '#FFFFFF';
      this.phase = 'SETTLING';
      this.phaseTime = 0;
      this.settleDelay = 0.3; // brief pause before first shot
    }
  }

  // ── SETTLING phase (pause between shots, plan next) ────────────

  private updateSettling(dt: number) {
    this.settleDelay -= dt;
    if (this.settleDelay > 0) return;

    const remaining = this.balls.filter(b => !b.pocketed && !b.isWhite);
    if (remaining.length === 0) {
      // All potted — transition to return
      this.phase = 'RETURN';
      this.phaseTime = 0;
      this.physicsAccum = 0;
      this.fireReturnShot();
      return;
    }

    // Track consecutive misses
    if (this.lastRemainingCount === remaining.length) {
      this.missStreak++;
    } else {
      this.missStreak = 0;
      this.lastRemainingCount = remaining.length;
    }

    // After 1 miss, scatter balls (should be very rare with exhaustive search)
    if (this.missStreak >= 1) {
      this.missStreak = 0;
      this.fireRepositionShot();
    } else {
      this.fireNextShot();
    }
    this.phase = 'SHOOTING';
    this.phaseTime = 0;
    this.physicsAccum = 0; // reset so live physics starts at same point as simulation
  }

  // ── SHOOTING phase (physics running) ──────────────────────────

  private updateShooting(dt: number) {
    this.stepPhysics(dt);

    if (this.areBallsSettled()) {
      this.phase = 'SETTLING';
      this.phaseTime = 0;
      this.settleDelay = 0.15;
    }
  }

  // ── RETURN phase ──────────────────────────────────────────────

  private updateReturn(dt: number) {
    this.stepPhysics(dt);

    // Fade color back during travel (time-based)
    const t = Math.min(1, this.phaseTime / 2.0);
    const orig = hexToRgb(this.whiteBall.originalColor);
    const r = Math.round(lerp(255, orig.r, t));
    const g = Math.round(lerp(255, orig.g, t));
    const b = Math.round(lerp(255, orig.b, t));
    this.whiteBall.color = `rgb(${r},${g},${b})`;

    // When ball stops, transition to smooth slide to exact position
    if (this.areBallsSettled()) {
      this.phase = 'SLIDE_HOME';
      this.phaseTime = 0;
      this.whiteBall.color = this.whiteBall.originalColor;
    }
  }

  // ── SLIDE_HOME phase: smoothly slide ball to exact original position ──

  private slideStartX = 0;
  private slideStartY = 0;
  private slideInited = false;

  private updateSlideHome(dt: number) {
    const SLIDE_DUR = 0.3;
    if (!this.slideInited) {
      this.slideStartX = this.whiteBall.x;
      this.slideStartY = this.whiteBall.y;
      this.slideInited = true;
    }

    const t = Math.min(1, this.phaseTime / SLIDE_DUR);
    const ease = t * (2 - t); // ease-out quadratic
    this.whiteBall.x = lerp(this.slideStartX, this.whiteBall.originalX, ease);
    this.whiteBall.y = lerp(this.slideStartY, this.whiteBall.originalY, ease);

    if (t >= 1) {
      this.whiteBall.x = this.whiteBall.originalX;
      this.whiteBall.y = this.whiteBall.originalY;
      this.phase = 'TOWER_FADEIN';
      this.phaseTime = 0;
    }
  }

  private static readonly TOWER_FADEIN_DUR = 0.5;

  private updateTowerFadeIn() {
    if (this.phaseTime >= PoolAnimation.TOWER_FADEIN_DUR) {
      this.finished = true;
    }
  }

  // ── Shot planning ───────────────────────────────────────────

  /** Exhaustive shot search: analytical candidates → direct aims → brute-force sweep. */
  private fireNextShot() {
    const remaining = this.balls.filter(b => !b.pocketed && !b.isWhite);
    if (remaining.length === 0) return;

    const wr = this.whiteBall.radius;
    const wx = this.whiteBall.x, wy = this.whiteBall.y;

    let bestVx = 0, bestVy = 0;
    let bestScore = -Infinity;

    const tryCandidate = (vx: number, vy: number) => {
      const res = this.simulateShot(vx, vy);
      let score = res.pottedCount * 10;
      if (!res.whiteHit) score -= 50;
      if (res.whitePocketed) score -= 200;
      if (score > bestScore) { bestScore = score; bestVx = vx; bestVy = vy; }
    };

    // Phase 1: Analytical candidates — all ball×pocket combos ranked by quality
    const ranked: { nx: number; ny: number; spd: number; score: number }[] = [];

    for (const ball of remaining) {
      const cd = ball.radius + wr;
      for (const pocket of this.pockets) {
        const bpx = pocket.x - ball.x, bpy = pocket.y - ball.y;
        const bpd = Math.sqrt(bpx * bpx + bpy * bpy);
        if (bpd < 1) continue;
        const bpnx = bpx / bpd, bpny = bpy / bpd;

        const gx = ball.x - bpnx * cd, gy = ball.y - bpny * cd;
        const wgx = gx - wx, wgy = gy - wy;
        const wgd = Math.sqrt(wgx * wgx + wgy * wgy);
        if (wgd < cd * 0.5) continue;

        const snx = wgx / wgd, sny = wgy / wgd;
        const cutDot = snx * bpnx + sny * bpny;
        const score = cutDot * 100 - wgd * 0.1 - bpd * 0.05;
        const spd = Math.min(SHOT_SPEED, Math.max(350, wgd * 2.0));
        ranked.push({ nx: snx, ny: sny, spd, score });
      }
    }

    ranked.sort((a, b) => b.score - a.score);

    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      for (const m of [1.3, 1.0, 0.7, 0.5]) {
        tryCandidate(r.nx * r.spd * m, r.ny * r.spd * m);
      }
      for (let deg = -5; deg <= 5; deg++) {
        if (deg === 0) continue;
        const rad = deg * Math.PI / 180;
        const rx = r.nx * Math.cos(rad) - r.ny * Math.sin(rad);
        const ry = r.nx * Math.sin(rad) + r.ny * Math.cos(rad);
        tryCandidate(rx * r.spd, ry * r.spd);
      }
      if (bestScore >= 10 && i >= 2) break;
    }

    // Phase 2: Direct aim at each ball center
    if (bestScore < 10) {
      for (const ball of remaining) {
        const ddx = ball.x - wx, ddy = ball.y - wy;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        for (const m of [1.0, 0.8, 0.6, 0.4]) {
          tryCandidate((ddx / dd) * SHOT_SPEED * m, (ddy / dd) * SHOT_SPEED * m);
        }
      }
    }

    // Phase 3: Brute-force 360° sweep at multiple speeds
    if (bestScore < 10) {
      for (let deg = 0; deg < 360; deg += 3) {
        const rad = deg * Math.PI / 180;
        const nx = Math.cos(rad), ny = Math.sin(rad);
        for (const spd of [SHOT_SPEED, SHOT_SPEED * 0.7, SHOT_SPEED * 0.4]) {
          tryCandidate(nx * spd, ny * spd);
        }
        if (bestScore >= 10) break;
      }
    }

    // Phase 4: Fine 1° sweep as last resort
    if (bestScore < 10) {
      for (let deg = 0; deg < 360; deg++) {
        const rad = deg * Math.PI / 180;
        const nx = Math.cos(rad), ny = Math.sin(rad);
        for (const spd of [SHOT_SPEED, SHOT_SPEED * 0.85, SHOT_SPEED * 0.7, SHOT_SPEED * 0.5, SHOT_SPEED * 0.3]) {
          tryCandidate(nx * spd, ny * spd);
        }
        if (bestScore >= 10) break;
      }
    }

    // Maximize energy: scale winning shot up to SHOT_SPEED, but ONLY if it already pots
    const origPotted = bestScore > 0 ? Math.round(bestScore / 10) : 0;
    const curSpeed = Math.sqrt(bestVx * bestVx + bestVy * bestVy);
    if (origPotted > 0 && curSpeed > 0 && curSpeed < SHOT_SPEED) {
      const maxScale = SHOT_SPEED / curSpeed;
      for (const scale of [maxScale, maxScale * 0.8, maxScale * 0.6]) {
        if (scale <= 1.05) break;
        const res = this.simulateShot(bestVx * scale, bestVy * scale);
        if (!res.whitePocketed && res.whiteHit && res.pottedCount >= origPotted) {
          bestVx *= scale;
          bestVy *= scale;
          break;
        }
      }
    }

    this.currentRecording = this.recordShot(bestVx, bestVy);
    this.replayTick = 0;
  }

  /** Run a headless simulation using the exact same physics sub-step as live play.
   *  Returns potted count, white safety, white hit, and white final position. */
  private simulateShot(vx: number, vy: number): { pottedCount: number; whitePocketed: boolean; whiteHit: boolean; whiteEndX: number; whiteEndY: number } {
    const sim: PhysBall[] = this.balls.filter(b => b.alive && !b.pocketed).map(b => ({
      x: b.x, y: b.y,
      vx: b.isWhite ? vx : 0, vy: b.isWhite ? vy : 0,
      radius: b.radius, alive: true, isWhite: b.isWhite,
    }));

    let pottedCount = 0;
    let whitePocketed = false;
    let whiteHit = false;
    let whiteEndX = this.whiteBall.x, whiteEndY = this.whiteBall.y;
    const maxTicks = 360;

    for (let tick = 0; tick < maxTicks; tick++) {
      let anyMoving = false;

      for (let s = 0; s < SUB_STEPS; s++) {
        // Shared physics sub-step (identical to live)
        this.physicsSubStep(sim);

        // Detect white ball hit: any non-white ball moving means a collision
        // chain from the cue ball (all non-white balls start at rest)
        if (!whiteHit) {
          for (const b of sim) {
            if (!b.alive || b.isWhite) continue;
            if (b.vx !== 0 || b.vy !== 0) {
              whiteHit = true;
              break;
            }
          }
        }

        // Track movement
        for (const b of sim) {
          if (b.alive && (b.vx !== 0 || b.vy !== 0)) anyMoving = true;
        }

        // Pocket capture (white is immune — stays alive, matching live physics exactly)
        for (const b of sim) {
          if (!b.alive) continue;
          for (const p of this.pockets) {
            if (dist(b.x, b.y, p.x, p.y) < p.radius + b.radius) {
              if (b.isWhite) {
                whitePocketed = true; // flag for scoring, but DON'T remove — matches live
              } else {
                b.alive = false;
                pottedCount++;
              }
              break;
            }
          }
        }
      }

      // Track white ball position
      const wb = sim.find(b => b.isWhite);
      if (wb && wb.alive) { whiteEndX = wb.x; whiteEndY = wb.y; }

      if (!anyMoving && tick > 3) break;
    }

    return { pottedCount, whitePocketed, whiteHit, whiteEndX, whiteEndY };
  }

  /** Run a full simulation and record per-tick positions + pocket events for replay. */
  private recordShot(vx: number, vy: number): ShotRecording {
    const ballIndices: number[] = [];
    const sim: PhysBall[] = [];
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.alive || b.pocketed) continue;
      ballIndices.push(i);
      sim.push({
        x: b.x, y: b.y,
        vx: b.isWhite ? vx : 0, vy: b.isWhite ? vy : 0,
        radius: b.radius, alive: true, isWhite: b.isWhite,
      });
    }

    const frames: BallSnapshot[][] = [];
    const pocketEvents: PocketEvent[] = [];
    frames.push(sim.map(b => ({ x: b.x, y: b.y })));

    const maxTicks = 360;
    for (let tick = 0; tick < maxTicks; tick++) {
      let anyMoving = false;

      for (let s = 0; s < SUB_STEPS; s++) {
        this.physicsSubStep(sim);

        for (let bi = 0; bi < sim.length; bi++) {
          const b = sim[bi];
          if (!b.alive) continue;
          for (const p of this.pockets) {
            if (dist(b.x, b.y, p.x, p.y) < p.radius + b.radius) {
              if (!b.isWhite) {
                pocketEvents.push({
                  tick: tick + 1,
                  recordingIndex: bi,
                  entrySpeed: Math.sqrt(b.vx * b.vx + b.vy * b.vy),
                  pocketX: p.x, pocketY: p.y,
                  ballX: b.x, ballY: b.y,
                });
                b.alive = false;
              }
              break;
            }
          }
        }
      }

      frames.push(sim.map(b => ({ x: b.x, y: b.y })));
      for (const b of sim) {
        if (b.alive && (b.vx !== 0 || b.vy !== 0)) anyMoving = true;
      }
      if (!anyMoving && tick > 3) break;
    }

    return { ballIndices, frames, pocketEvents };
  }

  /** Single physics sub-step: movement, friction, cushion bounce, ball-ball collision.
   *  Used by simulateShot and recordShot for guaranteed identical behavior. */
  private physicsSubStep(balls: PhysBall[]) {
    const subDt = FIXED_DT / SUB_STEPS;

    // Move + friction
    for (const b of balls) {
      if (!b.alive) continue;
      b.x += b.vx * subDt;
      b.y += b.vy * subDt;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed < MIN_SPEED) { b.vx = 0; b.vy = 0; }
    }

    // Cushion bounces (opening-based)
    for (const b of balls) {
      if (!b.alive) continue;
      if (b.x - b.radius < this.tableL && !this.hasOpening('left', b.y)) {
        b.x = this.tableL + b.radius; b.vx = Math.abs(b.vx) * RESTITUTION_CUSHION;
      }
      if (b.x + b.radius > this.tableR && !this.hasOpening('right', b.y)) {
        b.x = this.tableR - b.radius; b.vx = -Math.abs(b.vx) * RESTITUTION_CUSHION;
      }
      if (b.y - b.radius < this.tableT && !this.hasOpening('top', b.x)) {
        b.y = this.tableT + b.radius; b.vy = Math.abs(b.vy) * RESTITUTION_CUSHION;
      }
      if (b.y + b.radius > this.tableB && !this.hasOpening('bottom', b.x)) {
        b.y = this.tableB - b.radius; b.vy = -Math.abs(b.vy) * RESTITUTION_CUSHION;
      }
    }

    // Ball-ball collisions
    const alive = balls.filter(b => b.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        collideBalls(alive[i], alive[j]);
      }
    }

  }

  /** Compute return shot: analytical speed estimate + binary search refinement. */
  private fireReturnShot() {
    const tx = this.whiteBall.originalX;
    const ty = this.whiteBall.originalY;
    const ddx = tx - this.whiteBall.x;
    const ddy = ty - this.whiteBall.y;
    const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    const nx = ddx / d;
    const ny = ddy / d;

    // Analytical estimate: with friction F per sub-step, total distance = v0 * subDt / (1 - F)
    const subDt = FIXED_DT / SUB_STEPS;
    const analyticalSpeed = Math.min(SHOT_SPEED, d * (1 - FRICTION) / subDt);

    let bestVx = nx * analyticalSpeed;
    let bestVy = ny * analyticalSpeed;
    let bestDist = Infinity;

    const tryShot = (aNx: number, aNy: number, spd: number): number => {
      const vx = aNx * spd, vy = aNy * spd;
      const res = this.simulateShot(vx, vy);
      const fd = dist(res.whiteEndX, res.whiteEndY, tx, ty);
      if (fd < bestDist) { bestDist = fd; bestVx = vx; bestVy = vy; }
      return fd;
    };

    // Try direct angle at analytical speed first
    tryShot(nx, ny, analyticalSpeed);

    // Binary search on speed: find the speed that lands closest
    let lo = analyticalSpeed * 0.5, hi = Math.min(SHOT_SPEED, analyticalSpeed * 2);
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      const res = this.simulateShot(nx * mid, ny * mid);
      const endDist = dist(res.whiteEndX, res.whiteEndY, tx, ty);
      // Check if ball overshot or undershot by comparing direction
      const endDx = res.whiteEndX - this.whiteBall.x;
      const endDy = res.whiteEndY - this.whiteBall.y;
      const endProj = endDx * nx + endDy * ny; // projection along shot direction
      if (endProj < d) lo = mid; // undershot
      else hi = mid; // overshot
      if (endDist < bestDist) { bestDist = endDist; bestVx = nx * mid; bestVy = ny * mid; }
      if (bestDist < 5) break; // close enough
    }

    // Angle refinement around best direction
    const bestSpd = Math.sqrt(bestVx * bestVx + bestVy * bestVy) || analyticalSpeed;
    for (const deg of [-3, -2, -1, 1, 2, 3]) {
      const rad = deg * Math.PI / 180;
      const rx = nx * Math.cos(rad) - ny * Math.sin(rad);
      const ry = nx * Math.sin(rad) + ny * Math.cos(rad);
      tryShot(rx, ry, bestSpd);
    }

    this.currentRecording = this.recordShot(bestVx, bestVy);
    this.replayTick = 0;
  }

  /** Reposition: aim directly at nearest remaining ball at full speed to scatter. */
  private fireRepositionShot() {
    const remaining = this.balls.filter(b => !b.pocketed && !b.isWhite);
    if (remaining.length === 0) return;

    // Aim at nearest ball — a direct hit will scatter and create new angles
    const nearest = remaining.reduce((a, b) =>
      dist(this.whiteBall.x, this.whiteBall.y, a.x, a.y) <
      dist(this.whiteBall.x, this.whiteBall.y, b.x, b.y) ? a : b
    );
    const dx = nearest.x - this.whiteBall.x;
    const dy = nearest.y - this.whiteBall.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    this.currentRecording = this.recordShot((dx / d) * SHOT_SPEED, (dy / d) * SHOT_SPEED);
    this.replayTick = 0;
  }

  // ── Physics (identical logic used by both live and simulation) ──

  /** Check if a wall has a pocket opening at position `pos` along it.
   *  Uses circle-wall intersection + ball-radius margin for tangent pockets. */
  private hasOpening(wall: 'left' | 'right' | 'top' | 'bottom', pos: number): boolean {
    for (const p of this.pockets) {
      let distToWall: number, pPos: number;
      switch (wall) {
        case 'left':   if (p.x > this.tableL) continue; distToWall = this.tableL - p.x; pPos = p.y; break;
        case 'right':  if (p.x < this.tableR) continue; distToWall = p.x - this.tableR; pPos = p.y; break;
        case 'top':    if (p.y > this.tableT) continue; distToWall = this.tableT - p.y; pPos = p.x; break;
        case 'bottom': if (p.y < this.tableB) continue; distToWall = p.y - this.tableB; pPos = p.x; break;
        default: continue;
      }
      // Extend effective radius by ball radius so tangent pockets still create openings
      const effectiveR = p.radius + 40; // ball radius = 40 (tower default)
      if (distToWall >= effectiveR) continue;
      const halfOpening = Math.sqrt(effectiveR * effectiveR - distToWall * distToWall);
      if (Math.abs(pos - pPos) < halfOpening) return true;
    }
    return false;
  }

  // ── Replay from recording (replaces live physics) ──────────────

  private stepPhysics(dt: number) {
    if (!this.currentRecording) return;
    this.physicsAccum += dt;
    while (this.physicsAccum >= FIXED_DT) {
      this.physicsAccum -= FIXED_DT;
      this.advanceReplayTick();
    }
    this.interpolateReplay(this.physicsAccum / FIXED_DT);
  }

  private advanceReplayTick() {
    const rec = this.currentRecording!;
    if (this.replayTick >= rec.frames.length - 1) return;
    this.replayTick++;

    // Process pocket events for this tick
    for (const evt of rec.pocketEvents) {
      if (evt.tick !== this.replayTick) continue;
      const ball = this.balls[rec.ballIndices[evt.recordingIndex]];
      if (ball.pocketed) continue;
      ball.x = evt.ballX;
      ball.y = evt.ballY;
      ball.falling = true;
      ball.fallTime = 0;
      ball.fallDuration = lerp(0.6, 0.2, Math.min(1, evt.entrySpeed / SHOT_SPEED));
      ball.fallPocketX = evt.pocketX;
      ball.fallPocketY = evt.pocketY;
      ball.fallStartX = evt.ballX;
      ball.fallStartY = evt.ballY;
      ball.pocketed = true;
      ball.vx = 0; ball.vy = 0;
      const tower = this.enemies.find(e => e.id === ball.towerId);
      if (tower) { tower.alive = false; tower.hp = 0; }
    }

    // Update falling ball timers
    for (const b of this.balls) {
      if (!b.falling) continue;
      b.fallTime += FIXED_DT;
      if (b.fallTime >= b.fallDuration) {
        b.falling = false;
        b.alive = false;
      }
    }
  }

  private interpolateReplay(alpha: number) {
    const rec = this.currentRecording;
    if (!rec) return;
    const tick = this.replayTick;
    const nextTick = Math.min(tick + 1, rec.frames.length - 1);
    const frame = rec.frames[tick];
    const nextFrame = rec.frames[nextTick];
    for (let i = 0; i < rec.ballIndices.length; i++) {
      const ball = this.balls[rec.ballIndices[i]];
      if (ball.pocketed || ball.falling) continue;
      ball.x = lerp(frame[i].x, nextFrame[i].x, alpha);
      ball.y = lerp(frame[i].y, nextFrame[i].y, alpha);
    }
  }

  areBallsSettled(): boolean {
    for (const b of this.balls) {
      if (b.falling) return false;
    }
    if (this.currentRecording) {
      return this.replayTick >= this.currentRecording.frames.length - 1;
    }
    return true;
  }

  // ── Drawing (order: felt → holes → cushions → diamonds → balls) ──

  draw(ctx: CanvasRenderingContext2D) {
    const tableFade = this.phase === 'RETURN' ? Math.max(0, 1 - this.phaseTime / 1.5)
      : (this.phase === 'SLIDE_HOME' || this.phase === 'TOWER_FADEIN') ? 0 : 1;
    const w = this.canvasW, h = this.canvasH;

    if (tableFade > 0.01) {
      ctx.save();
      ctx.globalAlpha = tableFade;

      // Wood frame (outer border only)
      ctx.fillStyle = '#2a1500';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4a2800';
      ctx.fillRect(6, 6, w - 12, h - 12);

      // Green rail fill — covers entire inner area so gaps between pockets/cushions are green
      ctx.fillStyle = '#0b6623';
      ctx.fillRect(6, 6, w - 12, h - 12);

      // 1. Felt texture over entire green area (including pocket zones)
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 1;
      for (let y = 6; y < h - 6; y += 6) {
        ctx.beginPath();
        ctx.moveTo(6, y);
        ctx.lineTo(w - 6, y);
        ctx.stroke();
      }

      // 2. Pocket holes (dark circles)
      for (const p of this.pockets) {
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3a2000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 2b. Falling balls (drawn inside pocket holes, before cushions cover edges)
      for (const b of this.balls) {
        if (!b.falling) continue;
        this.drawFallingBall(ctx, b);
      }

      // 3. Cushion parallelograms (pre-computed)
      ctx.fillStyle = '#0a8030';
      for (const poly of this.cushionPolys) {
        ctx.beginPath();
        ctx.moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) {
          ctx.lineTo(poly[i][0], poly[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        // Highlight inner edge
        ctx.strokeStyle = '#0d9940';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(poly[poly.length - 1][0], poly[poly.length - 1][1]);
        ctx.lineTo(poly[poly.length - 2][0], poly[poly.length - 2][1]);
        ctx.stroke();
      }

      // 4. Diamonds (pre-computed: 3 per cushion, 20% bigger)
      ctx.fillStyle = '#c8a84e';
      for (const [dx, dy] of this.diamondPositions) {
        const s = 4.8;
        ctx.beginPath();
        ctx.moveTo(dx, dy - s);
        ctx.lineTo(dx + s * 0.6, dy);
        ctx.lineTo(dx, dy + s);
        ctx.lineTo(dx - s * 0.6, dy);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }

    // 5. Balls (always full opacity, skip falling ones — drawn inside pockets above)
    for (const b of this.balls) {
      if (b.pocketed || !b.alive || b.isWhite || b.falling) continue;
      this.drawBall(ctx, b);
    }
    if (this.phase === 'TOWER_FADEIN') {
      // Ball fades out, tower fades in
      const t = Math.min(1, this.phaseTime / PoolAnimation.TOWER_FADEIN_DUR);
      if (t < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        this.drawBall(ctx, this.whiteBall);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = t;
      this.winner.draw(ctx);
      ctx.restore();
    } else if (!this.whiteBall.pocketed && this.whiteBall.alive) {
      this.drawBall(ctx, this.whiteBall);
    }
  }

  private drawBall(ctx: CanvasRenderingContext2D, b: PoolBall) {
    const rgb = cssToRgb(b.color);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(b.x + 2, b.y + 2, b.radius, 0, Math.PI * 2);
    ctx.fill();

    // Ball body with gradient
    const grad = ctx.createRadialGradient(
      b.x - b.radius * 0.3, b.y - b.radius * 0.3, 0,
      b.x, b.y, b.radius,
    );
    grad.addColorStop(0, `rgba(${Math.min(255, rgb.r + 80)},${Math.min(255, rgb.g + 80)},${Math.min(255, rgb.b + 80)},1)`);
    grad.addColorStop(0.7, b.color);
    grad.addColorStop(1, `rgba(${Math.max(0, rgb.r - 40)},${Math.max(0, rgb.g - 40)},${Math.max(0, rgb.b - 40)},1)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(b.x - b.radius * 0.25, b.y - b.radius * 0.25, b.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFallingBall(ctx: CanvasRenderingContext2D, b: PoolBall) {
    const t = Math.min(1, b.fallTime / b.fallDuration);
    if (t >= 1) return;

    // Ball slides toward pocket center (accelerated by gravity: quadratic easing)
    const accel = t * t; // quadratic ease-in
    const bx = lerp(b.fallStartX, b.fallPocketX, accel);
    const by = lerp(b.fallStartY, b.fallPocketY, accel);

    // Shrink as it falls in
    const scale = 1 - accel * 0.85;
    const r = b.radius * scale;

    // Fade out
    const alpha = 1 - accel;

    if (r < 1 || alpha < 0.01) return;

    const rgb = cssToRgb(b.originalColor);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow (shrinks too)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(bx + 1, by + 1, r, 0, Math.PI * 2);
    ctx.fill();

    // Ball body
    const grad = ctx.createRadialGradient(
      bx - r * 0.3, by - r * 0.3, 0,
      bx, by, r,
    );
    grad.addColorStop(0, `rgba(${Math.min(255, rgb.r + 80)},${Math.min(255, rgb.g + 80)},${Math.min(255, rgb.b + 80)},1)`);
    grad.addColorStop(0.7, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
    grad.addColorStop(1, `rgba(${Math.max(0, rgb.r - 40)},${Math.max(0, rgb.g - 40)},${Math.max(0, rgb.b - 40)},1)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(bx - r * 0.25, by - r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ── Shared physics helper ─────────────────────────────────────────

/** Resolve elastic collision between two balls. Returns true if a collision occurred. */
function collideBalls(a: PhysBall, b: PhysBall): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const minD = a.radius + b.radius;
  if (d >= minD || d < 0.001) return false;

  const nx = dx / d;
  const ny = dy / d;
  const dvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (dvn <= 0) return false;

  const impulse = dvn * RESTITUTION_BALL;
  a.vx -= impulse * nx; a.vy -= impulse * ny;
  b.vx += impulse * nx; b.vy += impulse * ny;

  const overlap = (minD - d) / 2;
  a.x -= overlap * nx; a.y -= overlap * ny;
  b.x += overlap * nx; b.y += overlap * ny;
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 255, g: 255, b: 255 };
}

function cssToRgb(color: string): { r: number; g: number; b: number } {
  // Handle both #hex and rgb(r,g,b) formats
  if (color.startsWith('#')) return hexToRgb(color);
  const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
  return { r: 255, g: 255, b: 255 };
}
