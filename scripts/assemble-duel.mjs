import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const duelRoot = path.join(root, 'src', 'experiences', 'gravitational-duel');
const partsRoot = path.join(duelRoot, 'parts');
const target = path.join(duelRoot, 'GravitationalDuelExperience.ts');

await mkdir(duelRoot, { recursive: true });
const names = (await readdir(partsRoot)).filter((name) => name.endsWith('.part')).sort();
if (names.length === 0) throw new Error('Partes do Duelo Gravitacional não encontradas.');
const content = (await Promise.all(names.map((name) => readFile(path.join(partsRoot, name), 'utf8')))).join('');
if (!content.includes('export class GravitationalDuelExperience')) throw new Error('Fonte recomposta do duelo é inválida.');
await writeFile(target, content);
console.log(`Duelo Gravitacional recomposto: ${names.length} partes, ${content.length} caracteres.`);
