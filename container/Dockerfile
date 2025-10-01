FROM oven/bun:1.2.20-alpine

WORKDIR /app

# Install dependencies needed for compilation
RUN apk add --no-cache git

# Copy compilation script
COPY compile-service.js .

EXPOSE 3000

CMD ["bun", "run", "compile-service.js"]