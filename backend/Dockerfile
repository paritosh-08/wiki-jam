FROM node:20-alpine

# Install build dependencies for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application code
COPY . .

# Create sessions directory and temp upload directory
RUN mkdir -p /app/sessions /tmp/wiki-uploads

# Expose port
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]

