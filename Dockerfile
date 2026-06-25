# Base for shared dependencies — Debian slim for MediaPipe compatibility
FROM node:20-slim AS base
WORKDIR /app
# Install system dependencies, Python, OpenCV, MediaPipe, and latest yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl python3 python3-pip python3-venv \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages opencv-python-headless mediapipe numpy \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && mkdir -p /opt/opencv-data \
    && curl -L https://raw.githubusercontent.com/opencv/opencv/4.x/data/haarcascades/haarcascade_frontalface_default.xml -o /opt/opencv-data/haarcascade_frontalface_default.xml
ENV OPENCV_FACE_CASCADE=/opt/opencv-data/haarcascade_frontalface_default.xml

# Backend Build
FROM base AS api-builder
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/types/package*.json ./packages/types/
RUN npm install
COPY apps/api ./apps/api
COPY packages/types ./packages/types
RUN npm run build -w apps/api

# Frontend Build
FROM base AS web-builder
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_EXCERPT_API_TOKEN

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_EXCERPT_API_TOKEN=$NEXT_PUBLIC_EXCERPT_API_TOKEN

COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/types/package*.json ./packages/types/
RUN npm install
COPY apps/web ./apps/web
COPY packages/types ./packages/types
RUN npm run build -w apps/web

# API Production Image
FROM base AS api-prod
WORKDIR /app
# Copy the compiled API output
# Copy the compiled API output
COPY --from=api-builder /app/apps/api/dist ./
COPY --from=api-builder /app/node_modules ./node_modules
COPY --from=api-builder /app/apps/api/package.json ./package.json
COPY apps/api/scripts ./scripts

EXPOSE 8007
CMD ["node", "index.js"]

# Worker Production Image
FROM base AS worker-prod
WORKDIR /app
# Copy the same compiled output as API since workers are part of the api package
COPY --from=api-builder /app/apps/api/dist ./
COPY --from=api-builder /app/node_modules ./node_modules
COPY --from=api-builder /app/apps/api/package.json ./package.json
COPY apps/api/scripts ./scripts

CMD ["node", "workers/videoWorker.js"]

# Web Production Image
FROM base AS web-prod
WORKDIR /app
COPY --from=web-builder /app/apps/web/.next ./.next
COPY --from=web-builder /app/apps/web/public ./public
COPY --from=web-builder /app/node_modules ./node_modules
COPY --from=web-builder /app/apps/web/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
