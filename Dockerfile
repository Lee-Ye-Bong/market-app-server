FROM node:18

WORKDIR /app

COPY package*.json ./

# devDependencies(typescript 등)까지 설치
RUN npm install --include=dev

COPY . .

# tsc 바이너리에 실행 권한 추가
RUN chmod +x node_modules/.bin/tsc

# TypeScript 컴파일
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
