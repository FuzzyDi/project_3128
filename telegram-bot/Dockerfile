FROM node:18-alpine

WORKDIR /app

# Устанавливаем только то, что нужно для запуска
COPY package*.json ./
RUN npm install --only=production

# Копируем исходники
COPY . .

ENV NODE_ENV=production

CMD ["npm", "start"]
