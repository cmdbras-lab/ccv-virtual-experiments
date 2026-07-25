import type { Experience, ExperienceContext, ExperienceManifest, Viewport } from '../../core/Experience.js';
import type { HandInput, Vec2 } from '../../core/types.js';

export const orbitManifest: ExperienceManifest = {
  id: 'coloca-planeta-em-orbita',
  title: 'Coloca o planeta em órbita',
  subtitle: 'Usa a mão para agarrar e lançar um planeta.',
  description: 'Explora gravidade, velocidade tangencial, energia e órbitas através de um lançamento controlado por gestos.',
  icon: '🪐',
  version: '2.2.0',
  author: 'Clube Ciência Viva Abel Salazar',
};

type Phase = 'instructions' | 'ready' | 'grabbed' | 'flight' | 'success-observation' | 'finished';
type Ending = 'success' | 'collision' | 'escape' | 'timeout' | null;
type Star = { x: number; y: number; size: number; alpha: number; phase: number };
type LaunchMetrics = {
  idealSpeed: number;
  speed: number;
  speedRatio: number;
  directionQuality: number;
  distanceQuality: number;
  quality: number;
  tangent: Vec2;
};

const HAND_CONNECTIONS: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [17, 0],
];

export class OrbitExperience implements Experience {
  readonly manifest = orbitManifest;
  private context!: ExperienceContext;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private phase: Phase = 'instructions';
  private ending: Ending = null;
  private planet: Vec2 = { x: 0, y: 0 };
  private velocity: Vec2 = { x: 0, y: 0 };
  private cursor: Vec2 = { x: 0, y: 0 };
  private cursorPresent = false;
  private handLandmarks: Vec2[] = [];
  private pinch = false;
  private starRadius = 70;
  private planetRadius = 20;
  private mu = 1;
  private elapsed = 0;
  private flightTime = 0;
  private stableTime = 0;
  private orbitAngle = 0;
  private previousAngle = 0;
  private grabOrigin: Vec2 | null = null;
  private trail: Vec2[] = [];
  private previewPath: Vec2[] = [];
  private rawPreviewVelocity: Vec2 = { x: 0, y: 0 };
  private assistedPreviewVelocity: Vec2 = { x: 0, y: 0 };
  private previewMetrics: LaunchMetrics | null = null;
  private guidanceMessage = 'Move a mão de lado para criar impulso.';
  private stars: Star[] = [];
  private resultSent = false;
  private dwellStart = 0;
  private score = 0;
  private quality = 0;
  private assistanceApplied = 0;
  private successObservationStartAngle = 0;
  private successObservationCompleted = false;

  mount(context: ExperienceContext): void {
    this.context = context;
    this.createStars();
  }

  start(): void {
    this.phase = 'instructions';
    this.ending = null;
    this.elapsed = 0;
    this.flightTime = 0;
    this.stableTime = 0;
    this.orbitAngle = 0;
    this.previousAngle = 0;
    this.trail = [];
    this.previewPath = [];
    this.grabOrigin = null;
    this.rawPreviewVelocity = { x: 0, y: 0 };
    this.assistedPreviewVelocity = { x: 0, y: 0 };
    this.previewMetrics = null;
    this.guidanceMessage = 'Move a mão de lado para criar impulso.';
    this.resultSent = false;
    this.dwellStart = 0;
    this.score = 0;
    this.quality = 0;
    this.assistanceApplied = 0;
    this.successObservationStartAngle = 0;
    this.successObservationCompleted = false;
    const center = this.center();
    const targetRadius = this.targetRadius();
    this.planet = { x: center.x + targetRadius, y: center.y + targetRadius * 0.12 };
    this.velocity = { x: 0, y: 0 };
  }

