FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN pnpm install --filter @open-realtime/dashboard --prod=false --frozen-lockfile
COPY . .
RUN pnpm --filter @open-realtime/dashboard build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@open-realtime/dashboard", "start"]
