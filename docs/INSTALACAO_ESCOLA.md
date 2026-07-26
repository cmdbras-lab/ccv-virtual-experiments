# Instalação na escola — versão 2.2

## Equipamento recomendado

- computador ou mini-PC com Windows 10/11;
- Node.js LTS;
- Google Chrome ou Microsoft Edge;
- webcam 1080p junto ao ecrã;
- televisor ligado por HDMI;
- marca no chão a aproximadamente 1,5–2,5 m.

## Instalação

1. Descompactar numa pasta nova.
2. Executar `EXECUTAR_DEMO_WINDOWS.bat` e testar com o rato.
3. Executar `EXECUTAR_WINDOWS.bat`.
4. Autorizar a câmara na primeira utilização.
5. Reiniciar o programa para confirmar que a autorização fica memorizada e o arranque passa a ser autónomo.
6. Confirmar iluminação, convite por presença, volume da voz e escala da mão.

## Operação diária

O sistema tenta iniciar a câmara automaticamente, chama a atenção de quem se aproxima e regressa ao menu após inatividade. A tecla `B` força o menu. `Ctrl + Shift + L` apaga o ranking local.

## Marcas institucionais

Os ficheiros `public/branding/logo-aeas.png`, `public/branding/barra-prr-2024.png` e `public/branding/logo-clubes-ciencia-viva.png` são os logótipos originais usados pela aplicação. Preserve estes nomes e não altere a proporção das imagens.

## Instalação 2.4 sem dependências npm

No pacote completo, `INSTALAR_WINDOWS.bat` apenas verifica a distribuição já compilada. Não descarrega bibliotecas nem executa `npm install`. O acesso à Internet só é necessário para quem pretenda alterar e recompilar o código-fonte.
