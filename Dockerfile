FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production=false

# Copy source
COPY . .

# Build
RUN npx esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/server.js --external:ws

# Expose port
EXPOSE 3400

# Run
CMD ["node", "dist/server.js"]
