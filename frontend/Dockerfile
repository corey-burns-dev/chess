# --- Development Stage ---
FROM oven/bun:1.2 AS development
WORKDIR /app
COPY package.json bun.lock ./
ENV BUN_INSTALL_HUSKY=0
RUN bun install
COPY . .
# Vite's default dev port
EXPOSE 3000
CMD ["bun", "run", "dev"]

# --- Build Stage ---
FROM development AS build
RUN bun run build

# --- Production Stage ---
FROM nginx:stable-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
