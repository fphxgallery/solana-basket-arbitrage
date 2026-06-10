# ── Build client ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ── Build server ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS server-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build:server

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Production deps only
COPY package*.json ./
RUN npm install --omit=dev

# Copy built artifacts
COPY --from=server-builder /app/dist ./dist
COPY --from=client-builder /app/client/dist ./client/dist

# Wallet keypair mounted at runtime — never bake into image
VOLUME ["/app/wallet"]
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV WALLET_KEYPAIR_PATH=/app/wallet/keypair.json
ENV DATA_DIR=/app/data
EXPOSE 3420

CMD ["node", "dist/index.js"]
