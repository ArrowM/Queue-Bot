# ---- Base ----
# if current-alpine is not working, try node:22-alpine
FROM node:current-alpine AS base

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# ---- Dependencies ----
FROM base AS dependencies

# Install npm dependencies
RUN npm ci

# ---- Database ----
FROM dependencies AS database

# Copy DB Requirements
COPY .env ./
COPY drizzle.config.ts ./
COPY data/migrations ./data/migrations
COPY ./src/types ./src/types
COPY ./src/db/schema.ts ./src/db/schema.ts

RUN npx drizzle-kit push

# ---- Production ----
FROM database AS production

# Copy all source files
COPY . .

# Default command to start the application
ENTRYPOINT ["npm", "start"]