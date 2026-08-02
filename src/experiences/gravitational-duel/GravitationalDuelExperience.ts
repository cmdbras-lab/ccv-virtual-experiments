import type { Experience, ExperienceContext, ExperienceManifest, Viewport } from '../../core/Experience.js';
import { drawHandSkeleton, pointInRect, roundedRect, toPixels } from '../../core/GestureGraphics.js';
import type { HandInput, Vec2 } from '../../core/types.js';
import {
  captureQuality, clampMagnitude, distance, gravityAt, integrate, magnitude,
  normalise, predictTrajectory, scale, sub, type DuelPlanet, type ForceSample,
} from './DuelPhysics.js';

export const gravitationalDuelManifest: ExperienceManifest = {
  id: 'duelo-gravitacional',
  title: 'Duelo gravitacional',
  subtitle: 'Lança asteroides e vence o campo gravítico adversário.',
  description: 'Dois jogadores lançam asteroides por turnos. A gravidade curva as trajetórias, pode capturar projéteis e determina os impactos.',
  icon: '☄️',
  version: '3.0.6',
  author: 'Clube Ciência Viva Abel Salazar',
};

type Player = 0 | 1;
type Difficulty = 'assistido' | 'normal' | 'desafio';
type Phase = 'instructions' | 'aiming' | 'grabbed' | 'flight' | 'captured' | 'resolution' | 'finished';
type Outcome = 'hit' | 'self-hit' | 'capture' | 'miss' | null;
type DuelConfig = {
  shotsPerPlayer: number; planetLives: number; maximumFlightSeconds: number;
  launchVelocityScale: number; gravityStrength: number; trajectoryPreviewSeconds: number;
  captureRadiusMultiplier: number; captureHoldSeconds: number; captureObservationSeconds: number;
  turnPauseSeconds: number; assistanceStrength: number; showTrajectoryPreview: boolean;
  showForceComponents: boolean;
};
type Star = { x: number; y: number; size: number; alpha: number; phase: number };
type ImpactParticle = { position: Vec2; velocity: Vec2; life: number; maxLife: number; size: number; colour: string };

const NAMES = ['JOGADOR 1', 'JOGADOR 2'] as const;
const COLOURS = ['#55d7ff', '#ff7d9a'] as const;

export class GravitationalDuelExperience implements Experience {
  readonly manifest = gravitationalDuelManifest;
  private context!: ExperienceContext;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private input: HandInput | null = null;
  private phase: Phase = 'instructions';
  private active: Player = 0;
  private elapsed = 0;
  private phaseElapsed = 0;
  private flightElapsed = 0;
  private health: [number, number] = [3, 3];
  private shots: [number, number] = [4, 4];
  private points: [number, number] = [0, 0];
  private hits: [number, number] = [0, 0];
  private captures: [number, number] = [0, 0];
  private misses: [number, number] = [0, 0];
  private asteroid: Vec2 = { x: 0, y: 0 };
  private velocity: Vec2 = { x: 0, y: 0 };
  private acceleration: Vec2 = { x: 0, y: 0 };
  private force: ForceSample = { total: { x: 0, y: 0 }, components: [{ x: 0, y: 0 }, { x: 0, y: 0 }] };
  private grabOrigin: Vec2 | null = null;
  private previewVelocity: Vec2 = { x: 0, y: 0 };
  private preview: Vec2[] = [];
  private trail: Vec2[] = [];
  private captureCandidate: Player | null = null;
  private captureTime = 0;
  private capturedBy: Player | null = null;
  private captureAngle = 0;
  private captureRadius = 0;
  private captureAngularSpeed = 0;
  private outcome: Outcome = null;
  private outcomePlanet: Player | null = null;
  private message = 'Faz pinça sobre o asteroide e abre a mão para lançar.';
  private stars: Star[] = [];
  private impactParticles: ImpactParticle[] = [];
  private planetShake: [number, number] = [0, 0];
  private turnClock = 0;
  private difficulty: Difficulty = 'normal';
  private shuttleExplosionTime = 0;
  private shuttleExplosionAt: Vec2 | null = null;
  private resultSent = false;

  mount(context: ExperienceContext): void { this.context = context; this.createStars(); }

  start(): void {
    const config = this.config();
    this.phase = 'instructions'; this.active = 0; this.elapsed = 0; this.phaseElapsed = 0; this.flightElapsed = 0; this.turnClock = 0; this.difficulty = 'normal'; this.shuttleExplosionTime = 0; this.shuttleExplosionAt = null;
    this.health = [config.planetLives, config.planetLives];
    this.shots = [config.shotsPerPlayer, config.shotsPerPlayer];
    this.points = [0, 0]; this.hits = [0, 0]; this.captures = [0, 0]; this.misses = [0, 0];
    this.captureCandidate = null; this.captureTime = 0; this.capturedBy = null;
    this.outcome = null; this.outcomePlanet = null; this.resultSent = false;
    this.message = 'Faz pinça para iniciar o duelo.'; this.spawnAsteroid();
  }

