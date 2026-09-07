ARG NODE_IMAGE=node:24.19.0-bookworm-slim
FROM ${NODE_IMAGE} AS builder
WORKDIR /build
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --registry="${NPM_REGISTRY}" --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build:docker

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    SCHEDU_DB_PATH=/app/data/schedu.sqlite \
    SCHEDU_MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=builder --chown=node:node /build/dist/standalone/ ./
COPY --chown=node:node drizzle/ ./drizzle/
COPY --chown=node:node deploy/ ./deploy/
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000/tcp
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "deploy/start.mjs"]
