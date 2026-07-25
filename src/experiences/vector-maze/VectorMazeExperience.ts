import type { Experience, ExperienceContext, ExperienceManifest, Viewport } from '../../core/Experience.js';
import { drawHandSkeleton, roundedRect, toPixels } from '../../core/GestureGraphics.js';
import type { HandInput, Vec2 } from '../../core/types.js';

export const vectorMazeManifest: ExperienceManifest = {
  id: 'labirinto-vetorial',
  title: 'Labirinto vetorial',
  subtitle: 'Controla a aceleração e guia a bola.',
  description: 'Aplica uma força com a mão e observa os vetores velocidade e aceleração enquanto atravessas o labirinto.',
  icon: '🟠',
  version: '2.2.0',
  author: 'Clube Ciência Viva Abel Salazar',
};

type Phase = 'instructions' | 'playing' | 'success' | 'finished';
type Rect = { x: number; y: number; width: number; height: number };

export class VectorMazeExperience implements Experience {
  readonly manifest = vectorMazeManifest;
  private context!: ExperienceContext;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private input: HandInput | null = null;
  private phase: Phase = 'instructions';
  private ball: Vec2 = { x: 0, y: 0 };
  private velocity: Vec2 = { x: 0, y: 0 };
  private acceleration: Vec2 = { x: 0, y: 0 };
  private targetAcceleration: Vec2 = { x: 0, y: 0 };
  private neutral: Vec2 | null = null;
  private elapsed = 0;
  private totalElapsed = 0;
  private collisions = 0;
  private distanceTravelled = 0;
  private lastBall: Vec2 = { x: 0, y: 0 };
  private resultSent = false;
  private score = 0;
  private successElapsed = 0;
  private runTime = 0;
  private completionTime = 0;

  mount(context: ExperienceContext): void { this.context = context; }

  start(): void {
    this.phase = 'instructions';
    this.input = null;
    this.elapsed = 0;
    this.totalElapsed = 0;
    this.collisions = 0;
    this.distanceTravelled = 0;
    this.resultSent = false;
    this.score = 0;
    this.successElapsed = 0;
    this.runTime = 0;
    this.completionTime = 0;
    this.resetBall();
  }

  update(dtSeconds: number, input: HandInput): void {
    const dt = Math.min(dtSeconds, 0.035);
    this.elapsed += dt;
    this.totalElapsed += dt;
    this.input = input;

    if (this.phase === 'instructions') {
      if (this.elapsed > 0.8 && input.pinchStarted) {
        this.phase = 'playing';
        this.elapsed = 0;
        this.context.audio.tone(510, 0.1);
      }
      return;
    }

    if (this.phase === 'playing') {
      this.runTime += dt;
      this.updateControl(input);
      this.integrate(dt);
      if (this.inGoal()) this.completeSuccess();
      else if (this.elapsed >= this.context.config.vectorMaze.maximumSeconds) this.finish(false);
      return;
    }

    if (this.phase === 'success') {
      this.successElapsed += dt;
      this.targetAcceleration = { x: 0, y: 0 };
      this.acceleration = { x: 0, y: 0 };
      this.velocity.x *= Math.max(0, 1 - 1.8 * dt);
      this.velocity.y *= Math.max(0, 1 - 1.8 * dt);
      if (this.successElapsed > 4.5 || (this.successElapsed > 2 && input.pinchStarted)) this.finish(true);
      return;
    }

    if (this.phase === 'finished' && !this.resultSent) {
      this.resultSent = true;
      window.setTimeout(() => this.sendResult(), 700);
    }
  }

  render(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#07152a');
    gradient.addColorStop(0.55, '#10143c');
    gradient.addColorStop(1, '#02050d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (this.phase !== 'instructions') {
      this.drawMaze();
      this.drawGoal();
      this.drawBall();
      this.drawVectors();
      this.drawControlGuide();
    }
    if (this.input && this.phase === 'playing') drawHandSkeleton(ctx, this.input, this.viewport);
    this.drawHud();
  }

  resize(viewport: Viewport): void {
    const firstResize = this.viewport.width <= 1;
    this.viewport = viewport;
    if (firstResize || this.ball.x === 0) this.resetBall();
  }

  dispose(): void { this.neutral = null; }

