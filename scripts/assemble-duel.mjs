import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, 'src', 'experiences', 'gravitational-duel', 'GravitationalDuelExperience.ts');
const content = await readFile(target, 'utf8');
if (!content.includes('export class GravitationalDuelExperience')) {
  throw new Error('Fonte do Duelo Gravitacional inválida.');
}
console.log(`Duelo Gravitacional verificado: ${content.length} caracteres.`);
