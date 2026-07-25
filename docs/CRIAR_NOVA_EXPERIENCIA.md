# Criar uma nova experiência

## 1. Copiar o modelo

Copie:

```text
src/experiences/template/TemplateExperience.ts
```

para uma nova pasta em `src/experiences/`.

## 2. Definir o manifesto

Cada módulo deve ter um identificador único, título, subtítulo, descrição, ícone, versão e autor.

```ts
export const manifest = {
  id: 'identificador-unico',
  title: 'Título',
  subtitle: 'Instrução curta',
  description: 'Conceito científico trabalhado.',
  icon: '🔬',
  version: '1.0.0',
  author: 'Nome da equipa',
};
```

O manifesto é usado automaticamente no menu gestual e no Top global.

## 3. Implementar a interface

```ts
interface Experience {
  mount(context): void;
  start(): void;
  update(dtSeconds, input): void;
  render(): void;
  resize(viewport): void;
  dispose(): void;
}
```

O objeto `input` disponibiliza:

```ts
input.present
input.cursor.x
input.cursor.y
input.velocity
input.landmarks
input.pinch
input.pinchStarted
input.pinchEnded
```

Use `drawHandSkeleton` de `src/core/GestureGraphics.ts` para apresentar a mão de modo consistente.

## 4. Terminar e pontuar

A experiência termina através de:

```ts
context.complete({
  score: 0, // entre 0 e 1000
  title: 'Resultado',
  explanation: 'Explicação científica curta.',
  details: ['Indicador 1', 'Indicador 2'],
});
```

A pontuação deve estar normalizada entre 0 e 1000 para ser comparável no Top global.

## 5. Registar o módulo

Em `src/experiences/index.ts`:

```ts
import { NovaExperience, novaManifest } from './nova/NovaExperience';

registry.register(novaManifest, () => new NovaExperience());
```

Depois de registado, o módulo aparece automaticamente no menu. O desenho atual está preparado para quatro cartões; ao acrescentar mais módulos deverá adaptar-se `menuCards()` em `src/App.ts` para paginação ou mais linhas.

## 6. Validar

```bash
npm run check
npm run test:smoke
```
