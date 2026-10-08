# Site do Riseframe na Hostinger (hospedagem comum, sem VPS)

A hospedagem de sites (a de WordPress/arquivos) **mostra o site**: página inicial,
telas, demonstração. O **motor** que recebe e edita os vídeos (Node + FFmpeg) continua
no **Render** (`https://riseframe.onrender.com`), porque a hospedagem comum não roda
processos longos de vídeo.

## Pacote

A cada atualização, o GitHub gera `riseframe-site-hostinger.zip` (~12 MB) na página de
releases do Riseframe. Para gerar à mão:

    cd riseframe
    API_URL=https://riseframe.onrender.com npm --workspace web run build:hostinger

## Enviar para a Hostinger (hPanel)

1. **Arquivos → Gerenciador de arquivos** → abra `public_html`.
2. Apague o que a Hostinger colocou lá (`default.php`, `index.html` padrão…).
3. **Enviar** → `riseframe-site-hostinger.zip` → clique com o botão direito → **Extrair**
   (direto em `public_html`, não numa subpasta). Confira que `index.html`, `.htaccess`,
   `assets/`, `demo/` e `api/fonts/` estão dentro de `public_html`.
4. **Segurança → SSL**: ative o SSL grátis para `riseframe.com.br` e `www`.

## No Render (motor)

Environment do serviço riseframe:

| Variável | Valor |
|---|---|
| `CORS_ORIGIN` | `https://riseframe.com.br,https://www.riseframe.com.br` |
| `APP_URL` | `https://riseframe.com.br` |

Save, rebuild and deploy. Login com Google: no Google Cloud (Credenciais → seu Client
ID → Origens JavaScript autorizadas) inclua `https://riseframe.com.br` e
`https://www.riseframe.com.br`.

## DNS

Com os servidores DNS da Hostinger, o domínio já aponta para a hospedagem
(`@` e `www`). Não precisa de registro apontando para o Render.

## Observação

No Render grátis o motor "dorme" depois de 15 min sem uso: a primeira edição depois disso
demora ~1 min para começar. A página inicial e a demonstração abrem na hora (estão na
Hostinger).
