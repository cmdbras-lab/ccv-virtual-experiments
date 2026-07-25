import type { Experience, ExperienceContext, ExperienceManifest, Viewport } from '../../core/Experience.js';
import { drawDwellRing, drawHandSkeleton, pointInRect, roundedRect, toPixels } from '../../core/GestureGraphics.js';
import type { HandInput, Vec2 } from '../../core/types.js';

export const laserManifest: ExperienceManifest = {
  id: 'laboratorio-de-lasers',
  title: 'Laboratório de lasers',
  subtitle: 'Reflete a luz e compara os ângulos.',
  description: 'Orienta um espelho, acerta em alvos e responde a perguntas sobre a lei da reflexão.',
  icon: '🔦',
  version: '2.2.0',
  author: 'Clube Ciência Viva Abel Salazar',
};

type Phase = 'instructions' | 'aiming' | 'observation' | 'quiz' | 'quiz-feedback' | 'finished';
type Quiz = { question: string; options: string[]; correct: number; explanation: string };
type Rect = { x: number; y: number; width: number; height: number };

const QUIZZES: Quiz[] = [
  {
    question: 'Qual é a relação entre os dois ângulos?',
    options: ['São iguais', 'Incidência é maior', 'Reflexão é maior'],
    correct: 0,
    explanation: 'Num espelho plano, o ângulo de incidência é igual ao ângulo de reflexão.',
  },
  {
    question: 'Em relação a que linha se medem os ângulos?',
    options: ['Ao espelho', 'À normal', 'Ao alvo'],
    correct: 1,
    explanation: 'Os ângulos são medidos relativamente à normal à superfície no ponto de incidência.',
  },
  {
    question: 'Se a incidência aumentar 10°, a reflexão…',
    options: ['Diminui 10°', 'Não muda', 'Aumenta 10°'],
    correct: 2,
    explanation: 'Os dois ângulos variam sempre da mesma forma e mantêm-se iguais.',
  },
];

export class LaserExperience implements Experience {
  readonly manifest = laserManifest;
  private context!: ExperienceContext;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private phase: Phase = 'instructions';
  private input: HandInput | null = null;
  private elapsed = 0;
  private totalElapsed = 0;
  private round = 0;
  private score = 0;
  private hitHold = 0;
  private mirrorAngle = Math.PI / 2;
  private finishSent = false;
  private quizHover = -1;
  private quizHoverStartedAt = 0;
  private selectedAnswer = -1;
  private correctAnswers = 0;
  private hits = 0;
  private targetPositions: Vec2[] = [];

  mount(context: ExperienceContext): void { this.context = context; }

  start(): void {
    this.phase = 'instructions';
    this.input = null;
    this.elapsed = 0;
    this.totalElapsed = 0;
    this.round = 0;
    this.score = 0;
    this.hitHold = 0;
    this.finishSent = false;
    this.quizHover = -1;
    this.quizHoverStartedAt = 0;
    this.selectedAnswer = -1;
    this.correctAnswers = 0;
    this.hits = 0;
    this.targetPositions = this.createTargetPositions();
    this.mirrorAngle = this.initialMirrorAngle();
  }

  update(dtSeconds: number, input: HandInput): void {
    const dt = Math.min(dtSeconds, 0.05);
    this.elapsed += dt;
    this.totalElapsed += dt;
    this.input = input;

    if (this.phase === 'instructions') {
      if (this.elapsed > 0.8 && input.pinchStarted) {
        this.phase = 'aiming';
        this.elapsed = 0;
        this.context.audio.tone(520, 0.1);
      }
      return;
    }

    if (this.phase === 'aiming') {
      if (input.present) {
        const pivot = this.mirrorPivot();
        const cursor = toPixels(input.cursor, this.viewport);
        this.mirrorAngle = Math.atan2(cursor.y - pivot.y, cursor.x - pivot.x);
      }
      const hit = this.rayHitsTarget();
      this.hitHold = hit ? this.hitHold + dt : Math.max(0, this.hitHold - dt * 1.8);
      if (this.hitHold >= this.context.config.laser.aimHoldSeconds) this.completeShot();
      if (this.elapsed >= 45) this.finish();
      return;
    }

    if (this.phase === 'observation') {
      if (this.elapsed >= this.context.config.laser.observationSeconds) {
        this.phase = 'quiz';
        this.elapsed = 0;
        this.quizHover = -1;
        this.quizHoverStartedAt = 0;
      }
      return;
    }

    if (this.phase === 'quiz') {
      this.updateQuiz(input);
      return;
    }

    if (this.phase === 'quiz-feedback') {
      if (this.elapsed > 2.1) this.nextRound();
      return;
    }

    if (this.phase === 'finished' && !this.finishSent) {
      this.finishSent = true;
      window.setTimeout(() => this.sendResult(), 700);
    }
  }

