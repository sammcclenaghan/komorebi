FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# The web server build doesn't need the Electron runtime binary; skip its
# ~100MB postinstall download to keep CI builds fast and reliable.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build:web

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV KOMOREBI_WEB=1
ENV KOMOREBI_HOST=0.0.0.0
ENV KOMOREBI_PORT=3847
ENV KOMOREBI_DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/dist ./dist
EXPOSE 3847
VOLUME ["/data"]
CMD ["node", "dist-server/main.cjs"]
