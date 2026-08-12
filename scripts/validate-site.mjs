import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const site = path.join(root, 'site');

const requiredFiles = [
  'index.html',
  'portfolio.css',
  'ciencia-em-movimento/index.html',
  'ciencia-em-movimento/screenshots/01-orbita.webp',
  'ciencia-em-movimento/screenshots/02-reflexao-luz.webp',
  'ciencia-em-movimento/screenshots/03-moleculas.webp',
  'ciencia-em-movimento/screenshots/04-ondas-espetro.webp',
  'ciencia-em-movimento/screenshots/05-labirinto-vetorial.webp',
  'ciencia-em-movimento/screenshots/06-duelo-gravitacional.webp',
  'duelo-mbot2/index.html',
  'duelo-mbot2/duelo.css',
  'duelo-mbot2/screenshots/ecra-publico.webp',
  'duelo-mbot2/screenshots/ecra-equipa-live.webp',
  'duelo-mbot2/screenshots/planta-pista.webp',
  'esfera-vetorial/index.html',
  'laboratorio-no2-n2o4/index.html',
  'laboratorio-no2-n2o4/app/index.html',
];

const exists = async (file) => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

for (const relative of requiredFiles) {
  if (!(await exists(path.join(site, relative)))) {
    throw new Error(`Ficheiro obrigatório da publicação em falta: site/${relative}`);
  }
}

const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
};

const htmlFiles = (await walk(site)).filter((file) => file.endsWith('.html'));
const broken = [];

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, 'utf8');
  const attributes = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1]);

  for (const rawReference of attributes) {
    if (/^(?:https?:|data:|mailto:|tel:|javascript:|#)/i.test(rawReference)) continue;

    const reference = rawReference.split('#')[0].split('?')[0];
    if (!reference) continue;

    const base = reference.startsWith('/') ? site : path.dirname(htmlFile);
    const candidate = path.resolve(base, reference.replace(/^\//, ''));
    const target = reference.endsWith('/') ? path.join(candidate, 'index.html') : candidate;
    if (!(await exists(target))) {
      broken.push(`${path.relative(site, htmlFile)} -> ${rawReference}`);
    }
  }

  for (const image of html.matchAll(/<img\b([^>]*)>/gi)) {
    if (!/\balt=["'][^"']*["']/i.test(image[1])) {
      broken.push(`${path.relative(site, htmlFile)} -> imagem sem texto alternativo`);
    }
  }
}

if (broken.length) {
  throw new Error(`Ligações ou recursos inválidos:\n${broken.join('\n')}`);
}

const menu = await readFile(path.join(site, 'index.html'), 'utf8');
for (const route of ['duelo-mbot2/', 'ciencia-em-movimento/', 'esfera-vetorial/', 'laboratorio-no2-n2o4/']) {
  if (!menu.includes(`href="${route}"`)) throw new Error(`A página-menu não liga a ${route}`);
}
if ((menu.match(/class="project-card/g) || []).length !== 4) {
  throw new Error('A página-menu deve apresentar exatamente quatro atividades.');
}

const duel = await readFile(path.join(site, 'duelo-mbot2', 'index.html'), 'utf8');
for (const requiredText of ['Professor Carlos Brás', 'Programação', 'Live', 'Misto', 'não é disponibilizado para download direto']) {
  if (!duel.includes(requiredText)) throw new Error(`A página Duelo mBot2 não contém: ${requiredText}`);
}
if (/href=["'][^"']*(?:\.zip|\.apk|\/releases\/|ccv-mbot-duelo)/i.test(duel)) {
  throw new Error('A página Duelo mBot2 não pode disponibilizar software ou ligar ao repositório da aplicação.');
}

const movement = await readFile(path.join(site, 'ciencia-em-movimento', 'index.html'), 'utf8');
if ((movement.match(/class="experience-card/g) || []).length !== 6) {
  throw new Error('A página Ciência em Movimento deve apresentar exatamente seis experiências.');
}
for (const screenshot of [
  '01-orbita.webp',
  '02-reflexao-luz.webp',
  '03-moleculas.webp',
  '04-ondas-espetro.webp',
  '05-labirinto-vetorial.webp',
  '06-duelo-gravitacional.webp',
]) {
  if (!movement.includes(`screenshots/${screenshot}`)) {
    throw new Error(`A página Ciência em Movimento não apresenta a captura ${screenshot}.`);
  }
}
if (!movement.includes('id="gallery-dialog"')) {
  throw new Error('A página Ciência em Movimento deve permitir ampliar as capturas.');
}

console.log(`Site validado: ${htmlFiles.length} páginas HTML, quatro atividades e nenhuma ligação local partida.`);
