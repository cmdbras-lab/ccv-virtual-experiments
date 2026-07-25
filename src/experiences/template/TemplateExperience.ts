import type { Experience, ExperienceContext, ExperienceManifest, Viewport } from '../../core/Experience.js';
import type { HandInput } from '../../core/types.js';

export const templateManifest: ExperienceManifest = {
  id: 'modelo-alunos',
  title: 'Modelo para nova experiência',
  subtitle: 'Exemplo mínimo para começar.',
  description: 'Copia esta pasta, altera o manifesto e implementa update/render.',
  icon: '🧪',
  version: '1.0.0',
  author: 'Alunos do Clube Ciência Viva',
};

export class TemplateExperience implements Experience {
  readonly manifest = templateManifest;
  private context!: ExperienceContext;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private x = 0;
  private y = 0;

  mount(context: ExperienceContext): void {
    this.context = context;
  }

  start(): void {}

  update(_dtSeconds: number, input: HandInput): void {
    if (!input.present) return;
    this.x = input.cursor.x * this.viewport.width;
    this.y = input.cursor.y * this.viewport.height;
  }

  render(): void {
    const { ctx } = this.context;
    ctx.fillStyle = '#071427';
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '700 42px system-ui';
    ctx.fillText('Nova experiência', this.viewport.width / 2, 90);
    ctx.fillStyle = '#63e6ff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  resize(viewport: Viewport): void {
    this.viewport = viewport;
  }

  dispose(): void {}
}
