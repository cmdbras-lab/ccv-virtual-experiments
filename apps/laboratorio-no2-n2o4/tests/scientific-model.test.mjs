import test from "node:test";
import assert from "node:assert/strict";

function equilibriumAfterCompression({ a, b, compression }) {
  const Kc = b / (a * a);
  const finalVolume = 1 / compression;
  const conservedUnits = a + 2 * b;
  const densityUnits = conservedUnits / finalVolume;
  const finalA = (Math.sqrt(1 + 8 * Kc * densityUnits) - 1) / (4 * Kc);
  const finalB = Kc * finalA * finalA;
  return { Kc, finalVolume, finalA, finalB, conservedUnits };
}

test("a compressão instantânea reduz Qc/Kc para 1/r", () => {
  const a = 1;
  const b = 0.5;
  const r = 2;
  const Kc = b / (a * a);
  const immediateQ = (r * b) / ((r * a) ** 2);
  assert.ok(Math.abs(immediateQ / Kc - 1 / r) < 1e-12);
});

test("o novo equilíbrio padrão coincide com a solução analítica", () => {
  const result = equilibriumAfterCompression({ a: 1, b: 0.5, compression: 2 });
  assert.ok(Math.abs(result.finalA - 1.5615528128088303) < 1e-12);
  assert.ok(Math.abs(result.finalB - 1.2192235935955846) < 1e-12);
  assert.ok(1 < result.finalA && result.finalA < 2);
});

test("a quantidade equivalente de unidades NO2 é conservada", () => {
  const result = equilibriumAfterCompression({ a: 1, b: 0.5, compression: 2 });
  const finalUnits = result.finalVolume * (result.finalA + 2 * result.finalB);
  assert.ok(Math.abs(finalUnits - result.conservedUnits) < 1e-12);
});

test("o estado final satisfaz Qc = Kc", () => {
  const result = equilibriumAfterCompression({ a: 1.3, b: 0.4, compression: 2.6 });
  const Qc = result.finalB / (result.finalA ** 2);
  assert.ok(Math.abs(Qc / result.Kc - 1) < 1e-12);
});

test("na vista superior, concentração e percurso cancelam-se no instante da compressão", () => {
  const a = 1;
  const b = 0.5;
  const epsilonA = 0.45;
  const epsilonB = 0.02;
  const r = 2;
  const initialAbsorbance = (epsilonA * a + epsilonB * b) * 1;
  const immediateAbsorbance = (epsilonA * r * a + epsilonB * r * b) * (1 / r);
  assert.ok(Math.abs(immediateAbsorbance - initialAbsorbance) < 1e-12);
});

test("na vista lateral, a absorvância instantânea cresce com o fator de compressão", () => {
  const initial = 0.45 * 1 + 0.02 * 0.5;
  const immediate = 0.45 * 2 * 1 + 0.02 * 2 * 0.5;
  assert.ok(Math.abs(immediate / initial - 2) < 1e-12);
});