  update(dtSeconds: number, input: HandInput): void {
    const dt = Math.min(dtSeconds, 1 / 30);
    this.input = input; this.elapsed += dt; this.phaseElapsed += dt; this.updateImpactEffects(dt); if (['aiming', 'grabbed', 'flight'].includes(this.phase)) this.turnClock += dt;
    if (this.phase === 'instructions') {
      if (this.phaseElapsed > 0.5 && input.pinchStarted) {
        const choice = this.difficultyAt(toPixels(input.cursor, this.viewport));
        if (choice) { this.difficulty = choice; this.beginTurn(); }
      }
      return;
    }
    if (this.phase === 'aiming') {
      if (this.turnClock >= this.turnDuration()) { this.resolveTurnTimeout(); return; }
      if (!input.present) return;
      const cursor = toPixels(input.cursor, this.viewport);
      if (input.pinch && distance(cursor, this.asteroid) < Math.max(92, this.asteroidRadius() * 5.5)) {
        this.phase = 'grabbed'; this.phaseElapsed = 0; this.grabOrigin = { ...this.asteroid };
        this.context.audio.tone(630, 0.07, 0.03);
      }
      return;
    }
    if (this.phase === 'grabbed') {
      if (this.turnClock >= this.turnDuration()) { this.resolveTurnTimeout(); return; }
      if (!input.present) { this.beginTurn(); return; }
      this.asteroid = this.clampGrab(toPixels(input.cursor, this.viewport));
      this.updatePreview();
      if (input.pinchEnded) this.launch();
      return;
    }
    if (this.phase === 'flight') { if (this.turnClock >= this.turnDuration()) { this.resolveTurnTimeout(); return; } this.updateFlight(dt); return; }
    if (this.phase === 'captured') { this.updateCapture(dt); return; }
    if (this.phase === 'resolution') {
      if (this.phaseElapsed >= this.config().turnPauseSeconds) this.nextTurnOrFinish();
      return;
    }
    if (this.phase === 'finished' && !this.resultSent) {
      this.resultSent = true; window.setTimeout(() => this.sendResult(), 800);
    }
  }

