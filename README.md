# Ciência em Movimento 3.0

Plataforma modular de experiências científicas controladas por gestos, preparada para funcionar autonomamente num televisor ou ecrã da escola.

## Experiências incluídas

1. **Coloca o planeta em órbita** — lançamento assistido, trajetória prevista e observação de pelo menos três órbitas com os vetores velocidade e força gravítica.
2. **Laboratório de lasers** — laser à esquerda, espelho ao centro e alvo aleatório; normal e ângulos de incidência/reflexão assinalados e questionário após cada jogada.
3. **Constrói uma molécula** — água, dióxido de carbono, amoníaco e metano; cada molécula completa roda no espaço e apresenta geometria e curiosidades.
4. **Luz, ondas e espetro** — as sete cores do arco-íris surgem em ordem aleatória, com controlo do comprimento de onda e da intensidade.
5. **Labirinto vetorial** — bola com inércia, controlo suavizado, vetores velocidade/aceleração, atrito, colisões e cronómetro progressivo.
6. **Duelo gravitacional** — dois jogadores lançam asteroides por turnos contra o planeta adversário. Os dois campos gravíticos curvam a trajetória e podem produzir impacto, fuga ou captura orbital. São mostrados os vetores velocidade, aceleração/força resultante e as componentes gravíticas de cada planeta.

## Duelo gravitacional

- dois jogadores e uma única webcam, com jogadas alternadas para evitar trocas de mão;
- quatro asteroides iniciais e três vidas por jogador;
- previsão tracejada da trajetória antes do lançamento;
- atração simultânea dos dois planetas;
- visualização de `v`, `a/F`, `F₁`, `F₂` e `F = F₁ + F₂`;
- impactos, autocolisões, fugas e capturas orbitais;
- uma captura atribui pontos ao planeta que captura e um lançamento adicional;
- resultado final convertido para a escala global de 0 a 1000 pontos.

Os parâmetros do duelo podem ser ajustados em `public/config.json`, na secção `gravitationalDuel`.

## Funcionamento autónomo

- tenta iniciar a câmara automaticamente;
- quando deteta uma mão ou movimento recente, apresenta e pode dizer um convite para jogar;
- cada experiência começa num ecrã de instruções e só avança após uma pinça deliberada;
- regressa ao menu após inatividade;
- não utiliza reconhecimento facial nem identifica pessoas;
- não grava imagens, vídeo ou som.

A deteção de presença é apenas um sinal local de movimento de baixa resolução, combinado com a deteção da mão. Não são conservadas imagens.

## Menu gestual

A escolha exige manter a mão dentro de um cartão durante **3,5 segundos**. Existe atraso inicial, margem interna nos cartões e reinício da contagem quando a mão se desloca demasiado. A seleção imediata por pinça está desativada. O menu 3×2 apresenta agora as seis experiências.

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

`INSTALAR_WINDOWS.bat` verifica a integridade do pacote local. A versão executável não descarrega dependências e funciona offline depois de descompactada, desde que o computador tenha Node.js LTS.

## Teclas administrativas

- `B` — menu;
- `R` — reiniciar experiência;
- `F` — ecrã inteiro;
- `M` — desligar áudio;
- `Ctrl + Shift + L` — apagar ranking local.

## Configuração do duelo

```json
"gravitationalDuel": {
  "shotsPerPlayer": 4,
  "planetLives": 3,
  "maximumFlightSeconds": 14,
  "launchVelocityScale": 1.9,
  "gravityStrength": 0.0105,
  "trajectoryPreviewSeconds": 5.6,
  "captureRadiusMultiplier": 3.4,
  "captureHoldSeconds": 0.8,
  "captureObservationSeconds": 2.8,
  "turnPauseSeconds": 1.7,
  "assistanceStrength": 0.18,
  "showTrajectoryPreview": true,
  "showForceComponents": true
}
```

## Desenvolvimento

Requisitos: Node.js LTS e npm.

```bash
npm install
npm run check
npm run test:smoke
npm run dev
```

A arquitetura está em `src/core/`, `src/experiences/` e `src/experiences/index.ts`. O comando `npm run assemble` recompõe o ficheiro do Duelo Gravitacional a partir das partes-fonte antes da compilação. Consulte `docs/CRIAR_NOVA_EXPERIENCIA.md`.

## Recursos MediaPipe no repositório

Os modelos e binários do MediaPipe não são guardados no histórico Git. São copiados automaticamente da dependência `@mediapipe/hands` para `public/mediapipe/hands/` durante a preparação. A versão executável continua a ser totalmente local e offline depois da instalação.
