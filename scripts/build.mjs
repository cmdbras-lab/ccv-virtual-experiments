import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
const tsc = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');

await rm(dist, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
execFileSync(tsc, ['--project', 'tsconfig.build.json'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const mainPath = path.join(assets, 'main.js');
const main = (await readFile(mainPath, 'utf8')).replace(/^import ['"]\.\/styles\.css['"];\r?\n/, '');
await writeFile(mainPath, main);
await cp(path.join(root, 'src', 'styles.css'), path.join(assets, 'styles.css'));
await cp(path.join(root, 'public'), dist, { recursive: true });

const publicConfigPath = path.join(root, 'public', 'config.json');
const compiledConfig = JSON.parse(await readFile(publicConfigPath, 'utf8'));
const brandingKeys = ['schoolMark', 'fundingMark', 'scienceMark'];
for (const key of brandingKeys) {
  const relativePath = compiledConfig.branding?.[key];
  if (typeof relativePath !== 'string' || !relativePath) throw new Error(`Configuração do logótipo ${key} em falta.`);
  const logoPath = path.join(root, 'public', relativePath);
  const bytes = await readFile(logoPath);
  compiledConfig.branding[key] = `data:image/png;base64,${bytes.toString('base64')}`;
}
const compiledConfigJson = JSON.stringify(compiledConfig);
await writeFile(path.join(dist, 'config.json'), `${JSON.stringify(compiledConfig, null, 2)}\n`);
const embeddedConfig = compiledConfigJson.replace(/<\//g, '<\\/');

await writeFile(path.join(dist, 'index.html'), `<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#050816" />
    <title>Ciência em Movimento 2.4.1</title>
    <link rel="stylesheet" href="./assets/styles.css" />
    <script id="cem-config" type="application/json">${embeddedConfig}</script>
    <script type="module" src="./assets/main.js"></script>
  </head>
  <body>
    <main id="app" aria-live="polite"></main>
    <script src="./mediapipe/hands/hands.js"></script>
  </body>
</html>
`);
console.log('Distribuição 2.4.1 criada em dist/.');
