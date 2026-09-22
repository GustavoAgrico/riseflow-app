# 🎬 Riseframe Desktop

Editor de vídeo com IA — 100% local, sem servidor, sem conta.

**Status:** Beta (v0.1.0)  
**Plataformas:** Windows, Mac, Linux

---

## 📦 Instalação Rápida

### Windows
1. Download: [Riseframe-0.1.0.exe](https://github.com/GustavoAgrico/riseflow-app/releases)
2. Execute e siga as instruções
3. Pronto! 🚀

### Mac
1. Download: [Riseframe-0.1.0.dmg](https://github.com/GustavoAgrico/riseflow-app/releases)
2. Arraste para Applications
3. Pronto! 🚀

### Linux
```bash
chmod +x Riseframe-0.1.0.AppImage
./Riseframe-0.1.0.AppImage
```

---

## ⚡ Recursos

- ✅ **Corte de silêncio** — Remove pausas automaticamente
- ✅ **Legendas automáticas** — Gera de áudio (Whisper)
- ✅ **B-roll inteligente** — Encontra e insere vídeos relacionados
- ✅ **Color Grade** — Ajusta cores e contraste
- ✅ **Análise de conteúdo** — Claude (opcional)
- ✅ **Totalmente offline** — Funciona sem internet*

*exceto se usar Claude remoto

---

## 🚀 Uso

1. Abra Riseframe
2. Clique "Carregar vídeo"
3. Escolha modo:
   - **Transcription** — Transcreve áudio e gera legendas
   - **Editor automático** — Todos os efeitos (recomendado)
4. Aguarde processamento
5. Download o vídeo final

---

## 📊 Performance

| Tamanho | Duração | Tempo (Render) | Tempo (Local) |
|---------|---------|---|---|
| 100MB | 10 min | 8-10 min | 3-5 min |
| 500MB | 50 min | 40-50 min | 15-20 min |

Local é **2-3x mais rápido** que Render Free.

---

## ⚙️ Requisitos

### Obrigatório
- Windows 10+ / Mac 10.14+ / Linux (Ubuntu 18.04+)
- 4GB RAM (mínimo)
- 2GB disco livre

### Opcional
- GPU (CUDA/Metal) — 10-100x mais rápido
- ANTHROPIC_API_KEY — Para melhor análise de conteúdo

---

## 📁 Dados Locais

Tudo salvo em:
- **Windows:** `C:\Users\<seu-usuario>\AppData\Local\Riseframe\`
- **Mac:** `~/Library/Application Support/Riseframe/`
- **Linux:** `~/.config/Riseframe/`

Inclui:
- `riseframe.db` — Configurações e histórico
- `uploads/` — Vídeos enviados
- `outputs/` — Vídeos processados

---

## 🔄 Atualizações

Atualizações automáticas! Quando você abrir a app, vai verificar atualizações.

Se quiser verificar agora:
Menu → Verificar atualizações

---

## 🎯 Próximas Melhorias

- [ ] Suporte GPU (CUDA/Metal) — 10-100x mais rápido
- [ ] Fila de jobs em background
- [ ] Integração Google Drive
- [ ] Plugin system
- [ ] Mais idiomas

---

## 💬 Problemas?

1. **Erro ao abrir:** Reinstale FFmpeg
   ```bash
   # Windows (Chocolatey)
   choco install ffmpeg
   
   # Mac
   brew install ffmpeg
   
   # Linux
   sudo apt-get install ffmpeg
   ```

2. **Lento na primeira execução:** Esperando Whisper baixar modelo (~140MB)

3. **Dados desaparecidos:** Verificar em C:\Users\...\AppData\Local\Riseframe

4. **Mais ajuda:** [DESKTOP_SETUP.md](./DESKTOP_SETUP.md)

---

## 📚 Documentação Completa

- [DESKTOP_SETUP.md](./DESKTOP_SETUP.md) — Setup e configuração
- [DESKTOP_DEPLOYMENT.md](./DESKTOP_DEPLOYMENT.md) — Deployment e atualização

---

**Desenvolvido com ❤️ by Gustavo**

[Reportar bug](https://github.com/GustavoAgrico/riseflow-app/issues) • [Feature request](https://github.com/GustavoAgrico/riseflow-app/discussions)
