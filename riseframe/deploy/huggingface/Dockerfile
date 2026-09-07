# Dockerfile do Hugging Face Space do Riseframe.
# Diferente do Dockerfile principal: aqui o Space CLONA o código do GitHub (repo
# privado) usando um token de build (secret GH_TOKEN), então você só precisa deste
# arquivo + o README.md no Space. Versão leve: transcrição pela Deepgram (sem
# Python/Whisper), o que deixa o build rápido e estável no plano grátis.
FROM node:20-slim

# git para clonar; fontconfig + fontes para o libass queimar as legendas.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clona SOMENTE a pasta riseframe do repositório privado, usando o token de build.
# O GH_TOKEN é um secret configurado no Space (Settings → Secrets).
RUN --mount=type=secret,id=GH_TOKEN,required=true \
  git clone --depth 1 "https://x-access-token:$(cat /run/secrets/GH_TOKEN)@github.com/GustavoAgrico/riseflow-app.git" /tmp/repo \
  && cp -r /tmp/repo/riseframe/. /app/ \
  && rm -rf /tmp/repo

# Instala dependências dos workspaces e builda o frontend.
RUN npm install --workspaces --include-workspace-root
RUN npm run build

# O Space roteia para a porta declarada no README (app_port: 4000).
ENV PORT=4000
ENV CORS_ORIGIN=*
ENV TRANSCRIBE_PROVIDER=deepgram
ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "run", "start"]
