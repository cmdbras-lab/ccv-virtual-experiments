import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const requiredIds = [
  "no2LabApp",
  "compressBtn",
  "playBtn",
  "stepBtn",
  "resetBtn",
  "vesselCanvas",
  "concentrationChart",
  "equilibriumChart",
  "compressionFactor",
  "compressionMode",
  "topViewBtn",
  "sideViewBtn",
  "checkPredictionBtn"
];

export function validateHtml(html, filename = "index.html") {
  const errors = [];

  if (!/^<!doctype html>/i.test(html.trimStart())) errors.push("falta <!doctype html>");
  if (!/<html\b[^>]*lang="pt-PT"/i.test(html)) errors.push("idioma pt-PT não declarado");
  if (!/<title>Laboratório NO₂ ⇌ N₂O₄<\/title>/i.test(html)) errors.push("título incorreto");
  if (!/<meta\b[^>]*name="description"/i.test(html)) errors.push("descrição metadata ausente");
  if (Buffer.byteLength(html) >= 1024 * 1024) errors.push("ficheiro excede 1 MiB");

  for (const id of requiredIds) {
    if (!new RegExp(`id=["']${id}["']`).test(html)) errors.push(`elemento #${id} ausente`);
  }

  const externalAsset = /<(?:script|link|img|iframe|audio|video|source)\b[^>]*(?:src|href)=["']https?:\/\//i;
  if (externalAsset.test(html)) errors.push("recurso externo encontrado; o artefacto deve funcionar offline");
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(html)) errors.push("acesso de rede encontrado");
  if (/window\.openai/.test(html)) errors.push("dependência do ambiente ChatGPT encontrada");

  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length === 0) errors.push("script interno da aplicação ausente");

  for (const [, source] of scripts) {
    try {
      new Function(source);
    } catch (error) {
      errors.push(`JavaScript inválido: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`${filename}: ${errors.join("; ")}`);
  }

  return {
    bytes: Buffer.byteLength(html),
    scriptCount: scripts.length
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const filename = resolve(process.argv[2] || "index.html");
  const result = validateHtml(readFileSync(filename, "utf8"), filename);
  console.log(`Validação concluída: ${result.bytes} bytes, ${result.scriptCount} script(s) interno(s).`);
}