  update(dtSeconds: number, input: HandInput): void {
    const dt = Math.min(dtSeconds, 1 / 30);
    this.elapsed += dt;
    this.cursorPresent = input.present;
    this.cursor = this.toPixels(input.cursor);
    this.handLandmarks = input.landmarks.map((landmark) => this.toPixels(landmark));
    this.pinch = input.pinch;

    if (this.phase === 'instructions') {
      if (this.elapsed > 0.8 && input.pinchStarted) {
        this.phase = 'ready';
        this.context.audio.tone(440, 0.12);
      }
      return;
    }

    if (this.phase === 'ready') {
      if (input.present) {
        const distance = this.distance(this.cursor, this.planet);
        if (distance < Math.max(110, this.viewport.height * 0.12) && input.pinch) {
          this.phase = 'grabbed';
          this.grabOrigin = { ...this.planet };
          this.previewPath = [];
          this.context.audio.tone(620, 0.08, 0.035);
        }
      }
      return;
    }

    if (this.phase === 'grabbed') {
      if (!input.present) {
        this.phase = 'ready';
        this.previewPath = [];
        return;
      }
      this.planet = { ...this.cursor };
      this.updateLaunchPreview();
      if (input.pinchEnded) this.launch();
      return;
    }

    if (this.phase === 'flight') {
      this.integrate(dt);
      this.evaluateFlight(dt);
      return;
    }

    if (this.phase === 'success-observation') {
      const multiplier = Math.max(1, this.context.config.orbit.observationSpeedMultiplier);
      this.integrate(dt * multiplier);
      const observedAngle = this.orbitAngle - this.successObservationStartAngle;
      const requiredAngle = Math.PI * 2 * Math.max(3, this.context.config.orbit.successObservationOrbits);
      if (observedAngle >= requiredAngle) this.finishSuccessObservation();
      return;
    }

    if (this.phase === 'finished' && !this.resultSent) {
      this.resultSent = true;
      window.setTimeout(() => this.sendResult(), 900);
    }
  }

  render(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, Math.max(width, height));
    gradient.addColorStop(0, '#111a43');
    gradient.addColorStop(0.48, '#070d25');
    gradient.addColorStop(1, '#02040d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    this.drawStars();
    this.drawOrbitGuides();
    this.drawTrail();
    this.drawLaunchPreview();
    this.drawCentralStar();
    this.drawHand();
    this.drawPlanet();
    this.drawMotionVectors();
    this.drawHud();
    this.drawCursor();
  }

  resize(viewport: Viewport): void {
    this.viewport = viewport;
    const minDimension = Math.min(viewport.width, viewport.height);
    this.starRadius = Math.max(42, minDimension * this.context.config.orbit.starRadiusFraction);
    const massScale = Math.cbrt(Math.max(0.5, this.context.config.orbit.planetMassRelative));
    this.planetRadius = Math.max(17, minDimension * this.context.config.orbit.planetRadiusFraction * massScale);
    this.mu = Math.pow(minDimension, 3) * this.context.config.orbit.gravityStrength;
    this.createStars();
  }

  dispose(): void {
    this.trail = [];
    this.previewPath = [];
    this.grabOrigin = null;
    this.handLandmarks = [];
  }

  private launch(): void {
    const rawVelocity = this.estimateRawVelocity();
    const rawMetrics = this.calculateLaunchMetrics(rawVelocity);
    if (!rawMetrics || rawMetrics.speed < rawMetrics.idealSpeed * 0.08) {
      this.phase = 'ready';
      this.previewPath = [];
      this.guidanceMessage = 'Movimento demasiado pequeno. Agarra novamente e lança de lado.';
      this.context.audio.tone(210, 0.16, 0.025);
      return;
    }

    this.velocity = this.applyLaunchAssistance(rawVelocity);
    const difference = Math.hypot(this.velocity.x - rawVelocity.x, this.velocity.y - rawVelocity.y);
    this.assistanceApplied = Math.min(1, difference / Math.max(rawMetrics.idealSpeed, 1));
    this.phase = 'flight';
    this.flightTime = 0;
    this.stableTime = 0;
    this.trail = [{ ...this.planet }];
    this.previewPath = [];
    const center = this.center();
    this.previousAngle = Math.atan2(this.planet.y - center.y, this.planet.x - center.x);
    this.context.audio.launch();
  }

  private estimateRawVelocity(): Vec2 {
    if (!this.grabOrigin) return { x: 0, y: 0 };
    const scale = this.context.config.orbit.launchVelocityScale;
    return this.clampVelocity({
      x: (this.planet.x - this.grabOrigin.x) * scale,
      y: (this.planet.y - this.grabOrigin.y) * scale,
    });
  }

  private clampVelocity(velocity: Vec2): Vec2 {
    const speed = Math.hypot(velocity.x, velocity.y);
    const maxSpeed = Math.min(this.viewport.width, this.viewport.height) * 1.25;
    if (speed <= maxSpeed || speed < 1) return velocity;
    return { x: velocity.x * maxSpeed / speed, y: velocity.y * maxSpeed / speed };
  }

