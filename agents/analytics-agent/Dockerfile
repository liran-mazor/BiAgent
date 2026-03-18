FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install
COPY . .
CMD ["npx", "tsx", "src/index.ts"]
