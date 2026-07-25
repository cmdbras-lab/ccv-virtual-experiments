import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const port = process.env.PORT || '4173';
const url = `http://localhost:${port}`;
const serverScript = fileURLToPath(new URL('./static-server.mjs', import.meta.url));
const server = spawn(process.execPath, [serverScript], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port },
});

function openKiosk() {
  const platform = os.platform();
  if (platform === 'win32') {
    const candidates = [
      process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
      process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ].filter(Boolean);
    const browser = candidates.find((candidate) => candidate && existsSync(candidate));
    if (browser) {
      spawn(browser, ['--kiosk', '--autoplay-policy=no-user-gesture-required', url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    }
  } else if (platform === 'darwin') {
    spawn('open', ['-a', 'Google Chrome', '--args', '--kiosk', url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('sh', ['-c', `google-chrome --kiosk '${url}' || chromium --kiosk '${url}' || xdg-open '${url}'`], { detached: true, stdio: 'ignore' }).unref();
  }
}

setTimeout(openKiosk, 1100);
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