  private updateControl(input: HandInput): void {
    if (!input.present) {
      this.neutral = null;
      this.targetAcceleration = { x: 0, y: 0 };
      return;
    }
    const cursor = toPixels(input.cursor, this.viewport);
    if (input.pinchStarted || (input.pinch && !this.neutral)) this.neutral = { ...cursor };
    if (!input.pinch) {
      this.neutral = null;
      this.targetAcceleration = { x: 0, y: 0 };
      return;
    }
    if (!this.neutral) this.neutral = { ...cursor };
    const dx = cursor.x - this.neutral.x;
    const dy = cursor.y - this.neutral.y;
    const maxRange = Math.min(this.viewport.width, this.viewport.height) * 0.19;
    const length = Math.hypot(dx, dy);
    const limited = length > maxRange && length > 0 ? maxRange / length : 1;
    const mass = Math.max(1, this.context.config.vectorMaze.massFactor);
    const maxAcceleration = Math.min(this.viewport.width, this.viewport.height) * this.context.config.vectorMaze.accelerationScale / mass;
    this.targetAcceleration = {
      x: dx * limited / maxRange * maxAcceleration,
      y: dy * limited / maxRange * maxAcceleration,
    };
  }

  private integrate(dt: number): void {
    const response = Math.min(1, Math.max(0.2, this.context.config.vectorMaze.controlResponsePerSecond) * dt);
    this.acceleration.x += (this.targetAcceleration.x - this.acceleration.x) * response;
    this.acceleration.y += (this.targetAcceleration.y - this.acceleration.y) * response;
    const drag = Math.max(0, 1 - this.context.config.vectorMaze.dragPerSecond * dt);
    this.velocity.x = (this.velocity.x + this.acceleration.x * dt) * drag;
    this.velocity.y = (this.velocity.y + this.acceleration.y * dt) * drag;
    const maxSpeed = Math.min(this.viewport.width, this.viewport.height) * this.context.config.vectorMaze.maximumSpeedFraction;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed > maxSpeed) {
      this.velocity.x *= maxSpeed / speed;
      this.velocity.y *= maxSpeed / speed;
    }

