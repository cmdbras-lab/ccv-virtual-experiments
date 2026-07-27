import { access, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'dist/index.html',
  'dist/config.json',
  'dist/assets/main.js',
  'dist/assets/App.js',
  'dist/assets/styles.css',
  'dist/branding/logo-aeas.png',
  'dist/branding/barra-prr-2024.png',
  'dist/branding/logo-clubes-ciencia-viva.png',
  'dist/mediapipe/hands/hands.js',
  'dist/mediapipe/hands/hand_landmark_full.tflite',
];

const branding = [
  ['schoolMark', 'logo-aeas.png'],
  ['fundingMark', 'barra-prr-2024.png'],
  ['scienceMark', 'logo-clubes-ciencia-viva.png'],
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

try {
  for (const relative of required) {
    const absolute = path.join(root, relative);
    await access(absolute);
    const details = await stat(absolute);
    if (!details.isFile() || details.size === 0) throw new Error(`${relative} está vazio ou não é um ficheiro.`);
  }
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  if (!html.includes('id="cem-config"') || !html.includes('Ciência em Movimento 2.4.1')) {
    throw new Error('O HTML não contém a configuração incorporada da versão 2.4.1.');
  }
  const config = JSON.parse(await readFile(path.join(root, 'dist/config.json'), 'utf8'));
  if (config.branding?.developmentCredit !== 'Desenvolvido com recurso a IA pelo coordenador CCV Abel Salazar - prof. Carlos Brás.') {
    throw new Error('O crédito institucional está incorreto.');
  }
  for (const [key, filename] of branding) {
    const uri = config.branding?.[key];
    if (typeof uri !== 'string' || !uri.startsWith('data:image/png;base64,')) {
      throw new Error(`O logótipo ${filename} não está incorporado na distribuição.`);
    }
    const embedded = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
    const original = await readFile(path.join(root, 'dist/branding', filename));
    if (digest(embedded) !== digest(original)) throw new Error(`O logótipo incorporado ${filename} não corresponde ao ficheiro original.`);
  }
  const app = await readFile(path.join(root, 'dist/assets/App.js'), 'utf8');
  if (app.includes(['produz', 'um', 'som'].join(' ')) || app.includes(['emite', 'som'].join(' '))) throw new Error('A locução ainda refere a emissão de som na colisão.');
  if (!app.includes('drawTextBlockInRect') || !app.includes('fillText(line, rect.x, rect.y + index * lineHeight, rect.width)')) {
    throw new Error('A contenção dos títulos dentro dos cartões não está presente.');
  }
  console.log('Verificação concluída: a versão executável 2.4.1 está íntegra e pronta.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERRO DE INSTALAÇÃO: ${message}`);
  process.exitCode = 1;
}
