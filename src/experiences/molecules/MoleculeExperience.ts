import type { Experience, ExperienceContext, ExperienceManifest, Viewport } from '../../core/Experience.js';
import { drawHandSkeleton, toPixels } from '../../core/GestureGraphics.js';
import type { HandInput, Vec2 } from '../../core/types.js';

export const moleculeManifest: ExperienceManifest = {
  id: 'constroi-uma-molecula',
  title: 'Constrói uma molécula',
  subtitle: 'Monta-a e observa a estrutura completa.',
  description: 'Monta moléculas simples, observa-as a rodar e descobre curiosidades sobre cada substância.',
  icon: '⚛️',
  version: '2.4.1',
  author: 'Clube Ciência Viva Abel Salazar',
};

type AtomSymbol = 'H' | 'O' | 'C' | 'N';
type Atom = { id: number; symbol: AtomSymbol; position: Vec2; home: Vec2; placedSlot: number | null };
type Slot = { symbol: AtomSymbol; offset: Vec2; z?: number };
type Molecule = {
  name: string;
  formula: string;
  geometry: string;
  slots: Slot[];
  explanation: string;
  facts: string[];
};
type Phase = 'instructions' | 'playing' | 'observation' | 'round-failed' | 'finished';

const MOLECULES: Molecule[] = [
  {
    name: 'Água',
    formula: 'H₂O',
    geometry: 'geometria angular',
    explanation: 'Dois átomos de hidrogénio ligam-se a um átomo de oxigénio.',
    facts: [
      'A polaridade da água ajuda a dissolver muitas substâncias.',
      'A água líquida atinge a densidade máxima perto de 4 °C.',
    ],
    slots: [
      { symbol: 'O', offset: { x: 0, y: 0 }, z: 0 },
      { symbol: 'H', offset: { x: -0.11, y: 0.10 }, z: 0.035 },
      { symbol: 'H', offset: { x: 0.11, y: 0.10 }, z: -0.035 },
    ],
  },
  {
    name: 'Dióxido de carbono',
    formula: 'CO₂',
    geometry: 'geometria linear',
    explanation: 'Um átomo de carbono fica entre dois átomos de oxigénio: O=C=O.',
    facts: [
      'É produzido na respiração e utilizado pelas plantas na fotossíntese.',
      'No estado sólido é conhecido como gelo seco.',
    ],
    slots: [
      { symbol: 'C', offset: { x: 0, y: 0 }, z: 0 },
      { symbol: 'O', offset: { x: -0.15, y: 0 }, z: 0 },
      { symbol: 'O', offset: { x: 0.15, y: 0 }, z: 0 },
    ],
  },
  {
    name: 'Amoníaco',
    formula: 'NH₃',
    geometry: 'geometria piramidal trigonal',
    explanation: 'Um átomo de azoto liga-se a três átomos de hidrogénio.',
    facts: [
      'É uma matéria-prima importante na produção de fertilizantes.',
      'O seu cheiro intenso permite detetar pequenas fugas.',
    ],
    slots: [
      { symbol: 'N', offset: { x: 0, y: -0.025 }, z: 0 },
      { symbol: 'H', offset: { x: -0.13, y: 0.09 }, z: 0.03 },
      { symbol: 'H', offset: { x: 0.13, y: 0.09 }, z: 0.03 },
      { symbol: 'H', offset: { x: 0, y: 0.13 }, z: -0.09 },
    ],
  },
  {
    name: 'Metano',
    formula: 'CH₄',
    geometry: 'geometria tetraédrica',
    explanation: 'Um átomo de carbono liga-se a quatro átomos de hidrogénio orientados no espaço.',
    facts: [
      'É o principal constituinte do gás natural.',
      'A sua geometria tetraédrica distribui as quatro ligações de forma simétrica.',
    ],
    slots: [
      { symbol: 'C', offset: { x: 0, y: 0 }, z: 0 },
      { symbol: 'H', offset: { x: -0.13, y: 0.08 }, z: 0.07 },
      { symbol: 'H', offset: { x: 0.13, y: 0.08 }, z: 0.07 },
      { symbol: 'H', offset: { x: 0, y: -0.14 }, z: -0.09 },
      { symbol: 'H', offset: { x: 0, y: 0.16 }, z: -0.11 },
    ],
  },
];

