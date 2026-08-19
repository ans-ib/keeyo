# Keeyo — self-hosted hardware security key inventory
FROM node:22-alpine

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=5390

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 5390
VOLUME ["/data"]

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:5390/api/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