  private applyLaunchAssistance(rawVelocity: Vec2): Vec2 {
    const metrics = this.calculateLaunchMetrics(rawVelocity);
    if (!metrics || metrics.speed < 1) return rawVelocity;
    const assistance = Math.min(0.85, Math.max(0, this.context.config.orbit.assistanceStrength));
    const rawDirection = this.normalise(rawVelocity);
    const blendedDirection = this.normalise({
      x: rawDirection.x * (1 - assistance) + metrics.tangent.x * assistance,
      y: rawDirection.y * (1 - assistance) + metrics.tangent.y * assistance,
    });
    const speedCorrection = assistance * 0.62;
    const correctedSpeed = metrics.speed * (1 - speedCorrection) + metrics.idealSpeed * speedCorrection;
    const minimum = metrics.idealSpeed * 0.68;
    const maximum = metrics.idealSpeed * 1.35;
    const assistedSpeed = Math.min(maximum, Math.max(minimum, correctedSpeed));
    return this.clampVelocity({ x: blendedDirection.x * assistedSpeed, y: blendedDirection.y * assistedSpeed });
  }

  private updateLaunchPreview(): void {
    this.rawPreviewVelocity = this.estimateRawVelocity();
    this.previewMetrics = this.calculateLaunchMetrics(this.rawPreviewVelocity);
    if (!this.previewMetrics || this.previewMetrics.speed < this.previewMetrics.idealSpeed * 0.06) {
      this.assistedPreviewVelocity = { x: 0, y: 0 };
      this.previewPath = [];
      this.guidanceMessage = 'Move a mão de lado para criar impulso.';
      return;
    }
    this.assistedPreviewVelocity = this.applyLaunchAssistance(this.rawPreviewVelocity);
    this.previewPath = this.context.config.orbit.showTrajectoryPreview
      ? this.predictTrajectory(this.planet, this.assistedPreviewVelocity)
      : [];
    this.guidanceMessage = this.createGuidance(this.previewMetrics);
  }

  private calculateLaunchMetrics(velocity: Vec2): LaunchMetrics | null {
    const center = this.center();
    const dx = this.planet.x - center.x;
    const dy = this.planet.y - center.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return null;
    const radial = { x: dx / distance, y: dy / distance };
    const speed = Math.hypot(velocity.x, velocity.y);
    const idealSpeed = Math.sqrt(this.mu / distance);
    const direction = speed > 1 ? { x: velocity.x / speed, y: velocity.y / speed } : { x: 0, y: 0 };
    const tangentA = { x: -radial.y, y: radial.x };
    const tangentB = { x: radial.y, y: -radial.x };
    const dotA = direction.x * tangentA.x + direction.y * tangentA.y;
    const dotB = direction.x * tangentB.x + direction.y * tangentB.y;
    const tangent = dotA >= dotB ? tangentA : tangentB;
    const directionQuality = speed > 1 ? Math.max(0, Math.max(dotA, dotB)) : 0;
    const speedRatio = speed / Math.max(idealSpeed, 1);
    const speedQuality = Math.max(0, 1 - Math.abs(speedRatio - 1) / 0.72);
    const target = this.targetRadius();
    const distanceQuality = Math.max(0, 1 - Math.abs(distance - target) / (target * 0.85));
    const quality = directionQuality * 0.52 + speedQuality * 0.35 + distanceQuality * 0.13;
    return { idealSpeed, speed, speedRatio, directionQuality, distanceQuality, quality, tangent };
  }

  private createGuidance(metrics: LaunchMetrics): string {
    if (metrics.directionQuality < 0.42) return 'Lança de lado: evita apontar para a estrela ou para fora.';
    if (metrics.speedRatio < 0.7) return 'Boa direção. Aumenta um pouco a intensidade.';
    if (metrics.speedRatio > 1.38) return 'Boa direção. Abranda ligeiramente o movimento.';
    if (metrics.quality >= 0.76) return 'Excelente! Abre a mão para lançar.';
    if (metrics.directionQuality < 0.72) return 'Quase: aproxima o movimento da seta verde.';
    return 'Muito bem. Ajusta até a trajetória acompanhar a órbita.';
  }

  private predictTrajectory(start: Vec2, initialVelocity: Vec2): Vec2[] {
    const points: Vec2[] = [];
    const position = { ...start };
    const velocity = { ...initialVelocity };
    const center = this.center();
    const escapeRadius = Math.hypot(this.viewport.width, this.viewport.height) * 0.68;
    const dt = 0.045;
    for (let step = 0; step < 130; step += 1) {
      const dx = center.x - position.x;
      const dy = center.y - position.y;
      const distanceSquared = Math.max(dx * dx + dy * dy, this.starRadius * this.starRadius * 0.7);
      const distance = Math.sqrt(distanceSquared);
      const factor = this.mu / (distanceSquared * distance);
      velocity.x += dx * factor * dt;
      velocity.y += dy * factor * dt;
      position.x += velocity.x * dt;
      position.y += velocity.y * dt;
      if (step % 2 === 0) points.push({ ...position });
      const updatedDistance = this.distance(position, center);
      if (updatedDistance <= this.starRadius + this.planetRadius * 0.55 || updatedDistance >= escapeRadius) break;
    }
    return points;
  }

