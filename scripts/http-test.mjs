import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 43173;
const server = spawn(process.execPath, [path.join(root, 'scripts/static-server.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/index.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('O servidor local não iniciou no tempo previsto.');
}

try {
  await waitForServer();
  const checks = [
    ['/', 'text/html'],
    ['/config.json', 'application/json'],
    ['/assets/main.js', 'text/javascript'],
    ['/assets/styles.css', 'text/css'],
    ['/branding/logo-aeas.png', 'image/png'],
    ['/branding/barra-prr-2024.png', 'image/png'],
    ['/branding/logo-clubes-ciencia-viva.png', 'image/png'],
  ];
  for (const [urlPath, expectedType] of checks) {
    const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${urlPath}: HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith(expectedType)) throw new Error(`${urlPath}: tipo MIME ${contentType}, esperado ${expectedType}.`);
  }
  for (const filename of ['logo-aeas.png', 'barra-prr-2024.png', 'logo-clubes-ciencia-viva.png']) {
    const response = await fetch(`http://127.0.0.1:${port}/branding/${filename}`, { cache: 'no-store' });
    const served = Buffer.from(await response.arrayBuffer());
    const original = await readFile(path.join(root, 'dist/branding', filename));
    if (digest(served) !== digest(original)) throw new Error(`${filename}: conteúdo servido diferente do original.`);
  }
  console.log('Teste HTTP concluído: HTML, módulos, estilos e três logótipos servidos com tipos MIME e conteúdos corretos.');
} finally {
  server.kill('SIGTERM');
}
