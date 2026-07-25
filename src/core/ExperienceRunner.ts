import type { Experience, Viewport } from './Experience.js';
import type { AppConfig, ExperienceResult, HandInput } from './types.js';
import { AudioEngine } from './AudioEngine.js';
import { ScoreStore } from './ScoreStore.js';

export class ExperienceRunner {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  readonly audio = new AudioEngine();
  readonly scores = new ScoreStore();
  private active: Experience | null = null;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };

  onComplete: (result: ExperienceResult) => void = () => undefined;
  onRestartRequested: () => void = () => undefined;

  constructor(private readonly config: AppConfig) {
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Este navegador não disponibiliza Canvas 2D.');
    this.ctx = context;
    this.canvas.className = 'experience-canvas';
  }

  mount(experience: Experience): void {
    this.active?.dispose();
    this.active = experience;
    experience.mount({
      canvas: this.canvas,
      ctx: this.ctx,
      config: this.config,
      audio: this.audio,
      scores: this.scores,
      getViewport: () => this.viewport,
      complete: (result) => this.onComplete(result),
      requestRestart: () => this.onRestartRequested(),
    });
    experience.resize(this.viewport);
  }

  start(): void {
    this.active?.start();
  }

  update(dt: number, input: HandInput): void {
    this.active?.update(dt, input);
  }

  render(): void {
    this.active?.render();
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewport = { width, height, dpr };
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.active?.resize(this.viewport);
  }

  dispose(): void {
    this.active?.dispose();
    this.active = null;
  }
}
