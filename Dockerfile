# ==============================================================
# LoliNet Dockerfile
# Multi-stage lightweight production image
# ==============================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/lolinet.db

# Copy package definition files
COPY package.json package-lock.json ./

# Install dependencies (Node 22 supports built-in node:sqlite)
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Ensure data and uploads directories exist with proper permissions
RUN mkdir -p /app/data /app/assets/uploads && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Expose server port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/public/state || exit 1

# Start server
CMD ["node", "server/index.js"]
