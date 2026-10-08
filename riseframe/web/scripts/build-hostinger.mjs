// Gera o pacote do SITE para hospedagem comum (Hostinger, cPanel…): só arquivos
// estáticos. O "motor" (API que recebe e edita os vídeos) continua num servidor Node
// (Render) — informe a URL dele em API_URL. Uso:
//   API_URL=https://riseframe.onrender.com node scripts/build-hostinger.mjs
// Resultado: web/dist-hostinger/ e web/riseframe-site-hostinger.zip (enviar para public_html).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(WEB, 'dist-hostinger');
const API_URL = (process.env.API_URL || 'https://riseframe.onrender.com').replace(/\/+$/, '');

fs.rmSync(OUT, { recursive: true, force: true });
execSync(`npx vite build --outDir "${OUT}" --emptyOutDir`, {
  cwd: WEB,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_URL: API_URL },
});

// As fontes da legenda são lidas pelo CSS em /api/fonts/… (mesmo endereço do site):
// vão junto no pacote.
const fontsSrc = path.resolve(WEB, '..', 'server', 'assets', 'fonts');
fs.cpSync(fontsSrc, path.join(OUT, 'api', 'fonts'), { recursive: true });

// Apache/LiteSpeed (Hostinger): HTTPS, rotas do app (/termos, /privacidade…) caem no
// index.html, cache longo dos arquivos com hash e tipos certos dos vídeos e fontes.
fs.writeFileSync(path.join(OUT, '.htaccess'), `# Riseframe — site estático (a API fica em ${API_URL})
Options -MultiViews
RewriteEngine On

# Sempre HTTPS
RewriteCond %{HTTPS} off
RewriteCond %{HTTP:X-Forwarded-Proto} !https
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Arquivo ou pasta que existe: entrega direto
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Qualquer outra rota do app abre o index.html (o React decide a tela)
RewriteRule ^ /index.html [L]

AddType video/mp4 .mp4
AddType font/ttf .ttf
AddType application/json .json

<IfModule mod_headers.c>
  <FilesMatch "\\.(js|css|woff2?|ttf)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "index\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>
`);

const zip = path.join(WEB, 'riseframe-site-hostinger.zip');
fs.rmSync(zip, { force: true });
execSync(`cd "${OUT}" && zip -qr -9 "${zip}" . -x "*.DS_Store"`, { stdio: 'inherit', shell: '/bin/bash' });
const size = (p) => {
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) total += e.isDirectory() ? size(path.join(p, e.name)) : fs.statSync(path.join(p, e.name)).size;
  return total;
};
console.log(`\nSite pronto para a Hostinger (API: ${API_URL})`);
console.log(`  pasta: ${OUT} (${(size(OUT) / 1e6).toFixed(1)} MB)`);
console.log(`  zip:   ${zip} (${(fs.statSync(zip).size / 1e6).toFixed(1)} MB)`);
