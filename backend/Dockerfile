# Use official Node image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Create uploads folder
RUN mkdir -p uploads

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]