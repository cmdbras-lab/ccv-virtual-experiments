# Atualizar Ciência em Movimento para 2.4.1

Branch de trabalho: `update/ciencia-em-movimento-2.4.1`
Base: `main`

## Fonte da atualização

Usar o pacote validado `ciencia-em-movimento-v2.4.1-completo.zip`, fornecido na tarefa do Cloud Codex.

## Requisitos obrigatórios

1. Substituir a versão 2.2.0 do repositório pela versão 2.4.1 do pacote.
2. Preservar as correções de CI existentes na `main`, nomeadamente:
   - `.github/workflows/validate.yml`;
   - `tsconfig.build.json`;
   - `src/styles.d.ts`;
   - compilação através de `tsc --project tsconfig.build.json` em `scripts/build.mjs`.
3. Manter os três logótipos institucionais originais incluídos no pacote.
4. Confirmar que a distribuição compilada incorpora os logótipos como `data:image/png;base64`.
5. Confirmar que os títulos das experiências permanecem dentro dos cartões a 1366 × 768.
6. Confirmar o texto: `Desenvolvido com recurso a IA pelo coordenador CCV Abel Salazar - prof. Carlos Brás.`
7. Na instrução falada do labirinto, mencionar apenas que cada colisão faz perder pontos; não dizer que a colisão emite som.
8. Não adicionar `dist/`, `node_modules/` nem `public/mediapipe/` ao Git.

## Validação obrigatória

Executar:

```bash
npm ci --ignore-scripts
npm run setup
npm run check
npm run test:smoke
```

Se existir teste HTTP/runtime no pacote, executar também:

```bash
npm run build
node scripts/http-test.mjs
node scripts/validate-runtime.mjs
```

## Entrega

- Rever o diff contra `main`.
- Não alterar ficheiros alheios ao projeto.
- Criar um commit claro com a versão 2.4.1.
- Abrir pull request para `main`.
- Não fazer merge automático.
- Incluir no PR o resultado integral dos testes e qualquer limitação de validação em Windows real.