  render(): void {
    const { ctx } = this.context; const { width, height } = this.viewport;
    const bg = ctx.createRadialGradient(width * 0.5, height * 0.48, 20, width * 0.5, height * 0.48, Math.max(width, height));
    bg.addColorStop(0, '#172653'); bg.addColorStop(0.48, '#081129'); bg.addColorStop(1, '#02040c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    this.drawStars(); this.drawMidfield(); this.drawGravityFields(); this.drawPreview(); this.drawTrail();
    this.drawPlanets(); this.drawMoons(); this.drawShuttle(); this.drawImpactParticles(); this.drawAsteroid(); this.drawVectors(); this.drawHud(); this.drawMessage(); this.drawLegend();
    if (this.input && ['instructions', 'aiming', 'grabbed'].includes(this.phase)) drawHandSkeleton(ctx, this.input, this.viewport);
    if (this.phase === 'instructions') this.drawInstructions();
  }

  resize(viewport: Viewport): void { this.viewport = viewport; this.createStars(); if (this.asteroid.x === 0) this.spawnAsteroid(); }
  dispose(): void { this.input = null; this.preview = []; this.trail = []; this.grabOrigin = null; this.impactParticles = []; this.planetShake = [0, 0]; this.turnClock = 0; this.shuttleExplosionTime = 0; this.shuttleExplosionAt = null; }

  private config(): DuelConfig { return this.context.config.gravitationalDuel; }
  private planets(): [DuelPlanet, DuelPlanet] {
    const { width, height } = this.viewport; const radius = this.planetRadius();
    const mu = Math.pow(Math.min(width, height), 3) * this.config().gravityStrength;
    return [
      { position: { x: width * 0.16, y: height * 0.56 }, radius, mu },
      { position: { x: width * 0.84, y: height * 0.56 }, radius, mu },
    ];
  }
  private planetRadius(): number { return Math.max(36, Math.min(this.viewport.width, this.viewport.height) * 0.064); }
  private asteroidRadius(): number { return Math.max(11, Math.min(this.viewport.width, this.viewport.height) * 0.018); }

  private beginTurn(): void {
    this.phase = 'aiming'; this.phaseElapsed = 0; this.flightElapsed = 0; this.turnClock = 0; this.outcome = null; this.outcomePlanet = null;
    this.captureCandidate = null; this.captureTime = 0; this.capturedBy = null; this.preview = []; this.trail = [];
    this.grabOrigin = null; this.velocity = { x: 0, y: 0 }; this.acceleration = { x: 0, y: 0 };
    this.spawnAsteroid(); this.message = `${NAMES[this.active]}: agarra o asteroide e aponta para o planeta adversário.`;
  }

  private spawnAsteroid(): void {
    const planet = this.planets()[this.active]; const direction = this.active === 0 ? 1 : -1;
    this.asteroid = { x: planet.position.x + direction * planet.radius * 2.25, y: planet.position.y - planet.radius * 1.05 };
  }

  private clampGrab(point: Vec2): Vec2 {
    const margin = this.planetRadius() * 0.8;
    const [leftPlanet, rightPlanet] = this.planets();
    const planetDistance = rightPlanet.position.x - leftPlanet.position.x;
    const laneLimit = planetDistance * 0.25;
    const minX = this.active === 0 ? margin : Math.max(margin, rightPlanet.position.x - laneLimit);
    const maxX = this.active === 0 ? Math.min(this.viewport.width - margin, leftPlanet.position.x + laneLimit) : this.viewport.width - margin;
    return {
      x: Math.max(minX, Math.min(maxX, point.x)),
      y: Math.max(this.viewport.height * 0.18, Math.min(this.viewport.height * 0.82, point.y)),
    };
  }

  private updatePreview(): void {
    if (!this.grabOrigin) return;
    const raw = scale(sub(this.asteroid, this.grabOrigin), this.config().launchVelocityScale);
    const target = this.planets()[this.active === 0 ? 1 : 0].position;
    const targetDirection = normalise(sub(target, this.asteroid));
    const speed = magnitude(raw);
    const difficultyAssistance = this.difficulty === 'assistido' ? 0.14 : this.difficulty === 'desafio' ? -0.14 : 0;
    const assistance = Math.max(0, Math.min(0.55, this.config().assistanceStrength + difficultyAssistance));
    const rawDirection = normalise(raw);
    const direction = normalise({ x: rawDirection.x * (1 - assistance) + targetDirection.x * assistance, y: rawDirection.y * (1 - assistance) + targetDirection.y * assistance });
    this.previewVelocity = clampMagnitude(scale(direction, speed), Math.min(this.viewport.width, this.viewport.height) * 1.35);
    this.preview = this.config().showTrajectoryPreview
      ? predictTrajectory(this.asteroid, this.previewVelocity, this.planets(), this.config().trajectoryPreviewSeconds, this.viewport)
      : [];
    this.message = speed < 35 ? 'Aumenta o vetor de lançamento.' : 'Abre a mão para lançar. A trajetória tracejada já inclui a gravidade.';
  }

  private launch(): void {
    if (magnitude(this.previewVelocity) < 35) { this.beginTurn(); this.context.audio.failure(); return; }
    this.velocity = { ...this.previewVelocity }; this.trail = [{ ...this.asteroid }]; this.preview = [];
    this.phase = 'flight'; this.phaseElapsed = 0; this.flightElapsed = 0; this.shots[this.active] -= 1;
    this.context.audio.launch(); this.message = 'Observa: a velocidade é tangente; a aceleração aponta para a força resultante.';
  }

  private updateFlight(dt: number): void {
    this.flightElapsed += dt;
    const next = integrate(this.asteroid, this.velocity, dt, this.planets());
    this.asteroid = next.position; this.velocity = next.velocity; this.acceleration = next.acceleration; this.force = next.force;
    if (this.trail.length === 0 || distance(this.asteroid, this.trail[this.trail.length - 1] ?? this.asteroid) > 5) this.trail.push({ ...this.asteroid });
    if (this.trail.length > 240) this.trail.shift();
    const shuttle = this.shuttleState();
    if (distance(this.asteroid, shuttle.position) <= shuttle.hitRadius + this.asteroidRadius() * 0.65) {
      this.resolveTrafficBlock(); return;
    }
    const planets = this.planets();
    for (const player of [0, 1] as const) {
      if (distance(this.asteroid, planets[player].position) <= planets[player].radius + this.asteroidRadius() * 0.55) {
        this.resolveImpact(player); return;
      }
    }
    let best: Player | null = null; let quality = 0;
    for (const player of [0, 1] as const) {
      const candidate = captureQuality(this.asteroid, this.velocity, planets[player], this.config().captureRadiusMultiplier);
      if (candidate > quality) { quality = candidate; best = player; }
    }
    if (best !== null && quality >= 0.66) {
      if (this.captureCandidate === best) this.captureTime += dt; else { this.captureCandidate = best; this.captureTime = dt; }
      if (this.captureTime >= this.config().captureHoldSeconds) { this.beginCapture(best); return; }
    } else { this.captureCandidate = null; this.captureTime = 0; }
    const margin = Math.max(this.viewport.width, this.viewport.height) * 0.18;
    if (this.flightElapsed >= this.config().maximumFlightSeconds || this.asteroid.x < -margin || this.asteroid.x > this.viewport.width + margin
      || this.asteroid.y < -margin || this.asteroid.y > this.viewport.height + margin) this.resolveMiss();
  }

  private resolveImpact(planet: Player): void {
    this.outcomePlanet = planet; this.health[planet] = Math.max(0, this.health[planet] - 1);
    this.planetShake[planet] = Math.max(this.planetShake[planet], 0.55);
    this.spawnImpactBurst(planet);
    if (planet === this.active) {
      this.outcome = 'self-hit'; this.points[this.active] = Math.max(0, this.points[this.active] - 35);
      this.message = `O asteroide regressou ao planeta do ${NAMES[this.active]}.`;
    } else {
      this.outcome = 'hit'; this.hits[this.active] += 1; this.points[this.active] += 120;
      this.message = `Impacto no planeta adversário! O planeta vibrou e libertou poeiras.`;
    }
    this.phase = 'resolution'; this.phaseElapsed = 0; this.context.audio.tone(120, 0.25, 0.08);
  }

  private resolveMiss(): void {
    this.outcome = 'miss'; this.misses[this.active] += 1; this.points[this.active] += Math.min(35, Math.round(this.flightElapsed * 2));
    this.message = 'O asteroide escapou. Ajusta direção e intensidade no próximo lançamento.';
    this.phase = 'resolution'; this.phaseElapsed = 0; this.context.audio.failure();
  }

  private resolveTrafficBlock(): void {
    this.outcome = 'miss'; this.misses[this.active] += 1;
    this.spawnShuttleExplosion(this.shuttleState().position);
    this.message = 'Colisão com a nave em trânsito! Tenta uma trajetória gravitacional mais curva.';
    this.phase = 'resolution'; this.phaseElapsed = 0; this.context.audio.tone(82, 0.32, 0.1);
  }

  private resolveTurnTimeout(): void {
    this.outcome = 'miss'; this.misses[this.active] += 1;
    this.message = 'Tempo esgotado: a nave concluiu a travessia deste turno.';
    this.phase = 'resolution'; this.phaseElapsed = 0; this.context.audio.failure();
  }

  private turnDuration(): number {
    const base = Math.max(6.5, this.config().maximumFlightSeconds + 1.5);
    return base * (this.difficulty === 'assistido' ? 1.25 : this.difficulty === 'desafio' ? 0.82 : 1);
  }

  private shuttleState(): { position: Vec2; hitRadius: number; progress: number } {
    const [leftPlanet, rightPlanet] = this.planets();
    const startX = this.active === 0 ? leftPlanet.position.x + leftPlanet.radius * 1.6 : rightPlanet.position.x - rightPlanet.radius * 1.6;
    const endX = this.active === 0 ? rightPlanet.position.x - rightPlanet.radius * 1.6 : leftPlanet.position.x + leftPlanet.radius * 1.6;
    const progress = Math.max(0, Math.min(1, this.turnClock / this.turnDuration()));
    const radiusFactor = this.difficulty === 'assistido' ? 0.5 : this.difficulty === 'desafio' ? 0.78 : 0.64;
    return {
      position: {
        x: startX + (endX - startX) * progress,
        y: leftPlanet.position.y - leftPlanet.radius * 0.54 + Math.sin(this.elapsed * 2.1) * leftPlanet.radius * 0.12,
      },
      hitRadius: leftPlanet.radius * radiusFactor,
      progress,
    };
  }

  private beginCapture(planet: Player): void {
    const body = this.planets()[planet]; const offset = sub(this.asteroid, body.position);
    this.capturedBy = planet; this.captureRadius = magnitude(offset); this.captureAngle = Math.atan2(offset.y, offset.x);
    const tangentSign = offset.x * this.velocity.y - offset.y * this.velocity.x >= 0 ? 1 : -1;
    this.captureAngularSpeed = tangentSign * Math.sqrt(body.mu / Math.pow(this.captureRadius, 3));
    this.outcome = 'capture'; this.outcomePlanet = planet; this.phase = 'captured'; this.phaseElapsed = 0;
    this.captures[planet] += 1; this.points[planet] += planet === this.active ? 70 : 95; this.shots[planet] += 1;
    this.context.audio.success(); this.message = `Captura orbital pelo ${NAMES[planet]}: ganha pontos e um asteroide extra.`;
  }

  private updateCapture(dt: number): void {
    if (this.capturedBy === null) return;
    const body = this.planets()[this.capturedBy]; this.captureAngle += this.captureAngularSpeed * dt;
    this.asteroid = { x: body.position.x + Math.cos(this.captureAngle) * this.captureRadius, y: body.position.y + Math.sin(this.captureAngle) * this.captureRadius };
    this.velocity = { x: -Math.sin(this.captureAngle) * this.captureRadius * this.captureAngularSpeed, y: Math.cos(this.captureAngle) * this.captureRadius * this.captureAngularSpeed };
    this.force = gravityAt(this.asteroid, this.planets()); this.acceleration = this.force.total;
    this.trail.push({ ...this.asteroid }); if (this.trail.length > 220) this.trail.shift();
    if (this.phaseElapsed >= this.config().captureObservationSeconds) { this.phase = 'resolution'; this.phaseElapsed = 0; }
  }

  private nextTurnOrFinish(): void {
    if (this.health[0] <= 0 || this.health[1] <= 0 || (this.shots[0] <= 0 && this.shots[1] <= 0)) { this.finish(); return; }
    const other = (this.active === 0 ? 1 : 0) as Player;
    if (this.shots[other] > 0) this.active = other;
    else if (this.shots[this.active] <= 0) { this.finish(); return; }
    this.beginTurn();
  }


  private updateImpactEffects(dt: number): void {
    this.shuttleExplosionTime = Math.max(0, this.shuttleExplosionTime - dt);
    this.planetShake = this.planetShake.map((value) => Math.max(0, value - dt)) as [number, number];
    this.impactParticles = this.impactParticles
      .map((particle) => ({
        ...particle,
        position: { x: particle.position.x + particle.velocity.x * dt, y: particle.position.y + particle.velocity.y * dt },
        velocity: { x: particle.velocity.x * 0.985, y: particle.velocity.y * 0.985 - 8 * dt },
        life: particle.life - dt,
      }))
      .filter((particle) => particle.life > 0);
  }

  private spawnImpactBurst(planet: Player): void {
    const body = this.planets()[planet];
    const dustColours = ['rgba(255,235,205,0.9)', 'rgba(208,188,154,0.85)', 'rgba(176,156,130,0.8)'] as const;
    for (let index = 0; index < 20; index += 1) {
      const angle = (index / 20) * Math.PI * 2 + this.elapsed * 0.7;
      const speed = 70 + this.random(index + planet * 31) * 140;
      const radius = body.radius * (0.22 + this.random(index + 19) * 0.5);
      this.impactParticles.push({
        position: { x: body.position.x + Math.cos(angle) * radius, y: body.position.y + Math.sin(angle) * radius },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 25 },
        life: 0.6 + this.random(index + 51) * 0.45,
        maxLife: 1,
        size: 4 + this.random(index + 87) * 10,
        colour: dustColours[index % dustColours.length] ?? 'rgba(255,235,205,0.9)',
      });
    }
  }

