# A demóoldal image-e, két lépcsőben: az első lefordítja az alkalmazást, a második csak a kész eredményt viszi tovább.
# Így a végső image-ben nincs benne a fordításhoz kellő sok csomag.

# --- 1. lépcső: fordítás ---
FROM node:24-slim AS builder
WORKDIR /app

# Előbb csak a függőségek: így a kód módosítása után nem telepít újra mindent.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# A next.config.ts-ben output: "standalone" van, ezért a build a .next/standalone mappába
# egy önállóan futtatható szervert tesz (server.js és csak a szükséges csomagok).
RUN npm run build

# --- 2. lépcső: futtatás ---
FROM node:24-slim
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# 0.0.0.0: a konténeren kívülről is elérhető legyen (a gépre a docker-compose.yml csak a 127.0.0.1-en vezeti ki)
ENV HOSTNAME=0.0.0.0

# A standalone mappa nem tartalmazza a statikus fájlokat (CSS, böngészőoldali JS), azokat külön kell mellé másolni.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
