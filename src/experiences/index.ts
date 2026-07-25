import type { ExperienceRegistry } from '../core/ExperienceRegistry.js';
import { LaserExperience, laserManifest } from './laser/LaserExperience.js';
import { MoleculeExperience, moleculeManifest } from './molecules/MoleculeExperience.js';
import { OrbitExperience, orbitManifest } from './orbit/OrbitExperience.js';
import { VectorMazeExperience, vectorMazeManifest } from './vector-maze/VectorMazeExperience.js';
import { WavesExperience, wavesManifest } from './waves/WavesExperience.js';

export function registerExperiences(registry: ExperienceRegistry): void {
  registry.register(orbitManifest, () => new OrbitExperience());
  registry.register(laserManifest, () => new LaserExperience());
  registry.register(moleculeManifest, () => new MoleculeExperience());
  registry.register(wavesManifest, () => new WavesExperience());
  registry.register(vectorMazeManifest, () => new VectorMazeExperience());

  // Para ativar uma experiência criada pelos alunos:
  // 1. importar a classe e o manifesto;
  // 2. chamar registry.register(manifesto, () => new NovaExperiencia()).
}