export class MoleculeExperience implements Experience {
  readonly manifest = moleculeManifest;
  private context!: ExperienceContext;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private input: HandInput | null = null;
  private phase: Phase = 'instructions';
  private elapsed = 0;
  private totalElapsed = 0;
  private round = 0;
  private score = 0;
  private atoms: Atom[] = [];
  private grabbedAtom: number | null = null;
  private resultSent = false;
  private feedback = '';
  private feedbackTime = 0;
  private completedRounds = 0;

  mount(context: ExperienceContext): void { this.context = context; }

  start(): void {
    this.input = null;
    this.phase = 'instructions';
    this.elapsed = 0;
    this.totalElapsed = 0;
    this.round = 0;
    this.score = 0;
    this.atoms = [];
    this.grabbedAtom = null;
    this.resultSent = false;
    this.feedback = '';
    this.feedbackTime = 0;
    this.completedRounds = 0;
  }

  update(dtSeconds: number, input: HandInput): void {
    const dt = Math.min(dtSeconds, 0.05);
    this.elapsed += dt;
    this.totalElapsed += dt;
    this.feedbackTime = Math.max(0, this.feedbackTime - dt);
    this.input = input;

    if (this.phase === 'instructions') {
      if (this.elapsed > 0.8 && input.pinchStarted) {
        this.phase = 'playing';
        this.elapsed = 0;
        this.setupRound();
        this.context.audio.tone(540, 0.1);
      }
      return;
    }

    if (this.phase === 'playing') {
      const cursor = toPixels(input.cursor, this.viewport);
      if (this.grabbedAtom !== null) {
        const atom = this.atoms.find((candidate) => candidate.id === this.grabbedAtom);
        if (atom && input.present) atom.position = cursor;
        if (input.pinchEnded || !input.present) this.releaseAtom();
      } else if (input.pinchStarted && input.present) {
        const candidate = this.nearestFreeAtom(cursor);
        if (candidate && this.distance(candidate.position, cursor) < this.atomRadius() * 1.8) {
          this.grabbedAtom = candidate.id;
          this.context.audio.tone(650, 0.06, 0.025);
        }
      }
      if (this.elapsed > 30) this.endRound(false);
      return;
    }

    if (this.phase === 'observation') {
      const duration = Math.max(6, this.context.config.molecules.successObservationSeconds);
      if (this.elapsed >= duration || (this.elapsed > 3 && input.pinchStarted)) this.advanceRound();
      return;
    }

    if (this.phase === 'round-failed') {
      if (this.elapsed > 2.2) this.advanceRound();
      return;
    }

    if (this.phase === 'finished' && !this.resultSent) {
      this.resultSent = true;
      window.setTimeout(() => this.sendResult(), 650);
    }
  }

  render(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.48, 20, width * 0.5, height * 0.48, Math.max(width, height));
    gradient.addColorStop(0, '#172248');
    gradient.addColorStop(0.55, '#080d24');
    gradient.addColorStop(1, '#02040d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (this.phase === 'playing' || this.phase === 'round-failed') {
      this.drawSlots();
      this.drawBonds(this.slotPositions(), 0.42);
      this.drawAtoms();
    } else if (this.phase === 'observation') {
      this.drawCompletedMolecule();
      this.drawInformationPanel();
    }