  render(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#071326');
    gradient.addColorStop(0.55, '#10173c');
    gradient.addColorStop(1, '#02050d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    this.drawGrid();
    if (this.phase !== 'instructions') this.drawExperiment();
    if (this.phase === 'quiz' || this.phase === 'quiz-feedback') this.drawQuiz();
    if (this.input && this.phase !== 'quiz-feedback' && this.phase !== 'finished') drawHandSkeleton(ctx, this.input, this.viewport);
    this.drawHud();
  }

  resize(viewport: Viewport): void { this.viewport = viewport; }
  dispose(): void { /* nada */ }

  private completeShot(): void {
    const remaining = Math.max(0, 45 - this.elapsed);
    this.score += 220 + Math.round(Math.min(90, remaining * 1.7));
    this.hits += 1;
    this.hitHold = 0;
    this.phase = 'observation';
    this.elapsed = 0;
    this.context.audio.success();
  }

  private updateQuiz(input: HandInput): void {
    if (!input.present) {
      this.quizHover = -1;
      this.quizHoverStartedAt = 0;
      return;
    }
    const cursor = toPixels(input.cursor, this.viewport);
    const hovered = this.quizRects().findIndex((rect) => pointInRect(cursor, rect));
    if (hovered !== this.quizHover) {
      this.quizHover = hovered;
      this.quizHoverStartedAt = performance.now();
    }
    if (hovered < 0) return;
    const dwell = performance.now() - this.quizHoverStartedAt >= this.context.config.laser.quizDwellSeconds * 1000;
    if (dwell || input.pinchStarted) this.submitAnswer(hovered);
  }

  private submitAnswer(index: number): void {
    if (this.phase !== 'quiz') return;
    this.selectedAnswer = index;
    const correct = index === this.currentQuiz().correct;
    if (correct) {
      this.score += 70;
      this.correctAnswers += 1;
      this.context.audio.success();
    } else {
      this.score += 15;
      this.context.audio.failure();
    }
    this.phase = 'quiz-feedback';
    this.elapsed = 0;
  }

  private nextRound(): void {
    this.round += 1;
    if (this.round >= this.targetPositions.length) {
      this.finish();
      return;
    }
    this.phase = 'aiming';
    this.elapsed = 0;
    this.hitHold = 0;
    this.selectedAnswer = -1;
    this.quizHover = -1;
    this.mirrorAngle = this.initialMirrorAngle();
  }

  private finish(): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.elapsed = 0;
    this.score = Math.min(1000, this.score + (this.round >= 2 ? 40 : 0));
  }

  private sendResult(): void {
    this.context.complete({
      score: Math.min(1000, this.score),
      title: this.round >= 2 ? 'Reflexão dominada!' : 'Experiência concluída',
      explanation: 'O raio incidente e o raio refletido formam ângulos iguais com a normal ao espelho.',
      details: [
        `Alvos atingidos: ${this.hits}/${this.targetPositions.length}`,
        `Respostas corretas: ${this.correctAnswers}/3`,
        `Tempo total: ${this.totalElapsed.toFixed(1)} s`,
      ],
    });
  }