  private spawnShuttleExplosion(position: Vec2): void {
    this.shuttleExplosionAt = { ...position };
    this.shuttleExplosionTime = 0.9;
    const colours = ['rgba(255,245,180,0.98)', 'rgba(255,158,70,0.95)', 'rgba(100,228,255,0.92)'] as const;
    for (let index = 0; index < 30; index += 1) {
      const angle = (index / 30) * Math.PI * 2 + this.elapsed;
      const speed = 95 + this.random(index + 131) * 220;
      this.impactParticles.push({
        position: { ...position },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life: 0.55 + this.random(index + 177) * 0.55,
        maxLife: 1,
        size: 3 + this.random(index + 211) * 9,
        colour: colours[index % colours.length] ?? 'rgba(255,245,180,0.98)',
      });
    }
  }

  private planetVisualOffset(player: Player): Vec2 {
    const shake = this.planetShake[player];
    if (shake <= 0) return { x: 0, y: 0 };
    const amplitude = this.planetRadius() * 0.1 * Math.min(1, shake * 2.2);
    return {
      x: Math.sin(this.elapsed * 55 + player * 1.7) * amplitude,
      y: Math.cos(this.elapsed * 49 + player * 1.2) * amplitude * 0.65,
    };
  }

  private drawImpactParticles(): void {
    if (this.impactParticles.length === 0) return;
    const { ctx } = this.context;
    ctx.save();
    for (const particle of this.impactParticles) {
      const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.colour;
      ctx.beginPath();
      ctx.arc(particle.position.x, particle.position.y, particle.size * (0.45 + (1 - alpha) * 0.75), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private finish(): void { this.phase = 'finished'; this.phaseElapsed = 0; this.message = this.winnerText(); this.context.audio.success(); }
  private winner(): Player | null {
    if (this.health[0] !== this.health[1]) return this.health[0] > this.health[1] ? 0 : 1;
    if (this.points[0] !== this.points[1]) return this.points[0] > this.points[1] ? 0 : 1;
    return null;
  }
  private winnerText(): string { const winner = this.winner(); return winner === null ? 'Empate gravitacional!' : `${NAMES[winner]} venceu o duelo!`; }

  private sendResult(): void {
    const winner = this.winner(); const winningPoints = Math.max(this.points[0], this.points[1]);
    const livesQuality = Math.max(this.health[0], this.health[1]) / Math.max(1, this.config().planetLives);
    const score = Math.min(1000, Math.round(300 + winningPoints * 2.2 + livesQuality * 170 + (winner === null ? 0 : 80)));
    this.context.complete({
      score, title: this.winnerText(),
      explanation: 'A força gravítica resultante altera continuamente o vetor velocidade. Por isso o asteroide descreve uma trajetória curva e pode colidir, escapar ou ficar ligado numa órbita.',
      details: [
        `${NAMES[0]}: ${this.points[0]} pts · ${this.hits[0]} impactos · ${this.captures[0]} capturas`,
        `${NAMES[1]}: ${this.points[1]} pts · ${this.hits[1]} impactos · ${this.captures[1]} capturas`,
        `Vidas finais: ${this.health[0]} — ${this.health[1]} · Lançamentos falhados: ${this.misses[0] + this.misses[1]}`,
        `Dificuldade: ${this.difficultyLabel(this.difficulty)}`,
      ],
    });
  }

  private drawStars(): void {
    const { ctx } = this.context; const { width, height } = this.viewport;
    for (const star of this.stars) {
      ctx.globalAlpha = star.alpha * (0.78 + Math.sin(this.elapsed * 1.8 + star.phase) * 0.22);
      ctx.fillStyle = '#dff5ff'; ctx.beginPath(); ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  private drawMidfield(): void {
    const { ctx } = this.context; const { width, height } = this.viewport;
    ctx.save(); ctx.setLineDash([7, 12]); ctx.strokeStyle = 'rgba(180,225,255,0.16)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(width * 0.5, height * 0.2); ctx.lineTo(width * 0.5, height * 0.86); ctx.stroke();
    if (['aiming', 'grabbed'].includes(this.phase)) {
      const [leftPlanet, rightPlanet] = this.planets();
      const laneLimit = (rightPlanet.position.x - leftPlanet.position.x) * 0.25;
      const limitX = this.active === 0 ? leftPlanet.position.x + laneLimit : rightPlanet.position.x - laneLimit;
      const zoneLeft = this.active === 0 ? 0 : limitX;
      const zoneWidth = this.active === 0 ? limitX : width - limitX;
      ctx.fillStyle = this.alpha(COLOURS[this.active], 0.06);
      ctx.fillRect(zoneLeft, height * 0.18, zoneWidth, height * 0.68);
      ctx.strokeStyle = this.alpha(COLOURS[this.active], 0.42);
      ctx.beginPath(); ctx.moveTo(limitX, height * 0.18); ctx.lineTo(limitX, height * 0.86); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = this.alpha(COLOURS[this.active], 0.92);
      ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(12, height * 0.017)}px system-ui`;
      ctx.fillText('limite da mão', limitX, height * 0.165);
    }
    ctx.restore();
  }
  private drawGravityFields(): void {
    const { ctx } = this.context;
    this.planets().forEach((planet, player) => {
      for (let ring = 1; ring <= 3; ring += 1) {
        ctx.strokeStyle = this.alpha(COLOURS[player as Player], 0.13 / ring); ctx.lineWidth = 2; ctx.beginPath();
        ctx.arc(planet.position.x, planet.position.y, planet.radius * (1.55 + ring * 0.72), 0, Math.PI * 2); ctx.stroke();
      }
    });
  }
  private drawPlanets(): void {
    const { ctx } = this.context;
    this.planets().forEach((planet, player) => {
      const offset = this.planetVisualOffset(player as Player);
      const px = planet.position.x + offset.x;
      const py = planet.position.y + offset.y;
      const gradient = ctx.createRadialGradient(px - planet.radius * 0.35, py - planet.radius * 0.38, 4, px, py, planet.radius);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.18, COLOURS[player as Player]); gradient.addColorStop(1, player === 0 ? '#084b75' : '#7b1839');
      ctx.save(); ctx.fillStyle = gradient; ctx.shadowColor = COLOURS[player as Player]; ctx.shadowBlur = 30; ctx.beginPath();
      ctx.arc(px, py, planet.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = `800 ${Math.max(13, this.viewport.height * 0.018)}px system-ui`;
      ctx.fillText(`${'❤'.repeat(this.health[player as Player])}${'♡'.repeat(Math.max(0, this.config().planetLives - this.health[player as Player]))}`, px, py + planet.radius + 28);
    });
  }
  private drawMoons(): void {
    const { ctx } = this.context;
    this.planets().forEach((planet, player) => {
      const offset = this.planetVisualOffset(player as Player);
      const px = planet.position.x + offset.x;
      const py = planet.position.y + offset.y;
      const orbitRadius = planet.radius * (1.95 + player * 0.12);
      const moonRadius = Math.max(5, planet.radius * 0.22);
      const angle = this.elapsed * (0.95 + player * 0.18) + player * Math.PI * 0.9;
      const mx = px + Math.cos(angle) * orbitRadius;
      const my = py + Math.sin(angle) * orbitRadius * 0.82;
      ctx.save();
      ctx.strokeStyle = this.alpha(COLOURS[player as Player], 0.18);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 8]);
      ctx.beginPath();
      ctx.ellipse(px, py, orbitRadius, orbitRadius * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(mx, my, moonRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.alpha(COLOURS[player as Player], 0.32);
      ctx.beginPath();
      ctx.arc(mx - moonRadius * 0.18, my - moonRadius * 0.15, moonRadius * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  private drawShuttle(): void {
    const { ctx } = this.context;
    const shuttle = this.shuttleState();
    const size = this.planetRadius() * 0.52;
    const direction = this.active === 0 ? 1 : -1;
    ctx.save();
    ctx.strokeStyle = 'rgba(220,245,255,0.18)';
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(this.planets()[0].position.x + this.planetRadius() * 1.4, shuttle.position.y);
    ctx.lineTo(this.planets()[1].position.x - this.planetRadius() * 1.4, shuttle.position.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.shuttleExplosionTime > 0 && this.shuttleExplosionAt) {
      const progress = 1 - this.shuttleExplosionTime / 0.9;
      const radius = size * (0.7 + progress * 2.1);
      ctx.globalAlpha = Math.max(0, this.shuttleExplosionTime / 0.9);
      const burst = ctx.createRadialGradient(this.shuttleExplosionAt.x, this.shuttleExplosionAt.y, 1, this.shuttleExplosionAt.x, this.shuttleExplosionAt.y, radius);
      burst.addColorStop(0, '#ffffff'); burst.addColorStop(0.22, '#ffd66b'); burst.addColorStop(0.62, '#ff7b42'); burst.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = burst; ctx.beginPath(); ctx.arc(this.shuttleExplosionAt.x, this.shuttleExplosionAt.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      for (let index = 0; index < 6; index += 1) {
        const trailOffset = size * (1.15 + index * 0.48);
        const alpha = 0.34 * (1 - index / 6);
        ctx.fillStyle = `rgba(112,242,184,${alpha})`;
        ctx.beginPath(); ctx.arc(shuttle.position.x - direction * trailOffset, shuttle.position.y + Math.sin(this.elapsed * 8 + index) * 3, Math.max(2, size * (0.12 - index * 0.012)), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(70,216,255,0.12)';
      ctx.beginPath(); ctx.ellipse(shuttle.position.x, shuttle.position.y, shuttle.hitRadius * 1.15, shuttle.hitRadius * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(112,226,255,0.62)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.translate(shuttle.position.x, shuttle.position.y);
      ctx.scale(direction, 1);
      ctx.rotate(Math.sin(this.elapsed * 2.8) * 0.035);
      const flame = size * (0.25 + 0.12 * Math.sin(this.elapsed * 15));
      ctx.fillStyle = '#ffb74d'; ctx.beginPath(); ctx.moveTo(-size * 0.72, -size * 0.18); ctx.lineTo(-size * (0.72 + flame / size), 0); ctx.lineTo(-size * 0.72, size * 0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d6f6ff'; ctx.strokeStyle = '#70dfff'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(size * 0.98, 0); ctx.quadraticCurveTo(size * 0.25, -size * 0.48, -size * 0.58, -size * 0.3); ctx.lineTo(-size * 0.78, 0); ctx.lineTo(-size * 0.58, size * 0.3); ctx.quadraticCurveTo(size * 0.25, size * 0.48, size * 0.98, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#63e5ff'; ctx.beginPath(); ctx.ellipse(size * 0.22, -size * 0.04, size * 0.24, size * 0.17, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#70f2b8'; ctx.fillRect(-size * 0.28, -size * 0.08, size * 0.24, size * 0.16);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(size * 0.56, 0, size * 0.055, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    const { width, height } = this.viewport;
    const barWidth = Math.min(240, width * 0.21);
    const barX = width * 0.5 - barWidth * 0.5;
    const barY = height * 0.15;
    roundedRect(ctx, barX, barY, barWidth, 14, 8); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    roundedRect(ctx, barX, barY, barWidth * shuttle.progress, 14, 8); ctx.fillStyle = 'rgba(112,242,184,0.82)'; ctx.fill();
    ctx.fillStyle = 'rgba(220,240,255,0.82)'; ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(12, height * 0.017)}px system-ui`;
    ctx.fillText(`nave cronómetro · ${Math.max(0, this.turnDuration() - this.turnClock).toFixed(1)} s · ${this.difficultyLabel(this.difficulty)}`, width * 0.5, barY - 8);
  }

  private drawAsteroid(): void {
    const { ctx } = this.context; const radius = this.asteroidRadius();
    ctx.save(); ctx.translate(this.asteroid.x, this.asteroid.y); ctx.rotate(this.elapsed * 1.7); ctx.fillStyle = '#9e8d7b'; ctx.strokeStyle = '#e8d4bd'; ctx.lineWidth = 2;
    ctx.shadowColor = '#ffbd72'; ctx.shadowBlur = this.phase === 'flight' ? 20 : 9; ctx.beginPath();
    for (let index = 0; index < 10; index += 1) { const angle = index / 10 * Math.PI * 2; const r = radius * (0.78 + ((index * 37) % 7) / 22); const x = Math.cos(angle) * r; const y = Math.sin(angle) * r; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  private drawTrail(): void {
    if (this.trail.length < 2) return; const { ctx } = this.context; ctx.save(); ctx.strokeStyle = this.alpha(COLOURS[this.active], 0.56); ctx.lineWidth = 3;
    ctx.beginPath(); this.trail.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)); ctx.stroke(); ctx.restore();
  }
  private drawPreview(): void {
    if (this.preview.length < 2) return; const { ctx } = this.context; ctx.save(); ctx.setLineDash([8, 8]); ctx.strokeStyle = '#70f2b8'; ctx.lineWidth = 3;
    ctx.beginPath(); this.preview.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)); ctx.stroke(); ctx.restore();
    if (this.grabOrigin) this.drawArrow(this.grabOrigin, this.previewVelocity, '#70f2b8', 'lançamento', 0.18);
  }
  private drawVectors(): void {
    if (!['flight', 'captured'].includes(this.phase)) return;
    this.drawArrow(this.asteroid, this.velocity, '#66e6ff', 'v', 0.19);
    this.drawArrow(this.asteroid, this.acceleration, '#ffd66b', 'a / F', 0.032);
    if (this.config().showForceComponents) {
      this.drawArrow(this.asteroid, this.force.components[0], this.alpha(COLOURS[0], 0.8), 'F₁', 0.024, true);
      this.drawArrow(this.asteroid, this.force.components[1], this.alpha(COLOURS[1], 0.8), 'F₂', 0.024, true);
    }
  }
  private drawArrow(origin: Vec2, vector: Vec2, colour: string, label: string, scaleFactor: number, dashed = false): void {
    const { ctx } = this.context; const maximum = Math.min(this.viewport.width, this.viewport.height) * 0.17;
    const display = clampMagnitude(scale(vector, scaleFactor), maximum); if (magnitude(display) < 5) return;
    const end = { x: origin.x + display.x, y: origin.y + display.y }; const unit = normalise(display); const head = 13;
    ctx.save(); if (dashed) ctx.setLineDash([5, 5]); ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = dashed ? 2 : 4; ctx.shadowColor = colour; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(end.x, end.y); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - unit.x * head - unit.y * head * 0.55, end.y - unit.y * head + unit.x * head * 0.55);
    ctx.lineTo(end.x - unit.x * head + unit.y * head * 0.55, end.y - unit.y * head - unit.x * head * 0.55); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.font = `800 ${Math.max(13, this.viewport.height * 0.018)}px system-ui`; ctx.fillText(label, end.x + 7, end.y - 7); ctx.restore();
  }
  private drawHud(): void {
    const { ctx } = this.context; const { width, height } = this.viewport; const panelWidth = width * 0.31; const panelHeight = height * 0.13;
    for (const player of [0, 1] as const) {
      const x = player === 0 ? width * 0.035 : width * 0.965 - panelWidth; roundedRect(ctx, x, height * 0.035, panelWidth, panelHeight, 20);
      ctx.fillStyle = player === this.active && ['aiming', 'grabbed'].includes(this.phase) ? this.alpha(COLOURS[player], 0.22) : 'rgba(3,10,27,0.72)'; ctx.fill();
      ctx.strokeStyle = player === this.active ? COLOURS[player] : 'rgba(190,225,255,0.2)'; ctx.lineWidth = player === this.active ? 3 : 1.5; ctx.stroke();
      ctx.textAlign = player === 0 ? 'left' : 'right'; const tx = player === 0 ? x + panelWidth * 0.07 : x + panelWidth * 0.93;
      ctx.fillStyle = COLOURS[player]; ctx.font = `900 ${Math.max(17, height * 0.025)}px system-ui`; ctx.fillText(NAMES[player], tx, height * 0.075);
      ctx.fillStyle = '#ffffff'; ctx.font = `800 ${Math.max(15, height * 0.021)}px system-ui`; ctx.fillText(`${this.points[player]} pts · ${this.hits[player]} impactos`, tx, height * 0.112);
      ctx.fillStyle = 'rgba(220,240,255,0.78)'; ctx.font = `600 ${Math.max(13, height * 0.018)}px system-ui`; ctx.fillText(`Asteroides: ${this.shots[player]} · Capturas: ${this.captures[player]}`, tx, height * 0.143);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = `900 ${Math.max(22, height * 0.033)}px system-ui`; ctx.fillText('DUELO GRAVITACIONAL', width * 0.5, height * 0.075);
    ctx.fillStyle = 'rgba(220,240,255,0.75)'; ctx.font = `650 ${Math.max(13, height * 0.018)}px system-ui`; ctx.fillText(`Turno: ${NAMES[this.active]} · ${this.difficultyLabel(this.difficulty)} · ${Math.max(0, this.turnDuration() - this.turnClock).toFixed(1)} s · F = F₁ + F₂`, width * 0.5, height * 0.112);
  }
  private drawMessage(): void {
    if (this.phase === 'instructions') return; const { ctx } = this.context; const { width, height } = this.viewport; const boxWidth = Math.min(width * 0.67, 930);
    roundedRect(ctx, width * 0.5 - boxWidth * 0.5, height * 0.835, boxWidth, height * 0.07, 17);
    ctx.fillStyle = this.outcome === 'hit' ? 'rgba(70,210,150,0.25)' : this.phase === 'captured' ? 'rgba(255,210,90,0.23)' : 'rgba(0,7,22,0.76)'; ctx.fill();
    ctx.strokeStyle = this.phase === 'captured' ? '#ffd66b' : this.outcome === 'hit' ? '#70f2b8' : 'rgba(150,220,255,0.32)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = `750 ${Math.max(15, height * 0.021)}px system-ui`; ctx.fillText(this.message, width * 0.5, height * 0.879);
  }
  private drawLegend(): void {
    if (!['flight', 'captured', 'grabbed'].includes(this.phase)) return; const { ctx } = this.context; const { width, height } = this.viewport;
    ctx.textAlign = 'center'; ctx.font = `700 ${Math.max(12, height * 0.016)}px system-ui`;
    ctx.fillStyle = '#66e6ff'; ctx.fillText('→ velocidade', width * 0.38, height * 0.94);
    ctx.fillStyle = '#ffd66b'; ctx.fillText('→ aceleração / força resultante', width * 0.59, height * 0.94);
    ctx.fillStyle = 'rgba(225,240,255,0.68)'; ctx.fillText('a direção de a mostra como v está a mudar', width * 0.79, height * 0.94);
  }
  private drawInstructions(): void {
    const { ctx } = this.context; const { width, height } = this.viewport;
    const panelWidth = Math.min(width * 0.82, 1120); const panelHeight = Math.min(height * 0.76, 650);
    const x = width * 0.5 - panelWidth * 0.5; const y = height * 0.12;
    roundedRect(ctx, x, y, panelWidth, panelHeight, 28);
    ctx.fillStyle = 'rgba(4,10,30,0.93)'; ctx.fill(); ctx.strokeStyle = 'rgba(112,226,255,0.43)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = `900 ${Math.max(32, height * 0.052)}px system-ui`; ctx.fillText('☄️ Duelo gravitacional', width * 0.5, y + panelHeight * 0.12);
    ctx.fillStyle = '#8fe7ff'; ctx.font = `700 ${Math.max(17, height * 0.025)}px system-ui`; ctx.fillText('Contorna a nave em trânsito com uma trajetória gravitacional curva', width * 0.5, y + panelHeight * 0.2);
    const lines = [
      '1. Na tua vez, faz pinça sobre o asteroide e mantém a mão no teu quarto de campo.',
      '2. A linha tracejada prevê a trajetória; um ataque direto colide com a nave.',
      '3. A nave atravessa o espaço e funciona como cronómetro do turno.',
      '4. Abre a mão para lançar. Impactos retiram vidas; capturas orbitais dão bónus.',
    ];
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(235,247,255,0.9)'; ctx.font = `600 ${Math.max(16, height * 0.022)}px system-ui`;
    lines.forEach((line, index) => ctx.fillText(line, x + panelWidth * 0.08, y + panelHeight * (0.3 + index * 0.075)));
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffd66b'; ctx.font = `800 ${Math.max(16, height * 0.022)}px system-ui`;
    ctx.fillText('Escolhe a dificuldade fazendo pinça sobre um dos três botões.', width * 0.5, y + panelHeight * 0.64);

    const cursor = this.input?.present ? toPixels(this.input.cursor, this.viewport) : null;
    for (const item of this.difficultyRects()) {
      const hovered = cursor ? pointInRect(cursor, item.rect) : false;
      roundedRect(ctx, item.rect.x, item.rect.y, item.rect.width, item.rect.height, 18);
      ctx.fillStyle = hovered ? 'rgba(112,242,184,0.25)' : item.value === 'assistido' ? 'rgba(85,215,255,0.14)' : item.value === 'desafio' ? 'rgba(255,125,154,0.14)' : 'rgba(255,214,107,0.14)'; ctx.fill();
      ctx.strokeStyle = hovered ? '#70f2b8' : 'rgba(190,225,255,0.32)'; ctx.lineWidth = hovered ? 4 : 2; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = `900 ${Math.max(18, height * 0.025)}px system-ui`; ctx.fillText(this.difficultyLabel(item.value), item.rect.x + item.rect.width / 2, item.rect.y + item.rect.height * 0.4);
      ctx.fillStyle = 'rgba(220,240,255,0.78)'; ctx.font = `600 ${Math.max(12, height * 0.017)}px system-ui`;
      const detail = item.value === 'assistido' ? 'mais tempo · nave menor' : item.value === 'desafio' ? 'menos tempo · nave maior' : 'equilíbrio recomendado';
      ctx.fillText(detail, item.rect.x + item.rect.width / 2, item.rect.y + item.rect.height * 0.72);
    }
  }

  private difficultyRects(): { value: Difficulty; rect: { x: number; y: number; width: number; height: number } }[] {
    const { width, height } = this.viewport; const totalWidth = Math.min(width * 0.72, 900); const gap = Math.max(12, width * 0.012);
    const buttonWidth = (totalWidth - gap * 2) / 3; const buttonHeight = Math.min(100, height * 0.115); const startX = width * 0.5 - totalWidth * 0.5; const y = height * 0.68;
    return (['assistido', 'normal', 'desafio'] as Difficulty[]).map((value, index) => ({ value, rect: { x: startX + index * (buttonWidth + gap), y, width: buttonWidth, height: buttonHeight } }));
  }

  private difficultyAt(point: Vec2): Difficulty | null {
    return this.difficultyRects().find((item) => pointInRect(point, item.rect))?.value ?? null;
  }

  private difficultyLabel(value: Difficulty): string {
    return value === 'assistido' ? 'Assistido' : value === 'desafio' ? 'Desafio' : 'Normal';
  }

  private createStars(): void {
    this.stars = Array.from({ length: 110 }, (_, index) => ({ x: this.random(index * 3 + 1), y: this.random(index * 3 + 2), size: 0.7 + this.random(index * 3 + 3) * 1.9, alpha: 0.18 + this.random(index * 5 + 4) * 0.68, phase: this.random(index * 7 + 5) * Math.PI * 2 }));
  }
  private random(seed: number): number { const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return value - Math.floor(value); }
  private alpha(hex: string, alpha: number): string {
    const value = Number.parseInt(hex.replace('#', ''), 16); return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${Math.max(0, Math.min(1, alpha))})`;
  }
}
