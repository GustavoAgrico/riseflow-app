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
