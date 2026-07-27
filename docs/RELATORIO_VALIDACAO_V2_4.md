# Relatório de validação — Ciência em Movimento 2.4

## Correções verificadas

- os três logótipos PNG fornecidos estão presentes, com os mesmos bytes, em `public/branding/` e `dist/branding/`;
- o rodapé e o ecrã inicial usam as três marcas sem alterar a proporção;
- os títulos dos cartões são ajustados a um máximo de duas linhas, com redução automática do tamanho da letra e recorte interno;
- o instalador Windows deixou de executar `npm install` e usa um validador local com mensagens simples;
- a distribuição inclui todos os ficheiros necessários para execução offline depois de descompactada.

## Testes executados

- compilação TypeScript em modo estrito com TypeScript 5.8.3;
- construção completa de `dist/`;
- teste estrutural das cinco experiências em 1366 × 768 e 1600 × 900;
- validação dos recursos MediaPipe e das importações JavaScript;
- validação do cronómetro e das penalizações do Labirinto Vetorial;
- execução de `node scripts/validate-runtime.mjs`;
- extração e nova validação dos pacotes ZIP finais.

## Resultado

Todos os testes automatizados terminaram sem erros. A confirmação final deve ser feita no computador Windows e no ecrã 1366 × 768 da instalação, sobretudo para avaliar a escala física dos logótipos à distância.
