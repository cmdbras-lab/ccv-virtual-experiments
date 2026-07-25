# Arquitetura do sistema 2.2

```text
Webcam
  └─ HandTracker
       ├─ MediaPipe Hands local
       ├─ sinal local de movimento/presença
       ├─ suavização do cursor
       ├─ 21 pontos da mão
       └─ deteção de pinça
             ↓
       HandInput normalizado
             ↓
App / convite autónomo / menu gestual / nome-relâmpago
             ↓
ExperienceRunner ── ExperienceRegistry
       │                    ├─ órbitas
       │                    ├─ lasers
       │                    ├─ moléculas
       │                    ├─ ondas/espetro
       │                    └─ labirinto vetorial
       ├─ Canvas 2D
       ├─ áudio e fala sintetizados
       ├─ configuração
       └─ ScoreStore / Top global / localStorage
```

## Privacidade do sinal de presença

O `HandTracker` compara temporariamente uma grelha de luminância de 24 × 14 pontos para reconhecer alteração recente na imagem. Guarda apenas a amostra anterior em memória durante a execução. Não reconhece rostos, não identifica pessoas e não grava frames.

## Responsabilidades

- **HandTracker** — vídeo para coordenadas, landmarks, pinça e sinal de presença.
- **App** — autorização, convite autónomo, menu, voz, resultados, iniciais e Top.
- **ExperienceRunner** — montagem de módulos, Canvas, áudio, configuração e conclusão.
- **ExperienceRegistry** — registo modular e construção automática do menu.
- **ScoreStore** — pontuações locais de 0 a 1000 e três iniciais.

## Limites conhecidos

- a primeira autorização da câmara pode exigir um clique;
- iluminação, fundo e colocação da webcam influenciam a deteção;
- a voz depende das vozes instaladas no Windows/navegador;
- o ranking não é partilhado entre computadores;
- a presença por movimento é um convite aproximado, não um sensor de ocupação certificado.
