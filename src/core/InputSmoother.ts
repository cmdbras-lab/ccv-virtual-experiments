import type { Vec2 } from './types.js';

export class InputSmoother {
  private value: Vec2 | null = null;
  private previous: Vec2 | null = null;
  private previousTime = 0;
  private velocity: Vec2 = { x: 0, y: 0 };

  constructor(private readonly alpha = 0.38) {}

  reset(): void {
    this.value = null;
    this.previous = null;
    this.previousTime = 0;
    this.velocity = { x: 0, y: 0 };
  }

  push(next: Vec2, timestampMs: number): { position: Vec2; velocity: Vec2 } {
    if (!this.value) {
      this.value = { ...next };
      this.previous = { ...next };
      this.previousTime = timestampMs;
      return { position: { ...this.value }, velocity: { x: 0, y: 0 } };
    }

    this.value = {
      x: this.value.x + (next.x - this.value.x) * this.alpha,
      y: this.value.y + (next.y - this.value.y) * this.alpha,
    };

    const dt = Math.max((timestampMs - this.previousTime) / 1000, 1 / 120);
    if (this.previous) {
      const instant = {
        x: (this.value.x - this.previous.x) / dt,
        y: (this.value.y - this.previous.y) / dt,
      };
      this.velocity = {
        x: this.velocity.x * 0.55 + instant.x * 0.45,
        y: this.velocity.y * 0.55 + instant.y * 0.45,
      };
    }

    this.previous = { ...this.value };
    this.previousTime = timestampMs;
    return { position: { ...this.value }, velocity: { ...this.velocity } };
  }
}
