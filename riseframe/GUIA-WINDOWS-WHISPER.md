# Ativar a transcrição real (Whisper) no Windows

Sem isso, as legendas usam **texto de exemplo** (modo mock) e não batem com a fala.
Com o Whisper local ativo, a transcrição é real, roda na sua CPU e **custa zero**.

Tempo: ~5–10 min (a maior parte é download). Faça uma vez só.

---

## 1. Instalar o Python

1. Baixe o Python 3 em **https://www.python.org/downloads/** (botão "Download Python 3.x").
2. Rode o instalador e, **na primeira tela, marque a caixa `Add python.exe to PATH`** (essencial — sem isso o servidor não encontra o Python).
3. Clique em **Install Now** e espere terminar.

Confirme no **PowerShell** (ou Prompt de Comando):

```powershell
python --version
```

Deve aparecer algo como `Python 3.12.x`. Se disser "não reconhecido", feche e reabra o terminal; se persistir, reinstale marcando a caixa do PATH.

---

## 2. Instalar as dependências do Whisper

No terminal, entre na pasta **server** do projeto e instale:

```powershell
cd C:\Users\Gustavo Agrico\riseflow-app\riseframe\server
python -m pip install -r requirements.txt
```

> Use `python -m pip` (e não `pip` solto) — é o jeito que sempre funciona no Windows.

Isso instala o `faster-whisper` (transcrição) e o `opencv-python-headless` (usado no reframe com tracking). Pode levar 1–2 min.

---

## 3. Reiniciar o servidor

Pare o servidor (`Ctrl + C` na janela onde ele roda) e suba de novo:

```powershell
cd C:\Users\Gustavo Agrico\riseflow-app\riseframe
npm run dev
```

Na inicialização, procure esta linha no log:

```
OK  [server] whisper-local disponível (o modelo é baixado no 1º job, se ainda não estiver em cache)
```

Se aparecer `whisper-local indisponível (falta faster-whisper)`, o passo 2 não concluiu — volte e rode o `pip install` de novo (confira que está dentro da pasta `server`).

---

## 4. Primeiro vídeo (baixa o modelo)

No **primeiro** vídeo que você processar depois disso, o Whisper baixa o modelo de voz (~150 MB, precisa de internet). Esse job demora um pouco mais. Os próximos usam o modelo em cache e são rápidos.

Pronto: o **aviso vermelho** "Legendas de demonstração" some do resultado, as legendas passam a bater com a fala e a **correção automática** (cortar muletas "é...", "hã", "hmm" e gagueiras) passa a valer sobre o texto real.

---

## Ajustar a precisão (opcional)

O modelo padrão é o `base` (bom equilíbrio). Para mais precisão, crie/edite o arquivo **`server/.env`** e adicione:

```
WHISPER_MODEL=small
```

Opções, do mais rápido ao mais preciso: `tiny` → `base` (padrão) → `small` → `medium`. Quanto maior, melhor a transcrição, porém mais lento na CPU. Para pt-BR, `small` costuma ser um ótimo custo-benefício.

---

## Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| `python` não reconhecido | Python sem PATH → reinstale marcando `Add python.exe to PATH`, reabra o terminal. Se você tem o launcher, tente `py --version`. |
| Servidor não acha o Python mesmo com `python` funcionando | Defina o caminho manualmente no `server/.env`: `PYTHON_BIN=C:\Caminho\para\python.exe` |
| `pip` não reconhecido | Use sempre `python -m pip ...` (ou `py -m pip ...`). |
| Erro do `faster-whisper`/`ctranslate2` ao carregar | Instale o **Microsoft Visual C++ Redistributable (x64)** da Microsoft e reinicie. |
| Download do modelo travado/lento | É a rede baixando o modelo no 1º job. Deixe concluir; da 2ª vez é instantâneo (cache). |
| Ainda cai no mock | Confira o log do servidor no passo 3 e rode `python -c "import faster_whisper"` dentro da pasta `server` — se der erro, o pacote não instalou. |

> Observação: o FFmpeg **já vem embutido** no projeto (`ffmpeg-static`) — você **não** precisa instalar FFmpeg no Windows.
