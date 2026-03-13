# Build stage
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --loglevel=error

COPY server ./server
COPY client ./client
COPY shared ./shared
COPY attached_assets ./attached_assets
COPY migrations ./migrations
COPY vite.config.ts tailwind.config.ts tsconfig.json drizzle.config.ts postcss.config.js ./

RUN npm run build

# Run stage
FROM node:20-alpine AS run

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --loglevel=error

COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/shared ./shared
COPY drizzle.config.ts ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
