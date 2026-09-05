FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

# NODE_ENV=production ставим ПОСЛЕ установки зависимостей и сборки: если выставить его
# раньше, npm ci пропустит devDependencies (typescript, tsx), а без них не соберётся
# `next build` и не отработает `npm run migrate` в CMD.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npm run migrate && npm start"]
