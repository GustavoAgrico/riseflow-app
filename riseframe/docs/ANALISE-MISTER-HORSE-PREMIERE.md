# Engenharia reversa — Mister Horse para Premiere Pro

Análise de como funcionam os produtos da Mister Horse para o Premiere Pro
(misterhorse.com/products-for-premiere), e o que o Riseframe pode aproveitar.

> **Sobre as fontes.** O site misterhorse.com está bloqueado na rede deste ambiente, então
> a página não pôde ser aberta diretamente. A análise foi montada a partir de resultados de
> busca sobre as páginas oficiais (produto, preços, changelog), a central de ajuda
> (help.misterhorse.com), as páginas de produto no aescripts e o fórum da Adobe.
> Cada ponto está marcado como **[confirmado]** (dito por uma fonte) ou **[inferido]**
> (dedução técnica a partir das evidências; não verificado no código do plugin).

---

## 1. O que é o produto

| Item | O que é |
|---|---|
| **Animation Composer for Premiere** (antes "Premiere Composer") | Plug-in gratuito que fica num painel dentro do Premiere. É uma **biblioteca navegável** de itens prontos para jogar na timeline. Em jun/2026 foi renomeado e ganhou a mesma interface da versão para After Effects ("mesmo plug-in, agora com recursos novos e acabamento") **[confirmado]** |
| **Packs** | Conteúdo vendido/assinado que aparece dentro do plug-in: títulos e tipografia (Essential Typography, Text Presets), transições (Transitions for Premiere, Filmmaker's Transitions), efeitos sonoros (Essential Sound Effects), elementos 2D, fundos, texturas animadas etc. **[confirmado]** |
| **Mister Horse Product Manager** | App de desktop separado que instala o plug-in e baixa os packs. Login com conta Mister Horse (não é a conta do aescripts) **[confirmado]** |
| **Requisitos** | Página atual: Premiere 2025 ou mais novo. Um artigo de ajuda antigo fala em 22.0 ou mais novo **[confirmado, com conflito entre fontes]** |
| **Alcance** | "Usado por mais de 500.000 editores" **[confirmado]** |

### Modelo de negócio **[confirmado]**

| Plano | Preço | Conteúdo |
|---|---|---|
| Gratuito | US$ 0, uso comercial permitido | Plug-ins + mais de 1.000 itens + 4 ferramentas; biblioteca do usuário limitada a 500 itens (fonte mais antiga) |
| Anual | US$ 16,50/mês (US$ 198/ano) | Mais de 6.000 itens |
| Mensal | US$ 19,90/mês | Mais de 6.000 itens |

- Login em até 2 computadores ao mesmo tempo.
- Licenças perpétuas antigas continuam funcionando; os packs avulsos foram descontinuados em favor
  da assinatura única.

**Leitura estratégica:** o plug-in gratuito é o canal de aquisição. O editor instala de graça,
passa a usar a biblioteca todo dia dentro do Premiere, e o upsell é só "mais itens". O custo
marginal de um usuário gratuito é quase zero porque **quem renderiza é o Premiere**, não um
servidor deles.

---

## 2. Arquitetura (três camadas)

```
┌──────────────────────────────┐   login, download de packs, instala/atualiza o plug-in
│ Product Manager (app nativo) │──────────────────────────────────────────────┐
└──────────────────────────────┘                                              │
                                                                              ▼
┌───────────────────────────────────────────────┐   ┌───────────────────────────────────┐
│ Painel no Premiere (HTML/JS)                  │   │ Pasta de conteúdo no disco         │
│  - navega, busca, prévia em vídeo, favoritos  │◀──│  .mogrt, sequências/projetos .prproj│
│  - edita propriedades do item                 │   │  .wav, imagens, vídeos, thumbnails │
│  - aplica na timeline (clique ou arrastar)    │   │  + índice/manifesto do pack        │
└───────────────┬───────────────────────────────┘   └───────────────────────────────────┘
                │ chamadas de script do host (ExtendScript no CEP, ou a API UXP)
                ▼
┌───────────────────────────────────────────────┐
│ Premiere Pro: importa, insere na trilha,      │
│ ajusta posição/escala, renderiza nativamente   │
└───────────────────────────────────────────────┘
```

- **Instalador nativo [confirmado]:** existe o Product Manager e um componente "MHPC InitHelper"
  (bundle de macOS — MHPC = Mister Horse Premiere Composer), que aparece em artigo de erro do
  Gatekeeper. **[inferido]** O helper serve para preparar o ambiente do painel (registrar a
  extensão, permissões, comunicação com o Product Manager).
- **Painel [inferido]:** o Premiere Composer nasceu antes do UXP no Premiere, então é uma
  extensão **CEP** (HTML/JS + ExtendScript). Um usuário do fórum da Adobe pergunta exatamente
  "como o Premiere Composer cria camadas de ajuste via CEP/ExtendScript". A exigência atual de
  "Premiere 2025+" coincide com o lançamento oficial do UXP no Premiere (25.6), então uma
  migração para UXP é possível, mas **nenhuma fonte confirma**.
- **Conteúdo como dados [inferido]:** cada pack é uma pasta de arquivos nativos da Adobe mais um
  índice (categorias, nomes, thumbnails, prévias). O plug-in não tem motor de render próprio.

---

## 3. Como cada tipo de item é aplicado

O changelog confirma pelo menos dois tipos de "drop": **"Mogrt and sequence drops failing"**
(correção na 2.2.3). Ou seja, há itens que são MOGRT e itens que são **sequências do Premiere**.

### 3.1 Títulos, textos e elementos → MOGRT

- **[confirmado]** A biblioteca aceita MOGRTs; na 2.2.3 passou a aceitar MOGRTs feitos no próprio
  Premiere na biblioteca do usuário. Na 1.5.3 ganhou "editar propriedades gráficas direto no
  plug-in".
- **[inferido] Mecanismo:** o caminho padrão da API é
  `sequence.importMGT(caminho, tempoEmTicks, offsetTrilhaVideo, offsetTrilhaAudio)`, que devolve
  o clipe inserido. As propriedades editáveis (texto, cor, fonte, duração) ficam em
  `clip.getMGTComponent().properties`; o painel lê essa lista para montar os controles e grava
  com `setValue`. É o mesmo que o painel Essential Graphics faz, só que com a interface deles.
- O item entra **no playhead**, na primeira trilha livre acima do vídeo.

### 3.2 Transições → camadas de ajuste com efeitos nativos (não são transições do Premiere)

Este é o truque principal do produto.

**Evidências [confirmado]:**
- Ajuda oficial: "todas as transições da Mister Horse são criadas com **efeitos e clipes nativos
  do Premiere Pro**"; elas precisam de **opacidade 100%** para o efeito sem emenda; para mudar a
  cor, ponha os efeitos de cor numa camada de ajuste acima ou abaixo da transição.
- Changelog: aviso para "clipes que **perdem o status de camada de ajuste** depois que a sequência
  é redimensionada"; correção de "camada de ajuste faltando nas transições quando o painel da
  sequência está desacoplado"; correção de "alinhamento com o playhead nas transições"; arrastar
  transições reativado no Premiere 2025.
- Página do pack: "**escalada automaticamente para o tamanho do quadro**", funciona de 16:9 a 1:1,
  até 4K.

**Mecanismo [inferido]:**
1. Cada transição é uma **sequência curta** guardada num projeto do pack. Dentro dela há um ou
   mais **clipes de camada de ajuste** com efeitos nativos animados por keyframes (Transformar
   com desfoque de movimento, Deslocamento, Espelho, Desfoque direcional, brilho/exposição etc.).
2. Ao aplicar, o plug-in importa essa sequência e insere o conteúdo **na trilha acima do corte**,
   centralizado no playhead (ou no ponto de corte mais próximo). A metade de entrada anima o fim
   do clipe A e a de saída o começo do clipe B — por isso **não precisa de "handles"** de mídia
   como uma transição nativa e funciona entre trilhas diferentes.
3. Como a API de script não tem "criar camada de ajuste", o caminho conhecido (citado no fórum da
   Adobe) é: **ter uma sequência que contém só a camada de ajuste e inserir os clipes dela**, que
   chegam na timeline ainda como camada de ajuste. Isso explica os bugs de "perder o status de
   camada de ajuste" e de depender do painel da sequência.
4. Depois de inserir, o plug-in **reescala** os parâmetros (posição/escala do Transformar) pela
   resolução da sequência ativa — daí o "escalada automaticamente" e o limite 16:9 a 1:1.
5. A opacidade precisa ficar em 100% porque a camada de ajuste é o que "captura" as trilhas de
   baixo; com opacidade menor ela mistura a imagem transformada com a original e aparece emenda.

### 3.3 Efeitos sonoros → arquivos de áudio

- **[confirmado]** Sons curtos (whoosh, slide, clique, impacto) "todos com **pitch ajustável**".
- **[inferido]** O WAV é importado para uma pasta do projeto e inserido numa trilha de áudio no
  playhead (`importFiles` + `insertClip`/`overwriteClip`). O pitch é aplicado com o efeito de
  áudio nativo (Pitch Shifter) ou com variações pré-renderizadas no pack.

### 3.4 Biblioteca do usuário

- **[confirmado]** O usuário adiciona os próprios MOGRTs, sons, imagens e alguns formatos de
  vídeo; no plano gratuito há limite de itens. Esses arquivos ganham os mesmos recursos de
  navegação (busca, prévia, aplicar por clique ou arrastar).

---

## 4. Fluxo do usuário (resumo)

1. Instala o Product Manager → faz login → instala o plug-in e baixa os packs.
2. Abre o painel no Premiere (Janela › Extensões).
3. Navega por categoria (Textos, Transições, Sons, Elementos…), vê **prévia em vídeo** ao passar o
   mouse, marca favoritos, busca por nome.
4. Aplica: **clique** (insere no playhead) ou **arrastar** para a timeline.
5. Ajusta no próprio painel (textos, cores, duração, pitch) ou nos controles nativos do Premiere.
6. Exporta normalmente: tudo é nativo, então o projeto abre em qualquer máquina com Premiere,
   mesmo sem o plug-in (os MOGRTs e efeitos ficam embutidos no projeto).

---

## 5. Por que funciona (os princípios)

1. **Render nativo:** nada de motor próprio. O resultado é editável, previsível e sem custo de
   servidor.
2. **Conteúdo separado do código:** packs são pastas de arquivos + índice. Lançar conteúdo novo não
   exige versão nova do plug-in.
3. **Inserção inteligente:** o item chega no lugar certo (playhead/corte, trilha livre) e já na
   escala da sequência. O editor não ajusta nada para o primeiro resultado ficar bom.
4. **Transição como camada por cima**, e não como transição nativa: não precisa de handles, funciona
   entre trilhas, dá para mover/encurtar como um clipe qualquer.
5. **Prévia antes de aplicar** e **uma biblioteca só** para tudo (textos, transições, sons, mídia do
   usuário).
6. **Gratuito de verdade** (1.000+ itens, uso comercial) → base enorme → assinatura vende volume.

---

## 6. O que o Riseframe pode aproveitar

O Riseframe já tem transições, efeitos sonoros sintetizados, entradas/saídas de texto, movimentos
contínuos (v1.110) e exportação para Premiere/DaVinci/Final Cut em XML (v1.108). O que falta, pela
comparação:

| Ideia da Mister Horse | Situação no Riseframe | Sugestão |
|---|---|---|
| Biblioteca única (textos, transições, sons, elementos, mídia do usuário) com busca, categorias, favoritos e prévia em hover | Galerias separadas por recurso (legendas, transições, sons) | Um painel "Biblioteca" no editor com abas por tipo, busca e favoritos; prévia animada no hover |
| Itens como dados (pack = pasta + índice) | Transições, sons e animações definidos em código (`transitions.js`, `sfx.js`, `textLayers.js`) | Manifesto JSON por item (tipo, duração, parâmetros editáveis, thumbnail, plano mínimo) para lançar itens e "packs" sem mexer no código e liberar por plano |
| Parâmetros editáveis expostos (como no MOGRT) | Já existe para legendas/textos | Mesmo esquema para transições (direção, intensidade, cor) e sons (pitch, volume) |
| Inserção no playhead / no corte mais próximo, com duração ajustável | Transições aplicadas entre cenas | Ao arrastar uma transição, encaixar no corte mais próximo, centralizada, com alças para encurtar/alongar |
| Biblioteca do usuário (seus sons, imagens, overlays) | Brand Kit e mídias do projeto | "Meus itens": sons, imagens e overlays reutilizáveis entre projetos |
| Plano gratuito generoso como funil | — | Liberar uma parte da biblioteca no plano grátis e vender o "pack completo" |
| Plug-in dentro do Premiere | Exporta XML só com cortes e mídia | Médio prazo: um plug-in UXP "Riseframe para Premiere" que traz legendas, B-roll e cortes do Riseframe direto para a timeline. Curto prazo: incluir no XML os marcadores (momentos-chave) e as legendas como trilha de texto/SRT junto |

---

## 7. Limites desta análise

- O site oficial não pôde ser aberto aqui; nenhum arquivo do plug-in foi baixado nem inspecionado.
- Os pontos **[inferido]** devem ser confirmados instalando o plug-in gratuito e olhando a pasta
  da extensão (manifesto CEP `CSXS/manifest.xml` ou manifesto UXP `manifest.json`, scripts `.jsx`,
  estrutura das pastas dos packs) e um projeto depois de aplicar uma transição (camadas e efeitos
  inseridos).

## Fontes

- https://misterhorse.com/premiere-composer
- https://misterhorse.com/animation-composer-for-premiere
- https://misterhorse.com/products-for-premiere-pro
- https://misterhorse.com/pricing
- https://misterhorse.com/changelog/premiere-composer/3
- https://misterhorse.com/what-s-new/premiere-composer-renamed-to-animation-composer
- https://misterhorse.com/changelog/product-manager/4
- https://help.misterhorse.com/hc/en-us/articles/4405253924497-Transitions-Colors-are-changing-color-shift-while-transition-is-active
- https://help.misterhorse.com/hc/en-us/articles/360004003617-How-to-download-install-packs-for-Premiere-Composer
- https://help.misterhorse.com/hc/en-us/articles/8081200007069--Error-MHPC-InitHelper-bundle-will-damage-your-computer-You-should-move-it-to-trash
- https://aescripts.com/transitions-for-premiere-composer/
- https://aescripts.com/knowledgebase/index/view/faq/mister-horse-animation-composer-installing-products
- https://community.adobe.com/questions-729/creating-adjustment-layers-with-cep-extendscript-1417174
- https://developer.adobe.com/premiere-pro/uxp/changelog
