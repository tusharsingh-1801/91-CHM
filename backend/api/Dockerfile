FROM node:20-alpine

WORKDIR /app

# Copy root package.json and lockfile
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy backend source and env example
COPY backend/ ./backend/
COPY .env.example ./.env

# Run typescript build for backend
RUN npx tsc -b backend/api

# Run migrations and then start the server
CMD ["sh", "-c", "npm run migrate && npm run dev:server"]