    if (this.input && this.phase === 'playing') drawHandSkeleton(ctx, this.input, this.viewport);
    this.drawHud();
  }

  resize(viewport: Viewport): void { this.viewport = viewport; }
  dispose(): void { this.atoms = []; }

  private setupRound(): void {
    const molecule = this.currentMolecule();
    const symbols = molecule.slots.map((slot) => slot.symbol);
    const decoys: AtomSymbol[] = this.round === 0 ? ['C'] : this.round === 1 ? ['H'] : ['O'];
    const allSymbols = [...symbols, ...decoys];
    const spacing = this.viewport.width / (allSymbols.length + 1);
    const y = this.viewport.height * 0.79;
    this.atoms = allSymbols.map((symbol, index) => {
      const home = { x: spacing * (index + 1), y: y + ((index % 2) * 2 - 1) * this.viewport.height * 0.035 };
      return { id: index, symbol, position: { ...home }, home, placedSlot: null };
    });
    this.grabbedAtom = null;
  }

  private releaseAtom(): void {
    const atom = this.atoms.find((candidate) => candidate.id === this.grabbedAtom);
    this.grabbedAtom = null;
    if (!atom) return;
    const slots = this.slotPositions();
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < slots.length; index += 1) {
      if (this.atoms.some((candidate) => candidate.placedSlot === index)) continue;
      const distance = this.distance(atom.position, slots[index] ?? atom.position);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    const expected = this.currentMolecule().slots[bestIndex];
    if (bestIndex >= 0 && bestDistance < this.atomRadius() * 2.2 && expected?.symbol === atom.symbol) {
      atom.position = { ...(slots[bestIndex] ?? atom.home) };
      atom.placedSlot = bestIndex;
      this.context.audio.tone(760, 0.08, 0.035);
      this.feedback = 'Átomo colocado corretamente!';
      this.feedbackTime = 0.8;
      if (this.isRoundComplete()) this.endRound(true);
    } else {
      atom.position = { ...atom.home };
      atom.placedSlot = null;
      this.context.audio.tone(220, 0.1, 0.025);
      this.feedback = expected && expected.symbol !== atom.symbol ? `Aqui é necessário ${expected.symbol}` : 'Aproxima o átomo da posição correta';
      this.feedbackTime = 1.1;
    }
  }

  private endRound(success: boolean): void {
    if (this.phase !== 'playing') return;
    if (success) {
      const timeBonus = Math.max(0, Math.round((30 - this.elapsed) * 2.6));
      this.score += 180 + Math.min(70, timeBonus);
      this.completedRounds += 1;
      this.phase = 'observation';
      this.context.audio.success();
    } else {
      this.score += this.atoms.filter((atom) => atom.placedSlot !== null).length * 25;
      this.phase = 'round-failed';
      this.context.audio.failure();
    }
    this.elapsed = 0;
  }

  private advanceRound(): void {
    this.round += 1;
    if (this.round >= MOLECULES.length) {
      this.phase = 'finished';
      this.elapsed = 0;
      return;
    }
    this.phase = 'playing';
    this.elapsed = 0;
    this.setupRound();
  }

  private sendResult(): void {
    this.context.complete({
      score: Math.min(1000, this.score),
      title: this.completedRounds === MOLECULES.length ? 'Químico molecular!' : 'Moléculas exploradas',
      explanation: 'A fórmula indica os elementos e o número de átomos; a disposição espacial determina a geometria molecular.',
      details: [
        `Moléculas completas: ${this.completedRounds}/${MOLECULES.length}`,
        `Tempo total: ${this.totalElapsed.toFixed(1)} s`,
        'Observação: composição, ligações e geometria',
      ],
    });
  }

  private drawSlots(): void {
    const { ctx } = this.context;
    const positions = this.slotPositions();
    const molecule = this.currentMolecule();
    for (let index = 0; index < positions.length; index += 1) {
      const position = positions[index];
      const slot = molecule.slots[index];
      if (!position || !slot) continue;
      const occupied = this.atoms.some((atom) => atom.placedSlot === index);
      if (occupied) continue;
      ctx.save();
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = 'rgba(190,230,255,0.55)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(position.x, position.y, this.atomRadius(), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(225,244,255,0.62)';
      ctx.font = `700 ${Math.max(22, this.atomRadius() * 0.75)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.symbol, position.x, position.y + 1);
      ctx.restore();
    }
  }

  private drawBonds(positions: Vec2[], alpha = 1): void {
    const { ctx } = this.context;
    if (positions.length < 2) return;
    const center = positions[0];
    if (!center) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#dcecff';
    ctx.lineWidth = Math.max(8, this.viewport.height * 0.012);
    ctx.lineCap = 'round';
    for (let index = 1; index < positions.length; index += 1) {
      const point = positions[index];
      if (!point) continue;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawAtoms(): void {
    for (const atom of this.atoms) this.drawAtom(atom.symbol, atom.position, this.atomRadius(), atom.id === this.grabbedAtom);
  }

  private drawCompletedMolecule(): void {
    const center = { x: this.viewport.width * 0.37, y: this.viewport.height * 0.48 };
    const angle = this.elapsed * 0.72;
    const scale = 1.35;
    const projected = this.currentMolecule().slots.map((slot) => {
      const x = slot.offset.x * this.viewport.width;
      const z = (slot.z ?? 0) * this.viewport.width;
      const rotatedX = x * Math.cos(angle) - z * Math.sin(angle);
      const depth = x * Math.sin(angle) + z * Math.cos(angle);
      const perspective = 1 + depth / Math.max(this.viewport.width, 1) * 1.4;
      return {
        x: center.x + rotatedX * scale,
        y: center.y + slot.offset.y * this.viewport.height * scale,
        depth,
        perspective,
        symbol: slot.symbol,
      };
    });
    this.drawBonds(projected, 0.95);
    projected
      .slice()
      .sort((a, b) => a.depth - b.depth)
      .forEach((atom) => this.drawAtom(atom.symbol, atom, this.atomRadius() * 1.15 * atom.perspective, false));
  }

  private drawInformationPanel(): void {
    const { ctx } = this.context;
    const molecule = this.currentMolecule();
    const { width, height } = this.viewport;
    const x = width * 0.61;
    const y = height * 0.25;
    const w = width * 0.33;
    const h = height * 0.52;
    ctx.save();
    ctx.fillStyle = 'rgba(2,8,24,0.78)';
    ctx.strokeStyle = 'rgba(130,220,255,0.32)';
    ctx.lineWidth = 2;
    this.roundRect(x, y, w, h, 24);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#70f2b8';
    ctx.font = `800 ${Math.max(25, height * 0.036)}px system-ui`;
    ctx.fillText(`${molecule.name} · ${molecule.formula}`, x + w * 0.07, y + h * 0.13);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.max(16, height * 0.021)}px system-ui`;
    ctx.fillText(molecule.geometry, x + w * 0.07, y + h * 0.22);
    ctx.fillStyle = 'rgba(225,242,255,0.88)';
    ctx.font = `500 ${Math.max(15, height * 0.019)}px system-ui`;
    this.wrapText(molecule.explanation, x + w * 0.07, y + h * 0.34, w * 0.86, height * 0.035);
    ctx.fillStyle = '#ffd36d';
    ctx.font = `700 ${Math.max(16, height * 0.021)}px system-ui`;
    ctx.fillText('Curiosidades', x + w * 0.07, y + h * 0.52);
    ctx.fillStyle = 'rgba(225,242,255,0.88)';
    ctx.font = `500 ${Math.max(14, height * 0.018)}px system-ui`;
    molecule.facts.forEach((fact, index) => this.wrapText(`• ${fact}`, x + w * 0.07, y + h * (0.62 + index * 0.17), w * 0.86, height * 0.03));
    ctx.restore();
  }

  private drawAtom(symbol: AtomSymbol, position: Vec2, radius: number, highlighted: boolean): void {
    const { ctx } = this.context;
    const color = this.atomColor(symbol);
    const gradient = ctx.createRadialGradient(position.x - radius * 0.3, position.y - radius * 0.35, radius * 0.1, position.x, position.y, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.25, color.light);
    gradient.addColorStop(1, color.dark);
    ctx.save();
    ctx.shadowColor = color.light;
    ctx.shadowBlur = highlighted ? 32 : 16;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color.text;
    ctx.font = `900 ${Math.max(22, radius * 0.82)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, position.x, position.y + 1);
    ctx.restore();
  }

  private drawHud(): void {
    const { ctx } = this.context;
    const { width, height } = this.viewport;
    ctx.textAlign = 'center';
    if (this.phase === 'instructions') {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.max(36, height * 0.06)}px system-ui`;
      ctx.fillText('Constrói uma molécula', width / 2, height * 0.15);
      ctx.font = `500 ${Math.max(20, height * 0.028)}px system-ui`;
      ctx.fillStyle = 'rgba(225,242,255,0.9)';
      ctx.fillText('Faz pinça sobre um átomo, arrasta-o e abre a mão.', width / 2, height * 0.24);
      ctx.fillText('Quando terminares, observa a molécula completa a rodar.', width / 2, height * 0.29);
      ctx.fillText('Inclui água, dióxido de carbono, amoníaco e metano.', width / 2, height * 0.34);
      ctx.fillStyle = '#72f2b5';
      ctx.font = `800 ${Math.max(22, height * 0.032)}px system-ui`;
      ctx.fillText('Faz pinça para começar', width / 2, height * 0.47);
      return;
    }

    const molecule = this.currentMolecule();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(28, height * 0.043)}px system-ui`;
    ctx.fillText(`${molecule.name} · ${molecule.formula}`, width / 2, height * 0.09);

    if (this.phase === 'playing') {
      ctx.font = `500 ${Math.max(16, height * 0.021)}px system-ui`;
      ctx.fillStyle = 'rgba(205,235,250,0.82)';
      ctx.fillText(`Molécula ${this.round + 1} de ${MOLECULES.length} · agarra com pinça e larga no lugar certo`, width / 2, height * 0.135);
      if (this.feedbackTime > 0) {
        ctx.fillStyle = this.feedback.includes('corretamente') ? '#70f2b8' : '#ffd36d';
        ctx.font = `700 ${Math.max(22, height * 0.032)}px system-ui`;
        ctx.fillText(this.feedback, width / 2, height * 0.2);
      }
    } else if (this.phase === 'observation') {
      ctx.fillStyle = '#70f2b8';
      ctx.font = `800 ${Math.max(30, height * 0.048)}px system-ui`;
      ctx.fillText('Molécula completa!', width / 2, height * 0.15);
      ctx.fillStyle = 'rgba(225,242,255,0.82)';
      ctx.font = `500 ${Math.max(14, height * 0.018)}px system-ui`;
      const remaining = Math.max(0, this.context.config.molecules.successObservationSeconds - this.elapsed);
      ctx.fillText(`Observa a estrutura · próxima molécula em ${Math.ceil(remaining)} s`, width / 2, height * 0.91);
    } else if (this.phase === 'round-failed') {
      ctx.fillStyle = '#ffd36d';
      ctx.font = `800 ${Math.max(30, height * 0.048)}px system-ui`;
      ctx.fillText('Tempo terminado — vamos à próxima molécula', width / 2, height * 0.17);
    }
  }

  private currentMolecule(): Molecule { return MOLECULES[Math.min(this.round, MOLECULES.length - 1)] ?? MOLECULES[0]!; }
  private atomRadius(): number { return Math.max(30, Math.min(this.viewport.height * 0.052, this.viewport.width * 0.038)); }
  private moleculeCenter(): Vec2 { return { x: this.viewport.width * 0.5, y: this.viewport.height * 0.45 }; }
  private slotPositions(): Vec2[] {
    const center = this.moleculeCenter();
    return this.currentMolecule().slots.map((slot) => ({
      x: center.x + slot.offset.x * this.viewport.width,
      y: center.y + slot.offset.y * this.viewport.height,
    }));
  }
  private nearestFreeAtom(point: Vec2): Atom | null {
    const candidates = this.atoms.filter((atom) => atom.placedSlot === null);
    return candidates.sort((a, b) => this.distance(a.position, point) - this.distance(b.position, point))[0] ?? null;
  }
  private isRoundComplete(): boolean { return this.currentMolecule().slots.every((_, index) => this.atoms.some((atom) => atom.placedSlot === index)); }
  private distance(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
  private atomColor(symbol: AtomSymbol): { light: string; dark: string; text: string } {
    if (symbol === 'H') return { light: '#f4fbff', dark: '#a8b8c8', text: '#172136' };
    if (symbol === 'O') return { light: '#ff9c9c', dark: '#a81f36', text: '#ffffff' };
    if (symbol === 'C') return { light: '#9ca7b8', dark: '#252b38', text: '#ffffff' };
    return { light: '#8bb8ff', dark: '#2649a8', text: '#ffffff' };
  }
  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    const { ctx } = this.context;
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const { ctx } = this.context;
    const words = text.split(' ');
    let line = '';
    let row = 0;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, x, y + row * lineHeight);
        line = word;
        row += 1;
      } else line = candidate;
    }
    if (line) ctx.fillText(line, x, y + row * lineHeight);
  }
}
