import './styles.css';
import { App } from './App.js';
import type { AppConfig } from './core/types.js';

async function loadConfig(): Promise<AppConfig> {
  const response = await fetch(new URL('config.json?v=3.0.6.1', document.baseURI), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Não foi possível carregar config.json (${response.status}).`);
  return response.json() as Promise<AppConfig>;
}

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Elemento #app não encontrado.');
  const config = await loadConfig();
  new App(root, config);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.innerHTML = `<main class="fatal-error"><h1>Erro ao iniciar</h1><p>${message}</p></main>`;
});
