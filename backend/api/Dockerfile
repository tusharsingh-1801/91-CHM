FROM node:20-alpine

WORKDIR /app

# Copy root package.json and lockfile
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy backend source and env example
COPY backend/ ./backend/
COPY .env.example ./.env

# Validate the API sources without depending on frontend files that are not
# copied into this image.
RUN npx tsc --ignoreConfig --noEmit --target ES2022 --module NodeNext \
    --moduleResolution NodeNext --allowImportingTsExtensions \
    --esModuleInterop --skipLibCheck backend/api/app.ts backend/api/server.ts

# Run migrations and then start the server
CMD ["sh", "-c", "npm run migrate && npm run dev:server"]
