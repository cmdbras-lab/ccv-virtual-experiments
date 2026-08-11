# Ciência em Movimento 3.0

> **Versão 3.0.6.1** — correção urgente do arranque: impede a mistura de ficheiros em cache entre versões, força a atualização de `config.json` e torna o branding compatível com configurações anteriores.

Plataforma modular de experiências científicas controladas por gestos, preparada para funcionar autonomamente num televisor ou ecrã da escola.

## Aplicações pedagógicas independentes

### Esfera Vetorial

Aplicação pedagógica Android para explorar visualmente os vetores velocidade e aceleração. Inclui uma esfera controlada pela inclinação do telemóvel, desafios em pistas e um modo em que o utilizador desenha a trajetória que a esfera irá percorrer, com decomposição vetorial, pausa e slow motion.

- [**Página de divulgação da Esfera Vetorial**](https://cmdbras-lab.github.io/ccv-virtual-experiments/esfera-vetorial/)
- [**Projeto, documentação e screenshots**](apps/esfera-vetorial/)
- [**Descarregar Esfera Vetorial v0.2.2 (APK)**](apps/esfera-vetorial/downloads/EsferaVetorial-v0.2.2.apk)

> Idealizado e desenvolvido por Carlos Brás @ Clube Ciência Viva Abel Salazar- junho 2026. (Programação com recurso IA).

### Laboratório NO₂ ⇌ N₂O₄

Aplicação web para explorar a compressão isotérmica do equilíbrio `2 NO₂(g) ⇌ N₂O₄(g)`. Apresenta animação molecular, concentrações, `Qc/Kc`, velocidades direta/inversa, gráficos, comparação ótica entre vistas superior e lateral e um desafio de previsão.

- [**Experimentar no navegador**](https://cmdbras-lab.github.io/ccv-virtual-experiments/laboratorio-no2-n2o4/app/)
- [**Página de divulgação e download**](https://cmdbras-lab.github.io/ccv-virtual-experiments/laboratorio-no2-n2o4/)
- [**Código, documentação e guião didático**](apps/laboratorio-no2-n2o4/)
- [**Descarregar Laboratório NO₂ ⇌ N₂O₄ v1.0.0**](apps/laboratorio-no2-n2o4/downloads/Laboratorio-NO2-N2O4-v1.0.0.zip)

> Idealizado e desenvolvido por Carlos Brás @ Clube Ciência Viva Abel Salazar — agosto 2026. (Programação com recurso IA).

## Experiências incluídas

1. **Coloca o planeta em órbita** — lançamento assistido, trajetória prevista e observação de pelo menos três órbitas com os vetores velocidade e força gravítica.
2. **Laboratório de lasers** — laser à esquerda, espelho ao centro e alvo aleatório; normal e ângulos de incidência/reflexão assinalados e questionário após cada jogada.
3. **Constrói uma molécula** — água, dióxido de carbono, amoníaco e metano; cada molécula completa roda no espaço e apresenta geometria e curiosidades.
4. **Luz, ondas e espetro** — as sete cores do arco-íris surgem em ordem aleatória, com controlo do comprimento de onda e da intensidade.
5. **Labirinto vetorial** — bola com inércia, controlo suavizado, vetores velocidade/aceleração, atrito, colisões e cronómetro progressivo.
6. **Duelo gravitacional** — dois jogadores lançam asteroides por turnos contra o planeta adversário. Os dois campos gravíticos curvam a trajetória e podem produzir impacto, fuga ou captura orbital. São mostrados os vetores velocidade, aceleração/força resultante e as componentes gravíticas de cada planeta.

## Duelo gravitacional

- dois jogadores e uma única webcam, com jogadas alternadas para evitar trocas de mão;
- três dificuldades: **Assistido**, **Normal** e **Desafio**;
- nave em trânsito entre os planetas, usada como obstáculo e cronómetro do turno;
- ataques diretos tendem a colidir com a nave, incentivando trajetórias curvas;
- colisões com a nave produzem uma explosão visual com partículas;
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

No menu de entrada, o MediaPipe Pose identifica localmente pontos articulares do corpo para desenhar um avatar. O rastreio corporal é desligado quando começa uma experiência e fica ativa apenas a deteção da mão. Não são guardadas imagens, vídeo, som ou coordenadas corporais.

## Rastreio corporal local

- utiliza **MediaPipe Pose** com o modelo leve, incluído no pacote;
- funciona sem Internet depois de descompactado;
- acompanha cabeça, ombros, cotovelos, pulsos, ancas, joelhos e tornozelos;
- é executado apenas no menu de entrada, reduzindo a carga durante os jogos;
- se a pose não estiver disponível, mantém-se um avatar aproximado baseado no movimento.

## Menu gestual

A escolha exige manter a mão dentro de um cartão durante **3,5 segundos**. Existe atraso inicial, margem interna nos cartões e reinício da contagem quando a mão se desloca demasiado. A seleção imediata por pinça está desativada. O menu 3×2 apresenta agora as seis experiências.

## Identificação institucional

O menu apresenta no rodapé os logótipos oficiais fornecidos e a frase:

> Desenvolvido pelo coordenador do Clube Ciência Viva Abel Salazar - professor Carlos Brás - julho 2026

Os logótipos não surgem dentro dos jogos, preservando o espaço útil do ecrã.

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

A arquitetura está em `src/core/`, `src/experiences/` e `src/experiences/index.ts`. O comando `npm run assemble` verifica o ficheiro do Duelo Gravitacional antes da compilação. Consulte `docs/CRIAR_NOVA_EXPERIENCIA.md`.

## Recursos MediaPipe no repositório

Os modelos e binários do MediaPipe não são guardados no histórico Git. São copiados automaticamente da dependência `@mediapipe/hands` para `public/mediapipe/hands/` durante a preparação. A versão executável continua a ser totalmente local e offline depois da instalação.
