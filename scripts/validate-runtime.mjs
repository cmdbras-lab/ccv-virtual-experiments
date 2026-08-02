import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'dist/index.html',
  'dist/config.json',
  'dist/assets/main.js',
  'dist/assets/App.js',
  'dist/assets/experiences/gravitational-duel/GravitationalDuelExperience.js',
  'dist/assets/experiences/gravitational-duel/DuelPhysics.js',
  'dist/mediapipe/hands/hands.js',
  'dist/mediapipe/hands/hand_landmark_full.tflite',
  'dist/mediapipe/hands/hands_solution_simd_wasm_bin.wasm',
];

for (const relative of required) await stat(path.join(root, relative));
const config = JSON.parse(await readFile(path.join(root, 'dist', 'config.json'), 'utf8'));
if (!config.gravitationalDuel || config.gravitationalDuel.shotsPerPlayer < 3) {
  throw new Error('Configuração do Duelo Gravitacional em falta ou inválida.');
}
const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
if (!html.includes('Ciência em Movimento 3.0')) throw new Error('Versão 3.0 não identificada no executável.');
console.log('Validação local concluída: executável 3.0 e Duelo Gravitacional disponíveis.');
