# 1. Node.js 20 버전 사용 (가벼운 Alpine 리눅스)
FROM node:20-alpine

# 2. 컨테이너 안에서 작업 디렉토리 설정
WORKDIR /app

# 3. 패키지 정보 먼저 복사
COPY package*.json ./

# 4. 의존성 설치
RUN npm install

# 5. 나머지 소스 코드 전체 복사
COPY . .

# 6. 실행 환경
ENV NODE_ENV=production

# 7. 서버 실행 (package.json의 "start": "tsx src/app.ts" 사용)
CMD ["npm", "start"]
