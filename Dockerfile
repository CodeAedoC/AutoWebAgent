# Use Node.js 24 on Debian Bookworm
FROM node:24-bookworm-slim

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
EXPOSE 3001

CMD ["node", "index.js"]
