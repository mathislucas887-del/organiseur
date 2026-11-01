FROM node:22-slim
WORKDIR /app
COPY package.json server.js ./
RUN npm install --omit=dev
COPY public ./public
ENV DB_PATH=/data/organiseur.db PORT=8080
RUN mkdir -p /data
EXPOSE 8080
CMD ["node","server.js"]
