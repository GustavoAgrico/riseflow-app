// Páginas legais PÚBLICAS exigidas pela App Review da Meta.
//   /privacidade   | /privacy        → Política de Privacidade
//   /exclusao-de-dados | /data-deletion → Instruções de exclusão de dados
// Servidas pelo próprio Express (montadas ANTES do fallback do SPA no index.js)
// para terem URLs estáveis no domínio do app, sem depender do bundle React.
//
// ⚠️ ANTES DE ENVIAR À REVISÃO DA META: preencha os dados da empresa abaixo
// (ou defina as variáveis de ambiente no Render). Placeholders entre [colchetes]
// não podem ir para produção — a Meta reprova política incompleta. Recomenda-se
// revisão por um advogado; este é um modelo, não aconselhamento jurídico.
const { Router } = require('express')

const ORG = {
  brand: 'RiseFlow',
  legal: process.env.LEGAL_ORG_NAME || '[PREENCHER: Razão Social Ltda., CNPJ 00.000.000/0001-00]',
  email: process.env.LEGAL_CONTACT_EMAIL || '[PREENCHER: privacidade@seudominio.com]',
  location: process.env.LEGAL_JURISDICTION || '[PREENCHER: Cidade/UF, Brasil]',
  updated: process.env.LEGAL_UPDATED || '13 de agosto de 2026',
}

const shell = (title, inner) => `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="all">
<title>${title} — ${ORG.brand}</title>
<style>
  :root { --ink:#1b1f2a; --muted:#565e70; --line:#e6e8ee; --accent:#2b46c9; --bg:#ffffff; --soft:#f6f7fa; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); line-height:1.65;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width:760px; margin:0 auto; padding:56px 22px 90px; }
  .eyebrow { font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--accent); font-weight:700; }
  h1 { font-size:30px; line-height:1.15; margin:10px 0 4px; letter-spacing:-.02em; }
  .updated { color:var(--muted); font-size:14px; margin:0 0 28px; }
  h2 { font-size:19px; margin:34px 0 8px; letter-spacing:-.01em; }
  h3 { font-size:15px; margin:20px 0 6px; }
  p, li { color:var(--ink); font-size:15px; }
  .muted, .muted * { color:var(--muted); }
  a { color:var(--accent); }
  ul { padding-left:22px; }
  li { margin:5px 0; }
  code { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; background:var(--soft); padding:1px 6px; border-radius:5px; }
  .card { background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin:18px 0; }
  hr { border:none; border-top:1px solid var(--line); margin:36px 0; }
  footer { margin-top:40px; color:var(--muted); font-size:13px; }
  table { border-collapse:collapse; width:100%; font-size:14px; margin:10px 0; }
  th,td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
</style></head>
<body><main class="wrap">${inner}
<hr>
<footer>${ORG.brand} — ${ORG.legal}<br>Contato: <a href="mailto:${ORG.email}">${ORG.email}</a> · ${ORG.location}</footer>
</main></body></html>`

