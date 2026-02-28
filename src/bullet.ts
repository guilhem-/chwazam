import { hexToRgb, rgbString } from './colors';
import { angleBetween } from './utils';

export class Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  sourceId: number;
  radius = 5;
  speed = 360;
  alive = true;
  trail: { x: number; y: number }[] = [];

  // Guided missile mode
  guided = false;
  targetX = 0;
  targetY = 0;
  turnRate = 4; // radians per second for homing

  constructor(x: number, y: number, angle: number, color: string, sourceId: number, guided = false) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.color = color;
    this.sourceId = sourceId;
    this.guided = guided;
    if (guided) {
      this.radius = 7;
      this.speed = 264; // slower but homing
    }
  }

  setTarget(tx: number, ty: number) {
    this.targetX = tx;
    this.targetY = ty;
  }

  update(dt: number, canvasW: number, canvasH: number) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > (this.guided ? 12 : 6)) this.trail.shift();

    // Guided steering
    if (this.guided) {
      const desiredAngle = angleBetween(this.x, this.y, this.targetX, this.targetY);
      const currentAngle = Math.atan2(this.vy, this.vx);
      let diff = desiredAngle - currentAngle;
      // Normalize to [-PI, PI]
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.sign(diff) * Math.min(Math.abs(diff), this.turnRate * dt);
      const newAngle = currentAngle + steer;
      this.vx = Math.cos(newAngle) * this.speed;
      this.vy = Math.sin(newAngle) * this.speed;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Out of bounds
    const margin = 50;
    if (this.x < -margin || this.x > canvasW + margin || this.y < -margin || this.y > canvasH + margin) {
      this.alive = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const { r, g, b } = hexToRgb(this.color);

    // Trail
    for (let i = 0; i < this.trail.length; i++) {
      const alpha = (i / this.trail.length) * (this.guided ? 0.6 : 0.4);
      const size = this.radius * (i / this.trail.length) * 0.8;
      ctx.fillStyle = rgbString(r, g, b, alpha);
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bullet body
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.guided ? 15 : 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Guided missile extra glow ring
    if (this.guided) {
      ctx.strokeStyle = rgbString(r, g, b, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
  }
}
