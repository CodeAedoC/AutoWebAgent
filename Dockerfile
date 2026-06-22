# Use Node.js 20 on Debian Bookworm (needed for Playwright system dependencies)
FROM node:20-bookworm-slim

# Install Playwright's system dependencies for Chromium
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 libx11-6 libxext6 \
    wget ca-certificates fonts-liberation \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY backend/package*.json ./
RUN npm install

# Install Playwright's Chromium browser binary
RUN npx playwright install chromium

# Copy the backend source code
COPY backend/ .

# Expose the port Railway will route traffic to
EXPOSE 3001

CMD ["node", "index.js"]
