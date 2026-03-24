FROM nginx:alpine

# Copy nginx configuration first
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy only frontend files (excluding nginx.conf and Dockerfile)
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
