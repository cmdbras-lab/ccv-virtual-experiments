# Modelo científico

## Sistema estudado

O simulador representa, a temperatura constante, o equilíbrio gasoso

\[
2\,\mathrm{NO_2(g)} \rightleftharpoons \mathrm{N_2O_4(g)}
\]

e usa grandezas normalizadas. Os valores servem para observar relações e não constituem uma calibração para uma montagem laboratorial específica.

## Equilíbrio inicial

Com concentrações iniciais \(a=[NO_2]_i\) e \(b=[N_2O_4]_i\), o sistema parte do equilíbrio e, portanto,

\[
K_c=\frac{b}{a^2}.
\]

Se o volume for reduzido por um fator \(r\), de \(V_i\) para \(V_i/r\), as duas concentrações são multiplicadas por \(r\) antes de a reação responder. Logo,

\[
\frac{Q_{c,\,imediato}}{K_c}=\frac{1}{r}.
\]

Para \(r>1\), fica \(Q_c<K_c\): a velocidade direta supera a inversa e há formação líquida de \(N_2O_4\).

## Novo equilíbrio

O motor conserva o número de unidades equivalentes de \(NO_2\):

\[
n_{NO_2}+2n_{N_2O_4}=\text{constante}.
\]

No volume final, a solução analítica usada como referência é

\[
[NO_2]_f=\frac{-1+\sqrt{1+8K_cC_T}}{4K_c},
\qquad
[N_2O_4]_f=K_c[NO_2]_f^2,
\]

em que \(C_T=(n_{NO_2}+2n_{N_2O_4})/V_f\).

Para os valores predefinidos \(a=1,000\), \(b=0,500\) e \(r=2\), obtém-se:

- imediatamente após a compressão: \([NO_2]=2,000\), \([N_2O_4]=1,000\) e \(Q_c/K_c=0,500\);
- no novo equilíbrio: \([NO_2]\approx1,562\) e \([N_2O_4]\approx1,219\).

Assim, \([NO_2]_i<[NO_2]_f<[NO_2]_{imediato}\). A reação consome parte do aumento de concentração causado pela compressão, mas não o elimina por completo.

## Evolução temporal

A animação usa a lei cinética didática reversível

\[
v=k_d[NO_2]^2-k_i[N_2O_4],
\qquad k_i=\frac{k_d}{K_c},
\]

integrada numericamente pelo método de Runge–Kutta de quarta ordem. A igualdade entre as velocidades direta e inversa identifica o equilíbrio dinâmico.

## Modelo ótico

A absorvância mostrada é calculada por uma forma aditiva da lei de Beer–Lambert:

\[
A=l\left(\varepsilon_{NO_2}[NO_2]+\varepsilon_{N_2O_4}[N_2O_4]\right).
\]

Na vista superior, o percurso ótico acompanha a altura do recipiente e diminui por \(1/r\). No instante da compressão, o aumento das concentrações por \(r\) cancela essa redução do percurso. Na vista lateral, o diâmetro permanece constante; por isso, a absorvância aumenta imediatamente com a concentração. Depois, a reação altera a composição e as duas leituras podem evoluir de modo diferente.

## Limites e cuidados de interpretação

- A temperatura é constante, portanto \(K_c\) não muda durante a experiência.
- O gás é considerado ideal e homogéneo.
- A compressão mecânica e a resposta química podem ser separadas visualmente, mas essa pausa é uma estratégia didática.
- A lei cinética é uma idealização elementar; não pretende reproduzir todas as etapas microscópicas reais.
- A animação de partículas representa proporções e movimento qualitativos; não é dinâmica molecular.
- A cor observada depende simultaneamente da composição, dos coeficientes de absorção e do percurso ótico. “Mais concentrado” não implica, por si só, a mesma alteração visual em todas as direções de observação.

## Correções conceptuais incorporadas

O simulador evita três simplificações frequentes:

1. A reação não começa antes do salto físico de concentração numa compressão idealmente instantânea.
2. A conclusão sobre o sentido de evolução é obtida por \(Q_c/K_c\), e não apenas pela frase “a pressão favorece o lado com menos mols”.
3. A análise da cor inclui o percurso ótico; concentração e absorvância não são tratadas como sinónimos.
