import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const allowedExtensions = new Set(['.binarypb', '.data', '.js', '.tflite', '.wasm']);

for (const solution of ['hands', 'pose']) {
  const source = path.join(root, 'node_modules', '@mediapipe', solution);
  const target = path.join(root, 'public', 'mediapipe', solution);
  await mkdir(target, { recursive: true });
  const files = await readdir(source);
  for (const file of files) {
    const sourceFile = path.join(source, file);
    if (!(await stat(sourceFile)).isFile()) continue;
    if (!allowedExtensions.has(path.extname(file))) continue;
    await copyFile(sourceFile, path.join(target, file));
  }
}
console.log('Recursos locais do MediaPipe Hands e Pose preparados.');
