FROM node:22.20.0-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY server.js seed.json ./
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data NODE_NO_WARNINGS=1
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
