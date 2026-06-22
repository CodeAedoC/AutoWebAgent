# Use Node.js 20 on Debian Bookworm (Playwright is stable on Node 20 LTS)
FROM node:20-bookworm-slim

WORKDIR /app

# Copy package files and install dependencies
COPY backend/package*.json ./
RUN npm install

# Install Playwright's Chromium browser and ALL required system dependencies
# This is crucial for Railway, otherwise headless Chromium crashes immediately
RUN npx playwright install --with-deps chromium

# Copy the backend source code
COPY backend/ .

# Expose the port Railway will route traffic to
EXPOSE 8080

CMD ["node", "index.js"]
