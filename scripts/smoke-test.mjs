import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  ['dist/index.html', 300],
  ['dist/config.json', 300],
  ['dist/branding/aeas-mark.svg', 200],
  ['dist/branding/ciencia-viva-mark.svg', 200],
  ['dist/assets/main.js', 300],
  ['dist/assets/App.js', 5_000],
  ['dist/assets/styles.css', 3_000],
  ['dist/assets/experiences/orbit/OrbitExperience.js', 15_000],
  ['dist/assets/experiences/laser/LaserExperience.js', 8_000],
  ['dist/assets/experiences/molecules/MoleculeExperience.js', 10_000],
  ['dist/assets/experiences/waves/WavesExperience.js', 7_000],
  ['dist/assets/experiences/vector-maze/VectorMazeExperience.js', 10_000],
  ['dist/assets/experiences/gravitational-duel/GravitationalDuelExperience.js', 15_000],
  ['dist/assets/experiences/gravitational-duel/DuelPhysics.js', 1_500],
  ['dist/mediapipe/hands/hands.js', 40_000],
  ['dist/mediapipe/hands/hands.binarypb', 100],
  ['dist/mediapipe/hands/hand_landmark_full.tflite', 5_000_000],
  ['dist/mediapipe/hands/hands_solution_simd_wasm_bin.wasm', 5_000_000],
  ['dist/mediapipe/pose/pose.js', 40_000],
  ['dist/mediapipe/pose/pose_landmark_lite.tflite', 2_000_000],
  ['dist/mediapipe/pose/pose_solution_simd_wasm_bin.wasm', 5_000_000],
];

for (const [relative, minimumSize] of required) {
  const details = await stat(path.join(root, relative));
  if (details.size < minimumSize) throw new Error(`${relative}: tamanho inesperado (${details.size}).`);
}

const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
if (!html.includes('mediapipe/hands/hands.js')) throw new Error('index.html não carrega MediaPipe Hands.');
if (!html.includes('mediapipe/pose/pose.js')) throw new Error('index.html não carrega MediaPipe Pose.');
if (!html.includes('assets/main.js')) throw new Error('index.html não carrega o módulo principal.');
if (!html.includes('assets/styles.css')) throw new Error('index.html não carrega os estilos.');
if (!html.includes('Ciência em Movimento 3.0')) throw new Error('Título da versão 3.0 em falta.');

const config = JSON.parse(await readFile(path.join(root, 'dist', 'config.json'), 'utf8'));
if (!config.orbit || typeof config.orbit.gravityStrength !== 'number') throw new Error('Configuração orbital inválida.');
if (config.orbit.successObservationOrbits < 3) throw new Error('A observação orbital deve ter pelo menos três voltas.');
if (!config.menu || config.menu.dwellSeconds < 2.5) throw new Error('Tempo do menu demasiado curto.');
if (!config.molecules || config.molecules.successObservationSeconds < 6) throw new Error('Observação molecular demasiado curta.');
if (!config.laser || config.laser.quizDwellSeconds < 1) throw new Error('Configuração do questionário inválida.');
if (!config.waves || typeof config.waves.targetAmplitude !== 'number') throw new Error('Configuração das ondas inválida.');
if (!config.autonomous || config.autonomous.presenceRecentSeconds < 2) throw new Error('Modo autónomo inválido.');
if (!config.branding || (!config.branding.coordinator && !config.branding.developmentCredit)) throw new Error('Identificação institucional em falta.');
if (!config.vectorMaze || config.vectorMaze.massFactor < 1.5 || config.vectorMaze.maximumSpeedFraction > 0.5) throw new Error('Configuração do labirinto inválida.');
if (!config.leaderboard || config.leaderboard.nameLength !== 3) throw new Error('Configuração do Top global inválida.');
if (!config.gravitationalDuel || config.gravitationalDuel.shotsPerPlayer < 3 || config.gravitationalDuel.planetLives < 2) throw new Error('Configuração do duelo inválida.');
if (config.gravitationalDuel.captureRadiusMultiplier < 2 || !config.gravitationalDuel.showTrajectoryPreview) throw new Error('Captura ou previsão do duelo inválida.');

