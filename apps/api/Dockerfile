FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Install ALL deps (monorepo)
RUN pnpm install --frozen-lockfile

# Copy source
COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build API
RUN cd apps/api && pnpm build

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
