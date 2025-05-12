# ---- Base ----
# if current-alpine is not working, try node:22-alpine
FROM node:current-alpine AS base

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# ---- Dependencies ----
FROM base AS dependencies

# Install npm dependencies
RUN apk add --no-cache python3 make g++ \
    && npm ci \
    && apk del python3 make g++

# ---- Production ----
FROM dependencies AS production

# Copy all source files
COPY . .

# Default command to start the application
ENTRYPOINT ["npm", "start"]