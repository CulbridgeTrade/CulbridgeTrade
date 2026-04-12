FROM node:18-alpine

WORKDIR /app

# Required for native Node modules
RUN apk add --no-cache python3 make g++

# Dependency layer
COPY package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund

# Application layer
COPY . .

# Runtime configuration
ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "server.js"]
