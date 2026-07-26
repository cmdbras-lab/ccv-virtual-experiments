import { readFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  ['dist/index.html', 300],
  ['dist/config.json', 300],
  ['dist/branding/logo-aeas.png', 50_000],
  ['dist/branding/barra-prr-2024.png', 40_000],
  ['dist/branding/logo-clubes-ciencia-viva.png', 20_000],
  ['dist/assets/main.js', 300],
  ['dist/assets/App.js', 5_000],
  ['dist/assets/styles.css', 3_000],
  ['dist/assets/experiences/orbit/OrbitExperience.js', 15_000],
  ['dist/assets/experiences/laser/LaserExperience.js', 8_000],
  ['dist/assets/experiences/molecules/MoleculeExperience.js', 10_000],
  ['dist/assets/experiences/waves/WavesExperience.js', 7_000],
  ['dist/assets/experiences/vector-maze/VectorMazeExperience.js', 10_000],
  ['dist/mediapipe/hands/hands.js', 40_000],
  ['dist/mediapipe/hands/hands.binarypb', 100],
  ['dist/mediapipe/hands/hand_landmark_full.tflite', 5_000_000],
  ['dist/mediapipe/hands/hands_solution_simd_wasm_bin.wasm', 5_000_000],
];

for (const [relative, minimumSize] of required) {
  const details = await stat(path.join(root, relative));
  if (details.size < minimumSize) throw new Error(`${relative}: tamanho inesperado (${details.size}).`);
}

const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
if (!html.includes('mediapipe/hands/hands.js')) throw new Error('index.html não carrega MediaPipe Hands.');
if (!html.includes('assets/main.js')) throw new Error('index.html não carrega o módulo principal.');
if (!html.includes('assets/styles.css')) throw new Error('index.html não carrega os estilos.');
if (!html.includes('id="cem-config"') || !html.includes('Ciência em Movimento 2.4.1')) throw new Error('Configuração incorporada ou versão 2.4.1 em falta no HTML.');

const config = JSON.parse(await readFile(path.join(root, 'dist', 'config.json'), 'utf8'));
if (!config.orbit || typeof config.orbit.gravityStrength !== 'number') throw new Error('Configuração orbital inválida.');
if (config.orbit.successObservationOrbits < 3) throw new Error('A observação orbital deve ter pelo menos três voltas.');
if (!config.menu || config.menu.dwellSeconds < 2.5) throw new Error('Tempo do menu demasiado curto.');
if (!config.molecules || config.molecules.successObservationSeconds < 6) throw new Error('Observação molecular demasiado curta.');
if (!config.laser || config.laser.quizDwellSeconds < 1) throw new Error('Configuração do questionário inválida.');
if (!config.waves || typeof config.waves.targetAmplitude !== 'number') throw new Error('Configuração das ondas inválida.');
if (!config.autonomous || config.autonomous.presenceRecentSeconds < 2) throw new Error('Modo autónomo inválido.');
if (!config.branding || !config.branding.developmentCredit || !config.branding.fundingMark) throw new Error('Identificação institucional em falta.');
if (config.branding.developmentCredit !== 'Desenvolvido com recurso a IA pelo coordenador CCV Abel Salazar - prof. Carlos Brás.') throw new Error('Crédito institucional incorreto.');
for (const [key, filename] of [['schoolMark', 'logo-aeas.png'], ['fundingMark', 'barra-prr-2024.png'], ['scienceMark', 'logo-clubes-ciencia-viva.png']]) {
  const uri = config.branding[key];
  if (typeof uri !== 'string' || !uri.startsWith('data:image/png;base64,')) throw new Error(`O logótipo ${key} não está incorporado na distribuição.`);
  const embedded = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
  const original = await readFile(path.join(root, 'public', 'branding', filename));
  const distributed = await readFile(path.join(root, 'dist', 'branding', filename));
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  if (digest(embedded) !== digest(original) || digest(distributed) !== digest(original)) throw new Error(`O logótipo ${filename} não corresponde ao original fornecido.`);
  if (embedded.readUInt32BE(16) < 300 || embedded.readUInt32BE(20) < 90) throw new Error(`Dimensões PNG inválidas em ${filename}.`);
}
if (!config.vectorMaze || config.vectorMaze.massFactor < 1.5 || config.vectorMaze.maximumSpeedFraction > 0.5) throw new Error('Configuração do labirinto inválida.');
if (config.vectorMaze.maximumSeconds < 120) throw new Error('O labirinto deve disponibilizar pelo menos 120 segundos.');
if (config.vectorMaze.collisionPenaltyPoints < 10) throw new Error('Penalização de colisão demasiado baixa.');
if (!config.leaderboard || config.leaderboard.nameLength !== 3) throw new Error('Configuração do Top global inválida.');

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
if (manifests.length !== 5) throw new Error(`Esperadas 5 experiências; encontradas ${manifests.length}.`);
const ids = manifests.map((manifest) => manifest.id);
for (const expected of ['coloca-planeta-em-orbita', 'laboratorio-de-lasers', 'constroi-uma-molecula', 'domina-as-ondas', 'labirinto-vetorial']) {
  if (!ids.includes(expected)) throw new Error(`Experiência em falta: ${expected}`);
}