  private integrate(dt: number): void {
    const center = this.center();
    const dx = center.x - this.planet.x;
    const dy = center.y - this.planet.y;
    const distanceSquared = Math.max(dx * dx + dy * dy, this.starRadius * this.starRadius * 0.7);
    const distance = Math.sqrt(distanceSquared);
    const factor = this.mu / (distanceSquared * distance);
    this.velocity.x += dx * factor * dt;
    this.velocity.y += dy * factor * dt;
    this.planet.x += this.velocity.x * dt;
    this.planet.y += this.velocity.y * dt;
    this.flightTime += dt;

    const angle = Math.atan2(this.planet.y - center.y, this.planet.x - center.x);
    let delta = angle - this.previousAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    this.orbitAngle += Math.abs(delta);
    this.previousAngle = angle;

    this.trail.push({ ...this.planet });
    if (this.trail.length > 420) this.trail.shift();
  }

  private evaluateFlight(dt: number): void {
    const center = this.center();
    const distance = this.distance(this.planet, center);
    const target = this.targetRadius();
    const escapeRadius = Math.hypot(this.viewport.width, this.viewport.height) * 0.68;

    if (distance <= this.starRadius + this.planetRadius * 0.55) {
      this.finish('collision');
      return;
    }
    if (distance >= escapeRadius) {
      this.finish('escape');
      return;
    }

    const radialQuality = Math.max(0, 1 - Math.abs(distance - target) / (target * 1.15));
    const radial = {
      x: (this.planet.x - center.x) / distance,
      y: (this.planet.y - center.y) / distance,
    };
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const tangentialFraction = speed > 1 ? Math.abs((-radial.y * this.velocity.x + radial.x * this.velocity.y) / speed) : 0;
    this.quality = radialQuality * 0.5 + tangentialFraction * 0.5;

    const threshold = this.context.config.orbit.successQualityThreshold;
    if (this.quality > threshold) this.stableTime += dt;
    else this.stableTime = Math.max(0, this.stableTime - dt * 0.12);

    const required = this.context.config.orbit.challengeSeconds;
    if (this.stableTime >= required || (this.orbitAngle >= Math.PI * 1.35 && this.flightTime >= required * 0.55)) {
      this.beginSuccessObservation();
      return;
    }
    if (this.flightTime >= this.context.config.orbit.maximumFlightSeconds) this.finish('timeout');
  }

  private beginSuccessObservation(): void {
    if (this.phase !== 'flight') return;
    const center = this.center();
    const dx = this.planet.x - center.x;
    const dy = this.planet.y - center.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const radial = { x: dx / distance, y: dy / distance };
    const cross = radial.x * this.velocity.y - radial.y * this.velocity.x;
    const tangent = cross >= 0 ? { x: -radial.y, y: radial.x } : { x: radial.y, y: -radial.x };
    const circularSpeed = Math.sqrt(this.mu / distance);
    this.velocity = { x: tangent.x * circularSpeed, y: tangent.y * circularSpeed };
    this.phase = 'success-observation';
    this.ending = 'success';
    this.successObservationStartAngle = this.orbitAngle;
    this.trail = [{ ...this.planet }];
    this.context.audio.success();
  }

  private finishSuccessObservation(): void {
    if (this.phase !== 'success-observation') return;
    this.successObservationCompleted = true;
    this.finish('success');
  }

  private finish(ending: Exclude<Ending, null>): void {
    this.phase = 'finished';
    this.ending = ending;
    const survival = Math.min(this.flightTime / this.context.config.orbit.challengeSeconds, 1);
    const orbitProgress = Math.min(this.orbitAngle / (Math.PI * 2), 1);
    const successBonus = ending === 'success' ? 400 : 0;
    this.score = Math.min(1000, Math.round(100 + survival * 220 + orbitProgress * 190 + this.quality * 180 + successBonus));
    if (ending !== 'success') this.context.audio.failure();
  }

