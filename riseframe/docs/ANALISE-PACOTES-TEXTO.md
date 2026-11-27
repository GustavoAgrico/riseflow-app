# Análise dos pacotes de modelos de texto (referência) → pacote "Textos animados"

Pasta analisada: `Txt Premiere` (Google Drive do dono do projeto), com 31 pacotes e cerca de
540 modelos `.mogrt` para Premiere. Os nomes das pastas e os textos de exemplo ("@Envato market")
mostram que vêm do **Envato Elements**. A licença deles permite usar os modelos nos vídeos de
quem assina, **não** redistribuí-los dentro de um app para outras pessoas. Por isso **nenhum
arquivo, arte ou texto dos pacotes entra no Riseframe**: eles serviram só de referência de
estilo, e os modelos do app são desenhos próprios, feitos com as camadas de texto e forma que o
app já renderiza (`shared/textPacks.js`).

## Como foi analisado

- Inventário completo pelo conector do Google Drive (pastas, tipos e tamanhos).
- Amostra de 70 modelos (2 a 5 por pacote): `definition.json` (quantas linhas de texto, caixas,
  cores e controles editáveis) e `thumb.png` (composição). O projeto do After Effects dentro do
  `.mogrt` (`project.aegraphic`) não dá para ler de forma útil, e os `.mogrt` não trazem vídeo.
- 12 vídeos tutoriais dos pacotes (folhas de quadros) para o ritmo das animações.
- Os `.mogrt` não rodam no Riseframe de qualquer forma: só o After Effects/Premiere os renderiza.

## Famílias de estilo encontradas → modelo próprio no app

| Família (pacotes de referência) | O que caracteriza | Modelo no Riseframe |
|---|---|---|
| Minimalista (minimal-titles, animated-titles) | texto espaçado entre duas linhas finas; pílula de contorno; título + legenda pequena | Entre linhas · Pílula de contorno · Título e legenda · Faixa no meio |
| Cinético (kinetic-titles, various-titles, kinetic-typography) | palavras empilhadas em tamanhos diferentes formando um bloco, duas cores; palavra quebrada em sílabas; barra lateral | Bloco em duas cores · Palavra quebrada · Barra lateral |
| Tipografia inclinada (text-animation-for-premiere, creative-titles) | texto pesado girado, faixa colorida atrás, sublinhado | Faixa inclinada · Duas linhas sublinhadas · Vermelho com etiqueta · Tipografia inclinada |
| Condensado em cartão (kinetic-typography) | fonte condensada em duas cores sobre cartão escuro | Cartão condensado |
| Neon / brilho (text-animation, lyric-titles) | linhas e ícone brilhando, texto com glow | Neon com linhas · Brilho azul (fonte) |
| Quadrinhos / 3D (comic-text-animations) | cópias do texto deslocadas em cores formando volume | 3D em camadas |
| RGB (text-kit) | canais deslocados | Divisão RGB |
| Moderno limpo (2026 / RFX) | frase entrando palavra por palavra; palavra grande em fundo branco | Frase limpa · Palavra no fundo branco |
| Máquina de escrever (typewriter, typewriter radiant) | digitação com cursor, cartão colorido, código promocional | Cartão colorido digitando · Cupom digitando |
| Citações (modern-quotes) | autor pequeno em destaque + frase; nome grande + aspas + corpo | Citação com autor em cima · Citação com nome grande · Citação curta |
| Promoção (sale-labels-bubbles, sales-discount-stickers) | balões redondos/quadrados com "rabinho", selos de desconto, etiqueta inclinada | Balão "Novo" · Balão "Compre já" · Balão de preço · Mega promoção · Desconto em destaque · Selo redondo · Selo inclinado |
| Inscrever-se (subscribe-like-share) | barra com botão que muda de estado | Barra Inscrever-se |
| Crédito de nome (the-titles, title podcast) | nome grande + divisor + cargo; nome pequeno sobre sobrenome grande | Nome com divisor · Nome e sobrenome |
| Fontes | serifa itálica, condensada amarela, forte itálica | 4 fontes animadas novas |

Ficaram de fora estilos que dependem de arte desenhada (pinceladas "painted", papel amassado
"crumpled", formas líquidas dos "lyric"): precisariam de imagens/vídeos próprios.

## O que mudou no app (v1.112)

- `shared/textPacks.js`: 18 títulos, 14 componentes e 4 fontes animadas novas, nas categorias
  Títulos, Componentes gráficos e Fontes animadas da biblioteca de Efeitos. Textos em português.
- Fontes animadas agora também levam o itálico.
- Contador (`count`): no vídeo final só o primeiro passo do número faz a animação de entrada e só
  o último faz a de saída (antes cada número novo entrava de novo e o contador piscava).
- Miniaturas da biblioteca mostram itálico e opacidade das camadas.

## Observação de ambiente

No ambiente de desenvolvimento em nuvem havia uma Inter instalada no sistema (arquivos estáticos),
e o libass usava essa em vez da Inter do app: as letras saíam ~18% maiores e textos com animação
por palavra se sobrepunham. No servidor de produção (Docker, só DejaVu no sistema) e com a fonte do
app isso não acontece (medido: mesma proporção das outras fontes). Se aparecer num computador com
Inter instalada, a causa é essa.
