# Análise das referências de animação (estilos minimalista e cinético)

Feita a partir de quadros (um por quadro de vídeo, em grades de miniaturas), das diferenças
entre quadros (para achar o instante de cada animação) e de uma transcrição palavra por palavra
com reconhecimento offline (`pocketsphinx`, modelo em inglês: a precisão é baixa, mas o **tempo**
de cada palavra é o que importa para sincronizar). Na produção o app usa o Whisper.

## 1. Onde as animações entram em relação ao roteiro

| Referência | Ritmo das palavras | Quando algo muda |
|---|---|---|
| Minimalista (3 vídeos: "Faith-filled", "Meal prep", "Fresh mood") | ~0,27 s por palavra | a cada frase; cartão/lista a cada 2–3 frases |
| Cinético "cooking/editing" (vertical, 14 s) | ~0,10 s por letra (máquina de escrever) | troca de cena a cada ~2 s; transição diagonal |
| Cinético "NEW ENERGY" (6 s) | ~0,10 s por letra (deslize) | panorâmica a cada palavra |
| Cinético "Creative" (15 s) | ~0,5 s por palavra; câmera a cada ~3 s | troca de fundo (cor) a cada ~3 s |
| Imagem "Make it you|" | letra a letra com cursor piscando | — |

Regra geral: **a animação começa no instante da palavra falada** (margem de ~0,03–0,05 s antes),
nunca no início da frase.

## 2. Composição do design

- **Tipografia:** grotesca bold (Inter 700/900), sem serifa; itálico só como acento.
- **Pílula / caixa colorida** atrás da palavra-chave (azul no minimalista, verde-teal no cinético).
- **Cartões** brancos com cantos arredondados, sombra suave, inclinação de 0,08 rad que assenta.
- **Fundo:** navy com manchas suaves (minimalista); cor sólida que muda a cada cena — claro,
  verde-teal, laranja, preto e gradiente roxo→teal (cinético).
- **Detalhes:** colchetes finos nos cantos, barras de código, objeto 3D/recorte do assunto.

## 3. Lógica das animações (duração e sensação)

| Animação | Duração | Sensação |
|---|---|---|
| Palavra sobe com desfoque (`rise`) | 0,30 s | limpa, editorial |
| Letra sobe (`rise`), intervalo entre letras | 0,30 s; 0,045 s | ritmo de título |
| Letra desliza de lado com rastro (`slide`) | 0,28 s; 0,03 s | energia, velocidade |
| Máquina de escrever com cursor (`type`) | 0,09 s por letra | "escrita ao vivo", tutorial |
| Estoura (`pop`) | 0,30 s (overshoot) | brincalhão, destaque |
| Caixa atrás da palavra-chave | 0,25 s | ênfase |
| Cartão sobe e assenta | 0,50 s (overshoot) | objeto físico, premium |
| Contador + barras | 0,9 s | recompensa, dado |
| Panorâmica (`whip`) | 0,32 s, com desfoque | transição rápida |
| Zoom de aproximação (`push`) | cena inteira, 1,00→1,09 | foco crescente |
| Zoom de saída (`pull`) | cena inteira, 1,09→1,00 | respiro |
| Tremor leve (`shake`) | contínuo, ~3 Hz | vida, instabilidade controlada |
| Faixa diagonal (transição) | 0,40 s | corte gráfico |

## 4. Sons

Os sons deste estilo são **sintetizados** (sem arquivos de terceiros) e separados por kit:

- **Minimalista** (`mi-*`): tique de vidro (palavra da lista), pop de vidro (pílula), ar leve
  (cartão/lista), subida (contador), sino (resultado), brilho (botão final).
- **Cinético** (`cn-*`): tecla seca (cada palavra digitada), panorâmica (ar de baixa frequência),
  pop de letra, impacto grave (entrada e revelação), varredura (caixa e faixa).

Regra: um som por ação visível; nada que não corresponda a um movimento.

## 5. Como o app recria isso

- `shared/motionStyles.js`: estilos `minimalista` e `cinetico`; função `fxLine` (letras),
  `cnBlock` (quebra em linhas), `camFor` (câmera), `cnBg` (fundo que muda).
- `server/src/pipeline/sfx.js`: kits `mi-*` e `cn-*`.
- Testes: `server/test/motionEngine.test.js` (batidas, sons existentes, desenho sem erro).

## Limites

- A transcrição offline erra muitas palavras; os tempos são confiáveis, o texto não.
- As referências usam fotos recortadas e vídeos; o app usa os objetos 3D e recortes da biblioteca.

---

# Atualização v1.86 — quatro referências novas

