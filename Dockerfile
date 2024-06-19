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

# ---- Files ----
FROM dependencies AS files

# Copy all source files
COPY . .

# ---- Production ----
FROM database AS production

# Default command to start the application
ENTRYPOINT ["npm", "docker:start"]