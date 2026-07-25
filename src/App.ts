import { AudioEngine } from './core/AudioEngine.js';
import type { ExperienceManifest, Viewport } from './core/Experience.js';
import { ExperienceRegistry } from './core/ExperienceRegistry.js';
import { ExperienceRunner } from './core/ExperienceRunner.js';
import { drawDwellRing, drawHandSkeleton, pointInRect, roundedRect, toPixels } from './core/GestureGraphics.js';
import { HandTracker } from './core/HandTracker.js';
import type { ScoreEntry } from './core/ScoreStore.js';
import type { AppConfig, ExperienceResult, HandInput, Vec2 } from './core/types.js';
import { registerExperiences } from './experiences/index.js';

type AppState = 'permission' | 'loading' | 'menu' | 'playing' | 'result' | 'name-entry' | 'leaderboard' | 'error';
type Rect = { x: number; y: number; width: number; height: number };
type NameKey = { value: string; label: string; rect: Rect };

export class App {
  private readonly registry = new ExperienceRegistry();
  private readonly runner: ExperienceRunner;
  private readonly tracker: HandTracker;
  private readonly shell = document.createElement('section');
  private readonly overlay = document.createElement('div');
  private state: AppState = 'permission';
  private currentExperienceId = 'coloca-planeta-em-orbita';
  private previousFrame = performance.now();
  private lastHandSeenAt = performance.now();
  private frameId = 0;
  private result: ExperienceResult | null = null;
  private resultShownAt = 0;
  private pendingQualifyingScore = false;
  private menuHoverId: string | null = null;
  private menuHoverStartedAt = 0;
  private menuHoverLocked = false;
  private menuOpenedAt = 0;
  private menuHoverAnchor: Vec2 | null = null;
  private initials = '';
  private nameEntryStartedAt = 0;
  private nameHoverValue: string | null = null;
  private nameHoverStartedAt = 0;
  private nameHoverLocked = false;
  private savedEntry: ScoreEntry | null = null;
  private leaderboardShownAt = 0;
  private visitorPresent = false;
  private greetingUntil = 0;
  private lastGreetingAt = -Number.POSITIVE_INFINITY;
  private inviteMode = '';

