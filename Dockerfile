# ---- Base ----
FROM node:22-alpine AS base

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./
# Copy DB Requirements
COPY .env ./
COPY drizzle.config.ts ./
COPY ./db/migrations ./db/migrations
COPY ./src/types ./src/types
COPY ./src/db/schema.ts ./src/db/schema.ts

# ---- Dependencies ----
FROM base AS dependencies

# Install npm dependencies, including node-gyp
RUN npm run setup

# Copy all source files
COPY . .

# ---- Production ----
FROM dependencies AS production

# Default command to start the application
CMD ["npm", "start"]