/* ─────────────── Política de Privacidade ─────────────── */
const privacy = () => shell('Política de Privacidade', `
<div class="eyebrow">${ORG.brand}</div>
<h1>Política de Privacidade</h1>
<p class="updated">Última atualização: ${ORG.updated}</p>

<p>Esta política explica como o ${ORG.brand}, operado por ${ORG.legal} ("nós"), coleta, usa,
armazena e protege os dados quando você usa nossa plataforma de atendimento e automação de
mensagens ("Serviço"). Ao conectar um canal (WhatsApp, Instagram Direct, Facebook Messenger,
Telegram) e usar o Serviço, você concorda com esta política.</p>

<h2>1. Quem é o responsável pelos dados</h2>
<p>O controlador dos dados é ${ORG.legal}, com contato em <a href="mailto:${ORG.email}">${ORG.email}</a>.
Atuamos em conformidade com a LGPD (Lei 13.709/2018) e com os Termos da Plataforma da Meta.</p>

<h2>2. Dados que coletamos</h2>
<table>
  <tr><th>Categoria</th><th>Exemplos</th></tr>
  <tr><td>Dados de conta</td><td>E-mail e identificador de login do usuário do ${ORG.brand}.</td></tr>
  <tr><td>Conteúdo de mensagens</td><td>Mensagens recebidas e enviadas nos canais conectados (texto e metadados como data/hora e status).</td></tr>
  <tr><td>Dados de contato</td><td>Nome, telefone, usuário e identificadores dos contatos que conversam com você (ex.: PSID do Messenger, ID do Instagram), além de etiquetas e anotações que você criar.</td></tr>
  <tr><td>Dados da Página/Perfil da Meta</td><td>Nome da Página do Facebook e da conta do Instagram vinculada, e o número de seguidores exibido no painel. A Meta <strong>não</strong> nos fornece a lista de seguidores.</td></tr>
  <tr><td>Tokens de acesso</td><td>Tokens de acesso da Página, guardados de forma restrita no servidor para operar a integração em seu nome.</td></tr>
  <tr><td>Dados de uso</td><td>Registros de atividade, métricas de mensagens e logs técnicos para operar e proteger o Serviço.</td></tr>
</table>

<h2>3. Como usamos os dados</h2>
<ul>
  <li>Exibir suas conversas em uma caixa de entrada unificada e permitir que você responda.</li>
  <li>Executar automações (funis) e respostas automáticas por inteligência artificial, quando você as ativa.</li>
  <li>Mostrar métricas do seu atendimento (ex.: mensagens enviadas/recebidas, número de seguidores da Página).</li>
  <li>Operar, manter a segurança e melhorar o Serviço.</li>
</ul>

<h2>4. Compartilhamento com terceiros (sub-operadores)</h2>
<p>Não vendemos seus dados. Compartilhamos o mínimo necessário com prestadores que operam o Serviço:</p>
<table>
  <tr><th>Prestador</th><th>Finalidade</th></tr>
  <tr><td>Supabase</td><td>Banco de dados e armazenamento das conversas, contatos e configurações.</td></tr>
  <tr><td>Render</td><td>Hospedagem da aplicação.</td></tr>
  <tr><td>OpenAI e Anthropic</td><td>Processamento de IA: <strong>somente quando a resposta automática por IA está ativada</strong>, o conteúdo da conversa é enviado para gerar a resposta. Esses provedores não usam os dados para treinar modelos via API.</td></tr>
  <tr><td>Meta Platforms, Telegram</td><td>APIs dos canais para receber e enviar mensagens.</td></tr>
</table>

<h2>5. Dados obtidos da Meta</h2>
<p>Quando você conecta o Facebook Messenger ou o Instagram Direct, usamos as APIs da Meta para
receber e responder mensagens e ler informações básicas da Página/perfil. O uso desses dados
segue os <a href="https://developers.facebook.com/terms/">Termos da Plataforma da Meta</a> e as
políticas de dados aplicáveis. Você pode revogar nosso acesso a qualquer momento (ver seção 8),
o que interrompe o recebimento de novas mensagens por esses canais.</p>

<h2>6. Retenção</h2>
<p>Mantemos os dados enquanto sua conta estiver ativa e o canal conectado. Ao desconectar um canal
ou solicitar a exclusão, removemos os dados associados em até <strong>30 dias</strong>, exceto o
que a lei exigir manter. Consulte as <a href="/exclusao-de-dados">Instruções de exclusão de dados</a>.</p>

<h2>7. Segurança</h2>
<p>Adotamos medidas técnicas e organizacionais para proteger os dados: acesso restrito, segregação
de credenciais no servidor (nunca no navegador) e transporte por HTTPS. Nenhum sistema é
100% seguro, mas trabalhamos para reduzir riscos.</p>

<h2>8. Seus direitos e como revogar o acesso</h2>
<ul>
  <li><strong>Acesso, correção e exclusão</strong> dos seus dados, conforme a LGPD — escreva para <a href="mailto:${ORG.email}">${ORG.email}</a>.</li>
  <li><strong>Desconectar um canal</strong> dentro do ${ORG.brand} (tela de Integrações) remove os tokens e interrompe a integração.</li>
  <li><strong>Remover o app</strong> nas configurações do Facebook (Configurações → Integrações de negócios) revoga imediatamente nosso acesso às suas Páginas e ao Instagram.</li>
</ul>

<h2>9. Cookies</h2>
<p>Usamos apenas cookies/armazenamento necessários para manter sua sessão autenticada. Não usamos
cookies de publicidade de terceiros.</p>

<h2>10. Menores</h2>
<p>O Serviço é destinado a empresas e maiores de 18 anos. Não coletamos intencionalmente dados de menores.</p>

<h2>11. Alterações</h2>
<p>Podemos atualizar esta política. Mudanças relevantes serão indicadas pela data de atualização no topo.</p>

<h2>12. Contato</h2>
<p>Dúvidas sobre privacidade ou solicitações de titular: <a href="mailto:${ORG.email}">${ORG.email}</a>.</p>
`)

