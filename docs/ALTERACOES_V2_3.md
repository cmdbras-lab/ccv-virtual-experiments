# Ciência em Movimento 2.3 — alterações

## Compatibilidade com 1366 × 768

- composição compacta ativada em ecrãs de reduzida altura;
- cartões de permissão e resultados com menor altura e espaçamento;
- menu, Top global e teclado de iniciais reposicionados acima do rodapé;
- rodapé institucional reduzido e mantido integralmente visível;
- logótipos dimensionados sem deformação e apresentados sobre fundo branco.

## Identificação institucional

O rodapé passou a apresentar exclusivamente:

> Desenvolvido com recurso a IA pelo coordenador CCV Abel Salazar - prof. Carlos Brás.

As antigas marcas tipográficas simplificadas foram substituídas por versões vetoriais fiéis às marcas institucionais AEAS e Ciência Viva.

## Labirinto vetorial

- tempo máximo aumentado de 90 para 120 segundos;
- cronómetro digital permanente, central e de elevada visibilidade;
- pontos atuais visíveis durante toda a jogada;
- penalização configurável de 25 pontos por choque numa parede;
- contador de colisões e indicação explícita da penalização;
- moldura vermelha e mensagem «COLISÃO! −25 PONTOS» após cada impacto;
- som grave de colisão em duas fases;
- resultado final indica os pontos perdidos nas paredes;
- instruções iniciais e faladas explicam a regra de penalização.

## Configuração

Os novos valores encontram-se em `public/config.json`:

```json
"vectorMaze": {
  "maximumSeconds": 120,
  "collisionPenaltyPoints": 25
}
```
