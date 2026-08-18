FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./server
COPY public ./public
COPY mobile/SyncWatch-v2.1.5.apk ./mobile/SyncWatch-v2.1.5.apk
COPY SyncWatch-Client-v2.1.5.exe ./client/SyncWatch-Client-v2.1.5.exe
COPY server-standalone.js ./server-standalone.js

ENV NODE_ENV=production PORT=5000 SYNCWATCH_DATA_DIR=/app/SyncWatch-Data
EXPOSE 5000
VOLUME ["/app/SyncWatch-Data"]
CMD ["node", "server-standalone.js"]