const appModule = await import(pathToFileURL(path.join(assetsRoot, 'App.js')));
const titleDraws = [];
let currentFont = '10px system-ui';
const menuContext = new Proxy({
  measureText(text) {
    const size = Number(/([0-9.]+)px/.exec(currentFont)?.[1] ?? 10);
    return { width: String(text).length * size * 0.56 };
  },
  fillText(text, x, y, maxWidth) {
    titleDraws.push({ text: String(text), x, y, maxWidth, font: currentFont });
  },
  createLinearGradient: () => gradient,
  createRadialGradient: () => gradient,
}, {
  get(target, property) {
    if (property === 'font') return currentFont;
    if (property in target) return target[property];
    return () => undefined;
  },
  set(target, property, value) {
    if (property === 'font') currentFont = String(value);
    else target[property] = value;
    return true;
  },
});
const appForLayout = Object.create(appModule.App.prototype);
appForLayout.runner = { ctx: menuContext };
appForLayout.config = config;
appForLayout.menuHoverStartedAt = 0;
const width1366 = 1366;
const height768 = 768;
const areaX = width1366 * 0.035;
const areaY = height768 * 0.225;
const areaWidth = width1366 * 0.68;
const areaHeight = height768 * 0.615;
const gapX = width1366 * 0.014;
const gapY = height768 * 0.03;
const cardWidth = (areaWidth - gapX * 2) / 3;
const cardHeight = (areaHeight - gapY) / 2;
for (const [index, manifest] of manifests.entries()) {
  titleDraws.length = 0;
  const rect = {
    x: areaX + (index % 3) * (cardWidth + gapX),
    y: areaY + Math.floor(index / 3) * (cardHeight + gapY),
    width: cardWidth,
    height: cardHeight,
  };
  appForLayout.drawMenuCard(manifest, rect, false, 0);
  const titleCalls = titleDraws.filter((call) => /^800\s+[0-9.]+px/.test(call.font));
  const subtitleCalls = titleDraws.filter((call) => /^500\s+[0-9.]+px/.test(call.font));
  const textCalls = [...titleCalls, ...subtitleCalls];
  if (titleCalls.length < 1 || subtitleCalls.length < 1) throw new Error(`Título ou subtítulo não desenhado em ${manifest.id}.`);
  if (titleCalls.map((call) => call.text).join(' ') !== manifest.title) throw new Error(`Título truncado ou alterado em ${manifest.id}.`);
  if (subtitleCalls.map((call) => call.text).join(' ') !== manifest.subtitle) throw new Error(`Subtítulo truncado ou alterado em ${manifest.id}.`);
  const titleBottom = Math.max(...titleCalls.map((call) => call.y + Number(/([0-9.]+)px/.exec(call.font)?.[1] ?? 0) * 1.05));
  const subtitleTop = Math.min(...subtitleCalls.map((call) => call.y));
  if (titleBottom > subtitleTop) throw new Error(`Título sobreposto ao subtítulo em ${manifest.id}.`);
  for (const call of textCalls) {
    const fontSize = Number(/([0-9.]+)px/.exec(call.font)?.[1] ?? 0);
    if (call.x < rect.x || call.x > rect.x + rect.width) throw new Error(`Texto fora horizontalmente do cartão ${manifest.id}.`);
    if (call.y < rect.y || call.y + fontSize * 1.2 > rect.y + rect.height * 0.88) throw new Error(`Texto fora verticalmente do cartão ${manifest.id}.`);
    if (typeof call.maxWidth !== 'number' || call.maxWidth > rect.width * 0.87) throw new Error(`Limite horizontal ausente no cartão ${manifest.id}.`);
  }
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
for (const viewport of [{ width: 1366, height: 768, dpr: 1 }, { width: 1600, height: 900, dpr: 1 }]) {
  for (const id of ids) {
    const experience = registry.create(id);
    experience.mount({
      canvas: {},
      ctx: context2d,
      config,
      audio: silentAudio,
      scores: {},
      getViewport: () => viewport,
      complete() {},
      requestRestart() {},
    });
    experience.resize(viewport);
    experience.start();
    experience.update(0.016, emptyInput);
    experience.render();
    experience.dispose();
  }
}

const wavesSource = await readFile(path.join(root, 'src', 'experiences', 'waves', 'WavesExperience.ts'), 'utf8');
for (const colour of ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'anil', 'violeta']) {
  if (!wavesSource.includes(`name: '${colour}'`)) throw new Error(`Cor em falta no espetro: ${colour}`);
}
const moleculeSource = await readFile(path.join(root, 'src', 'experiences', 'molecules', 'MoleculeExperience.ts'), 'utf8');
if (!moleculeSource.includes("name: 'Metano'") || !moleculeSource.includes("formula: 'CH₄'")) throw new Error('Metano não encontrado.');
const appSource = await readFile(path.join(root, 'src', 'App.ts'), 'utf8');
if (!appSource.includes('visitor-invite') || !appSource.includes('pedagogical-highlight')) throw new Error('Modo autónomo ou destaque pedagógico em falta.');
if (!appSource.includes('drawTextBlockInRect') || !appSource.includes('ctx.clip()') || !appSource.includes('ctx.fillText(line, rect.x, rect.y + index * lineHeight, rect.width)')) throw new Error('Ajuste e recorte rigoroso dos títulos do menu em falta.');
if (!appSource.includes('Desloca a mão suavemente') || !appSource.includes('Cada colisão com uma parede retira pontos.')) throw new Error('Instruções do labirinto incompletas.');
if (appSource.includes(['produz', 'um', 'som'].join(' ')) || appSource.includes(['emite', 'som'].join(' '))) throw new Error('A locução do labirinto ainda anuncia o som de colisão.');
const mazeSource = await readFile(path.join(root, 'src', 'experiences', 'vector-maze', 'VectorMazeExperience.ts'), 'utf8');
if (!mazeSource.includes('CRONÓMETRO') || !mazeSource.includes('COLISÃO! −') || !mazeSource.includes('collisionPenaltyPoints')) throw new Error('Cronómetro ou feedback de colisão em falta.');
const stylesSource = await readFile(path.join(root, 'src', 'styles.css'), 'utf8');
if (!stylesSource.includes('max-height: 800px') || !stylesSource.includes('1366 × 768')) throw new Error('Layout compacto 1366 × 768 em falta.');

console.log('Smoke test 2.4.1 concluído: 5 experiências renderizadas; cartões verificados a 1366×768; logótipos incorporados e comparados com os originais; créditos, locução, instalador, cronómetro, colisões, modelos e importações validados.');
