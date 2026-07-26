import './styles.css';
import { App } from './App.js';
import type { AppConfig } from './core/types.js';

function normalizeAssetUrl(value: string): string {
  if (/^(?:data:|blob:|https?:)/i.test(value)) return value;
  return new URL(value.replace(/^\/+/, ''), document.baseURI).toString();
}

function normalizeBranding(config: AppConfig): AppConfig {
  config.branding.schoolMark = normalizeAssetUrl(config.branding.schoolMark);
  config.branding.fundingMark = normalizeAssetUrl(config.branding.fundingMark);
  config.branding.scienceMark = normalizeAssetUrl(config.branding.scienceMark);
  return config;
}

async function loadImage(url: string, label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve();
      else reject(new Error(`O logótipo ${label} não tem dimensões válidas.`));
    };
    image.onerror = () => reject(new Error(`Não foi possível carregar o logótipo ${label}.`));
    image.src = url;
  });
}

async function preloadBranding(config: AppConfig): Promise<void> {
  await Promise.all([
    loadImage(config.branding.schoolMark, 'do Agrupamento de Escolas Abel Salazar'),
    loadImage(config.branding.fundingMark, 'PRR / República Portuguesa / União Europeia'),
    loadImage(config.branding.scienceMark, 'Clubes Ciência Viva na Escola'),
  ]);
}

async function loadConfig(): Promise<AppConfig> {
  const embedded = document.querySelector<HTMLScriptElement>('#cem-config');
  if (embedded?.textContent?.trim()) {
    return normalizeBranding(JSON.parse(embedded.textContent) as AppConfig);
  }
  const response = await fetch(new URL('config.json', document.baseURI));
  if (!response.ok) throw new Error(`Não foi possível carregar config.json (${response.status}).`);
  return normalizeBranding(await response.json() as AppConfig);
}

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Elemento #app não encontrado.');
  const config = await loadConfig();
  await preloadBranding(config);
  new App(root, config);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.innerHTML = `<main class="fatal-error"><h1>Erro ao iniciar</h1><p>${message}</p></main>`;
});
