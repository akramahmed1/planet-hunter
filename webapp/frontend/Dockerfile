# Railway build: set NEXT_PUBLIC_API_BASE to the public backend URL at build time.
# Next.js bakes this value into the build, so it cannot change after deploy.
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE

RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "npm run start -- --port ${PORT:-3000} --hostname 0.0.0.0"]
