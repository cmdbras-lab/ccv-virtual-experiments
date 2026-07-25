# Ranking global e introdução do nome

## Decisão de desenho

Não se usa teclado físico, reconhecimento de voz nem nome completo. O sistema pede três iniciais apenas quando a pontuação pode entrar no Top global.

Esta solução reduz:

- tempo entre jogadores;
- ruído e erros de reconhecimento de voz;
- recolha desnecessária de dados pessoais;
- necessidade de tocar no equipamento.

## Fluxo

1. A experiência termina.
2. O sistema compara a pontuação com o Top global.
3. Se não qualificar, guarda o resultado anonimamente e regressa ao menu.
4. Se qualificar, apresenta o teclado gestual.
5. O aluno seleciona três letras.
6. O resultado é apresentado no Top e o sistema regressa ao menu.

## Seleção

Cada tecla pode ser ativada de duas formas:

- manter o indicador sobre a tecla durante 0,6 s;
- fazer pinça enquanto aponta para a tecla.

A terceira inicial provoca a gravação automática após uma pausa curta.

## Armazenamento

O ranking é guardado em `localStorage` no perfil do navegador do computador. Não é enviado para a Internet.

Para apagar o ranking, usar:

```text
Ctrl + Shift + L
```

## Limitação

“Global” significa global para os cinco módulos naquele computador. Para vários televisores ou computadores partilharem o mesmo Top, deverá ser acrescentada uma API local e uma base de dados central.
