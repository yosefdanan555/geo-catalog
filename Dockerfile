# syntax=docker/dockerfile:1
FROM node:24 AS build

WORKDIR /tmp/buildApp

COPY ./package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:24-alpine AS production

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV SERVER_PORT=8080

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node --from=build /tmp/buildApp/dist .

USER node
EXPOSE 8080

CMD ["dumb-init", "node", "--import", "./instrumentation.mjs", "./index.js"]
