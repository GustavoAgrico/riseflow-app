# Riseframe — build do frontend + servidor num único container.
# O binário do FFmpeg vem do pacote `ffmpeg-static` (não precisa de apt install ffmpeg),
# mas o burn-in de legendas (libass) precisa de fontes + fontconfig em runtime.
FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências dos workspaces primeiro (cache de camadas).
COPY package.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install --workspaces --include-workspace-root

# Copia o código e builda o frontend.
COPY . .
RUN npm run build

ENV PORT=4000
ENV CORS_ORIGIN=*
EXPOSE 4000

# O servidor serve web/dist e /api na mesma origem (porta 4000).
CMD ["npm", "run", "start"]
