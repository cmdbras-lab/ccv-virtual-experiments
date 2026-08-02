import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
const tsc = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');

execFileSync(process.execPath, [path.join(root, 'scripts', 'assemble-duel.mjs')], { cwd: root, stdio: 'inherit' });
await rm(dist, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
execFileSync(tsc, ['--project', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });

const mainPath = path.join(assets, 'main.js');
const main = (await readFile(mainPath, 'utf8')).replace(/^import ['"]\.\/styles\.css['"];\r?\n/, '');
await writeFile(mainPath, main);
await cp(path.join(root, 'src', 'styles.css'), path.join(assets, 'styles.css'));
await cp(path.join(root, 'public'), dist, { recursive: true });
await writeFile(path.join(dist, 'index.html'), `<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#050816" />
    <title>Ciência em Movimento 3.0.6</title>
    <link rel="stylesheet" href="./assets/styles.css" />
    <script type="module" src="./assets/main.js"></script>
  </head>
  <body>
    <main id="app" aria-live="polite"></main>
    <script src="./mediapipe/pose/pose.js"></script>
    <script src="./mediapipe/hands/hands.js"></script>
  </body>
</html>
`);
console.log('Distribuição 3.0.6 criada em dist/.');
