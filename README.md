# Ciência em Movimento 2.2

Plataforma modular de experiências científicas controladas por gestos, preparada para funcionar autonomamente num televisor ou ecrã da escola.

## Experiências incluídas

1. **Coloca o planeta em órbita** — planeta visualmente maior, Sol mais pequeno, lançamento assistido, trajetória prevista e observação de pelo menos três órbitas com os vetores velocidade e força gravítica.
2. **Laboratório de lasers** — laser à esquerda, espelho ao centro e alvo aleatório ao longo do topo; normal e ângulos de incidência/reflexão assinalados e questionário após cada jogada.
3. **Constrói uma molécula** — água, dióxido de carbono, amoníaco e metano; cada molécula completa roda no espaço e apresenta geometria e curiosidades.
4. **Luz, ondas e espetro** — as sete cores do arco-íris surgem em ordem aleatória, com controlo do comprimento de onda e da intensidade.
5. **Labirinto vetorial** — bola com maior inércia, controlo suavizado, vetores velocidade/aceleração, atrito, colisões e cronómetro progressivo.

## Funcionamento autónomo

- tenta iniciar a câmara automaticamente;
- quando deteta uma mão ou movimento recente, apresenta e pode dizer um convite para jogar;
- cada experiência começa num ecrã de instruções e só avança após uma pinça deliberada;
- regressa ao menu após inatividade;
- não utiliza reconhecimento facial nem identifica pessoas;
- não grava imagens, vídeo ou som.

A deteção de presença é apenas um sinal local de movimento de baixa resolução, combinado com a deteção da mão. Não são conservadas imagens.

## Menu gestual

A escolha exige manter a mão dentro de um cartão durante **3,5 segundos**. Existe atraso inicial, margem interna nos cartões e reinício da contagem quando a mão se desloca demasiado. A seleção imediata por pinça está desativada.

## Identificação institucional

O menu e os restantes ecrãs apresentam marcas compactas e o rodapé:

> Coordenador CCV — Prof. Carlos Brás · Desenvolvido por Prof. Carlos Brás com recurso a AI

Os SVG em `public/branding/` são marcas tipográficas locais simplificadas. Podem ser substituídos pelos ficheiros oficiais, conservando os mesmos nomes, sem alterar o código.

## Top global e privacidade

Todas as experiências atribuem entre 0 e 1000 pontos. O Top global reúne os melhores resultados no computador da instalação e pede apenas três iniciais quando a pontuação se qualifica.

- processamento local;
- sem reconhecimento facial;
- sem gravação de vídeo ou áudio;
- resultados guardados apenas em `localStorage`.

## Executar no computador da escola

Com webcam:

```text
EXECUTAR_WINDOWS.bat
```

Teste com rato:

```text
EXECUTAR_DEMO_WINDOWS.bat
```

No modo de demonstração, mover o rato representa o indicador e manter o botão premido representa a pinça.

## Teclas administrativas

- `B` — menu;
- `R` — reiniciar experiência;
- `F` — ecrã inteiro;
- `M` — desligar áudio;
- `Ctrl + Shift + L` — apagar ranking local.

## Configuração

Os parâmetros estão em `public/config.json` e, no pacote executável, em `dist/config.json`. Incluem:

- modo autónomo, voz e tempo de presença recente;
- permanência no menu;
- dimensões relativas do Sol e do planeta;
- duração da observação molecular;
- questionário do laser;
- intensidade, massa, resposta e velocidade máxima do labirinto.

## Desenvolvimento

Requisitos: Node.js LTS e npm.

```bash
npm install
npm run check
npm run test:smoke
npm run dev
```

A arquitetura está em `src/core/`, `src/experiences/` e `src/experiences/index.ts`. Consulte `docs/CRIAR_NOVA_EXPERIENCIA.md`.

## Recursos MediaPipe no repositório

Os modelos e binários do MediaPipe não são guardados no histórico Git. São copiados automaticamente da dependência `@mediapipe/hands` para `public/mediapipe/hands/` durante `npm install`/`npm ci`. A versão executável continua a ser totalmente local e offline depois da instalação.
