# Etapa 1: compilar el frontend con API en el mismo origen (VITE_API_BASE_URL vacío).
FROM oven/bun:1 AS web
WORKDIR /app
COPY package.json bun.lock ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN bun install --frozen-lockfile
COPY web web
RUN VITE_API_BASE_URL= bun run --filter web build

# Etapa 2: API + frontend compilado, servido por Express.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates && python3 -m venv /opt/ytdlp && /opt/ytdlp/bin/pip install --no-cache-dir yt-dlp && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/ytdlp/bin:${PATH}" HOST=0.0.0.0 MUSIC_DIR=/data/music YTDLP_JS_RUNTIME=1
WORKDIR /app
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev
COPY server ./server
COPY --from=web /app/web/dist ./web/dist
EXPOSE 3001
CMD ["npm", "--prefix", "server", "start"]
