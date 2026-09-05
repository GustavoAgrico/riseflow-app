# Riseframe — build do frontend + servidor num único container.
# O binário do FFmpeg vem do pacote `ffmpeg-static` (não precisa de apt install ffmpeg),
# mas o burn-in de legendas (libass) precisa de fontes + fontconfig em runtime.
# A transcrição padrão (whisper-local) roda em CPU via Python + faster-whisper.
FROM node:20-slim

# Tamanho do modelo Whisper a pré-baixar no build (tiny|base|small|medium).
ARG WHISPER_MODEL=base

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     fontconfig fonts-dejavu-core python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependências Python da transcrição local + pré-download do modelo (cache na imagem).
# O pré-download precisa de acesso ao HuggingFace no ambiente de build; se ele não
# estiver disponível, o modelo é baixado no 1º job em runtime.
COPY server/requirements.txt ./server/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r server/requirements.txt \
  && (python3 -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')" \
      || echo 'aviso: modelo Whisper não pré-baixado no build; será baixado no 1º job')

# Instala dependências dos workspaces Node (cache de camadas).
COPY package.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install --workspaces --include-workspace-root

# Copia o código e builda o frontend.
COPY . .
RUN npm run build

ENV PORT=4000
ENV CORS_ORIGIN=*
ENV TRANSCRIBE_PROVIDER=whisper-local
ENV WHISPER_MODEL=${WHISPER_MODEL}
EXPOSE 4000

# O servidor serve web/dist e /api na mesma origem (porta 4000).
CMD ["npm", "run", "start"]
