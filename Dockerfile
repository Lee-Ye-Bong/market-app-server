FROM node:18

WORKDIR /app

COPY package*.json ./

# devDependencies(typescript 등)까지 같이 설치
RUN npm install --include=dev

COPY . .

# TypeScript 컴파일 (tsc)
RUN npm run build

EXPOSE 3000

# dist/app.js 실행
CMD ["npm", "start"]