const assetsRoot = path.join(root, 'dist', 'assets');
const jsFiles = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else if (entry.name.endsWith('.js')) jsFiles.push(absolute);
  }
}
await collect(assetsRoot);
const importPattern = /(?:from\s+|import\s+)["'](\.{1,2}\/[^"']+)["']/g;
for (const file of jsFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    if (match[1].endsWith('.css')) continue;
    const target = path.resolve(path.dirname(file), match[1]);
    await stat(target).catch(() => { throw new Error(`Importação inexistente em ${path.relative(root, file)}: ${match[1]}`); });
  }
}

const registryModule = await import(pathToFileURL(path.join(assetsRoot, 'core', 'ExperienceRegistry.js')));
const experiencesModule = await import(pathToFileURL(path.join(assetsRoot, 'experiences', 'index.js')));
const registry = new registryModule.ExperienceRegistry();
experiencesModule.registerExperiences(registry);
const manifests = registry.list();
if (manifests.length !== 6) throw new Error(`Esperadas 6 experiências; encontradas ${manifests.length}.`);
const ids = manifests.map((manifest) => manifest.id);
for (const expected of ['coloca-planeta-em-orbita', 'laboratorio-de-lasers', 'constroi-uma-molecula', 'domina-as-ondas', 'labirinto-vetorial', 'duelo-gravitacional']) {
  if (!ids.includes(expected)) throw new Error(`Experiência em falta: ${expected}`);
}

const gradient = { addColorStop() {} };
const context2d = new Proxy({
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
  measureText: (text) => ({ width: String(text).length * 9 }),
}, {
  get(target, property) {
    if (property in target) return target[property];
    return () => undefined;
  },
  set(target, property, value) { target[property] = value; return true; },
});
const silentAudio = { tone() {}, success() {}, failure() {}, launch() {}, speak() {} };
const emptyInput = {
  present: false,
  cursor: { x: 0.5, y: 0.5 },
  rawCursor: { x: 0.5, y: 0.5 },
  velocity: { x: 0, y: 0 },
  landmarks: [],
  pinch: false,
  pinchStarted: false,
  pinchEnded: false,
  pinchRatio: 1,
  confidence: 0,
  timestampMs: 0,
};
for (const id of ids) {
  const experience = registry.create(id);
  experience.mount({
    canvas: {},
    ctx: context2d,
    config,
    audio: silentAudio,
    scores: {},
    getViewport: () => ({ width: 1600, height: 900, dpr: 1 }),
    complete() {},
    requestRestart() {},
  });
  experience.resize({ width: 1600, height: 900, dpr: 1 });
  experience.start();
  experience.update(0.016, emptyInput);
  experience.render();
  experience.dispose();
}

const wavesSource = await readFile(path.join(root, 'src', 'experiences', 'waves', 'WavesExperience.ts'), 'utf8');
for (const colour of ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'anil', 'violeta']) {
  if (!wavesSource.includes(`name: '${colour}'`)) throw new Error(`Cor em falta no espetro: ${colour}`);
}
const moleculeSource = await readFile(path.join(root, 'src', 'experiences', 'molecules', 'MoleculeExperience.ts'), 'utf8');
if (!moleculeSource.includes("name: 'Metano'") || !moleculeSource.includes("formula: 'CH₄'")) throw new Error('Metano não encontrado.');
const appSource = await readFile(path.join(root, 'src', 'App.ts'), 'utf8');
if (!appSource.includes('visitor-invite') || !appSource.includes('pedagogical-highlight')) throw new Error('Modo autónomo ou destaque pedagógico em falta.');
if (!appSource.includes("figure.source === 'pose'") || !appSource.includes('setPoseEnabled(true)')) throw new Error('Avatar corporal com pose em falta.');
const duelSource = await readFile(path.join(root, 'src', 'experiences', 'gravitational-duel', 'GravitationalDuelExperience.ts'), 'utf8');
for (const concept of ['velocidade', 'aceleração', 'força resultante', 'Captura orbital', 'difficultyRects', 'spawnShuttleExplosion']) {
  if (!duelSource.includes(concept)) throw new Error(`Conceito em falta no duelo: ${concept}`);
}

console.log('Smoke test concluído: 6 experiências, Pose local, avatar corporal, dificuldades e nave-cronómetro validados.');
