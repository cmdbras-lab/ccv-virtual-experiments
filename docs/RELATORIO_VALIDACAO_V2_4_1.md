# Relatório de validação — Ciência em Movimento 2.4.1

## Correções verificadas

- os três logótipos originais estão presentes em `public/branding/` e `dist/branding/`;
- os logótipos são também incorporados em `dist/config.json` como `data:image/png;base64`, eliminando dependência de caminhos relativos no navegador;
- cada imagem incorporada foi descodificada e comparada por SHA-256 com o PNG original fornecido;
- o servidor local envia os PNG com `Content-Type: image/png`;
- o crédito institucional contém corretamente «prof. Carlos Brás»;
- títulos e subtítulos usam áreas independentes, redução automática da letra, limite horizontal e recorte interno;
- a instrução falada do Labirinto Vetorial informa apenas que cada colisão retira pontos; não anuncia a emissão de som;
- o som real de colisão e a penalização visual de pontos permanecem ativos.

## Testes executados

- verificação TypeScript em modo estrito;
- construção completa da distribuição 2.4.1;
- teste estrutural das cinco experiências em 1366 × 768 e 1600 × 900;
- execução do método real de desenho dos cinco cartões com validação das coordenadas, limites horizontais e limites verticais do texto em 1366 × 768;
- validação byte a byte e SHA-256 dos três logótipos originais, distribuídos e incorporados;
- teste HTTP local de HTML, JSON, JavaScript, CSS e PNG, incluindo tipos MIME e conteúdo servido;
- validação da configuração incorporada no HTML e da configuração executável;
- validação das importações JavaScript, modelos MediaPipe, cronómetro e penalizações do Labirinto Vetorial;
- execução de `node scripts/validate-runtime.mjs`.

## Resultado

Todos os testes automatizados terminaram sem erros. Os pacotes finais foram extraídos para pastas limpas e os mesmos testes foram repetidos sobre os ficheiros extraídos.
