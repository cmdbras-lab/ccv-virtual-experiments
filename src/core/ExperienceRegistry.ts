import type { ExperienceFactory, ExperienceManifest } from './Experience.js';

type Entry = { manifest: ExperienceManifest; factory: ExperienceFactory };

export class ExperienceRegistry {
  private readonly entries = new Map<string, Entry>();

  register(manifest: ExperienceManifest, factory: ExperienceFactory): void {
    if (this.entries.has(manifest.id)) {
      throw new Error(`Já existe uma experiência com o id “${manifest.id}”.`);
    }
    this.entries.set(manifest.id, { manifest, factory });
  }

  create(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Experiência não encontrada: ${id}`);
    return entry.factory();
  }

  list(): ExperienceManifest[] {
    return [...this.entries.values()].map((entry) => entry.manifest);
  }
}
