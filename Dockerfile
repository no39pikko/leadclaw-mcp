# GTM Agent / LeadClaw v2 server.
# Build:  docker build -t gtm-agent .
# Run:    docker run -d --name gtm -p 4000:4000 --env-file .env -v gtm-data:/app/data gtm-agent
FROM node:20-slim

# Build tools for better-sqlite3's native addon (falls back to source build if no prebuild).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV PORT=4000
EXPOSE 4000

# SQLite + Google token live here — mount a volume to persist across restarts.
VOLUME ["/app/data"]

CMD ["node", "dist/v2/server.js"]
