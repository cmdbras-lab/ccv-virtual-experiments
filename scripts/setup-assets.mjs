import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'node_modules', '@mediapipe', 'hands');
const target = path.join(root, 'public', 'mediapipe', 'hands');
const allowedExtensions = new Set(['.binarypb', '.data', '.js', '.tflite', '.wasm']);

await mkdir(target, { recursive: true });
const files = await readdir(source);
for (const file of files) {
  const sourceFile = path.join(source, file);
  if (!(await stat(sourceFile)).isFile()) continue;
  if (!allowedExtensions.has(path.extname(file))) continue;
  await copyFile(sourceFile, path.join(target, file));
}
console.log('Recursos locais do MediaPipe Hands preparados.');
