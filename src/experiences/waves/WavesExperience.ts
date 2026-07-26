import type { Experience, ExperienceContext, ExperienceManifest, Viewport } from '../../core/Experience.js';
import { drawHandSkeleton } from '../../core/GestureGraphics.js';
import type { HandInput } from '../../core/types.js';

export const wavesManifest: ExperienceManifest = {
  id: 'domina-as-ondas',
  title: 'Luz, ondas e espetro',
  subtitle: 'Descobre as sete cores do arco-íris.',
  description: 'Relaciona frequência, comprimento de onda, cor e intensidade no espetro visível.',
  icon: '🌈',
  version: '2.4.1',
  author: 'Clube Ciência Viva Abel Salazar',
};

type Phase = 'instructions' | 'playing' | 'round-result' | 'finished';
type Target = { name: string; wavelengthNm: number; amplitude: number; color: string };

const RAINBOW: readonly Omit<Target, 'amplitude'>[] = [
  { name: 'vermelho', wavelengthNm: 650, color: '#ff3434' },
  { name: 'laranja', wavelengthNm: 610, color: '#ff8b24' },
  { name: 'amarelo', wavelengthNm: 580, color: '#ffe04a' },
  { name: 'verde', wavelengthNm: 535, color: '#35dc72' },
  { name: 'azul', wavelengthNm: 470, color: '#33a9ff' },
  { name: 'anil', wavelengthNm: 445, color: '#5257ff' },
  { name: 'violeta', wavelengthNm: 410, color: '#9c4dff' },
];

export class WavesExperience implements Experience {
  readonly manifest = wavesManifest;
  private context!: ExperienceContext;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private input: HandInput | null = null;
  private phase: Phase = 'instructions';
  private elapsed = 0;
  private totalElapsed = 0;
  private round = 0;
  private score = 0;
  private wavelengthNm = 520;
  private amplitude = 0.24;
  private matchHold = 0;
  private resultSent = false;
  private successfulRounds = 0;
  private targets: Target[] = [];
  private lastRoundSuccess = false;

  mount(context: ExperienceContext): void { this.context = context; }

  start(): void {
    const base = this.context.config.waves.targetAmplitude;
    const amplitudes = [-0.07, 0.02, 0.08, -0.02, 0.05, -0.05, 0].map((delta) => Math.min(0.4, Math.max(0.18, base + delta)));
    this.targets = this.shuffle(RAINBOW.map((target, index) => ({ ...target, amplitude: amplitudes[index] ?? base })));
    this.input = null;
    this.phase = 'instructions';
    this.elapsed = 0;
    this.totalElapsed = 0;
    this.round = 0;
    this.score = 0;
    this.matchHold = 0;
    this.resultSent = false;
    this.successfulRounds = 0;
    this.lastRoundSuccess = false;
    this.prepareRound();
  }

  update(dtSeconds: number, input: HandInput): void {
    const dt = Math.min(dtSeconds, 0.05);
    this.elapsed += dt;
    this.totalElapsed += dt;
    this.input = input;

    if (this.phase === 'instructions') {
      if (this.elapsed > 0.8 && input.pinchStarted) {
        this.phase = 'playing';
        this.elapsed = 0;
        this.context.audio.tone(480, 0.1);
      }
      return;
    }

    if (this.phase === 'playing') {
      if (input.present) {
        this.wavelengthNm = 400 + input.cursor.x * 300;
        this.amplitude = 0.10 + (1 - input.cursor.y) * 0.34;
      }
      const quality = this.matchQuality();
      const matching = this.wavelengthError() <= 16 && this.amplitudeError() <= 0.045;
      this.matchHold = matching ? this.matchHold + dt : Math.max(0, this.matchHold - dt * 1.8);
      if (this.matchHold >= this.context.config.waves.successHoldSeconds) this.completeRound(true, quality);
      else if (this.elapsed > 22) this.completeRound(false, quality);
      return;
    }

    if (this.phase === 'round-result') {
      if (this.elapsed > 3.1 || (this.elapsed > 1.2 && input.pinchStarted)) this.nextRound();
      return;
    }

    if (this.phase === 'finished' && !this.resultSent) {
      this.resultSent = true;
      window.setTimeout(() => this.sendResult(), 650);
    }
  }

  render(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#06162e');
    gradient.addColorStop(1, '#02050d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (this.phase !== 'instructions') {
      this.drawWaveArea();
      this.drawSpectrumPanel();
      this.drawLamp();
    }
    if (this.input && this.phase === 'playing') drawHandSkeleton(ctx, this.input, this.viewport);
    this.drawHud();
  }

  resize(viewport: Viewport): void { this.viewport = viewport; }
  dispose(): void { /* sem recursos adicionais */ }

  private prepareRound(): void {
    const target = this.currentTarget();
    this.wavelengthNm = target.wavelengthNm > 550 ? 440 : 640;
    this.amplitude = Math.max(0.12, target.amplitude - 0.1);
    this.matchHold = 0;
  }

