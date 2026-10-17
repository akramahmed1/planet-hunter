# Railway build: set NEXT_PUBLIC_API_BASE to the public backend URL at build time.
# Next.js bakes this value into the build, so it cannot change after deploy.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
# Railway passes the deploy commit as a build arg; shown in a <meta> tag so checks can confirm the live build.
ARG RAILWAY_GIT_COMMIT_SHA=local
ENV NEXT_PUBLIC_BUILD_SHA=$RAILWAY_GIT_COMMIT_SHA

RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000
CMD ["sh", "-c", "npm run start -- --port ${PORT:-3000} --hostname 0.0.0.0"]
