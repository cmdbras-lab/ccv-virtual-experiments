import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateHtml } from "../scripts/validate.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("o artefacto standalone é válido e autocontido", () => {
  const result = validateHtml(html);
  assert.ok(result.bytes > 50_000);
  assert.ok(result.scriptCount >= 1);
});

test("a experiência principal está presente", () => {
  for (const text of [
    "Comprimir",
    "Recipiente molecular",
    "Concentrações",
    "Quociente da reação",
    "Três momentos decisivos",
    "Desafio de previsão",
    "Vista superior",
    "Vista lateral"
  ]) {
    assert.ok(html.includes(text), `texto ausente: ${text}`);
  }
});

test("não existem recursos remotos obrigatórios", () => {
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["']https?:\/\//i);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref=["']https?:\/\//i);
  assert.doesNotMatch(html, /window\.openai|\bfetch\s*\(/);
});
