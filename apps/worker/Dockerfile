FROM node:20-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./
COPY tsconfig.json ./

# Copy source
COPY . .

# Install dependencies
RUN npm install

# Build TypeScript
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/apps/worker/index.js"]
