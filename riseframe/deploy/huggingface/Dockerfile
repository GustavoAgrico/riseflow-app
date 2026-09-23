# Dockerfile do Hugging Face Space do Riseframe (plano grátis: 2 vCPU / 16 GB).
# Diferente do Dockerfile principal: aqui o Space CLONA o código do GitHub, então
# você só precisa deste arquivo + o README.md no Space. Versão leve: transcrição
# pela Deepgram (sem Whisper), o que deixa o build rápido e estável.
# Para pegar a versão nova do código: Space → Settings → "Factory rebuild".
FROM node:20-slim

# git para clonar; fontes para o libass queimar as legendas; Python + OpenCV para o
# reframe que segue o rosto (formatos 9:16/1:1 a partir de vídeo horizontal).
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates fontconfig fonts-dejavu-core python3 python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages opencv-python-headless==4.10.0.84

WORKDIR /app

# Clona só a pasta riseframe. O repositório é público; se um dia ficar privado,
# crie o secret GH_TOKEN no Space (Settings → Variables and secrets).
RUN --mount=type=secret,id=GH_TOKEN,mode=0444,required=false \
  T="$(cat /run/secrets/GH_TOKEN 2>/dev/null || true)"; \
  URL="https://github.com/GustavoAgrico/riseflow-app.git"; \
  if [ -n "$T" ]; then URL="https://x-access-token:${T}@github.com/GustavoAgrico/riseflow-app.git"; fi; \
  git clone --depth 1 "$URL" /tmp/repo \
  && cp -r /tmp/repo/riseframe/. /app/ \
  && rm -rf /tmp/repo

# Instala dependências dos workspaces e builda o frontend.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm install --workspaces --include-workspace-root && npm run build

# O Space roda o contêiner como o usuário 1000 (o "node" desta imagem): a pasta de
# dados precisa ser dele, senão uploads e renders falham por permissão.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

# O Space roteia para a porta declarada no README (app_port: 4000).
ENV PORT=4000
ENV CORS_ORIGIN=*
ENV TRANSCRIBE_PROVIDER=deepgram
ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "run", "start"]