  private sendResult(): void {
    const success = this.ending === 'success';
    const assistancePercent = Math.round(this.assistanceApplied * 100);
    this.context.complete({
      score: this.score,
      title: success ? 'Órbita conseguida!' : this.ending === 'collision' ? 'Colisão com a estrela' : this.ending === 'escape' ? 'O planeta escapou' : 'Órbita instável',
      explanation: success
        ? 'A velocidade transversal compensou a atração gravitacional: o planeta ficou em queda contínua à volta da estrela.'
        : 'Uma órbita exige o equilíbrio certo entre a atração gravitacional, a distância e a velocidade tangencial.',
      details: [
        `Tempo de voo: ${this.flightTime.toFixed(1)} s`,
        `Tempo em órbita estável: ${this.stableTime.toFixed(1)} s`,
        `Voltas equivalentes: ${(this.orbitAngle / (Math.PI * 2)).toFixed(2)}`,
        `Observação concluída: ${this.successObservationCompleted ? `${Math.max(3, this.context.config.orbit.successObservationOrbits)} voltas` : 'não aplicável'}`,
        `Massa relativa do planeta: ${this.context.config.orbit.planetMassRelative.toFixed(1)}×`,
        `Correção pedagógica: ${assistancePercent}%`,
      ],
    });
  }

