# ---- Base ----
FROM node:24-alpine AS base

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# ---- Dependencies ----
FROM base AS dependencies

# Build tools for native modules (better-sqlite3) when no prebuilt binary is available
RUN apk add --no-cache python3 make g++

# Install npm dependencies
RUN npm ci

# ---- Production ----
FROM dependencies AS production

# Copy all source files
COPY . .

# Default command to start the application
ENTRYPOINT ["npm", "start"]