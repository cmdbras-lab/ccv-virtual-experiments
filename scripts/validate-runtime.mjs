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
  'dist/mediapipe/pose/pose.js',
  'dist/mediapipe/pose/pose_landmark_lite.tflite',
  'dist/mediapipe/pose/pose_solution_simd_wasm_bin.wasm',
];

for (const relative of required) await stat(path.join(root, relative));
const config = JSON.parse(await readFile(path.join(root, 'dist', 'config.json'), 'utf8'));
if (!config.gravitationalDuel || config.gravitationalDuel.shotsPerPlayer < 3) {
  throw new Error('Configuração do Duelo Gravitacional em falta ou inválida.');
}
const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
if (!html.includes('Ciência em Movimento 3.0.6')) throw new Error('Versão 3.0.6 não identificada no executável.');
if (!html.includes('mediapipe/pose/pose.js')) throw new Error('MediaPipe Pose não está incluído no executável.');
console.log('Validação local concluída: v3.0.6, Pose offline e Duelo Gravitacional disponíveis.');