  constructor(private readonly root: HTMLElement, private readonly config: AppConfig) {
    registerExperiences(this.registry);
    this.runner = new ExperienceRunner(config);
    this.tracker = new HandTracker({ mirrored: config.cameraMirrored, detectionFps: config.handDetectionFps });
    this.runner.audio.setSpeechEnabled(config.autonomous.voiceEnabled);

    this.shell.className = 'installation-shell';
    this.overlay.className = 'app-overlay';
    this.shell.append(this.runner.canvas, this.overlay);
    this.root.replaceChildren(this.shell);

    this.runner.onComplete = (result) => this.showResult(result);
    this.runner.onRestartRequested = () => this.startExperience(this.currentExperienceId);
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    this.resize();
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      this.tracker.startMouseSimulation();
      this.showMenu();
    } else if (this.config.autonomous.autoStartCamera) {
      void this.enableCamera(true);
    } else {
      this.renderPermission();
    }
    this.loop();
  }

  private renderPermission(): void {
    this.state = 'permission';
    this.overlay.innerHTML = `
      <div class="permission-card">
        ${this.brandMarksHtml()}
        <div class="brand">${this.escape(this.config.schoolName)}</div>
        <div class="planet-mark">🔬</div>
        <h1>${this.escape(this.config.installationTitle)}</h1>
        <h2>Experiências científicas controladas por gestos</h2>
        <p>A câmara deteta apenas a posição da mão. Não são gravadas imagens nem som.</p>
        <button id="enable-camera" class="primary-button">Ativar experiências</button>
        <button id="fullscreen" class="secondary-button">Ecrã inteiro</button>
        <button id="demo-mode" class="secondary-button">Testar com o rato</button>
        <p class="small-note">Na primeira utilização, autoriza a câmara no navegador.</p>
      </div>
      ${this.brandingFooterHtml()}
    `;
    this.overlay.querySelector<HTMLButtonElement>('#enable-camera')?.addEventListener('click', () => void this.enableCamera());
    this.overlay.querySelector<HTMLButtonElement>('#fullscreen')?.addEventListener('click', () => void document.documentElement.requestFullscreen());
    this.overlay.querySelector<HTMLButtonElement>('#demo-mode')?.addEventListener('click', () => {
      this.tracker.startMouseSimulation();
      this.showMenu();
    });
  }

  private async enableCamera(automatic = false): Promise<void> {
    this.state = 'loading';
    this.overlay.innerHTML = `<div class="status-card"><div class="spinner"></div><h2>A preparar as experiências…</h2><p>A iniciar a câmara e a deteção local da mão.</p></div>${this.brandingFooterHtml()}`;
    try {
      await this.tracker.startCamera();
      this.showMenu();
    } catch (error) {
      if (automatic) {
        this.renderPermission();
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.state = 'error';
      this.overlay.innerHTML = `
        <div class="permission-card error-card">
          <h1>Não foi possível iniciar a câmara</h1>
          <p>${this.escape(message)}</p>
          <p>Confirma a autorização da câmara e verifica se outra aplicação a está a utilizar.</p>
          <button id="retry" class="primary-button">Tentar novamente</button>
        </div>
        ${this.brandingFooterHtml()}`;
      this.overlay.querySelector<HTMLButtonElement>('#retry')?.addEventListener('click', () => this.renderPermission());
    }
  }

  private showMenu(): void {
    this.state = 'menu';
    this.result = null;
    this.pendingQualifyingScore = false;
    this.savedEntry = null;
    this.menuHoverId = null;
    this.menuHoverStartedAt = 0;
    this.menuHoverLocked = false;
    this.menuHoverAnchor = null;
    this.menuOpenedAt = performance.now();
    this.runner.dispose();
    this.overlay.innerHTML = `
      <div class="privacy-chip">● processamento local · sem gravação</div>
      <div class="help-chip">Aponta e mantém ${this.config.menu.dwellSeconds.toFixed(1)} s · B: menu · F: ecrã inteiro</div>
      <div id="visitor-invite" class="visitor-invite is-visible"></div>
      ${this.brandingFooterHtml()}
    `;
    this.visitorPresent = false;
    this.greetingUntil = 0;
    this.inviteMode = '';
    this.lastHandSeenAt = performance.now();
  }

  private startExperience(id: string): void {
    this.currentExperienceId = id;
    this.state = 'playing';
    this.result = null;
    this.overlay.innerHTML = `
      <div class="privacy-chip">● processamento local · sem gravação</div>
      <div class="help-chip">B: voltar ao menu · R: reiniciar · ESC: sair do ecrã inteiro</div>
      ${this.brandingFooterHtml()}
    `;
    const experience = this.registry.create(id);
    this.runner.mount(experience);
    this.runner.start();
    window.setTimeout(() => {
      if (this.state === 'playing' && this.currentExperienceId === id) this.runner.audio.speak(this.instructionFor(id));
    }, 450);
    this.lastHandSeenAt = performance.now();
  }

  private showResult(result: ExperienceResult): void {
    if (this.state !== 'playing') return;
    this.state = 'result';
    this.result = result;
    this.resultShownAt = performance.now();
    this.pendingQualifyingScore = this.runner.scores.qualifiesGlobal(result.score, this.config.leaderboard.globalLimit);
    if (!this.pendingQualifyingScore) this.runner.scores.add(this.currentExperienceId, result.score, '---');
    const top = this.runner.scores.topGlobal(this.config.leaderboard.displayLimit);
    const manifest = this.manifestFor(this.currentExperienceId);
    this.overlay.innerHTML = `
      <div class="result-card">
        <div class="score-label">${this.escape(manifest.icon)} PONTUAÇÃO</div>
        <div class="score-number">${Math.round(result.score)}</div>
        <h1>${this.escape(result.title)}</h1>
        <div class="pedagogical-highlight"><strong>IDEIA-CHAVE</strong><p>${this.escape(result.explanation)}</p></div>
        <div class="result-details">${result.details.map((detail) => `<span>${this.escape(detail)}</span>`).join('')}</div>
        ${this.pendingQualifyingScore
          ? '<div class="top-alert">🏆 Entraste no Top global! Vais escolher três iniciais.</div>'
          : '<p class="small-note">A classificação fica registada anonimamente neste computador.</p>'}
        <div class="leaderboard compact-leaderboard">
          <h3>Top global</h3>
          ${this.globalTopHtml(top)}
        </div>
        <button id="menu" class="primary-button">Voltar ao menu</button>
      </div>
      ${this.brandingFooterHtml()}
    `;
    this.overlay.querySelector<HTMLButtonElement>('#menu')?.addEventListener('click', () => this.showMenu());
  }

  private beginNameEntry(): void {
    if (!this.result || !this.pendingQualifyingScore) return;
    this.state = 'name-entry';
    this.initials = '';
    this.nameEntryStartedAt = performance.now();
    this.nameHoverValue = null;
    this.nameHoverStartedAt = 0;
    this.nameHoverLocked = false;
    this.overlay.innerHTML = `
      <div class="privacy-chip">🏆 nome-relâmpago: três iniciais</div>
      <div class="help-chip">Aponta e mantém 0,6 s · ou faz pinça</div>
      ${this.brandingFooterHtml()}
    `;
  }

  private savePendingScore(name: string): void {
    if (!this.result) return;
    const finalName = name === 'ANON' ? '---' : (name || '---').padEnd(this.config.leaderboard.nameLength, '-');
    this.savedEntry = this.runner.scores.add(this.currentExperienceId, this.result.score, finalName);
    this.pendingQualifyingScore = false;
    this.state = 'leaderboard';
    this.leaderboardShownAt = performance.now();
    this.overlay.innerHTML = `
      <div class="privacy-chip">🏆 Top global atualizado</div>
      <div class="help-chip">Faz pinça para regressar ao menu</div>
      ${this.brandingFooterHtml()}
    `;
    this.contextToneSuccess();
  }

  private loop = (): void => {
    this.frameId = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.previousFrame) / 1000, 0.05);
    this.previousFrame = now;

    const input = this.tracker.getInput();
    if (input.present) this.lastHandSeenAt = now;

    if (this.state === 'menu') {
      this.updateVisitorInvitation(this.tracker.getPresenceSignal(this.config.autonomous.presenceRecentSeconds), now);
      this.updateMenu(input, now);
      this.renderMenu(input, now);
    } else if (this.state === 'playing') {
      this.runner.update(dt, input);
      this.runner.render();
      if (now - this.lastHandSeenAt > this.config.idleResetSeconds * 1000) this.showMenu();
    } else if (this.state === 'result' && this.result) {
      this.runner.render();
      if (this.pendingQualifyingScore && (now - this.resultShownAt > 2600 || (now - this.resultShownAt > 900 && input.pinchStarted))) {
        this.beginNameEntry();
      } else if (!this.pendingQualifyingScore && (now - this.resultShownAt > 9000 || (now - this.resultShownAt > 2500 && input.pinchStarted))) {
        this.showMenu();
      }
    } else if (this.state === 'name-entry') {
      this.updateNameEntry(input, now);
      this.renderNameEntry(input, now);
      if (now - this.nameEntryStartedAt > this.config.leaderboard.nameEntrySeconds * 1000) this.savePendingScore(this.initials);
    } else if (this.state === 'leaderboard') {
      this.renderLeaderboard(input);
      if (now - this.leaderboardShownAt > 6500 || (now - this.leaderboardShownAt > 1200 && input.pinchStarted)) this.showMenu();
    }
  };

  private updateMenu(input: HandInput, now: number): void {
    if (now - this.menuOpenedAt < this.config.menu.initialDelaySeconds * 1000) return;
    if (!input.present) {
      this.menuHoverId = null;
      this.menuHoverStartedAt = 0;
      this.menuHoverLocked = false;
      this.menuHoverAnchor = null;
      return;
    }
    const cursor = toPixels(input.cursor, this.viewport());
    const cards = this.menuCards();
    const hovered = cards.find((card) => {
      const insetX = card.rect.width * this.config.menu.cardInsetFraction;
      const insetY = card.rect.height * this.config.menu.cardInsetFraction;
      return pointInRect(cursor, {
        x: card.rect.x + insetX,
        y: card.rect.y + insetY,
        width: card.rect.width - insetX * 2,
        height: card.rect.height - insetY * 2,
      });
    })?.manifest.id ?? null;

    const movedTooFar = this.menuHoverAnchor
      ? Math.hypot(cursor.x - this.menuHoverAnchor.x, cursor.y - this.menuHoverAnchor.y) > this.config.menu.stableRadiusPx
      : false;

    if (hovered !== this.menuHoverId || movedTooFar) {
      this.menuHoverId = hovered;
      this.menuHoverStartedAt = now;
      this.menuHoverLocked = false;
      this.menuHoverAnchor = hovered ? { ...cursor } : null;
    }
    if (!hovered) return;
    const dwellComplete = now - this.menuHoverStartedAt >= this.config.menu.dwellSeconds * 1000;
    const pinchShortcut = this.config.menu.allowPinchShortcut && input.pinchStarted;
    if (!this.menuHoverLocked && (pinchShortcut || dwellComplete)) {
      this.menuHoverLocked = true;
      this.runner.audio.tone(620, 0.08, 0.03);
      this.startExperience(hovered);
    }
  }

  private renderMenu(input: HandInput, now: number): void {
    const { ctx } = this.runner;
    const viewport = this.viewport();
    const { width, height } = viewport;
    const gradient = ctx.createRadialGradient(width * 0.42, height * 0.4, 30, width * 0.42, height * 0.4, Math.max(width, height));
    gradient.addColorStop(0, '#142452');
    gradient.addColorStop(0.5, '#071027');
    gradient.addColorStop(1, '#02040d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#8edfff';
    ctx.font = `700 ${Math.max(13, height * 0.018)}px system-ui`;
    ctx.fillText(this.config.schoolName.toLocaleUpperCase('pt-PT'), width * 0.05, height * 0.075);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.max(38, height * 0.064)}px system-ui`;
    ctx.fillText(this.config.installationTitle, width * 0.05, height * 0.145);
    ctx.fillStyle = 'rgba(220,240,255,0.82)';
    ctx.font = `500 ${Math.max(17, height * 0.023)}px system-ui`;
    ctx.fillText(input.present ? 'Aponta para uma experiência e mantém a mão durante 3 segundos.' : 'Mostra uma mão à câmara para escolher uma experiência.', width * 0.05, height * 0.19);

    for (const card of this.menuCards()) this.drawMenuCard(card.manifest, card.rect, card.manifest.id === this.menuHoverId, now);
    this.drawGlobalTopPanel();
    drawHandSkeleton(ctx, input, viewport);
    if (input.present && this.menuHoverId) {
      const cursor = toPixels(input.cursor, viewport);
      drawDwellRing(ctx, cursor, (now - this.menuHoverStartedAt) / (this.config.menu.dwellSeconds * 1000), 32);
    }
  }

  private drawMenuCard(manifest: ExperienceManifest, rect: Rect, hovered: boolean, now: number): void {
    const { ctx } = this.runner;
    ctx.save();
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 25);
    ctx.fillStyle = hovered ? 'rgba(72,190,236,0.25)' : 'rgba(255,255,255,0.075)';
    ctx.fill();
    ctx.strokeStyle = hovered ? '#72f2b5' : 'rgba(150,214,255,0.24)';
    ctx.lineWidth = hovered ? 4 : 2;
    ctx.shadowColor = hovered ? '#55e6c0' : 'transparent';
    ctx.shadowBlur = hovered ? 22 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(42, rect.height * 0.29)}px system-ui`;
    ctx.textAlign = 'left';
    ctx.fillText(manifest.icon, rect.x + rect.width * 0.07, rect.y + rect.height * 0.39);
    ctx.font = `800 ${Math.max(21, rect.height * 0.13)}px system-ui`;
    ctx.fillText(manifest.title, rect.x + rect.width * 0.07, rect.y + rect.height * 0.64);
    ctx.fillStyle = 'rgba(215,238,250,0.76)';
    ctx.font = `500 ${Math.max(13, rect.height * 0.075)}px system-ui`;
    this.wrapText(manifest.subtitle, rect.x + rect.width * 0.07, rect.y + rect.height * 0.78, rect.width * 0.86, rect.height * 0.1);

    if (hovered) {
      const progress = Math.min(1, (now - this.menuHoverStartedAt) / (this.config.menu.dwellSeconds * 1000));
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(rect.x + rect.width * 0.07, rect.y + rect.height * 0.9, rect.width * 0.86, 10);
      ctx.fillStyle = '#72f2b5';
      ctx.fillRect(rect.x + rect.width * 0.07, rect.y + rect.height * 0.9, rect.width * 0.86 * progress, 10);
    }
    ctx.restore();
  }

  private drawGlobalTopPanel(): void {
    const { ctx } = this.runner;
    const { width, height } = this.viewport();
    const rect: Rect = { x: width * 0.735, y: height * 0.215, width: width * 0.23, height: height * 0.67 };
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 24);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,211,109,0.32)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd36d';
    ctx.textAlign = 'center';
    ctx.font = `800 ${Math.max(21, height * 0.029)}px system-ui`;
    ctx.fillText('🏆 TOP GLOBAL', rect.x + rect.width / 2, rect.y + height * 0.055);

    const top = this.runner.scores.topGlobal(this.config.leaderboard.displayLimit);
    const rowHeight = rect.height * 0.105;
    if (top.length === 0) {
      ctx.fillStyle = 'rgba(220,240,255,0.7)';
      ctx.font = `500 ${Math.max(14, height * 0.019)}px system-ui`;
      ctx.fillText('Ainda sem resultados', rect.x + rect.width / 2, rect.y + rect.height * 0.35);
      return;
    }
    top.forEach((entry, index) => {
      const manifest = this.manifestFor(entry.experienceId);
      const y = rect.y + height * 0.1 + rowHeight * index;
      ctx.textAlign = 'left';
      ctx.fillStyle = index === 0 ? '#ffd36d' : '#ffffff';
      ctx.font = `800 ${Math.max(15, height * 0.021)}px system-ui`;
      ctx.fillText(`${index + 1}. ${entry.playerName}`, rect.x + rect.width * 0.08, y);
      ctx.textAlign = 'right';
      ctx.fillText(`${manifest.icon} ${entry.score}`, rect.x + rect.width * 0.92, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.width * 0.08, y + rowHeight * 0.32);
      ctx.lineTo(rect.x + rect.width * 0.92, y + rowHeight * 0.32);
      ctx.stroke();
    });
  }

  private updateNameEntry(input: HandInput, now: number): void {
    if (!input.present) {
      this.nameHoverValue = null;
      this.nameHoverStartedAt = 0;
      this.nameHoverLocked = false;
      return;
    }
    const cursor = toPixels(input.cursor, this.viewport());
    const hovered = this.nameKeys().find((key) => pointInRect(cursor, key.rect))?.value ?? null;
    if (hovered !== this.nameHoverValue) {
      this.nameHoverValue = hovered;
      this.nameHoverStartedAt = now;
      this.nameHoverLocked = false;
    }
    if (!hovered) return;
    const dwellComplete = now - this.nameHoverStartedAt >= 600;
    if (!this.nameHoverLocked && (input.pinchStarted || dwellComplete)) {
      this.nameHoverLocked = true;
      this.activateNameKey(hovered);
    }
  }

  private activateNameKey(value: string): void {
    if (value === 'BACK') {
      this.initials = this.initials.slice(0, -1);
      this.runner.audio.tone(300, 0.06, 0.02);
      return;
    }
    if (value === 'ANON') {
      this.savePendingScore('ANON');
      return;
    }
    if (value === 'OK') {
      if (this.initials.length === this.config.leaderboard.nameLength) this.savePendingScore(this.initials);
      else this.runner.audio.failure();
      return;
    }
    if (value === 'MENU') {
      this.savePendingScore(this.initials);
      return;
    }
    if (/^[A-Z]$/.test(value) && this.initials.length < this.config.leaderboard.nameLength) {
      this.initials += value;
      this.runner.audio.tone(520 + this.initials.length * 90, 0.06, 0.025);
      if (this.initials.length === this.config.leaderboard.nameLength) {
        window.setTimeout(() => {
          if (this.state === 'name-entry' && this.initials.length === this.config.leaderboard.nameLength) this.savePendingScore(this.initials);
        }, 650);
      }
    }
  }

  private renderNameEntry(input: HandInput, now: number): void {
    const { ctx } = this.runner;
    const viewport = this.viewport();
    const { width, height } = viewport;
    const gradient = ctx.createRadialGradient(width / 2, height * 0.38, 20, width / 2, height * 0.38, Math.max(width, height));
    gradient.addColorStop(0, '#20204f');
    gradient.addColorStop(0.55, '#080d24');
    gradient.addColorStop(1, '#02040d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd36d';
    ctx.font = `900 ${Math.max(34, height * 0.055)}px system-ui`;
    ctx.fillText('🏆 Entraste no Top global!', width / 2, height * 0.09);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.max(18, height * 0.025)}px system-ui`;
    ctx.fillText('Escolhe três iniciais. Cada letra fica selecionada após 0,6 s.', width / 2, height * 0.14);

    const slotWidth = Math.min(width * 0.075, 105);
    const slotGap = slotWidth * 0.22;
    const totalWidth = slotWidth * this.config.leaderboard.nameLength + slotGap * (this.config.leaderboard.nameLength - 1);
    for (let index = 0; index < this.config.leaderboard.nameLength; index += 1) {
      const x = width / 2 - totalWidth / 2 + index * (slotWidth + slotGap);
      const y = height * 0.175;
      roundedRect(ctx, x, y, slotWidth, height * 0.105, 18);
      ctx.fillStyle = index < this.initials.length ? 'rgba(112,242,184,0.2)' : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.strokeStyle = index < this.initials.length ? '#70f2b8' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${Math.max(34, height * 0.055)}px system-ui`;
      ctx.fillText(this.initials[index] ?? '·', x + slotWidth / 2, y + height * 0.072);
    }

    for (const key of this.nameKeys()) {
      const hovered = key.value === this.nameHoverValue;
      roundedRect(ctx, key.rect.x, key.rect.y, key.rect.width, key.rect.height, 14);
      const disabled = key.value === 'OK' && this.initials.length !== this.config.leaderboard.nameLength;
      ctx.fillStyle = disabled ? 'rgba(255,255,255,0.035)' : hovered ? 'rgba(72,190,236,0.28)' : 'rgba(255,255,255,0.085)';
      ctx.fill();
      ctx.strokeStyle = hovered ? '#72f2b5' : 'rgba(150,214,255,0.2)';
      ctx.lineWidth = hovered ? 3 : 1.5;
      ctx.stroke();
      ctx.fillStyle = disabled ? 'rgba(255,255,255,0.28)' : '#ffffff';
      ctx.font = `800 ${key.label.length > 2 ? Math.max(13, height * 0.018) : Math.max(22, height * 0.03)}px system-ui`;
      ctx.fillText(key.label, key.rect.x + key.rect.width / 2, key.rect.y + key.rect.height * 0.64);
      if (hovered) {
        ctx.fillStyle = '#72f2b5';
        ctx.fillRect(key.rect.x, key.rect.y + key.rect.height - 7, key.rect.width * Math.min(1, (now - this.nameHoverStartedAt) / 600), 7);
      }
    }

    const remaining = Math.max(0, this.config.leaderboard.nameEntrySeconds - (now - this.nameEntryStartedAt) / 1000);
    ctx.fillStyle = 'rgba(210,235,250,0.7)';
    ctx.font = `500 ${Math.max(14, height * 0.018)}px system-ui`;
    ctx.fillText(`Tempo restante: ${Math.ceil(remaining)} s · sem escolha será guardado como ---`, width / 2, height * 0.965);
    drawHandSkeleton(ctx, input, viewport);
  }

  private renderLeaderboard(input: HandInput): void {
    const { ctx } = this.runner;
    const viewport = this.viewport();
    const { width, height } = viewport;
    const gradient = ctx.createRadialGradient(width / 2, height * 0.35, 20, width / 2, height * 0.35, Math.max(width, height));
    gradient.addColorStop(0, '#332744');
    gradient.addColorStop(0.55, '#0a1027');
    gradient.addColorStop(1, '#02040d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd36d';
    ctx.font = `900 ${Math.max(38, height * 0.062)}px system-ui`;
    ctx.fillText('🏆 Top global', width / 2, height * 0.12);
    ctx.fillStyle = 'rgba(220,240,255,0.8)';
    ctx.font = `500 ${Math.max(17, height * 0.023)}px system-ui`;
    ctx.fillText('Todas as experiências usam uma escala comum de 0 a 1000 pontos.', width / 2, height * 0.17);

    const top = this.runner.scores.topGlobal(this.config.leaderboard.globalLimit);
    const panelWidth = Math.min(width * 0.72, 920);
    const x = width / 2 - panelWidth / 2;
    const y = height * 0.22;
    const rowHeight = height * 0.061;
    top.forEach((entry, index) => {
      const highlighted = entry.createdAt === this.savedEntry?.createdAt;
      roundedRect(ctx, x, y + index * rowHeight, panelWidth, rowHeight * 0.82, 12);
      ctx.fillStyle = highlighted ? 'rgba(112,242,184,0.22)' : index === 0 ? 'rgba(255,211,109,0.14)' : 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = highlighted ? '#70f2b8' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = highlighted ? 3 : 1;
      ctx.stroke();
      const manifest = this.manifestFor(entry.experienceId);
      ctx.textAlign = 'left';
      ctx.fillStyle = index === 0 ? '#ffd36d' : '#ffffff';
      ctx.font = `800 ${Math.max(17, height * 0.023)}px system-ui`;
      ctx.fillText(`${index + 1}.`, x + panelWidth * 0.035, y + index * rowHeight + rowHeight * 0.55);
      ctx.fillText(entry.playerName, x + panelWidth * 0.12, y + index * rowHeight + rowHeight * 0.55);
      ctx.font = `600 ${Math.max(15, height * 0.02)}px system-ui`;
      ctx.fillStyle = 'rgba(225,242,255,0.82)';
      ctx.fillText(`${manifest.icon} ${manifest.title}`, x + panelWidth * 0.32, y + index * rowHeight + rowHeight * 0.55);
      ctx.textAlign = 'right';
      ctx.fillStyle = highlighted ? '#70f2b8' : '#ffffff';
      ctx.font = `900 ${Math.max(19, height * 0.026)}px system-ui`;
      ctx.fillText(`${entry.score}`, x + panelWidth * 0.96, y + index * rowHeight + rowHeight * 0.55);
    });
    drawHandSkeleton(ctx, input, viewport);
  }

  private nameKeys(): NameKey[] {
    const { width, height } = this.viewport();
    const values = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => ({ value: letter, label: letter }));
    values.push(
      { value: 'BACK', label: '⌫' },
      { value: 'ANON', label: 'ANÓN.' },
      { value: 'OK', label: 'OK' },
      { value: 'MENU', label: 'SAIR' },
    );
    const columns = 6;
    const rows = 5;
    const areaX = width * 0.12;
    const areaY = height * 0.32;
    const areaWidth = width * 0.76;
    const areaHeight = height * 0.58;
    const gap = Math.max(8, Math.min(width, height) * 0.012);
    const keyWidth = (areaWidth - gap * (columns - 1)) / columns;
    const keyHeight = (areaHeight - gap * (rows - 1)) / rows;
    return values.map((item, index) => ({
      ...item,
      rect: {
        x: areaX + (index % columns) * (keyWidth + gap),
        y: areaY + Math.floor(index / columns) * (keyHeight + gap),
        width: keyWidth,
        height: keyHeight,
      },
    }));
  }

  private menuCards(): { manifest: ExperienceManifest; rect: Rect }[] {
    const { width, height } = this.viewport();
    const manifests = this.registry.list();
    const columns = 3;
    const rows = 2;
    const areaX = width * 0.035;
    const areaY = height * 0.225;
    const areaWidth = width * 0.68;
    const areaHeight = height * 0.66;
    const gapX = width * 0.014;
    const gapY = height * 0.03;
    const cardWidth = (areaWidth - gapX * (columns - 1)) / columns;
    const cardHeight = (areaHeight - gapY * (rows - 1)) / rows;
    return manifests.map((manifest, index) => ({
      manifest,
      rect: {
        x: areaX + (index % columns) * (cardWidth + gapX),
        y: areaY + Math.floor(index / columns) * (cardHeight + gapY),
        width: cardWidth,
        height: cardHeight,
      },
    }));
  }

  private updateVisitorInvitation(present: boolean, now: number): void {
    if (present && !this.visitorPresent && now - this.lastGreetingAt >= this.config.autonomous.greetingCooldownSeconds * 1000) {
      this.greetingUntil = now + 6500;
      this.lastGreetingAt = now;
      this.runner.audio.speak('Olá! Queres fazer uma experiência? Mostra uma mão à câmara, aponta para um jogo e mantém a mão nessa posição.');
    }
    this.visitorPresent = present;
    const mode = now < this.greetingUntil ? 'greeting' : present ? 'ready' : 'attract';
    if (mode === this.inviteMode) return;
    this.inviteMode = mode;
    const invitation = this.overlay.querySelector<HTMLElement>('#visitor-invite');
    if (!invitation) return;
    if (mode === 'ready') {
      invitation.className = 'visitor-invite';
      invitation.replaceChildren();
      return;
    }
    invitation.className = 'visitor-invite is-visible';
    invitation.innerHTML = mode === 'greeting'
      ? '<strong>👋 Olá! Queres jogar?</strong><span>Mostra uma mão, aponta para uma experiência e mantém a posição.</span>'
      : '<strong>🔬 Ciência em movimento</strong><span>Aproxima-te do ecrã. A câmara convida-te a experimentar!</span>';
  }

  private instructionFor(id: string): string {
    const instructions: Record<string, string> = {
      'coloca-planeta-em-orbita': 'Junta o polegar e o indicador para começar. Agarra o planeta, ajusta o vetor e abre a mão para o lançar.',
      'laboratorio-de-lasers': 'Faz pinça para começar. Move a mão à volta do espelho até o feixe refletido atingir o alvo no topo.',
      'constroi-uma-molecula': 'Faz pinça para começar. Agarra cada átomo e larga-o na posição correta.',
      'domina-as-ondas': 'Faz pinça para começar. Move a mão para reproduzir cada uma das sete cores do arco-íris.',
      'labirinto-vetorial': 'Faz pinça para iniciar o cronómetro. Desloca a mão suavemente para aplicar força e orientar a bola.',
    };
    return instructions[id] ?? 'Faz pinça para começar a experiência.';
  }

  private brandMarksHtml(): string {
    return `<div class="brand-marks">
      <img src="${this.escape(this.config.branding.schoolMark)}" alt="Agrupamento de Escolas Abel Salazar">
      <img src="${this.escape(this.config.branding.scienceMark)}" alt="Clube Ciência Viva">
    </div>`;
  }

  private brandingFooterHtml(): string {
    return `<footer class="branding-footer">
      ${this.brandMarksHtml()}
      <span>${this.escape(this.config.branding.coordinator)} · ${this.escape(this.config.branding.developmentCredit)}</span>
    </footer>`;
  }

  private viewport(): Viewport {
    return { width: window.innerWidth, height: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2) };
  }

  private manifestFor(id: string): ExperienceManifest {
    return this.registry.list().find((manifest) => manifest.id === id) ?? {
      id,
      title: id,
      subtitle: '',
      description: '',
      icon: '🔬',
      version: '2.2.0',
      author: '',
    };
  }

  private globalTopHtml(entries: ScoreEntry[]): string {
    if (entries.length === 0) return '<p>Ainda não existem resultados.</p>';
    return entries.map((entry, index) => {
      const manifest = this.manifestFor(entry.experienceId);
      return `<div><strong>${index + 1}. ${this.escape(entry.playerName)}</strong><span>${this.escape(manifest.icon)} ${entry.score}</span></div>`;
    }).join('');
  }

  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const { ctx } = this.runner;
    const words = text.split(' ');
    let line = '';
    let lineIndex = 0;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, x, y + lineIndex * lineHeight);
        line = word;
        lineIndex += 1;
      } else line = candidate;
    }
    if (line) ctx.fillText(line, x, y + lineIndex * lineHeight);
  }

  private contextToneSuccess(): void {
    const audio = this.runner.audio as AudioEngine;
    audio.success();
  }

  private resize = (): void => {
    this.runner.resize(window.innerWidth, window.innerHeight);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (event.ctrlKey && event.shiftKey && key === 'l') {
      this.runner.scores.clear();
      this.showMenu();
      return;
    }
    if (key === 'r' && this.state === 'playing') this.startExperience(this.currentExperienceId);
    if (key === 'b' && !['permission', 'loading', 'error'].includes(this.state)) this.showMenu();
    if (key === 'm') (this.runner.audio as AudioEngine).setEnabled(false);
    if (key === 'f') void document.documentElement.requestFullscreen();
  };

  private escape(value: string): string {
    return value.replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[character] ?? character);
  }
}
