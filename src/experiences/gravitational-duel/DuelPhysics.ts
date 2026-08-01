import type { Vec2 } from '../../core/types.js';

export type DuelPlanet = { position: Vec2; radius: number; mu: number };
export type ForceSample = { total: Vec2; components: [Vec2, Vec2] };

export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function scale(v: Vec2, factor: number): Vec2 { return { x: v.x * factor, y: v.y * factor }; }
export function magnitude(v: Vec2): number { return Math.hypot(v.x, v.y); }
export function distance(a: Vec2, b: Vec2): number { return magnitude(sub(a, b)); }
export function normalise(v: Vec2): Vec2 {
  const length = magnitude(v);
  return length > 0.0001 ? scale(v, 1 / length) : { x: 0, y: 0 };
}
export function clampMagnitude(v: Vec2, maximum: number): Vec2 {
  const length = magnitude(v);
  return length > maximum && length > 0 ? scale(v, maximum / length) : v;
}

export function gravityAt(position: Vec2, planets: readonly [DuelPlanet, DuelPlanet]): ForceSample {
  const components = planets.map((planet) => {
    const offset = sub(planet.position, position);
    const radius = Math.max(magnitude(offset), planet.radius * 0.72);
    return scale(offset, planet.mu / (radius * radius * radius));
  }) as [Vec2, Vec2];
  return { total: add(components[0], components[1]), components };
}

export function integrate(position: Vec2, velocity: Vec2, dt: number, planets: readonly [DuelPlanet, DuelPlanet]): {
  position: Vec2; velocity: Vec2; acceleration: Vec2; force: ForceSample;
} {
  const force = gravityAt(position, planets);
  const nextVelocity = add(velocity, scale(force.total, dt));
  return {
    position: add(position, scale(nextVelocity, dt)),
    velocity: nextVelocity,
    acceleration: force.total,
    force,
  };
}

export function predictTrajectory(
  start: Vec2,
  velocity: Vec2,
  planets: readonly [DuelPlanet, DuelPlanet],
  seconds: number,
  bounds: { width: number; height: number },
): Vec2[] {
  const points: Vec2[] = [];
  let position = { ...start };
  let currentVelocity = { ...velocity };
  const dt = 0.045;
  const steps = Math.max(1, Math.ceil(seconds / dt));
  for (let step = 0; step < steps; step += 1) {
    const next = integrate(position, currentVelocity, dt, planets);
    position = next.position;
    currentVelocity = next.velocity;
    if (step % 2 === 0) points.push({ ...position });
    if (planets.some((planet) => distance(position, planet.position) <= planet.radius)) break;
    if (position.x < -bounds.width * 0.15 || position.x > bounds.width * 1.15
      || position.y < -bounds.height * 0.2 || position.y > bounds.height * 1.2) break;
  }
  return points;
}

export function captureQuality(position: Vec2, velocity: Vec2, planet: DuelPlanet, captureMultiplier: number): number {
  const radial = sub(position, planet.position);
  const radius = magnitude(radial);
  if (radius > planet.radius * captureMultiplier || radius < planet.radius * 1.25) return 0;
  const speed = magnitude(velocity);
  if (speed < 1) return 0;
  const circularSpeed = Math.sqrt(planet.mu / radius);
  const radialUnit = normalise(radial);
  const direction = normalise(velocity);
  const radialFraction = Math.abs(direction.x * radialUnit.x + direction.y * radialUnit.y);
  const tangentialQuality = Math.max(0, 1 - radialFraction / 0.62);
  const speedQuality = Math.max(0, 1 - Math.abs(speed / circularSpeed - 1) / 0.78);
  const specificEnergy = speed * speed * 0.5 - planet.mu / radius;
  const boundQuality = specificEnergy < 0 ? 1 : Math.max(0, 1 - specificEnergy / Math.max(planet.mu / radius, 1));
  return tangentialQuality * 0.42 + speedQuality * 0.38 + boundQuality * 0.2;
}
