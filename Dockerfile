# ============================================================
# Stage 1: BASE — shared foundation for all stages
# ============================================================
# node:22-slim uses Debian with glibc (not Alpine/musl)
# Why slim over Alpine: better compatibility with native modules like bcrypt,
# and Node.js officially supports Debian but not Alpine
FROM node:22-slim AS base

# corepack is Node's built-in package manager manager
# It reads "packageManager" from package.json and installs that exact pnpm version
# This guarantees the same pnpm version locally and in Docker
RUN corepack enable

WORKDIR /app

# ============================================================
# Stage 2: PROD-DEPS — production dependencies only
# ============================================================
FROM base AS prod-deps

# Copy only what pnpm needs to resolve dependencies
# Docker caches each layer — if these files don't change, deps aren't reinstalled
COPY package.json pnpm-lock.yaml ./

# Prisma schema must be present BEFORE install because postinstall runs "prisma generate"
# Without this, the postinstall hook fails and the build breaks
COPY prisma/schema.prisma ./prisma/schema.prisma

# --frozen-lockfile: fails if lockfile doesn't match package.json (reproducible builds)
# --prod: skip devDependencies (no typescript, jest, eslint in production)
# --ignore-scripts: skip postinstall (prisma generate) — prisma CLI is a devDependency
# The generated client is copied from the build stage instead
# --mount=type=cache: BuildKit feature — persists pnpm store across builds for speed
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts

# ============================================================
# Stage 3: BUILD — install all deps and compile TypeScript
# ============================================================
FROM base AS build

COPY package.json pnpm-lock.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma

# Install ALL dependencies (including devDeps like typescript, @nestjs/cli)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# NOW copy source code — this layer busts cache only when code changes,
# not when dependencies change (that's the whole point of copying package.json first)
COPY . .

# Compile TypeScript → JavaScript into /app/dist
RUN pnpm build

# ============================================================
# Stage 4: PRODUCTION — minimal runtime image
# ============================================================
FROM base AS production

ENV NODE_ENV=production

# Create a non-root user — if the app gets compromised, the attacker
# can't install packages, modify system files, or escalate privileges
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nodejs

WORKDIR /app

# Copy production node_modules from stage 2 (no devDependencies)
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy compiled JavaScript from stage 3
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

# Copy Prisma schema + generated client (needed at runtime for queries)
COPY --from=build --chown=nodejs:nodejs /app/src/generated ./src/generated
COPY --from=build --chown=nodejs:nodejs /app/prisma ./prisma

# Copy package.json (needed by Node.js for module resolution)
COPY --from=build --chown=nodejs:nodejs /app/package.json ./

# Switch to non-root user BEFORE exposing ports or starting the app
USER nodejs

EXPOSE 3000

# Docker health check — pings your existing /health endpoint every 30s
# If 3 consecutive checks fail, Docker marks the container as unhealthy
# start-period gives NestJS time to boot before checks begin
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "const req = require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }); req.setTimeout(2000, () => { req.destroy(); process.exit(1); }); req.on('error', () => { process.exit(1); });"

# "node dist/main.js" not "pnpm start:prod" — avoids pnpm overhead
# and ensures SIGTERM goes directly to Node (important for graceful shutdown)
CMD ["node", "--require", "./dist/instrumentation.js", "dist/main.js"]

# ============================================================
# Stage 5: DEVELOPMENT — for docker-compose local dev
# ============================================================
FROM base AS development

ENV NODE_ENV=development

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy all source (will be overridden by volume mount in docker-compose)
COPY . .

EXPOSE 3000 9229

CMD ["pnpm", "run", "start:dev"]
