# Ciência em Movimento 2.4.1

Plataforma modular de experiências científicas controladas por gestos, preparada para funcionar autonomamente num televisor ou ecrã da escola.

## Experiências incluídas

1. **Coloca o planeta em órbita** — planeta visualmente maior, Sol mais pequeno, lançamento assistido, trajetória prevista e observação de pelo menos três órbitas com os vetores velocidade e força gravítica.
2. **Laboratório de lasers** — laser à esquerda, espelho ao centro e alvo aleatório ao longo do topo; normal e ângulos de incidência/reflexão assinalados e questionário após cada jogada.
3. **Constrói uma molécula** — água, dióxido de carbono, amoníaco e metano; cada molécula completa roda no espaço e apresenta geometria e curiosidades.
4. **Luz, ondas e espetro** — as sete cores do arco-íris surgem em ordem aleatória, com controlo do comprimento de onda e da intensidade.
5. **Labirinto vetorial** — bola com maior inércia, controlo suavizado, vetores velocidade/aceleração, cronómetro digital de 120 segundos e penalização visual e sonora de 25 pontos por colisão.

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

> Desenvolvido com recurso a IA pelo coordenador CCV Abel Salazar - prof. Carlos Brás.

Os três ficheiros PNG em `public/branding/` são os logótipos originais fornecidos: Agrupamento de Escolas Abel Salazar, barra PRR/República Portuguesa/União Europeia e Clubes Ciência Viva na Escola. Na distribuição executável, os mesmos bytes são também incorporados em `dist/config.json` como imagens PNG locais, evitando falhas de carregamento por caminho ou tipo MIME. São apresentados sem deformação e sobre fundo branco.

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
- intensidade, massa, resposta, velocidade máxima, duração e penalização por colisão do labirinto.

## Resolução de instalação

O layout inclui uma composição compacta específica para ecrãs **1366 × 768**, mantendo o rodapé, os logótipos, os cartões do menu e os resultados dentro da área visível.

## Desenvolvimento

Requisitos: Node.js LTS e npm.

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run setup
npm run check
npm run test:smoke
npm run dev
```

A arquitetura está em `src/core/`, `src/experiences/` e `src/experiences/index.ts`. Consulte `docs/CRIAR_NOVA_EXPERIENCIA.md`.

## Instalação da versão completa 2.4.1

`INSTALAR_WINDOWS.bat` já não executa `npm install`. A distribuição compilada e os recursos MediaPipe estão incluídos no ZIP, pelo que o instalador apenas verifica os ficheiros necessários. Esta alteração elimina o erro de instalação apresentado como `error: [Circular *1]` em algumas combinações de Node.js/npm no Windows.

Os títulos e subtítulos dos cinco cartões são desenhados em áreas verticais independentes, com ajuste automático de tamanho, máximo de duas linhas, limite horizontal explícito e recorte próprio. Assim, nenhum texto pode sair da respetiva caixa ou sobrepor-se ao subtítulo em 1366 × 768.
