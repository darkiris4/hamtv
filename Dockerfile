FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cached unless package.json changes)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY server.js    ./
COPY public/      ./public/

# config.json is NOT baked in — it's mounted as a volume at runtime
# so tile changes survive container rebuilds.

EXPOSE 3000

CMD ["node", "server.js"]
