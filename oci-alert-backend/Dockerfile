FROM node:18
WORKDIR /app
COPY package*.json ./
# Install dependencies and rebuild native modules in the container
RUN npm install --legacy-peer-deps
RUN npm rebuild sqlite3 --build-from-source
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
