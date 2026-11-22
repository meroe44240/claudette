# Build context: chat/
FROM node:20-alpine
WORKDIR /app/seed
COPY seed/package.json seed/package-lock.json ./
RUN npm ci --omit=dev
COPY seed/src ./src
COPY humans.yaml agents.yaml /app/
COPY avatars /app/avatars
ENV CONFIG_DIR=/app
ENTRYPOINT ["npx", "tsx", "src/seed.ts"]
