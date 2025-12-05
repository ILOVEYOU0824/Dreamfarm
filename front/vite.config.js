import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 환경 변수 로드
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    esbuild: {
      charset: 'utf8',
    },
    server: {
      port: 5173, // 백엔드 CORS 설정과 일치하도록 포트 고정
      headers: {
        'Content-Language': 'ko',
      },
    },
    preview: {
      headers: {
        'Content-Language': 'ko',
      },
    },
    build: {
      chunkSizeWarningLimit: 1500, // 1.5MB까지만 경고
    },
    // 환경 변수가 없을 때 기본값 설정 (로컬 개발용)
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(
        env.VITE_API_BASE || 'http://localhost:3000'
      ),
      'import.meta.env.VITE_USE_MOCK': JSON.stringify(env.VITE_USE_MOCK || '0'),
    },
  }
})
