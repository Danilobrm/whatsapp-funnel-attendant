# syntax=docker/dockerfile:1.7

# ---- Build stage ----------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Full install (dev deps needed for tsc)
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Only prod deps at runtime — no tsc, no vitest, no tsx.
COPY package*.json ./
RUN npm ci --omit=dev

# Compiled JS + SQL fixtures used by migrations and the seed script
COPY --from=builder /app/dist ./dist
COPY db ./db

EXPOSE 3000

CMD ["node", "dist/index.js"]
