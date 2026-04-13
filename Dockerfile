FROM node:20.17-alpine

WORKDIR /app

# Required for native Node modules
RUN apk add --no-cache python3 make g++

# Dependency layer
COPY package*.json ./

RUN npm install --omit=dev --no-audit --no-fund

# Application layer
COPY . .

# Runtime configuration
ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:$$PORT/health || exit 1

# Run as non-root for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S culbridge -u 1001
USER culbridge

CMD ["node", "server.js"]
