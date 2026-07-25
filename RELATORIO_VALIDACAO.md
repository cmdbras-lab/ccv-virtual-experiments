# Relatório de validação — Ciência em Movimento 2.2

## Verificações concluídas

- verificação TypeScript em modo estrito, incluindo `noUncheckedIndexedAccess`;
- construção da distribuição modular em `dist/`;
- teste estrutural das cinco experiências;
- resolução de todas as importações JavaScript relativas;
- presença dos modelos MediaPipe e ficheiros WebAssembly locais;
- presença da configuração, marcas institucionais e recursos de execução;
- validação matemática da orientação ideal do espelho para alvos no topo;
- teste HTTP local dos recursos principais.

## Resultado

A compilação e o teste `scripts/smoke-test.mjs` terminaram sem erros.

## Validação ainda necessária no equipamento físico

- autorização inicial da webcam no perfil do navegador;
- sensibilidade do convite por movimento com a iluminação real;
- volume e disponibilidade da voz portuguesa instalada no Windows;
- facilidade dos novos ângulos do espelho;
- sensação de inércia do labirinto;
- escala visual das marcas institucionais no televisor.

O sistema não faz reconhecimento facial. A presença é inferida localmente por movimento recente de uma grelha de baixa resolução e pela deteção da mão; não guarda frames nem amostras após a execução.