Quatro vídeos de referência analisados por quadros (contact sheets de 1 quadro a cada 0,3 s) e
pelos tempos das palavras. Cada um virou um estilo do app.

| Referência | Formato | Ideia principal | Estilo no app |
|---|---|---|---|
| w1 — "tablescape" / "GAIN AGAIN" | 16:9, 10 s | palavras enormes, bloco laranja sobre a palavra-chave, repetição em faixas, cortes em tiras | `bloco` |
| w2 — "MOTION" repetido | 1:1, 7 s | a mesma palavra repetida em colunas que se multiplicam, inversão de cor, fatias com falha | `bloco` |
| w3 — marca "SoftwareWOW" | 9:16, 22 s | fundo lilás, cartão inclinado com objeto, barras que crescem, letra-fantasma gigante, logo em degradê | `marca` |
| w4 — contador em grade | 1:1, 15 s | grade de botões cinza cujos números rolam até o valor final | `rolagem` |

## 1. Onde entra no roteiro

- Cada frase vira uma batida. A palavra-chave (a de maior peso) é a que ganha o bloco, a faixa ou a
  caixa. Em w1 e w2 a palavra-chave aparece repetida; no app ela aparece repetida só no eco (`bl-echo`).
- O contador (`rolagem`) só usa a grade quando a frase tem número. Frase sem número vira texto
  (`rl-text`), para não inventar um valor.
- w3 abre com a letra-fantasma e fecha com a logo, como na referência.

## 2. Composição

- **Bloco (w1/w2):** fundo chapado (preto, branco ou laranja); texto grande; a palavra-chave dentro
  de um bloco da cor de destaque; no eco, a palavra repetida em 7 linhas com opacidade baixa.
- **Marca (w3):** fundo lilás ou branco; cartão de 800×1040 com cantos arredondados e inclinação
  de perspectiva; barras brancas com altura crescente; a logo final em degradê.
- **Contador (w4):** fundo cinza claro; uma caixa só (pílula) com sombra suave; o número sobe de 0
  até o valor lido da própria frase; a frase entra embaixo.

## 3. Lógica das animações

| Movimento | Duração | Sensação |
|---|---|---|
| Bloco que cai (`pop`) | ~0,3 s, com overshoot | impacto |
| Faixa que varre (`slide`) | 0,35 s | corte gráfico |
| Eco de palavra | 0,6 s | repetição, ritmo |
| Fatias que sobem e descem | 0,35 s por tira, defasadas | glitch controlado |
| Cartão que assenta | 0,5 s (overshoot) | objeto físico |
| Barras que crescem | 0,5 s por barra, defasadas 0,12 s | dado, progresso |
| Número que sobe de 0 ao valor | 0,8 s ou 70% da batida, freando no fim | recompensa |
| Câmera | `push`, `pull`, `whip`, `shake`, `drift` | igual aos estilos anteriores |

## 4. Sons (sintetizados, kits `bk-*`, `mk-*`, `rl-*`)

- **Bloco (`bk-*`):** `bk-hit` impacto grave ao cair o bloco; `bk-slice` tique de corte (uma por tira
  e uma por repetição do eco); `bk-swipe` varredura na faixa e na caixa.
- **Marca (`mk-*`):** `mk-card` ar de cartão deslizando; `mk-chime` sino de logo com eco.
- **Contador (`rl-tick`):** tique mecânico de odômetro, até 24 tiques espaçados como o número sobe
  (rápido no começo, freando no fim). Só na frase com número.

Regra mantida: um som por ação visível.

## 5. Como o app recria isso

- `shared/motionStyles.js`: `BLO_DRAW`, `MRC_DRAW`, `RLG_DRAW`; `STYLE_BEATS` com `bloco`, `marca`,
  `rolagem`; `CAM_STYLES` (câmera nos estilos de câmera); `flatBg` (fundo chapado).
- `server/src/pipeline/sfx.js`: kits `bk-*`, `mk-*`, `rl-tick`.
- `shared/kinetic.js`: três novos temas no seletor (Blocos e repetição, Marca, Contador em grade).
- Testes: `server/test/motionEngine.test.js` (batidas, sons existentes, desenho de todos os tipos,
  grade só com número).

## Limites

- As referências usam telas de celular e fotos reais. Aqui o cartão mostra o objeto do app
  (carrinho, foguete, etc.) em vez de uma captura de tela.
- A logo final é só texto em degradê; não há logotipo da marca original.
- Os tempos são os da transcrição offline, que erra palavras. Os quadros e a lógica de movimento são
  confiáveis; o texto exato não.
