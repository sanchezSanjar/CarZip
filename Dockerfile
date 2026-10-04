# CarZip backend: one image for both programs, the API (default) and the batch server.
# docker-compose.yml starts them, together with Redis.

# 1) build: install everything, run the tests, compile both apps, then drop the dev tools
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test \
	&& npx nest build \
	&& npx nest build carzip-batch \
	&& npm prune --omit=dev

# 2) run: only the compiled code and the production packages
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# uploaded photos are written here (a folder on the server, see docker-compose.yml)
RUN mkdir uploads && chown node:node uploads
USER node
EXPOSE 3007
CMD ["node", "dist/apps/carzip-api/main.js"]
