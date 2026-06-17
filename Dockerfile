FROM node:22-slim

# openssl requerido por prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3001

# db push crea/sincroniza el sqlite al arrancar, luego levanta el server
CMD ["npm", "run", "deploy"]