/* ─────────────── Instruções de exclusão de dados ─────────────── */
const deletion = () => shell('Instruções de Exclusão de Dados', `
<div class="eyebrow">${ORG.brand}</div>
<h1>Instruções de Exclusão de Dados</h1>
<p class="updated">Última atualização: ${ORG.updated}</p>

<p>Você pode solicitar a exclusão dos dados que o ${ORG.brand} armazena sobre você e seus contatos
a qualquer momento. Há três formas:</p>

<div class="card">
<h3>1. Desconectar o canal no próprio ${ORG.brand}</h3>
<p class="muted">Entre no ${ORG.brand} → <strong>Integrações</strong> → no canal desejado (Facebook Messenger /
Instagram Direct) clique em <strong>Desconectar</strong>. Isso remove os tokens de acesso e interrompe
a integração imediatamente.</p>
</div>

<div class="card">
<h3>2. Revogar o acesso pelo Facebook</h3>
<p class="muted">No Facebook, vá em <strong>Configurações e privacidade → Configurações → Integrações de
negócios</strong>, localize <strong>${ORG.brand}</strong> e clique em <strong>Remover</strong>. Isso revoga
nosso acesso às suas Páginas e ao Instagram.</p>
</div>

<div class="card">
<h3>3. Solicitar a exclusão completa por e-mail</h3>
<p class="muted">Envie um e-mail para <a href="mailto:${ORG.email}">${ORG.email}</a> com o assunto
<strong>"Exclusão de dados"</strong>, informando o e-mail da sua conta e/ou o nome da Página/Instagram
conectado. Confirmamos o recebimento e concluímos a exclusão em até <strong>30 dias</strong>.</p>
</div>

<h2>O que é excluído</h2>
<ul>
  <li>Conversas e mensagens armazenadas dos canais conectados;</li>
  <li>Contatos, etiquetas e anotações associados;</li>
  <li>Tokens de acesso e configurações da integração.</li>
</ul>
<p class="muted">Podemos reter registros mínimos quando exigido por lei ou para segurança/prevenção a
fraude, pelo prazo legal aplicável, de forma isolada e sem uso comercial.</p>

<h2>Confirmação</h2>
<p>Ao concluir, enviamos uma confirmação para o e-mail de contato informado. Em caso de dúvida sobre o
andamento, escreva para <a href="mailto:${ORG.email}">${ORG.email}</a>.</p>
`)

const router = Router()
router.get(['/privacidade', '/privacy'], (req, res) => res.type('html').send(privacy()))
router.get(['/exclusao-de-dados', '/data-deletion'], (req, res) => res.type('html').send(deletion()))

module.exports = router