  private completeRound(success: boolean, quality: number): void {
    const speedBonus = Math.max(0, 22 - this.elapsed) / 22 * 25;
    const roundScore = Math.min(143, Math.round(quality * 105 + speedBonus + (success ? 13 : 0)));
    this.score += roundScore;
    this.lastRoundSuccess = success;
    if (success) {
      this.successfulRounds += 1;
      this.context.audio.success();
    } else this.context.audio.tone(260 + quality * 260, 0.18);
    this.phase = 'round-result';
    this.elapsed = 0;
    this.matchHold = 0;
  }

  private nextRound(): void {
    this.round += 1;
    if (this.round >= this.targets.length) {
      this.phase = 'finished';
      this.elapsed = 0;
      return;
    }
    this.prepareRound();
    this.phase = 'playing';
    this.elapsed = 0;
  }

  private sendResult(): void {
    this.context.complete({
      score: Math.min(1000, this.score),
      title: this.successfulRounds === this.targets.length ? 'Arco-íris completo!' : 'Espetro explorado',
      explanation: 'A cor da luz depende do comprimento de onda: o violeta tem menor comprimento de onda e o vermelho maior. A amplitude altera a intensidade, não a cor.',
      details: [
        `Cores reproduzidas: ${this.successfulRounds}/${this.targets.length}`,
        'Cores: vermelho · laranja · amarelo · verde · azul · anil · violeta',
        `Tempo total: ${this.totalElapsed.toFixed(1)} s`,
      ],
    });
  }

  private drawWaveArea(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const x0 = width * 0.055;
    const x1 = width * 0.62;
    const centerY = height * 0.54;
    const waveHeight = height * 0.42;
    const target = this.currentTarget();

    ctx.save();
    ctx.strokeStyle = 'rgba(210,240,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, centerY);
    ctx.lineTo(x1, centerY);
    ctx.stroke();
    this.drawWave(target.amplitude * waveHeight, this.cyclesForWavelength(target.wavelengthNm), target.color, true, x0, x1, centerY);
    this.drawWave(this.amplitude * waveHeight, this.cyclesForWavelength(this.wavelengthNm), this.wavelengthColor(this.wavelengthNm), false, x0, x1, centerY);
    ctx.restore();
  }

