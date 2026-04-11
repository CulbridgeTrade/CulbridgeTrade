FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production

COPY . .

RUN addgroup -S nodejs && adduser -S culbridge -G nodejs

USER culbridge

EXPOSE 3000

CMD ["node", "server.js"]
