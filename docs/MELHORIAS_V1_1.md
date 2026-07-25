# Melhorias da versão 1.1

A versão 1.1 torna a experiência mais acessível e mais pedagógica, sem retirar ao jogador o controlo do lançamento.

## 1. Mão virtual visível

Os 21 pontos detetados pelo MediaPipe são convertidos numa mão virtual luminosa. A imagem real da câmara continua sem ser mostrada, gravada ou guardada.

- azul: mão aberta ou em movimento;
- verde: gesto de pinça ativo;
- polegar e indicador destacados para facilitar a aprendizagem do gesto.

## 2. Controlo por deslocamento

Na versão anterior, a intensidade dependia sobretudo da rapidez do gesto no instante da libertação. Na versão 1.1, o controlo funciona como um lançamento preparado:

1. o jogador faz pinça sobre o planeta;
2. desloca a mão e pode mantê-la parada;
3. o vetor fica visível e estável;
4. abre os dedos quando estiver satisfeito.

Isto permite observar, corrigir e aprender antes de lançar.

## 3. Feedback visual

Enquanto o planeta está agarrado, são apresentados:

- seta verde tracejada: direção tangencial recomendada;
- seta colorida: direção e intensidade escolhidas;
- trajetória tracejada: previsão do movimento após a libertação;
- barra de intensidade com zona recomendada;
- mensagens como “aumenta a intensidade”, “lança de lado” ou “excelente”.

## 4. Assistência pedagógica

O lançamento real é corrigido parcialmente em direção à velocidade orbital adequada. A correção não cria automaticamente uma órbita perfeita: preserva uma parte maioritária do gesto do jogador e evita que pequenos erros tornem o jogo frustrante.

O parâmetro `assistanceStrength` pode variar entre `0` e aproximadamente `0.8`:

- `0`: sem assistência;
- `0.35`: assistência ligeira;
- `0.55`: valor recomendado para a entrada da escola;
- `0.7`: modo muito acessível.

## 5. Dificuldade ajustada

A configuração recomendada passou para:

- 6 segundos de estabilidade necessários;
- zona de captura do planeta mais ampla;
- tolerância orbital superior;
- perda de estabilidade mais gradual;
- assistência de lançamento a 55%.

## Parâmetros em `public/config.json`

```json
{
  "orbit": {
    "challengeSeconds": 6,
    "maximumFlightSeconds": 18,
    "launchVelocityScale": 2.45,
    "gravityStrength": 0.015,
    "targetRadiusFraction": 0.29,
    "assistanceStrength": 0.55,
    "successQualityThreshold": 0.43,
    "showHandSkeleton": true,
    "showTrajectoryPreview": true
  }
}
```
