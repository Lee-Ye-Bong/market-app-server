# 1. Node 공식 이미지 사용
FROM node:18

# 2. 작업 폴더 생성
WORKDIR /app

# 3. package.json & package-lock.json 복사
COPY package*.json ./

# 4. 의존성 설치 (devDependencies 포함)
RUN npm install

# 5. 모든 소스 파일 복사
COPY . .

# 6. TypeScript 빌드
RUN npm run build

# 7. 3000 포트 노출 (Railway가 자동 설정)
EXPOSE 3000

# 8. 실행 명령 (dist 폴더 실행)
CMD ["npm", "start"]
