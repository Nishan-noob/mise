FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

FROM base AS deps
RUN npm ci --workspace=packages/shared --workspace=packages/backend --ignore-scripts

FROM deps AS build
COPY packages/shared/ ./packages/shared/
COPY packages/backend/ ./packages/backend/
RUN npm run build -w packages/shared
RUN npm run build -w packages/backend

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build /app/packages/backend/src/db ./packages/backend/src/db
COPY package.json package-lock.json ./

RUN npm ci --workspace=packages/backend --omit=dev --ignore-scripts

EXPOSE 4000
WORKDIR /app/packages/backend
CMD ["node", "dist/index.js"]
