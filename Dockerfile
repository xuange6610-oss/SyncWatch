FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY public ./public
COPY mobile/SyncWatch同步观影-v2.1.9.apk ./mobile/SyncWatch同步观影-v2.1.9.apk
COPY SyncWatch同步观影-Client-v2.1.9.exe ./client/SyncWatch同步观影-Client-v2.1.9.exe
COPY server-standalone.js ./server-standalone.js

ENV NODE_ENV=production PORT=5000 SYNCWATCH_DATA_DIR=/app/SyncWatch同步观影-Data
EXPOSE 5000
VOLUME ["/app/SyncWatch同步观影-Data"]
CMD ["node", "server-standalone.js"]
