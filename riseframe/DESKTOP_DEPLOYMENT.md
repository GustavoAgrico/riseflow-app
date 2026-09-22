# Riseframe Desktop — Deployment e Distribuição

## Como Distribuir a App

### Opção 1: GitHub Releases (Recomendado — Auto-Update)

Distribua os instaladores via GitHub Releases. A app vai verificar atualizações automaticamente.

#### Setup

1. **Criar GitHub Release**

```bash
# Tag a versão (no package.json deve ter versão)
git tag v0.1.0
git push origin v0.1.0
```

2. **No GitHub, criar Release**
   - Vá para https://github.com/GustavoAgrico/riseflow-app/releases
   - Clique "Create a new release"
   - Tag: `v0.1.0`
   - Title: "Riseframe Desktop v0.1.0"
   - Description: mudanças, melhorias, etc.
   - Upload dos arquivos:
     - `Riseframe-0.1.0.exe` (Windows)
     - `Riseframe-0.1.0.dmg` (Mac)
     - `Riseframe-0.1.0.AppImage` (Linux)
   - Publicar

3. **Auto-Update vai funcionar**

A app verifica GitHub a cada inicialização e oferece atualizar se houver versão mais nova.

---

### Opção 2: Distribuição Manual

Se não quer usar GitHub, distribua os arquivos diretamente:

**Windows:**
```
https://seu-servidor.com/downloads/Riseframe-0.1.0.exe
https://seu-servidor.com/downloads/Riseframe-0.1.0-portable.exe
```

**Mac:**
```
https://seu-servidor.com/downloads/Riseframe-0.1.0.dmg
```

**Linux:**
```
https://seu-servidor.com/downloads/Riseframe-0.1.0.AppImage
https://seu-servidor.com/downloads/riseframe-0.1.0.deb
```

---

## Processo de Build

### Build Completo (todos os sistemas)

```bash
npm run build:desktop
```

Gera arquivos em `dist/builds/`:
```
dist/builds/
├── Riseframe-0.1.0.exe
├── Riseframe-0.1.0-portable.exe
├── Riseframe-0.1.0.dmg
├── Riseframe-0.1.0.AppImage
└── riseframe-0.1.0.deb
```

### Build por Sistema

**Apenas Windows:**
```bash
electron-builder -w
```

**Apenas Mac:**
```bash
electron-builder -m
```

**Apenas Linux:**
```bash
electron-builder -l
```

### Build Assinado (Produção)

Se você quiser assinar a app (recomendado para distribuição profissional):

**Windows (requer certificado de assinatura):**
```bash
# Em electron-builder.yml
win:
  certificateFile: ./certs/cert.pfx
  certificatePassword: ${CERTIFICATE_PASSWORD}
```

**Mac (requer ID Apple):**
```bash
# Em electron-builder.yml
mac:
  identity: "Developer ID Application: Your Name (TEAM_ID)"
  hardenedRuntime: true
```

---

## Auto-Update: Como Funciona

### 1. **Verificação**
A app verifica atualizações ao iniciar e a cada 1 hora.

### 2. **Download**
Se houver versão mais nova, baixa silenciosamente em background.

### 3. **Notificação**
Quando o download termina, pergunta ao usuário:
- "Reiniciar agora" → instala e reinicia
- "Depois" → instala na próxima vez que fechar a app

### 4. **Instalação**
A app se reinicia, desinstala versão antiga e instala a nova.

---

## Configurar Auto-Update Custom

Se quiser fazer auto-update com seu próprio servidor (sem GitHub):

**1. Criar `electron-builder.yml`:**
```yaml
publish:
  provider: generic
  url: https://seu-servidor.com/builds/
```

**2. No seu servidor, ter:**
```
https://seu-servidor.com/builds/
├── latest.yml  (arquivo de manifest)
├── Riseframe-0.1.0.exe
└── Riseframe-0.1.0.dmg
```

**3. Formato do `latest.yml`:**
```yaml
version: 0.1.0
files:
  - url: Riseframe-0.1.0.exe
    sha512: <hash-do-arquivo>
    size: 154000000
  - url: Riseframe-0.1.0.dmg
    sha512: <hash-do-arquivo>
    size: 180000000
```

Gere com:
```bash
npm run build:desktop
# Arquivo latest.yml é gerado automaticamente em dist/
```

---

## Versioning

Atualize a versão em `package.json`:

```json
{
  "version": "0.2.0"
}
```

E commit com tag:
```bash
git add package.json
git commit -m "Bump version to 0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

---

## Checklist antes de Deploy

- [ ] Testar em Windows
- [ ] Testar em Mac
- [ ] Testar em Linux
- [ ] Versão atualizada em `package.json`
- [ ] `web/dist/` foi feito (npm run build)
- [ ] FFmpeg está funcionando
- [ ] Whisper baixa e funciona
- [ ] Upload de vídeos funciona
- [ ] Processamento de vídeo funciona
- [ ] Export de vídeo final funciona
- [ ] Auto-update está habilitado

---

## Rollback de Versão

Se uma versão tem bug crítico:

**GitHub:**
1. Delete a tag: `git push origin --delete v0.2.0`
2. Delete a Release no GitHub
3. Crie nova tag com `vX.X.X-beta` para teste

**Manual:**
Remova os arquivos do servidor e redistribua versão anterior.

---

## Monitoramento

A app envia logs para:
- **Console do Electron:** Ctrl+Shift+I (devtools)
- **Arquivo de log:** `~/.config/Riseframe/logs/` (Linux/Mac) ou `%AppData%\Riseframe\logs\` (Windows)

Para habilitar log detalhado:
```bash
# No .env
DEBUG=true
```

---

## Licença & Segurança

Antes de distribuir, considere:
- [ ] Adicionar licença (LICENSE.md)
- [ ] Privacidade (privacy.md)
- [ ] Termos de uso
- [ ] Como os dados locais são protegidos

---

## Suporte aos Usuários

Quando um usuário tiver problema:

1. **Pedir versão:** App Menu → About → mostra versão
2. **Pedir logs:** Devtools (Ctrl+Shift+I) → Console
3. **Resetar:** Delete `.config/Riseframe/` (Linux/Mac) ou `%AppData%\Riseframe\` (Windows)

---

**Versão Atual:** v39  
**Último atualizado:** 2026-09-22
