import type { AppConfig, ExperienceResult, HandInput } from './types.js';
import type { AudioEngine } from './AudioEngine.js';
import type { ScoreStore } from './ScoreStore.js';

export interface ExperienceManifest {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  version: string;
  author: string;
}

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export interface ExperienceContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  config: AppConfig;
  audio: AudioEngine;
  scores: ScoreStore;
  getViewport(): Viewport;
  complete(result: ExperienceResult): void;
  requestRestart(): void;
}

export interface Experience {
  readonly manifest: ExperienceManifest;
  mount(context: ExperienceContext): void;
  start(): void;
  update(dtSeconds: number, input: HandInput): void;
  render(): void;
  resize(viewport: Viewport): void;
  dispose(): void;
}

export type ExperienceFactory = () => Experience;