  private drawStars(): void {
    const { ctx } = this.context;
    for (const star of this.stars) {
      const pulse = 0.72 + Math.sin(this.elapsed * 1.4 + star.phase) * 0.28;
      ctx.globalAlpha = star.alpha * pulse;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawOrbitGuides(): void {
    const { ctx } = this.context;
    const center = this.center();
    const target = this.targetRadius();
    ctx.save();
    ctx.setLineDash([7, 14]);
    ctx.strokeStyle = 'rgba(114, 207, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, target, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(170,225,255,0.58)';
    ctx.font = `500 ${Math.max(13, this.viewport.height * 0.017)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('zona de órbita recomendada', center.x, center.y - target - 16);
    ctx.restore();
  }

  private drawTrail(): void {
    if (this.trail.length < 2) return;
    const { ctx } = this.context;
    ctx.save();
    ctx.lineWidth = 3;
    for (let i = 1; i < this.trail.length; i += 1) {
      const current = this.trail[i];
      const previous = this.trail[i - 1];
      if (!current || !previous) continue;
      ctx.strokeStyle = `rgba(87, 215, 255, ${i / this.trail.length * 0.72})`;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawLaunchPreview(): void {
    if (this.phase !== 'grabbed') return;
    const { ctx } = this.context;
    const metrics = this.previewMetrics;
    if (!metrics) return;
    const previewColor = this.feedbackColor(metrics.quality);

    if (this.grabOrigin) {
      ctx.save();
      ctx.strokeStyle = previewColor;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(this.grabOrigin.x, this.grabOrigin.y);
      ctx.lineTo(this.planet.x, this.planet.y);
      ctx.stroke();
      ctx.setLineDash([5, 7]);
      ctx.strokeStyle = 'rgba(220,245,255,0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.grabOrigin.x, this.grabOrigin.y, this.planetRadius * 1.15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.previewPath.length > 1) {
      ctx.save();
      ctx.setLineDash([8, 9]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = previewColor;
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      const first = this.previewPath[0];
      if (first) ctx.moveTo(first.x, first.y);
      for (let index = 1; index < this.previewPath.length; index += 1) {
        const point = this.previewPath[index];
        if (point) ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    const idealLength = Math.min(155, this.viewport.height * 0.18);
    this.drawArrow(this.planet, {
      x: this.planet.x + metrics.tangent.x * idealLength,
      y: this.planet.y + metrics.tangent.y * idealLength,
    }, '#67f7bd', true, 3);

    if (metrics.speed > metrics.idealSpeed * 0.06) {
      const direction = this.normalise(this.rawPreviewVelocity);
      const ratio = Math.min(1.65, Math.max(0.2, metrics.speedRatio));
      const actualLength = idealLength * ratio;
      this.drawArrow(this.planet, {
        x: this.planet.x + direction.x * actualLength,
        y: this.planet.y + direction.y * actualLength,
      }, previewColor, false, 5);
    }

    this.drawLaunchPanel(metrics, previewColor);
  }

  private drawLaunchPanel(metrics: LaunchMetrics, previewColor: string): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const panelWidth = Math.min(660, width * 0.62);
    const panelX = (width - panelWidth) / 2;
    const panelY = height * 0.805;
    const barX = panelX + 28;
    const barY = panelY + 56;
    const barWidth = panelWidth - 56;
    const barHeight = Math.max(14, height * 0.018);
    const scaleMaximum = 1.65;

    ctx.save();
    ctx.fillStyle = 'rgba(2,8,25,0.82)';
    ctx.strokeStyle = 'rgba(180,230,255,0.25)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, panelX, panelY, panelWidth, 116, 22);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.max(17, height * 0.022)}px system-ui`;
    ctx.fillStyle = previewColor;
    ctx.fillText(this.guidanceMessage, width / 2, panelY + 32);

    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    this.roundRect(ctx, barX, barY, barWidth, barHeight, barHeight / 2);
    ctx.fill();

    const idealStart = barX + barWidth * (0.72 / scaleMaximum);
    const idealEnd = barX + barWidth * (1.28 / scaleMaximum);
    ctx.fillStyle = 'rgba(103,247,189,0.30)';
    ctx.fillRect(idealStart, barY, idealEnd - idealStart, barHeight);

    const markerX = barX + barWidth * Math.min(1, metrics.speedRatio / scaleMaximum);
    ctx.fillStyle = previewColor;
    ctx.beginPath();
    ctx.moveTo(markerX, barY - 7);
    ctx.lineTo(markerX - 8, barY - 18);
    ctx.lineTo(markerX + 8, barY - 18);
    ctx.closePath();
    ctx.fill();

    ctx.font = `600 ${Math.max(13, height * 0.016)}px system-ui`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(230,245,255,0.82)';
    ctx.fillText(`Intensidade: ${this.intensityLabel(metrics.speedRatio)}`, barX, panelY + 98);
    ctx.textAlign = 'right';
    ctx.fillText(`Direção: ${this.directionLabel(metrics.directionQuality)}`, barX + barWidth, panelY + 98);
    ctx.restore();
  }

  private drawArrow(start: Vec2, end: Vec2, color: string, dashed: boolean, width: number): void {
    const { ctx } = this.context;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = 15;
    ctx.save();
    if (dashed) ctx.setLineDash([9, 8]);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
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
    ctx.restore();
  }

  private drawCentralStar(): void {
    const { ctx } = this.context;
    const center = this.center();
    const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, this.starRadius * 2.8);
    glow.addColorStop(0, 'rgba(255,255,235,1)');
    glow.addColorStop(0.18, 'rgba(255,224,99,1)');
    glow.addColorStop(0.42, 'rgba(255,126,39,0.72)');
    glow.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.starRadius * 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff1a6';
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.starRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHand(): void {
    if (!this.context.config.orbit.showHandSkeleton || !this.cursorPresent || this.handLandmarks.length < 21) return;
    if (this.phase === 'flight' || this.phase === 'success-observation' || this.phase === 'finished') return;
    const { ctx } = this.context;
    const palmIndices = [0, 5, 9, 13, 17];
    const color = this.pinch ? '#6ff4bc' : '#69dfff';

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let index = 0; index < palmIndices.length; index += 1) {
      const point = this.handLandmarks[palmIndices[index] ?? 0];
      if (!point) continue;
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(4, this.viewport.height * 0.006);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    for (const [fromIndex, toIndex] of HAND_CONNECTIONS) {
      const from = this.handLandmarks[fromIndex];
      const to = this.handLandmarks[toIndex];
      if (!from || !to) continue;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    for (let index = 0; index < this.handLandmarks.length; index += 1) {
      const point = this.handLandmarks[index];
      if (!point) continue;
      const isPinchPoint = index === 4 || index === 8;
      ctx.fillStyle = isPinchPoint ? (this.pinch ? '#fff59a' : '#ffffff') : color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, isPinchPoint ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlanet(): void {
    const { ctx } = this.context;
    const gradient = ctx.createRadialGradient(
      this.planet.x - this.planetRadius * 0.35,
      this.planet.y - this.planetRadius * 0.4,
      this.planetRadius * 0.1,
      this.planet.x,
      this.planet.y,
      this.planetRadius * 1.15,
    );
    gradient.addColorStop(0, '#b9f3ff');
    gradient.addColorStop(0.35, '#39a8e5');
    gradient.addColorStop(0.72, '#2854a6');
    gradient.addColorStop(1, '#101b4f');
    ctx.save();
    ctx.shadowColor = '#53d8ff';
    ctx.shadowBlur = this.phase === 'grabbed' ? 34 : 16;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.planet.x, this.planet.y, this.planetRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMotionVectors(): void {
    if (this.phase !== 'success-observation') return;
    const center = this.center();
    const dx = center.x - this.planet.x;
    const dy = center.y - this.planet.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const velocityLength = Math.min(150, Math.max(80, speed * 0.42));
    const velocityDirection = speed > 0 ? { x: this.velocity.x / speed, y: this.velocity.y / speed } : { x: 0, y: 0 };
    const forceDirection = { x: dx / distance, y: dy / distance };
    const forceLength = Math.min(145, Math.max(75, this.targetRadius() / distance * 110));
    const velocityEnd = {
      x: this.planet.x + velocityDirection.x * velocityLength,
      y: this.planet.y + velocityDirection.y * velocityLength,
    };
    const forceEnd = {
      x: this.planet.x + forceDirection.x * forceLength,
      y: this.planet.y + forceDirection.y * forceLength,
    };
    this.drawArrow(this.planet, velocityEnd, '#63d8ff', false, 5);
    this.drawArrow(this.planet, forceEnd, '#ff8a5b', false, 5);
    const { ctx } = this.context;
    ctx.save();
    ctx.font = `800 ${Math.max(14, this.viewport.height * 0.018)}px system-ui`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#63d8ff';
    ctx.fillText('velocidade', velocityEnd.x + 8, velocityEnd.y - 8);
    ctx.fillStyle = '#ff8a5b';
    ctx.fillText('força gravítica', forceEnd.x + 8, forceEnd.y - 8);
    ctx.restore();
  }

  private drawHud(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';

    if (this.phase === 'instructions') {
      ctx.font = `700 ${Math.max(34, height * 0.055)}px system-ui`;
      ctx.fillText('Coloca o planeta em órbita', width / 2, height * 0.18);
      ctx.font = `500 ${Math.max(20, height * 0.028)}px system-ui`;
      ctx.fillStyle = 'rgba(225,240,255,0.92)';
      ctx.fillText(this.cursorPresent ? 'A tua mão virtual já está no ecrã' : 'Mostra uma mão à câmara', width / 2, height * 0.25);
      ctx.font = `400 ${Math.max(16, height * 0.021)}px system-ui`;
      ctx.fillStyle = 'rgba(190,215,245,0.78)';
      ctx.fillText('Junta polegar e indicador para agarrar. Abre a mão para lançar.', width / 2, height * 0.31);
      ctx.fillText('O sistema mostra a direção, a intensidade e a trajetória prevista.', width / 2, height * 0.355);
      ctx.fillText(`Planeta ampliado · massa relativa ${this.context.config.orbit.planetMassRelative.toFixed(1)}×`, width / 2, height * 0.405);
      ctx.fillStyle = '#72f2b5';
      ctx.font = `800 ${Math.max(22, height * 0.032)}px system-ui`;
      ctx.fillText('Faz pinça para começar', width / 2, height * 0.52);
      return;
    }

    if (this.phase === 'ready') {
      ctx.font = `700 ${Math.max(25, height * 0.038)}px system-ui`;
      ctx.fillText('Toca no planeta com o indicador e faz pinça', width / 2, height * 0.11);
      ctx.font = `500 ${Math.max(15, height * 0.019)}px system-ui`;
      ctx.fillStyle = 'rgba(190,225,245,0.78)';
      ctx.fillText('Podes agarrá-lo numa zona ampla: não é necessária grande precisão.', width / 2, height * 0.15);
    } else if (this.phase === 'grabbed') {
      ctx.font = `700 ${Math.max(24, height * 0.035)}px system-ui`;
      ctx.fillText('Move e mantém a mão: o impulso fica definido antes de largares', width / 2, height * 0.09);
      ctx.font = `500 ${Math.max(15, height * 0.019)}px system-ui`;
      ctx.fillStyle = 'rgba(190,225,245,0.82)';
      ctx.fillText('Compara a tua seta com a verde e abre os dedos para lançar.', width / 2, height * 0.13);
    } else if (this.phase === 'flight' || this.phase === 'success-observation' || this.phase === 'finished') {
      const required = this.context.config.orbit.challengeSeconds;
      ctx.textAlign = 'left';
      ctx.font = `600 ${Math.max(18, height * 0.025)}px system-ui`;
      ctx.fillText(`Voo: ${this.flightTime.toFixed(1)} s`, width * 0.045, height * 0.075);
      ctx.fillText(`Estável: ${this.stableTime.toFixed(1)} / ${required} s`, width * 0.045, height * 0.115);
      if (this.phase === 'success-observation') {
        const observed = Math.max(0, this.orbitAngle - this.successObservationStartAngle);
        const requiredOrbits = Math.max(3, this.context.config.orbit.successObservationOrbits);
        ctx.fillText(`Observação: ${Math.min(requiredOrbits, Math.floor(observed / (Math.PI * 2)) + 1)}/${requiredOrbits} voltas`, width * 0.045, height * 0.155);
      } else {
        ctx.fillText(`Órbita: ${(this.orbitAngle / (Math.PI * 2)).toFixed(2)} voltas`, width * 0.045, height * 0.155);
      }

      const barX = width * 0.045;
      const barY = height * 0.18;
      const barWidth = Math.min(360, width * 0.32);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(barX, barY, barWidth, 14);
      ctx.fillStyle = this.quality > this.context.config.orbit.successQualityThreshold ? '#5df0b7' : '#ffbf66';
      ctx.fillRect(barX, barY, barWidth * Math.min(1, this.stableTime / required), 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = `500 ${Math.max(14, height * 0.018)}px system-ui`;
      ctx.fillText('estabilidade orbital', barX, barY + 37);

      if (this.phase === 'success-observation') {
        const observed = Math.max(0, this.orbitAngle - this.successObservationStartAngle);
        const requiredOrbits = Math.max(3, this.context.config.orbit.successObservationOrbits);
        ctx.textAlign = 'center';
        ctx.font = `800 ${Math.max(30, height * 0.048)}px system-ui`;
        ctx.fillStyle = '#67f7bd';
        ctx.fillText('ÓRBITA CONSEGUIDA — OBSERVA OS VETORES', width / 2, height * 0.86);
        ctx.font = `600 ${Math.max(16, height * 0.021)}px system-ui`;
        ctx.fillStyle = 'rgba(225,242,255,0.88)';
        const messages = [
          'A força gravítica aponta sempre para o Sol.',
          'A velocidade é tangente à trajetória.',
          'A força altera continuamente a direção da velocidade.',
        ];
        const index = Math.min(messages.length - 1, Math.floor(observed / (Math.PI * 2)));
        ctx.fillText(messages[index] ?? messages[0]!, width / 2, height * 0.91);
        ctx.fillText(`Volta ${Math.min(requiredOrbits, Math.floor(observed / (Math.PI * 2)) + 1)} de ${requiredOrbits}`, width / 2, height * 0.95);
      } else if (this.phase === 'finished') {
        ctx.textAlign = 'center';
        ctx.font = `800 ${Math.max(40, height * 0.065)}px system-ui`;
        ctx.fillStyle = this.ending === 'success' ? '#67f7bd' : '#ffd27b';
        ctx.fillText(this.ending === 'success' ? 'ÓRBITA CONSEGUIDA!' : 'FIM DA TENTATIVA', width / 2, height * 0.88);
      }
    }
  }

  private drawCursor(): void {
    if (!this.cursorPresent || this.phase === 'flight' || this.phase === 'success-observation' || this.phase === 'finished') return;
    const { ctx } = this.context;
    ctx.save();
    ctx.strokeStyle = this.pinch ? '#72f2b5' : '#7eeaff';
    ctx.lineWidth = 4;
    ctx.shadowColor = this.pinch ? '#72f2b5' : '#3ad8ff';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(this.cursor.x, this.cursor.y, this.pinch ? 13 : 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private feedbackColor(quality: number): string {
    if (quality >= 0.76) return '#67f7bd';
    if (quality >= 0.48) return '#ffd166';
    return '#ff8a70';
  }

  private intensityLabel(ratio: number): string {
    if (ratio < 0.7) return 'fraca';
    if (ratio <= 1.3) return 'adequada';
    return 'forte';
  }

  private directionLabel(quality: number): string {
    if (quality < 0.42) return 'radial';
    if (quality < 0.75) return 'a melhorar';
    return 'tangencial';
  }

  private normalise(value: Vec2): Vec2 {
    const length = Math.hypot(value.x, value.y);
    if (length < 0.0001) return { x: 0, y: 0 };
    return { x: value.x / length, y: value.y / length };
  }

  private center(): Vec2 {
    return { x: this.viewport.width * 0.5, y: this.viewport.height * 0.53 };
  }

  private targetRadius(): number {
    return Math.min(this.viewport.width, this.viewport.height) * this.context.config.orbit.targetRadiusFraction;
  }

  private toPixels(normalized: Vec2): Vec2 {
    return { x: normalized.x * this.viewport.width, y: normalized.y * this.viewport.height };
  }

  private distance(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private createStars(): void {
    const count = Math.max(90, Math.round((this.viewport.width * this.viewport.height) / 12000));
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * this.viewport.width,
      y: Math.random() * this.viewport.height,
      size: 0.4 + Math.random() * 1.6,
      alpha: 0.25 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
    }));
  }
}
