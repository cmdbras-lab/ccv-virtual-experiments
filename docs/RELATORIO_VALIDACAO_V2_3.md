# Relatório de validação — Ciência em Movimento 2.3

## Verificações concluídas

- compilação TypeScript em modo estrito, incluindo `noUncheckedIndexedAccess`;
- construção completa da distribuição `dist/`;
- resolução das importações JavaScript relativas;
- renderização estrutural das cinco experiências em 1366 × 768 e 1600 × 900;
- presença dos recursos locais MediaPipe e WebAssembly;
- presença e carregamento das duas marcas institucionais vetoriais;
- validação do texto institucional solicitado;
- validação do limite de 120 segundos no labirinto;
- validação da penalização configurável por colisão;
- validação estrutural do cronómetro, aviso visual e som de impacto.

## Resultado

A compilação específica da aplicação e o teste `scripts/smoke-test.mjs` terminaram sem erros.

## Validação física recomendada

No equipamento definitivo devem ser confirmados:

- legibilidade do rodapé e dos logótipos no televisor 1366 × 768;
- volume do som de colisão no sistema de áudio utilizado;
- adequação dos 120 segundos ao público da escola;
- sensibilidade e estabilidade da webcam com a iluminação real.
