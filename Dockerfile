# RiseFlow — imagem única para o Render: builda o frontend (Vite) e roda o
# proxy Express (server/) servindo o build estático + /api na mesma porta.
#
# IMPORTANTE: variáveis VITE_* são de BUILD (viram texto no bundle). No Render,
# cadastre-as como env vars do serviço (elas são expostas ao docker build):
#   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
# VITE_API_URL/VITE_SOCKET_URL ficam vazias de propósito → same-origin.

# ── Estágio 1: build do frontend ────────────────────────────────────────────
FROM node:22-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL=""
ARG VITE_SOCKET_URL=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_URL=$VITE_API_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build

# ── Estágio 2: runtime (proxy Express + dist) ───────────────────────────────
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=frontend /app/dist /app/dist

# Render injeta PORT; o server usa process.env.PORT (default 3333).
EXPOSE 3333
CMD ["node", "index.js"]
