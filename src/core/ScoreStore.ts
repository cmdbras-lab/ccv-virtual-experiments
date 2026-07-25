export interface ScoreEntry {
  score: number;
  experienceId: string;
  playerName: string;
  createdAt: string;
}

const STORAGE_KEY = 'ciencia-em-movimento:scores:v2';
const LEGACY_STORAGE_KEY = 'ciencia-em-movimento:scores:v1';

export class ScoreStore {
  add(experienceId: string, score: number, playerName = 'ANÓNIMO'): ScoreEntry {
    const entry: ScoreEntry = {
      experienceId,
      score: Math.max(0, Math.min(1000, Math.round(score))),
      playerName: this.cleanName(playerName),
      createdAt: new Date().toISOString(),
    };
    const entries = this.read();
    entries.push(entry);
    entries.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 200)));
    return entry;
  }

  top(experienceId: string, limit = 10): ScoreEntry[] {
    return this.read().filter((entry) => entry.experienceId === experienceId).slice(0, limit);
  }

  topGlobal(limit = 10): ScoreEntry[] {
    return this.read().slice(0, limit);
  }

  qualifiesGlobal(score: number, limit = 10): boolean {
    const top = this.topGlobal(limit);
    return top.length < limit || score > (top[top.length - 1]?.score ?? 0);
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  private read(): ScoreEntry[] {
    const current = this.parse(localStorage.getItem(STORAGE_KEY));
    if (current.length > 0 || localStorage.getItem(STORAGE_KEY)) return current;

    const legacy = this.parseLegacy(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      return legacy;
    }
    return [];
  }

  private parse(value: string | null): ScoreEntry[] {
    try {
      if (!value) return [];
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is ScoreEntry => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Partial<ScoreEntry>;
        return typeof candidate.score === 'number'
          && typeof candidate.experienceId === 'string'
          && typeof candidate.playerName === 'string'
          && typeof candidate.createdAt === 'string';
      }).map((entry) => ({ ...entry, playerName: this.cleanName(entry.playerName) }))
        .sort((a, b) => b.score - a.score);
    } catch {
      return [];
    }
  }

  private parseLegacy(value: string | null): ScoreEntry[] {
    try {
      if (!value) return [];
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((entry): ScoreEntry[] => {
        if (!entry || typeof entry !== 'object') return [];
        const candidate = entry as { score?: unknown; experienceId?: unknown; createdAt?: unknown };
        if (typeof candidate.score !== 'number' || typeof candidate.experienceId !== 'string' || typeof candidate.createdAt !== 'string') return [];
        return [{ score: candidate.score, experienceId: candidate.experienceId, playerName: '---', createdAt: candidate.createdAt }];
      }).sort((a, b) => b.score - a.score);
    } catch {
      return [];
    }
  }

  private cleanName(value: string): string {
    const cleaned = value.toLocaleUpperCase('pt-PT').replace(/[^A-ZÀ-Ü0-9-]/g, '').slice(0, 10);
    return cleaned || '---';
  }
}
