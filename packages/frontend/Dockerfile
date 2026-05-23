FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

FROM base AS deps
RUN npm ci --workspace=packages/shared --workspace=packages/frontend --ignore-scripts

FROM deps AS build
COPY packages/shared/ ./packages/shared/
COPY packages/frontend/ ./packages/frontend/
RUN npm run build -w packages/shared
RUN npm run build -w packages/frontend

FROM nginx:alpine AS runtime
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