  private drawWave(amplitudePx: number, cycles: number, color: string, dashed: boolean, x0: number, x1: number, centerY: number): void {
    const { ctx } = this.context;
    ctx.save();
    if (dashed) ctx.setLineDash([12, 10]);
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 5 : 8;
    ctx.shadowColor = color;
    ctx.shadowBlur = dashed ? 8 : 18;
    ctx.beginPath();
    for (let i = 0; i <= 220; i += 1) {
      const p = i / 220;
      const x = x0 + (x1 - x0) * p;
      const y = centerY - Math.sin(p * Math.PI * 2 * cycles) * amplitudePx;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawSpectrumPanel(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const x = width * 0.68;
    const y = height * 0.2;
    const w = width * 0.28;
    const h = height * 0.57;
    const target = this.currentTarget();

    ctx.save();
    panel(ctx, x, y, w, h, 24);
    ctx.fillStyle = 'rgba(2,8,24,0.8)'; ctx.fill();
    ctx.strokeStyle = 'rgba(135,220,255,0.28)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(20, height * 0.029)}px system-ui`;
    ctx.fillText('Espetro visível', x + w / 2, y + h * 0.1);

    const barX = x + w * 0.09; const barY = y + h * 0.25; const barW = w * 0.82; const barH = h * 0.13;
    const spectrum = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    spectrum.addColorStop(0, '#8d3cff'); spectrum.addColorStop(0.16, '#4d55ff'); spectrum.addColorStop(0.32, '#2f9fff');
    spectrum.addColorStop(0.5, '#29d15f'); spectrum.addColorStop(0.67, '#ffe242'); spectrum.addColorStop(0.83, '#ff8b28'); spectrum.addColorStop(1, '#ef2b2b');
    ctx.fillStyle = spectrum; ctx.fillRect(barX, barY, barW, barH);
    const p = Math.max(0, Math.min(1, (this.wavelengthNm - 400) / 300));
    const arrowX = barX + p * barW;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(arrowX, barY - 18); ctx.lineTo(arrowX - 10, barY - 2); ctx.lineTo(arrowX + 10, barY - 2); ctx.closePath(); ctx.fill();

    ctx.fillStyle = target.color; ctx.font = `900 ${Math.max(28, height * 0.044)}px system-ui`;
    ctx.fillText(target.name.toLocaleUpperCase('pt-PT'), x + w / 2, y + h * 0.54);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(17, height * 0.023)}px system-ui`;
    ctx.fillText(`${this.wavelengthNm.toFixed(0)} nm`, x + w / 2, y + h * 0.64);
    ctx.fillStyle = 'rgba(220,240,255,0.78)'; ctx.font = `500 ${Math.max(13, height * 0.018)}px system-ui`;
    ctx.fillText(`Alvo: ${target.wavelengthNm} nm`, x + w / 2, y + h * 0.72);
    ctx.fillText(`Amplitude: ${this.amplitude.toFixed(2)} / ${target.amplitude.toFixed(2)}`, x + w / 2, y + h * 0.8);
    ctx.restore();
  }

  private drawLamp(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const color = this.wavelengthColor(this.wavelengthNm);
    const x = width * 0.34; const y = height * 0.17; const radius = Math.max(28, height * 0.05);
    ctx.save(); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 38;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  private drawHud(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    if (this.phase === 'instructions') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.max(34, height * 0.057)}px system-ui`;
      ctx.fillText('Constrói as sete cores do arco-íris', width / 2, height * 0.27);
      ctx.fillStyle = 'rgba(220,240,255,0.88)'; ctx.font = `600 ${Math.max(19, height * 0.027)}px system-ui`;
      ctx.fillText('Move a mão na horizontal para a cor e na vertical para a intensidade.', width / 2, height * 0.39);
      ctx.fillText('Mantém as duas ondas coincidentes para validar cada cor.', width / 2, height * 0.45);
      ctx.fillStyle = '#72f2b5'; ctx.font = `800 ${Math.max(22, height * 0.032)}px system-ui`;
      ctx.fillText('Faz pinça para começar', width / 2, height * 0.62);
      if (this.input) drawHandSkeleton(ctx, this.input, this.viewport);
      return;
    }

    const target = this.currentTarget();
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(20, height * 0.029)}px system-ui`;
    ctx.fillText(`Cor ${Math.min(this.round + 1, this.targets.length)}/${this.targets.length}: ${target.name.toLocaleUpperCase('pt-PT')}`, width * 0.055, height * 0.09);
    ctx.fillStyle = target.color; ctx.font = `700 ${Math.max(17, height * 0.023)}px system-ui`;
    ctx.fillText(this.guidance(), width * 0.055, height * 0.135);

    if (this.phase === 'playing') {
      const progress = Math.min(1, this.matchHold / this.context.config.waves.successHoldSeconds);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(width * 0.055, height * 0.9, width * 0.55, 14);
      ctx.fillStyle = target.color; ctx.fillRect(width * 0.055, height * 0.9, width * 0.55 * progress, 14);
    }
    if (this.phase === 'round-result') {
      ctx.textAlign = 'center'; ctx.fillStyle = this.lastRoundSuccess ? '#72f2b5' : '#ffd36d';
      ctx.font = `900 ${Math.max(31, height * 0.052)}px system-ui`;
      ctx.fillText(this.lastRoundSuccess ? `${target.name} conseguida!` : `${target.name}: continua a explorar`, width / 2, height * 0.84);
      ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.max(16, height * 0.022)}px system-ui`;
      ctx.fillText('A cor depende do comprimento de onda; a amplitude controla a intensidade.', width / 2, height * 0.89);
    }
  }

  private guidance(): string {
    const target = this.currentTarget();
    const waveError = this.wavelengthNm - target.wavelengthNm;
    if (Math.abs(waveError) > 16) return waveError < 0 ? 'Desloca para a direita: aumenta o comprimento de onda.' : 'Desloca para a esquerda: reduz o comprimento de onda.';
    const ampError = this.amplitude - target.amplitude;
    if (Math.abs(ampError) > 0.045) return ampError < 0 ? 'Sobe a mão: aumenta a intensidade.' : 'Desce a mão: reduz a intensidade.';
    return 'Excelente! Mantém a mão estável.';
  }

  private currentTarget(): Target {
    const fallback = RAINBOW[2] ?? { name: 'amarelo', wavelengthNm: 580, color: '#ffe04a' };
    return this.targets[Math.min(this.round, Math.max(0, this.targets.length - 1))] ?? { ...fallback, amplitude: 0.3 };
  }
  private wavelengthError(): number { return Math.abs(this.wavelengthNm - this.currentTarget().wavelengthNm); }
  private amplitudeError(): number { return Math.abs(this.amplitude - this.currentTarget().amplitude); }
  private matchQuality(): number {
    const wavelengthQuality = Math.max(0, 1 - this.wavelengthError() / 95);
    const amplitudeQuality = Math.max(0, 1 - this.amplitudeError() / 0.22);
    return wavelengthQuality * 0.68 + amplitudeQuality * 0.32;
  }
  private cyclesForWavelength(nm: number): number { return 3.3 + (700 - nm) / 300 * 4.7; }
  private wavelengthColor(nm: number): string {
    const ordered = [...RAINBOW].sort((a, b) => a.wavelengthNm - b.wavelengthNm);
    let best = ordered[0] ?? { name: 'amarelo', wavelengthNm: 580, color: '#ffe04a' };
    for (const item of ordered) if (Math.abs(item.wavelengthNm - nm) < Math.abs(best.wavelengthNm - nm)) best = item;
    return best.color;
  }
  private shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const current = result[i];
      const other = result[j];
      if (current !== undefined && other !== undefined) { result[i] = other; result[j] = current; }
    }
    return result;
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
