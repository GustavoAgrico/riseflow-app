# Deploy RiseFlow na Vercel

## Pré-requisitos
- Conta na Vercel (vercel.com)
- Projeto no GitHub

## Passos
1. Push do código para GitHub
2. Acessar vercel.com → New Project → Importar repositório
3. Framework Preset: Vite
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Environment Variables — adicionar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_EVOLUTION_URL`
   - `VITE_EVOLUTION_KEY`
   - `VITE_EVOLUTION_INSTANCE`

   > Observação: o código lê `VITE_EVOLUTION_KEY` e `VITE_EVOLUTION_INSTANCE`
   > (e não `VITE_EVOLUTION_API_KEY`). Use exatamente esses nomes. Veja `.env.example`.
7. Clicar Deploy

## Após deploy
- Configurar domínio customizado em Settings → Domains
- Adicionar URL de produção no Supabase → Auth → URL Configuration → Site URL
- Adicionar URL no Google OAuth redirect URIs
- Configurar webhook Evolution API para URL de produção

## Proxy da Evolution API
Em desenvolvimento, o caminho `/evolution` é redirecionado para a API pelo proxy do Vite
(`vite.config.js`). Em produção, esse redirecionamento é feito pelo `vercel.json`
(rewrite de `/evolution/:path*` → URL da Railway). Se a URL da Evolution API mudar,
atualize o `destination` em `vercel.json` e o `target` em `vite.config.js`.

## Supabase
Rodar todos os SQLs no SQL Editor (Dashboard → SQL Editor):

Na pasta `supabase/`:
- `usage_table.sql`
- `notes_table.sql`
- `settings_table.sql`

Na raiz do projeto:
- `supabase-chat.sql`
- `supabase-chat-migration.sql`
- `supabase-flowbuilder.sql`
- `supabase-rls-check.sql` (verificação de RLS — opcional)
- `supabase-diagnose.sql` (diagnóstico — opcional)

## Webhook (opcional — server-side)
`src/api/webhook.js` é uma função server-side (Supabase Edge Function ou Node) e **não**
faz parte do bundle do frontend. Ela usa variáveis de ambiente do servidor — nunca
expostas no client:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DEFAULT_USER_ID`

Configure-as no ambiente onde a função for hospedada (não na build do Vite).
