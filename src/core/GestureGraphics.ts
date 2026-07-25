import type { HandInput, Vec2 } from './types.js';
import type { Viewport } from './Experience.js';

const HAND_CONNECTIONS: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [17, 0],
];

export function toPixels(point: Vec2, viewport: Viewport): Vec2 {
  return { x: point.x * viewport.width, y: point.y * viewport.height };
}

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  input: HandInput,
  viewport: Viewport,
  options: { alpha?: number; cursor?: boolean } = {},
): void {
  if (!input.present) return;
  const alpha = options.alpha ?? 0.92;
  const color = input.pinch ? '#6ff4bc' : '#69dfff';
  const points = input.landmarks.map((point) => toPixels(point, viewport));

  if (points.length >= 21) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [index, landmarkIndex] of [0, 5, 9, 13, 17].entries()) {
      const point = points[landmarkIndex];
      if (!point) continue;
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(4, viewport.height * 0.006);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    for (const [fromIndex, toIndex] of HAND_CONNECTIONS) {
      const from = points[fromIndex];
      const to = points[toIndex];
      if (!from || !to) continue;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!point) continue;
      const pinchPoint = index === 4 || index === 8;
      ctx.fillStyle = pinchPoint ? (input.pinch ? '#fff59a' : '#ffffff') : color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, pinchPoint ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (options.cursor !== false) drawGestureCursor(ctx, input, viewport);
}

export function drawGestureCursor(ctx: CanvasRenderingContext2D, input: HandInput, viewport: Viewport): void {
  if (!input.present) return;
  const cursor = toPixels(input.cursor, viewport);
  ctx.save();
  ctx.strokeStyle = input.pinch ? '#72f2b5' : '#7eeaff';
  ctx.lineWidth = 4;
  ctx.shadowColor = input.pinch ? '#72f2b5' : '#3ad8ff';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(cursor.x, cursor.y, input.pinch ? 13 : 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawDwellRing(
  ctx: CanvasRenderingContext2D,
  point: Vec2,
  progress: number,
  radius = 30,
): void {
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#72f2b5';
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, progress)));
  ctx.stroke();
  ctx.restore();
}

export function pointInRect(point: Vec2, rect: { x: number; y: number; width: number; height: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
