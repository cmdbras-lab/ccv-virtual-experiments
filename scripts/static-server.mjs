import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'dist');
const port = Number(process.env.PORT || 4173);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.task', 'application/octet-stream'],
  ['.map', 'application/json; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  try {
    const rawPath = decodeURIComponent((request.url || '/').split('?')[0] || '/');
    let filePath = path.join(root, rawPath === '/' ? 'index.html' : rawPath);
    if (!filePath.startsWith(root)) throw new Error('Invalid path');
    try {
      if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      filePath = path.join(root, 'index.html');
    }
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mime.get(path.extname(filePath)) || 'application/octet-stream',
      'Cache-Control': path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=86400',
      'Content-Length': String(content.length),
    });
    response.end(content);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Ciência em Movimento: http://localhost:${port}`);
});
