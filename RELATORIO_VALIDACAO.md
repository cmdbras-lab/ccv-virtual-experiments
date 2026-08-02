# Relatório de validação — Ciência em Movimento 3.0.6

## Verificações concluídas

- verificação TypeScript em modo estrito;
- compilação modular para `dist/`;
- teste estrutural das seis experiências;
- resolução das importações JavaScript relativas;
- presença local dos modelos e ficheiros WebAssembly do MediaPipe Hands e MediaPipe Pose;
- carregamento do `pose.js` antes do módulo principal;
- validação do avatar corporal no código e ativação apenas no menu;
- validação das três dificuldades do Duelo Gravitacional;
- simulação automática da escolha do modo Assistido;
- simulação automática da colisão com a nave e geração de explosão/partículas;
- teste HTTP local do menu, do modelo Pose e dos recursos principais;
- validação do pacote executável sem acesso à Internet.

## Resultado

A compilação, o teste `scripts/smoke-test.mjs` e `scripts/validate-runtime.mjs` terminaram sem erros.

## Validação ainda necessária no equipamento físico

- desempenho conjunto de Hands a 24 fps e Pose leve a 12 fps no computador da escola;
- estabilidade do avatar com a iluminação e distância reais;
- enquadramento necessário para captar pernas e tornozelos;
- dimensão da nave e da zona de colisão no televisor;
- duração de cada dificuldade com alunos;
- volume dos sons e legibilidade das partículas a distância.

O sistema não faz reconhecimento facial nem identifica pessoas. O processamento corporal e da mão ocorre localmente; não grava imagens, som ou coordenadas.