  private drawGrid(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    ctx.save();
    ctx.strokeStyle = 'rgba(95,190,255,0.07)';
    const step = Math.max(42, height * 0.07);
    for (let x = 0; x < width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.restore();
  }

  private drawExperiment(): void {
    const { ctx } = this.context;
    const source = this.source();
    const pivot = this.mirrorPivot();
    const target = this.target();
    const reflected = this.reflectedDirection();
    const endpoint = this.rayBoundary(pivot, reflected);
    const hit = this.rayHitsTarget();

    ctx.save();
    ctx.fillStyle = '#e7f7ff';
    ctx.shadowColor = '#6ee7ff';
    ctx.shadowBlur = 24;
    ctx.fillRect(source.x - 32, source.y - 22, 60, 44);
    ctx.fillStyle = '#73ddff';
    ctx.beginPath();
    ctx.moveTo(source.x + 28, source.y - 12);
    ctx.lineTo(source.x + 54, source.y);
    ctx.lineTo(source.x + 28, source.y + 12);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ff4b4b';
    ctx.shadowColor = '#ff3030';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(source.x + 50, source.y);
    ctx.lineTo(pivot.x, pivot.y);
    ctx.lineTo(endpoint.x, endpoint.y);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(this.mirrorAngle);
    const length = Math.min(this.viewport.width * 0.22, this.viewport.height * 0.34);
    const mirrorGradient = ctx.createLinearGradient(-length / 2, 0, length / 2, 0);
    mirrorGradient.addColorStop(0, '#6784a7');
    mirrorGradient.addColorStop(0.5, '#e8fbff');
    mirrorGradient.addColorStop(1, '#6784a7');
    ctx.fillStyle = mirrorGradient;
    ctx.shadowColor = '#b9f4ff';
    ctx.shadowBlur = 18;
    ctx.fillRect(-length / 2, -8, length, 16);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = hit || this.phase === 'observation' || this.phase === 'quiz' || this.phase === 'quiz-feedback' ? '#70f2b8' : '#ffd36d';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = hit ? 35 : 15;
    ctx.beginPath();
    ctx.arc(target.x, target.y, this.targetRadius(), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#071326';
    ctx.beginPath();
    ctx.arc(target.x, target.y, this.targetRadius() * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.drawNormalAndAngles();
  }

  private drawNormalAndAngles(): void {
    const { ctx } = this.context;
    const pivot = this.mirrorPivot();
    const normalBase = { x: -Math.sin(this.mirrorAngle), y: Math.cos(this.mirrorAngle) };
    const towardSource = this.normalise({ x: this.source().x - pivot.x, y: this.source().y - pivot.y });
    const reflected = this.reflectedDirection();
    const normal = (normalBase.x * (towardSource.x + reflected.x) + normalBase.y * (towardSource.y + reflected.y)) >= 0
      ? normalBase
      : { x: -normalBase.x, y: -normalBase.y };
    const angleDeg = this.incidenceAngleDegrees();

    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = 'rgba(210,240,255,0.78)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivot.x - normal.x * 115, pivot.y - normal.y * 115);
    ctx.lineTo(pivot.x + normal.x * 115, pivot.y + normal.y * 115);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#dff7ff';
    ctx.font = `600 ${Math.max(13, this.viewport.height * 0.017)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('normal', pivot.x + normal.x * 132, pivot.y + normal.y * 132);

    this.drawAngleArc(normal, towardSource, 58, '#ffd36d', `i = ${angleDeg.toFixed(0)}°`);
    this.drawAngleArc(normal, reflected, 82, '#70f2b8', `r = ${angleDeg.toFixed(0)}°`);
    ctx.restore();
  }

  private drawAngleArc(from: Vec2, to: Vec2, radius: number, color: string, label: string): void {
    const { ctx } = this.context;
    const pivot = this.mirrorPivot();
    const a0 = Math.atan2(from.y, from.x);
    let delta = Math.atan2(to.y, to.x) - a0;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, radius, a0, a0 + delta, delta < 0);
    ctx.stroke();
    const middle = a0 + delta / 2;
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.max(14, this.viewport.height * 0.018)}px system-ui`;
    ctx.fillText(label, pivot.x + Math.cos(middle) * (radius + 30), pivot.y + Math.sin(middle) * (radius + 30));
  }

  private drawQuiz(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const quiz = this.currentQuiz();
    ctx.save();
    ctx.fillStyle = 'rgba(1,5,18,0.86)';
    ctx.fillRect(0, height * 0.58, width, height * 0.42);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(24, height * 0.034)}px system-ui`;
    ctx.fillText(quiz.question, width / 2, height * 0.65);

    this.quizRects().forEach((rect, index) => {
      const hovered = index === this.quizHover && this.phase === 'quiz';
      const selected = index === this.selectedAnswer;
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 18);
      ctx.fillStyle = selected
        ? (index === quiz.correct ? 'rgba(112,242,184,0.28)' : 'rgba(255,100,100,0.25)')
        : hovered ? 'rgba(72,190,236,0.26)' : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.strokeStyle = selected ? (index === quiz.correct ? '#70f2b8' : '#ff8585') : hovered ? '#72f2b5' : 'rgba(160,220,255,0.25)';
      ctx.lineWidth = hovered || selected ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.max(16, height * 0.022)}px system-ui`;
      ctx.fillText(quiz.options[index] ?? '', rect.x + rect.width / 2, rect.y + rect.height * 0.6);
    });

    if (this.phase === 'quiz' && this.input?.present && this.quizHover >= 0) {
      const cursor = toPixels(this.input.cursor, this.viewport);
      const progress = (performance.now() - this.quizHoverStartedAt) / (this.context.config.laser.quizDwellSeconds * 1000);
      drawDwellRing(ctx, cursor, progress, 30);
    }
    if (this.phase === 'quiz-feedback') {
      ctx.fillStyle = this.selectedAnswer === quiz.correct ? '#70f2b8' : '#ffd36d';
      ctx.font = `700 ${Math.max(16, height * 0.021)}px system-ui`;
      ctx.fillText(quiz.explanation, width / 2, height * 0.96);
    }
    ctx.restore();
  }

