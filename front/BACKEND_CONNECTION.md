# 백엔드 연결 가이드

## 1. 백엔드 코드 클론 및 설정

### 깃허브에서 백엔드 코드 클론

```bash
# 현재 위치: C:\Users\bgogi\OneDrive\바탕 화면
# 백엔드 저장소 클론 (다른 이름으로 클론하여 프론트엔드와 충돌 방지)
git clone https://github.com/Grayjiwon/dreamProject backend-repo
cd backend-repo/back

# 의존성 설치
npm install

# 환경 변수 파일 생성 (.env)
# 백엔드 프로젝트 루트(backend-repo/back)에 .env 파일 생성
# 필요한 환경 변수:
# - PORT=3000 (기본값, 생략 가능)
# - FRONTEND_ORIGINS=http://localhost:5173 (프론트엔드 주소)
# - SUPABASE_URL=your_supabase_url
# - SUPABASE_KEY=your_supabase_key
# - GEMINI_API_KEY=your_gemini_api_key

# 백엔드 서버 실행
npm start
```

**참고**: 백엔드 서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

### 백엔드 서버 포트 확인

백엔드 서버는 기본적으로 **포트 3000**에서 실행됩니다 (`server.js`의 `process.env.PORT || 3000`).
실행 후 `http://localhost:3000`에서 접근 가능합니다.

## 2. 프론트엔드 환경 변수 파일 생성

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# 백엔드 API 기본 URL
# 개발 환경: 로컬 백엔드 서버 주소 (예: http://localhost:3000)
# 프로덕션: 배포된 백엔드 서버 주소 (예: https://your-backend.com)
VITE_API_BASE=http://localhost:3000

# 모킹 사용 여부 (0: 백엔드 사용, 1: 모킹 사용)
VITE_USE_MOCK=0
```

## 3. 백엔드 서버 설정

### 개발 환경
- 백엔드 서버가 `http://localhost:3000`에서 실행 중이어야 합니다.
- 다른 포트를 사용하는 경우 `.env` 파일의 `VITE_API_BASE` 값을 변경하세요.

### 프로덕션 환경
- 배포된 백엔드 서버 URL로 `VITE_API_BASE` 값을 변경하세요.
- 예: `VITE_API_BASE=https://api.yourdomain.com`

## 4. CORS 설정 (백엔드)

백엔드 서버에서 CORS를 허용해야 합니다. 

### 현재 문제
프론트엔드가 `http://localhost:5173`에서 실행 중인데, 백엔드 서버가 이 origin을 허용하지 않아 CORS 오류가 발생하고 있습니다.

### 해결 방법
백엔드 담당자에게 다음을 요청하세요:

1. **배포된 백엔드 서버의 환경 변수 확인**
   - `FRONTEND_ORIGINS` 또는 `FRONTEND_ORIGIN` 환경 변수에 `http://localhost:5173` 추가
   - 또는 배포 플랫폼(Render 등)의 환경 변수 설정에서 추가

2. **백엔드 코드 확인**
   ```javascript
   // server.js의 DEFAULT_ALLOWED_ORIGINS에 이미 포함되어 있음:
   const DEFAULT_ALLOWED_ORIGINS = [
     'http://localhost:5173',  // ✅ 이미 있음
     'http://127.0.0.1:5173',
     'https://dream-project-theta.vercel.app',
     'https://creative-elf-1b8dcf.netlify.app',
   ];
   ```
   
   하지만 배포된 서버에서는 환경 변수 `FRONTEND_ORIGINS`가 설정되어 있으면 기본값을 무시합니다.

3. **요청 메시지 예시**
   ```
   배포된 백엔드 서버(Render)의 환경 변수에 
   FRONTEND_ORIGINS=http://localhost:5173,https://dream-project-theta.vercel.app
   추가해주세요!
   ```

## 5. 필요한 API 엔드포인트

프론트엔드에서 사용하는 주요 API 엔드포인트:

### 인증
- `POST /auth/login` - 로그인

### 학생 관리
- `GET /api/students` - 학생 목록 조회
- `POST /api/students` - 학생 추가
- `PUT /api/students/:id` - 학생 수정
- `DELETE /api/students/:id` - 학생 삭제

