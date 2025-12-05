# 배포 가이드

이 문서는 프론트엔드와 백엔드를 배포하는 방법을 안내합니다.

## 배포 전 준비사항

### 1. 환경 변수 확인

#### 프론트엔드 환경 변수
`.env` 파일 생성 (프론트엔드 루트 디렉토리):
```env
VITE_API_BASE=https://your-backend-url.com
VITE_USE_MOCK=0
```

#### 백엔드 환경 변수
`.env` 파일 생성 (백엔드 루트 디렉토리):
```env
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
FRONTEND_ORIGINS=https://your-frontend-url.com
```

---

## 프론트엔드 배포 (Netlify)

### 방법 1: Netlify 웹사이트에서 배포

1. **Netlify 계정 생성**
   - https://www.netlify.com 접속
   - GitHub 계정으로 로그인

2. **프로젝트 연결**
   - "Add new site" → "Import an existing project"
   - GitHub 저장소 선택
   - 빌드 설정:
     - **Build command**: `npm run build`
     - **Publish directory**: `dist`
     - **Base directory**: `front` (또는 프론트엔드 폴더 경로)

3. **환경 변수 설정**
   - Site settings → Environment variables
   - 다음 변수 추가:
     ```
     VITE_API_BASE=https://your-backend-url.com
     VITE_USE_MOCK=0
     ```

4. **배포**
   - "Deploy site" 클릭
   - 배포 완료 후 URL 확인

### 방법 2: Netlify CLI로 배포

```bash
# Netlify CLI 설치
npm install -g netlify-cli

# 프론트엔드 디렉토리로 이동
cd front

# Netlify 로그인
netlify login

# 배포
npm run build
netlify deploy --prod
```

---

## 백엔드 배포 (Railway 추천)

### Railway 배포 방법

1. **Railway 계정 생성**
   - https://railway.app 접속
   - GitHub 계정으로 로그인

2. **프로젝트 생성**
   - "New Project" → "Deploy from GitHub repo"
   - 백엔드 저장소 선택
   - Root Directory를 `back`으로 설정

3. **환경 변수 설정**
   - Settings → Variables
   - 다음 변수 추가:
     ```
     PORT=3000
     SUPABASE_URL=your_supabase_url
     SUPABASE_KEY=your_supabase_key
     GEMINI_API_KEY=your_gemini_api_key
     GEMINI_MODEL=gemini-2.5-flash
     FRONTEND_ORIGINS=https://your-frontend-url.com
     ```

4. **배포 설정**
   - Settings → Build Command: (비워두기)
   - Settings → Start Command: `npm start`

5. **배포**
   - 자동으로 배포 시작
   - 배포 완료 후 URL 확인 (예: `https://your-app.railway.app`)

### Render 배포 방법 (대안)

1. **Render 계정 생성**
   - https://render.com 접속
   - GitHub 계정으로 로그인

2. **Web Service 생성**
   - "New" → "Web Service"
   - 저장소 선택
   - 설정:
     - **Name**: your-backend-name
     - **Root Directory**: `back`
     - **Environment**: Node
     - **Build Command**: (비워두기)
     - **Start Command**: `npm start`

3. **환경 변수 설정**
   - Environment 탭에서 변수 추가

4. **배포**
   - "Create Web Service" 클릭
   - 배포 완료 후 URL 확인

---

## 배포 후 확인사항

### 1. 프론트엔드 확인
- 배포된 URL 접속
- 브라우저 콘솔에서 API 연결 확인
- 로그인 기능 테스트

### 2. 백엔드 확인
- 백엔드 URL + `/api/health` 접속 (있다면)
- 프론트엔드에서 API 호출 테스트
- CORS 설정 확인

### 3. 환경 변수 확인
- 프론트엔드: `VITE_API_BASE`가 백엔드 URL을 가리키는지 확인
- 백엔드: `FRONTEND_ORIGINS`가 프론트엔드 URL을 포함하는지 확인

---

## 문제 해결

### CORS 에러
- 백엔드의 `FRONTEND_ORIGINS`에 프론트엔드 URL 추가
- 프로토콜 포함 (https://)

### API 연결 실패
- 프론트엔드의 `VITE_API_BASE` 확인
- 백엔드 URL이 올바른지 확인
- 백엔드 서버가 실행 중인지 확인

### 환경 변수 미적용
- 배포 플랫폼에서 환경 변수 재설정
- 재배포 필요할 수 있음

---

## 배포 체크리스트

- [ ] 프론트엔드 빌드 성공 (`npm run build`)
- [ ] 백엔드 환경 변수 설정 완료
- [ ] 프론트엔드 환경 변수 설정 완료
- [ ] CORS 설정 확인
- [ ] API 연결 테스트
- [ ] 로그인 기능 테스트
- [ ] 파일 업로드 기능 테스트