    this.lastBall = { ...this.ball };
    const oldX = this.ball.x;
    this.ball.x += this.velocity.x * dt;
    if (this.collides()) {
      this.ball.x = oldX;
      this.velocity.x *= -0.42;
      this.registerCollision();
    }
    const oldY = this.ball.y;
    this.ball.y += this.velocity.y * dt;
    if (this.collides()) {
      this.ball.y = oldY;
      this.velocity.y *= -0.42;
      this.registerCollision();
    }
    this.distanceTravelled += Math.hypot(this.ball.x - this.lastBall.x, this.ball.y - this.lastBall.y);
  }

  private completeSuccess(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'success';
    this.successElapsed = 0;
    this.completionTime = this.runTime;
    this.targetAcceleration = { x: 0, y: 0 };
    const timeQuality = Math.max(0, 1 - this.runTime / this.context.config.vectorMaze.maximumSeconds);
    const collisionQuality = Math.max(0, 1 - this.collisions / 22);
    const ideal = Math.min(this.viewport.width, this.viewport.height) * 2.35;
    const routeQuality = Math.max(0, Math.min(1, ideal / Math.max(ideal, this.distanceTravelled)));
    this.score = Math.round(360 + timeQuality * 280 + collisionQuality * 210 + routeQuality * 150);
    this.context.audio.success();
  }

  private finish(success: boolean): void {
    if (this.phase === 'finished') return;
    if (!success) {
      const progress = this.progressToGoal();
      this.score = Math.round(progress * 380 + Math.max(0, 220 - this.collisions * 10));
      this.context.audio.failure();
    }
    this.phase = 'finished';
    this.elapsed = 0;
  }

  private sendResult(): void {
    const success = this.inGoal() || this.score >= 600;
    this.context.complete({
      score: Math.min(1000, Math.max(0, this.score)),
      title: success ? 'Labirinto concluído!' : 'Percurso interrompido',
      explanation: 'A aceleração altera o vetor velocidade. Quando deixas de aplicar força, a bola mantém o movimento e abranda apenas devido ao atrito.',
      details: [
        `Cronómetro: ${(this.completionTime || this.runTime).toFixed(1)} s`,
        `Colisões: ${this.collisions}`,
        `Velocidade final: ${Math.hypot(this.velocity.x, this.velocity.y).toFixed(0)} px/s`,
      ],
    });
  }

  private drawMaze(): void {
    const { ctx } = this.context;
    ctx.save();
    for (const wall of this.walls()) {
      roundedRect(ctx, wall.x, wall.y, wall.width, wall.height, Math.min(14, wall.width / 3, wall.height / 3));
      const gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.width, wall.y + wall.height);
      gradient.addColorStop(0, '#284c72');
      gradient.addColorStop(0.5, '#5d88ad');
      gradient.addColorStop(1, '#18304f');
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,230,255,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGoal(): void {
    const { ctx } = this.context;
    const goal = this.goal();
    const pulse = 1 + Math.sin(this.totalElapsed * 4) * 0.08;
    ctx.save();
    ctx.strokeStyle = '#70f2b8';
    ctx.fillStyle = 'rgba(112,242,184,0.18)';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#70f2b8';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, this.goalRadius() * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(15, this.viewport.height * 0.019)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('META', goal.x, goal.y + 5);
    ctx.restore();
  }

  private drawBall(): void {
    const { ctx } = this.context;
    const radius = this.ballRadius();
    const gradient = ctx.createRadialGradient(this.ball.x - radius * 0.35, this.ball.y - radius * 0.4, radius * 0.1, this.ball.x, this.ball.y, radius);
    gradient.addColorStop(0, '#fff7c2');
    gradient.addColorStop(0.3, '#ffb23f');
    gradient.addColorStop(1, '#bd4b14');
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.shadowColor = '#ffab39';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawVectors(): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const acc = Math.hypot(this.acceleration.x, this.acceleration.y);
    const velocityScale = speed > 1 ? Math.min(155, speed * 0.28) / speed : 0;
    const accelerationScale = acc > 1 ? Math.min(135, acc * 0.09) / acc : 0;
    this.drawArrow(this.ball, {
      x: this.ball.x + this.velocity.x * velocityScale,
      y: this.ball.y + this.velocity.y * velocityScale,
    }, '#63d8ff', 'v', speed);
    this.drawArrow(this.ball, {
      x: this.ball.x + this.acceleration.x * accelerationScale,
      y: this.ball.y + this.acceleration.y * accelerationScale,
    }, '#ff7f5e', 'a', acc);
  }

  private drawArrow(start: Vec2, end: Vec2, color: string, symbol: string, magnitude: number): void {
    if (magnitude < 2) return;
    const { ctx } = this.context;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = 14;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${Math.max(14, this.viewport.height * 0.018)}px system-ui`;
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} = ${magnitude.toFixed(0)}`, end.x + 8, end.y - 8);
    ctx.restore();
  }

  private drawControlGuide(): void {
    if (!this.input?.present || !this.neutral || !this.input.pinch || this.phase !== 'playing') return;
    const { ctx } = this.context;
    const cursor = toPixels(this.input.cursor, this.viewport);
    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = 'rgba(255,255,255,0.58)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.neutral.x, this.neutral.y, 25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    this.drawArrow(this.neutral, cursor, '#70f2b8', 'força', Math.hypot(this.acceleration.x, this.acceleration.y));
    ctx.restore();
  }

  private drawHud(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    ctx.textAlign = 'center';
    if (this.phase === 'instructions') {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.max(36, height * 0.06)}px system-ui`;
      ctx.fillText('Labirinto vetorial', width / 2, height * 0.15);
      ctx.font = `500 ${Math.max(19, height * 0.026)}px system-ui`;
      ctx.fillStyle = 'rgba(225,242,255,0.9)';
      ctx.fillText('Faz pinça para criar um ponto neutro.', width / 2, height * 0.23);
      ctx.fillText('Desloca a mão: a direção e a distância controlam a aceleração.', width / 2, height * 0.28);
      ctx.fillText('Abre a mão para deixar de aplicar força; a bola continua em movimento.', width / 2, height * 0.33);
      ctx.fillText('A bola tem maior inércia: antecipa as curvas e trava com suavidade.', width / 2, height * 0.38);
      ctx.fillStyle = '#72f2b5';
      ctx.font = `800 ${Math.max(22, height * 0.032)}px system-ui`;
      ctx.fillText('Faz pinça para começar o cronómetro', width / 2, height * 0.51);
      return;
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(19, height * 0.026)}px system-ui`;
    ctx.fillText(`Cronómetro: ${this.formatTime(this.runTime)}`, width * 0.03, height * 0.065);
    ctx.fillStyle = 'rgba(225,242,255,0.72)';
    ctx.font = `600 ${Math.max(15, height * 0.02)}px system-ui`;
    ctx.fillText(`Limite: ${Math.max(0, this.context.config.vectorMaze.maximumSeconds - this.runTime).toFixed(0)} s`, width * 0.03, height * 0.1);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(19, height * 0.026)}px system-ui`;
    ctx.fillText(`Colisões: ${this.collisions}`, width * 0.03, height * 0.14);
    ctx.fillStyle = '#63d8ff';
    ctx.fillText('azul: velocidade', width * 0.03, height * 0.185);
    ctx.fillStyle = '#ff8a6a';
    ctx.fillText('laranja: aceleração', width * 0.03, height * 0.225);

    if (this.phase === 'playing') {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(225,242,255,0.84)';
      ctx.font = `600 ${Math.max(15, height * 0.019)}px system-ui`;
      ctx.fillText(this.input?.pinch ? 'Mantém a pinça e ajusta a força.' : 'Faz pinça para aplicar uma força à bola.', width / 2, height * 0.07);
    } else if (this.phase === 'success') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#70f2b8';
      ctx.font = `900 ${Math.max(36, height * 0.058)}px system-ui`;
      ctx.fillText('LABIRINTO CONCLUÍDO!', width / 2, height * 0.12);
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${Math.max(17, height * 0.022)}px system-ui`;
      ctx.fillText('Observa: sem força aplicada, a aceleração tende para zero.', width / 2, height * 0.17);
    }
  }

  private resetBall(): void {
    this.ball = { x: this.viewport.width * 0.09, y: this.viewport.height * 0.82 };
    this.lastBall = { ...this.ball };
    this.velocity = { x: 0, y: 0 };
    this.acceleration = { x: 0, y: 0 };
    this.targetAcceleration = { x: 0, y: 0 };
    this.neutral = null;
  }

  private walls(): Rect[] {
    const { width: w, height: h } = this.viewport;
    const t = Math.max(18, Math.min(w, h) * 0.025);
    return [
      { x: w * 0.035, y: h * 0.12, width: w * 0.93, height: t },
      { x: w * 0.035, y: h * 0.90, width: w * 0.93, height: t },
      { x: w * 0.035, y: h * 0.12, width: t, height: h * 0.80 },
      { x: w * 0.945, y: h * 0.12, width: t, height: h * 0.80 },
      { x: w * 0.27, y: h * 0.25, width: t, height: h * 0.65 },
      { x: w * 0.50, y: h * 0.12, width: t, height: h * 0.54 },
      { x: w * 0.73, y: h * 0.34, width: t, height: h * 0.58 },
    ];
  }

  private collides(): boolean {
    const r = this.ballRadius();
    return this.walls().some((wall) => {
      const closestX = Math.max(wall.x, Math.min(this.ball.x, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(this.ball.y, wall.y + wall.height));
      return Math.hypot(this.ball.x - closestX, this.ball.y - closestY) < r;
    });
  }

  private registerCollision(): void {
    const now = performance.now();
    const last = Number((this as unknown as { lastCollisionAt?: number }).lastCollisionAt ?? 0);
    if (now - last > 180) {
      this.collisions += 1;
      (this as unknown as { lastCollisionAt?: number }).lastCollisionAt = now;
      this.context.audio.tone(180, 0.05, 0.012);
    }
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds - minutes * 60;
    return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(1).padStart(4, '0')}`;
  }

  private ballRadius(): number { return Math.max(16, Math.min(this.viewport.width, this.viewport.height) * 0.021); }
  private goalRadius(): number { return this.ballRadius() * 1.8; }
  private goal(): Vec2 { return { x: this.viewport.width * 0.88, y: this.viewport.height * 0.20 }; }
  private inGoal(): boolean { return Math.hypot(this.ball.x - this.goal().x, this.ball.y - this.goal().y) <= this.goalRadius() - this.ballRadius() * 0.15; }
  private progressToGoal(): number {
    const start = { x: this.viewport.width * 0.09, y: this.viewport.height * 0.82 };
    const total = Math.hypot(this.goal().x - start.x, this.goal().y - start.y);
    const remaining = Math.hypot(this.goal().x - this.ball.x, this.goal().y - this.ball.y);
    return Math.max(0, Math.min(1, 1 - remaining / total));
  }
}