  private drawHud(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    ctx.textAlign = 'center';
    if (this.phase === 'instructions') {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.max(36, height * 0.06)}px system-ui`;
      ctx.fillText('Laboratório de lasers', width / 2, height * 0.16);
      ctx.font = `500 ${Math.max(20, height * 0.028)}px system-ui`;
      ctx.fillStyle = 'rgba(225,242,255,0.9)';
      ctx.fillText('O laser está à esquerda, o espelho ao centro e o alvo surge no topo.', width / 2, height * 0.24);
      ctx.fillText('Move a mão em torno do espelho para produzir ângulos amplos.', width / 2, height * 0.29);
      ctx.fillText('Observa os ângulos i e r e responde ao questionário.', width / 2, height * 0.34);
      ctx.fillStyle = '#72f2b5';
      ctx.font = `800 ${Math.max(22, height * 0.032)}px system-ui`;
      ctx.fillText('Faz pinça para começar', width / 2, height * 0.48);
      return;
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(24, height * 0.034)}px system-ui`;
    ctx.fillText(this.phase === 'finished' ? 'Experiência concluída' : `Alvo ${Math.min(this.round + 1, this.targetPositions.length)} de ${this.targetPositions.length}`, width / 2, height * 0.08);
    ctx.font = `500 ${Math.max(15, height * 0.019)}px system-ui`;
    ctx.fillStyle = 'rgba(205,235,250,0.82)';
    if (this.phase === 'aiming') ctx.fillText('Roda o espelho; i e r são medidos em relação à normal.', width / 2, height * 0.125);
    if (this.phase === 'observation') ctx.fillText('Jogada concluída: observa o percurso e os ângulos antes do questionário.', width / 2, height * 0.125);

    if (this.phase === 'aiming') {
      const barWidth = Math.min(width * 0.34, 420);
      const x = width / 2 - barWidth / 2;
      const y = height * 0.91;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y, barWidth, 14);
      ctx.fillStyle = '#70f2b8';
      ctx.fillRect(x, y, barWidth * Math.min(1, this.hitHold / this.context.config.laser.aimHoldSeconds), 14);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.rayHitsTarget() ? 'Mantém o alinhamento…' : 'Procura o alvo com o feixe refletido', width / 2, y - 14);
    }
  }

  private source(): Vec2 { return { x: this.viewport.width * 0.09, y: this.viewport.height * 0.73 }; }
  private mirrorPivot(): Vec2 { return { x: this.viewport.width * 0.5, y: this.viewport.height * 0.58 }; }
  private target(): Vec2 {
    const position = this.targetPositions[Math.min(this.round, Math.max(0, this.targetPositions.length - 1))] ?? { x: 0.72, y: 0.16 };
    return { x: this.viewport.width * position.x, y: this.viewport.height * position.y };
  }
  private targetRadius(): number { return Math.max(28, this.viewport.height * 0.047); }

  private reflectedDirection(): Vec2 {
    const source = this.source();
    const pivot = this.mirrorPivot();
    const incoming = this.normalise({ x: pivot.x - source.x, y: pivot.y - source.y });
    const normal = { x: -Math.sin(this.mirrorAngle), y: Math.cos(this.mirrorAngle) };
    const dot = incoming.x * normal.x + incoming.y * normal.y;
    return this.normalise({ x: incoming.x - 2 * dot * normal.x, y: incoming.y - 2 * dot * normal.y });
  }

  private incidenceAngleDegrees(): number {
    const source = this.source();
    const pivot = this.mirrorPivot();
    const incoming = this.normalise({ x: pivot.x - source.x, y: pivot.y - source.y });
    const normal = { x: -Math.sin(this.mirrorAngle), y: Math.cos(this.mirrorAngle) };
    const dot = Math.min(1, Math.max(0, Math.abs(incoming.x * normal.x + incoming.y * normal.y)));
    return Math.acos(dot) * 180 / Math.PI;
  }

  private rayHitsTarget(): boolean {
    if (this.phase === 'instructions' || this.phase === 'finished') return false;
    const origin = this.mirrorPivot();
    const direction = this.reflectedDirection();
    const target = this.target();
    const tx = target.x - origin.x;
    const ty = target.y - origin.y;
    const projection = tx * direction.x + ty * direction.y;
    if (projection < 0) return false;
    const closest = { x: origin.x + direction.x * projection, y: origin.y + direction.y * projection };
    return Math.hypot(closest.x - target.x, closest.y - target.y) <= this.targetRadius() * 0.9;
  }

  private rayBoundary(origin: Vec2, direction: Vec2): Vec2 {
    const candidates: number[] = [];
    if (direction.x > 0.001) candidates.push((this.viewport.width - origin.x) / direction.x);
    if (direction.x < -0.001) candidates.push((0 - origin.x) / direction.x);
    if (direction.y > 0.001) candidates.push((this.viewport.height - origin.y) / direction.y);
    if (direction.y < -0.001) candidates.push((0 - origin.y) / direction.y);
    const valid = candidates.filter((value) => value > 0);
    const t = valid.length ? Math.min(...valid) : 0;
    return { x: origin.x + direction.x * t, y: origin.y + direction.y * t };
  }

  private createTargetPositions(): Vec2[] {
    const positions: Vec2[] = [];
    const bands = [[0.16, 0.35], [0.42, 0.64], [0.7, 0.9]] as const;
    for (const [minimum, maximum] of this.shuffleBands(bands)) {
      positions.push({ x: minimum + Math.random() * (maximum - minimum), y: 0.12 + Math.random() * 0.1 });
    }
    return positions;
  }

  private shuffleBands<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      const current = result[index];
      const replacement = result[other];
      if (current !== undefined && replacement !== undefined) { result[index] = replacement; result[other] = current; }
    }
    return result;
  }

  private initialMirrorAngle(): number {
    const source = this.source();
    const pivot = this.mirrorPivot();
    const target = this.target();
    const incoming = this.normalise({ x: pivot.x - source.x, y: pivot.y - source.y });
    const outgoing = this.normalise({ x: target.x - pivot.x, y: target.y - pivot.y });
    const normal = this.normalise({ x: incoming.x - outgoing.x, y: incoming.y - outgoing.y });
    const ideal = Math.atan2(-normal.x, normal.y);
    const offset = (this.round % 2 === 0 ? 1 : -1) * 14 * Math.PI / 180;
    return ideal + offset;
  }

  private quizRects(): Rect[] {
    const { width, height } = this.viewport;
    const gap = width * 0.025;
    const total = width * 0.78;
    const cardWidth = (total - gap * 2) / 3;
    return [0, 1, 2].map((index) => ({
      x: width * 0.11 + index * (cardWidth + gap),
      y: height * 0.72,
      width: cardWidth,
      height: height * 0.14,
    }));
  }
  private currentQuiz(): Quiz { return QUIZZES[Math.min(this.round, QUIZZES.length - 1)] ?? QUIZZES[0]!; }
  private normalise(value: Vec2): Vec2 {
    const length = Math.hypot(value.x, value.y) || 1;
    return { x: value.x / length, y: value.y / length };
  }
}