### 업로드
- `GET /uploads` - 업로드 목록
- `POST /uploads` - 파일 업로드
- `GET /uploads/:id/text` - 업로드된 파일 텍스트 조회
- `POST /uploads/:id/log` - 로그 저장

### 대시보드
- `GET /api/dashboard` - 대시보드 데이터
- `GET /api/dashboard?studentId=...&startDate=...&endDate=...` - 필터링된 대시보드 데이터

### AI 분석
- `POST /ai/extract-records` - Gemini를 통한 레코드 추출
- `POST /ai/generate-report` - 리포트 생성

### 리포트
- `GET /api/reports` - 리포트 목록
- `POST /api/reports` - 리포트 생성

## 6. 인증 토큰 처리

프론트엔드는 `localStorage`에 저장된 토큰을 `Authorization: Bearer {token}` 헤더로 전송합니다.

백엔드에서 토큰 검증 및 사용자 인증을 처리해야 합니다.

## 7. 테스트 방법

1. 백엔드 서버를 실행합니다.
2. `.env` 파일에 올바른 `VITE_API_BASE` 값을 설정합니다.
3. 프론트엔드를 재시작합니다 (`npm run dev`).
4. 브라우저 개발자 도구의 Network 탭에서 API 호출을 확인합니다.

## 8. 문제 해결

### CORS 오류
- 백엔드에서 CORS 설정을 확인하세요.
- 프론트엔드와 백엔드의 포트가 다른지 확인하세요.

### 401 Unauthorized
- 로그인 토큰이 올바르게 전송되는지 확인하세요.
- 백엔드에서 토큰 검증 로직을 확인하세요.

### 404 Not Found
- API 엔드포인트 경로가 올바른지 확인하세요.
- 백엔드 라우팅 설정을 확인하세요.

## 9. 빠른 시작 체크리스트

1. ✅ 백엔드 코드 클론 완료 (`C:\backend-repo\back`)
2. ✅ 백엔드 의존성 설치 완료 (`npm install`)
3. ⏳ 백엔드 환경 변수 설정 (`.env` 파일 생성)
   - `C:\backend-repo\back\.env.example` 파일을 참고하여 `.env` 파일 생성
   - 팀원에게 SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY 문의
4. ⏳ 백엔드 서버 실행 (`npm start`)
5. ⏳ 백엔드 서버 포트 확인 (`http://localhost:3000`)
6. ✅ 프론트엔드 `.env` 파일 생성 완료
   - `VITE_API_BASE=https://dreamproject-ia6s.onrender.com` 설정 완료
7. ⏳ 프론트엔드 재시작 (`npm run dev`)
8. ⏳ 브라우저에서 테스트

## 10. 백엔드 폴더 위치

백엔드 코드는 다음 위치에 클론되었습니다:
- **경로**: `C:\backend-repo\back`

백엔드 작업 시 이 폴더로 이동하여 작업하세요.

## 11. 환경 변수 파일 생성 방법

### 백엔드 `.env` 파일 생성

```bash
# 백엔드 폴더로 이동
cd C:\backend-repo\back

# .env.example 파일을 복사하여 .env 파일 생성
copy .env.example .env

# .env 파일을 열어서 실제 값으로 수정
# - SUPABASE_URL: 팀원에게 문의
# - SUPABASE_SERVICE_KEY: 팀원에게 문의
# - GEMINI_API_KEY: 팀원에게 문의 또는 Google AI Studio에서 발급
```

### 프론트엔드 `.env` 파일 생성

```bash
# 프론트엔드 폴더로 이동
cd "C:\Users\bgogi\OneDrive\바탕 화면\front"

# .env 파일 생성 (이미 생성 완료됨)
# 내용:
VITE_API_BASE=https://dreamproject-ia6s.onrender.com
VITE_USE_MOCK=0
```

**참고**: 프론트엔드 `.env` 파일은 이미 생성되어 배포된 백엔드 서버(`https://dreamproject-ia6s.onrender.com`)로 연결되도록 설정되어 있습니다.

