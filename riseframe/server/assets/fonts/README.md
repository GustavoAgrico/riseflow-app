# Fontes das legendas (empacotadas)

Fontes premium usadas nas legendas, embutidas para renderizar igual em qualquer
máquina (o FFmpeg/libass as carrega via `fontsdir`). Todas são de licença aberta
**SIL Open Font License 1.1** (ver `OFL.txt`) — exceto a Permanent Marker, Apache 2.0 —,
redistribuíveis com o app.

| Arquivo | Família | Fonte |
|---|---|---|
| Poppins-Bold.ttf | Poppins | Indian Type Foundry (Google Fonts) |
| Inter.ttf | Inter | Rasmus Andersson — equivalente livre estilo Helvetica |
| OpenSans.ttf | Open Sans | Steve Matteson (Google Fonts) |
| Anton-Regular.ttf | Anton | Vernon Adams (Google Fonts) |
| BebasNeue-Regular.ttf | Bebas Neue | Ryoichi Tsunekawa (Google Fonts) |
| ArchivoBlack-Regular.ttf | Archivo Black | Omnibus-Type (Google Fonts) |
| EBGaramond.ttf | EB Garamond | Georg Duffner — equivalente livre estilo Garamond |
| LuckiestGuy-Regular.ttf | Luckiest Guy | Astigmatic (Google Fonts) |
| Oswald-Bold.ttf | Oswald | Vernon Adams (Google Fonts) |
| Bangers-Regular.ttf | Bangers | Vernon Adams (Google Fonts) |
| LilitaOne-Regular.ttf | Lilita One | Juan Montoreano (Google Fonts) |
| Rubik-ExtraBold.ttf | Rubik ExtraBold | Hubert & Fischer (Google Fonts) |
| Nunito-Black.ttf | Nunito Black | Vernon Adams (Google Fonts) |
| PlayfairDisplay-Black.ttf | Playfair Display Black | Claus Eggers Sørensen (Google Fonts) |
| PermanentMarker-Regular.ttf | Permanent Marker | Font Diner — **Apache License 2.0** (ver `LICENSE-PermanentMarker-Apache-2.0.txt`) |
| Kanit-ExtraBold.ttf | Kanit ExtraBold | Cadson Demak (Google Fonts) |
| Righteous-Regular.ttf | Righteous | Astigmatic (Google Fonts) |
| Pacifico-Regular.ttf | Pacifico | Vernon Adams (Google Fonts) |
| Fredoka-Bold.ttf | Fredoka | Milena Brandão (Google Fonts) |
| BarlowCondensed-ExtraBold.ttf | Barlow Condensed ExtraBold | Jeremy Tribby (Google Fonts) |

As 12 últimas vêm dos pacotes `@fontsource/*` (subconjunto latino, que cobre o
português: acentos, ç, ã, õ), convertidas de WOFF para TTF sem alteração dos desenhos.

Origem: https://github.com/google/fonts

Nota: Helvetica e Apple Garamond são fontes proprietárias e não podem ser
redistribuídas; usamos equivalentes livres (Inter e EB Garamond) com visual próximo.

## Estilos (S-*.ttf)

Os arquivos `S-<fonte>-<código>.ttf` são os outros estilos das fontes acima (Regular,
Itálico, Negrito, Black…: código = peso, `i` = itálico), tirados do pacote
**@fontsource** (subconjunto latino, que inclui todos os acentos do português) — mesma
licença **SIL OFL 1.1**. Cada arquivo tem um nome de família próprio
(`RFS <fonte> <código>`), para o libass e o navegador escolherem exatamente aquele
arquivo. Fontes: Montserrat, Poppins, Inter, Open Sans, Barlow Condensed, Kanit, Rubik,
Nunito, Playfair Display, EB Garamond e Oswald.

## Fontes próprias do usuário

Fontes enviadas pelo usuário (botão "Enviar fonte") ficam em `DATA_DIR/fonts/<usuário>/`,
renomeadas para `RFU <id>`, e são usadas só nos vídeos dele. Ele é responsável pela
licença da fonte que envia.
