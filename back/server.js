// server.js
require('dotenv').config();
const express = require('express');
const { supabase } = require('./supabaseClient'); // 공용 클라이언트 불러오기
const cors = require('cors');
const { PDF_TXT_EXTRACTION_PROMPT } = require('./prompts');

// 🔹 업로드 + AI 분석용 추가 의존성
const multer = require('multer');
const path = require('path');
// pdf-parse 모듈 로드 (v2.x는 PDFParse 클래스를 export)
let pdfParse;
try {
  const pdfParseModule = require('pdf-parse');
  // pdf-parse v2.x는 PDFParse 클래스를 export하므로, 함수로 래핑
  if (typeof pdfParseModule === 'function') {
    // v1.x 스타일: 직접 함수
    pdfParse = pdfParseModule;
  } else if (pdfParseModule && pdfParseModule.PDFParse) {
    // v2.x 스타일: PDFParse 클래스 사용
    const PDFParse = pdfParseModule.PDFParse;
    pdfParse = async (buffer, options) => {
      const parser = new PDFParse(buffer, options);
      return await parser.parse();
    };
    console.log('[초기화] pdf-parse v2.x (PDFParse 클래스) 로드 성공');
  } else if (pdfParseModule && typeof pdfParseModule.default === 'function') {
    pdfParse = pdfParseModule.default;
  } else {
    // 마지막 시도: 모듈 자체가 함수인지 확인
    throw new Error('pdf-parse 모듈을 찾을 수 없습니다. pdf-parse v1.1.1로 다운그레이드하세요: npm install pdf-parse@1.1.1');
  }
  console.log('[초기화] pdfParse 함수 타입:', typeof pdfParse);
} catch (err) {
  console.error('[초기화] pdf-parse 모듈 로드 실패:', err);
  throw err;
}
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// 글로벌 에러 핸들러: 서버 크래시 방지 및 로그 출력
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// CORS 설정: Vite Dev 서버(5173) 등에서 오는 요청 허용
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://dream-project-theta.vercel.app',
  'https://creative-elf-1b8dcf.netlify.app',
  'https://dreamgrowfarm.netlify.app', // Netlify 배포 URL 추가
];

// 환경변수 FRONTEND_ORIGINS에 쉼표로 여러 개 지정 가능
const envOrigins = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// 환경 변수와 기본값을 병합 (중복 제거)
const ALLOWED_ORIGINS = envOrigins.length 
  ? [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins])] // 환경 변수와 기본값 병합
  : DEFAULT_ALLOWED_ORIGINS;
console.log('[CORS] Allowed origins:', ALLOWED_ORIGINS);

const corsOptions = {
  origin(origin, callback) {
    // 비브라우저/서버-서버 요청(origin 없음) 허용
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 600,
};

app.use(cors(corsOptions));
// 사전검사(Preflight) 요청 처리: 현재 요청에 대해 cors 헤더를 적용한 뒤 204 반환
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return cors(corsOptions)(req, res, () => res.sendStatus(204));
  }
  return next();
});
// Multer 등 업로드 중 발생하는 에러를 표준화해서 응답
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, message: '파일이 너무 큽니다. 최대 10MB까지 허용됩니다.' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ ok: false, message: '업로드 처리 중 오류가 발생했습니다.', error: err.message });
  }
  return res.status(500).json({ ok: false, message: '서버 오류가 발생했습니다.', error: String(err) });
});

// 🔹 업로드용 multer & Gemini 클라이언트 설정
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
let genAI = null;
try {
  if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log(`[Gemini] 모델: ${GEMINI_MODEL}`);
  } else {
    console.warn('[Gemini] GEMINI_API_KEY 미설정: AI 분석 비활성화 상태로 서버 시작');
  }
} catch (e) {
  console.error('[Gemini] 클라이언트 초기화 에러:', e?.message || e);
  genAI = null;
}

// Gemini API 키/모델 헬스체크 엔드포인트
// GET /api/ai/health → { ok: boolean, message, model, details }
app.get('/api/ai/health', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(400).json({
      ok: false,
      message: 'GEMINI_API_KEY가 설정되지 않았습니다 (.env 확인).',
      model: GEMINI_MODEL,
    });
  }
  if (!genAI) {
    return res.status(500).json({
      ok: false,
      message: 'Gemini 클라이언트가 초기화되지 않았습니다.',
      model: GEMINI_MODEL,
    });
  }

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'ping' }],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 16,
      },
    });
    const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.json({
      ok: true,
      message: 'Gemini 응답 성공',
      model: GEMINI_MODEL,
      details: text.slice(0, 200),
    });
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[AI Health] 에러:', msg);
    // Google API 에러 객체에 statusCode/response가 있는 경우 포함
    const status = err?.status || err?.code || 500;
    const body = err?.response?.data || err?.response || null;
    return res.status(200).json({
      ok: false,
      message: 'Gemini 호출 실패',
      model: GEMINI_MODEL,
      error: msg,
      status,
      bodySnippet: body ? JSON.stringify(body).slice(0, 500) : null,
    });
  }
});

// AI 채팅 엔드포인트
// POST /api/ai/chat → { message: string, context: object, conversationHistory: array }
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, context = {}, conversationHistory = [] } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ 
        message: '질문을 입력해주세요.',
        error: 'Message is required'
      });
    }

    if (!GEMINI_API_KEY || !genAI) {
      return res.status(500).json({
        message: 'AI 서비스가 설정되지 않았습니다.',
        error: 'Gemini API not configured'
      });
    }

    // 메시지에서 학생 이름 추출 (예: "재성 학생의 단체가 어디야?" → "재성")
    let mentionedStudentName = null;
    if (context.students && Array.isArray(context.students)) {
      for (const student of context.students) {
        const name = student.name || '';
        const alias = student.alias || '';
        // 학생 이름이나 별명이 메시지에 포함되어 있는지 확인
        if (name && message.includes(name)) {
          mentionedStudentName = name;
          break;
        }
        if (alias && message.includes(alias)) {
          mentionedStudentName = alias;
          break;
        }
      }
    }

    // 학생 데이터 조회 (선택된 학생 또는 메시지에서 언급된 학생)
    let studentData = null;
    let queryStudentId = context.selectedStudentId;
    
    // 메시지에서 학생 이름이 언급되었지만 선택된 학생이 다른 경우, 언급된 학생 찾기
    if (mentionedStudentName && (!queryStudentId || mentionedStudentName !== context.selectedStudentName)) {
      try {
        const { data: studentsList, error: findError } = await supabase
          .from('students')
          .select('id, name, alias, group_name')
          .or(`name.ilike.%${mentionedStudentName}%,alias.ilike.%${mentionedStudentName}%`)
          .limit(1);
        
        if (!findError && studentsList && studentsList.length > 0) {
          queryStudentId = studentsList[0].id;
        }
      } catch (e) {
        console.error('[AI Chat] 학생 이름으로 검색 실패:', e);
      }
    }

    // 학생 상세 정보 조회
    if (queryStudentId) {
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, name, alias, group_name, birth_date, memo, status')
          .eq('id', queryStudentId)
          .single();
        
        if (!error && data) {
          studentData = data;
        }
      } catch (e) {
        console.error('[AI Chat] 학생 데이터 조회 실패:', e);
      }
    }

    // 모든 학생 목록 조회 (학생 이름으로 검색할 때 사용)
    let allStudentsList = [];
    if (context.students && Array.isArray(context.students) && context.students.length > 0) {
      try {
        const studentIds = context.students.map(s => s.id).filter(Boolean);
        if (studentIds.length > 0) {
          const { data, error } = await supabase
            .from('students')
            .select('id, name, alias, group_name, birth_date, status')
            .in('id', studentIds);
          
          if (!error && data) {
            allStudentsList = data;
          }
        }
      } catch (e) {
        console.error('[AI Chat] 전체 학생 목록 조회 실패:', e);
      }
    }

    // 기간별 활동 데이터 조회 (선택된 학생 또는 메시지에서 언급된 학생)
    let activityData = [];
    const activityQueryStudentId = queryStudentId || context.selectedStudentId;
    if (context.startDate && context.endDate && activityQueryStudentId) {
      try {
        const { data, error } = await supabase
          .from('log_entries')
          .select(`
            id,
            log_date,
            log_content,
            emotion_tag,
            student_id,
            students(id, name),
            analysis
          `)
          .eq('student_id', activityQueryStudentId)
          .gte('log_date', context.startDate)
          .lte('log_date', context.endDate)
          .order('log_date', { ascending: true });

        if (!error && data) {
          activityData = data;
        }
      } catch (e) {
        console.error('[AI Chat] 활동 데이터 조회 실패:', e);
      }
    }

    // 프롬프트 구성
    const systemPrompt = `당신은 학생들의 활동과 감정을 분석하는 AI 어시스턴트입니다. 
학생들의 활동 기록과 감정 데이터를 바탕으로 질문에 답변해주세요.

${studentData ? `현재 조회 중인 학생 정보:
- 이름: ${studentData.name || '알 수 없음'}
- 별명: ${studentData.alias || '없음'}
- 단체명: ${studentData.group_name || '없음'}
- 생년월일: ${studentData.birth_date || '없음'}
- 상태: ${studentData.status || '없음'}
- 메모: ${studentData.memo || '없음'}` : ''}

${allStudentsList.length > 0 ? `전체 학생 목록 (${allStudentsList.length}명):
${allStudentsList.map((s, idx) => 
  `${idx + 1}. ${s.name || '이름 없음'}${s.alias ? ` (별명: ${s.alias})` : ''} - 단체: ${s.group_name || '없음'} - 상태: ${s.status || '없음'}`
).join('\n')}` : ''}

${context.startDate || context.endDate ? `기간: ${context.startDate || '시작일 없음'} ~ ${context.endDate || '종료일 없음'}` : ''}

${activityData.length > 0 ? `활동 기록 (${activityData.length}개):
${activityData.slice(0, 10).map((log, idx) => 
  `${idx + 1}. ${log.log_date}: ${log.log_content || ''} (감정: ${log.emotion_tag || '없음'})`
).join('\n')}` : ''}

질문에 대해 친절하고 구체적으로 답변해주세요. 
학생의 이름, 단체명, 생년월일, 상태 등의 정보를 물어보면 위에 제공된 데이터를 바탕으로 정확하게 답변해주세요.`;

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    
    // 대화 히스토리 구성
    const contents = [];
    
    // 시스템 프롬프트를 첫 메시지로
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt }]
    });
    
    // 대화 히스토리 추가 (최근 5개만)
    const recentHistory = conversationHistory.slice(-5);
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }
    
    // 현재 메시지 추가
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // 503 에러 재시도 로직 포함
    const maxRetries = 3;
    let result;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await model.generateContent({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1000,
          },
        });
        break; // 성공 시 루프 종료
      } catch (apiErr) {
        lastError = apiErr;
        const errorMessage = apiErr.message || apiErr.toString() || '';
        
        // 503 에러 (서버 과부하) - 재시도 가능
        const is503Error = errorMessage.includes('503') || 
                          errorMessage.includes('Service Unavailable') ||
                          errorMessage.includes('overloaded');
        
        if (is503Error && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 지수 백오프: 1초, 2초, 4초
          console.warn(`[AI Chat] 503 에러 (시도 ${attempt}/${maxRetries}), ${delay}ms 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // 재시도
        }
        
        // 재시도 불가능하거나 503이 아닌 다른 에러
        if (attempt === maxRetries) {
          throw apiErr; // 최대 재시도 횟수 초과 시 에러 던지기
        }
      }
    }
    
    if (!result) {
      throw lastError || new Error('Gemini API 호출 실패');
    }

    const responseText = result?.response?.text?.() || 
                        result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || 
                        '죄송합니다. 답변을 생성하는데 실패했습니다.';

    return res.json({
      message: responseText,
      model: GEMINI_MODEL
    });
  } catch (err) {
    console.error('[AI Chat] 에러:', err);
    const msg = err?.message || String(err);
    return res.status(500).json({
      message: 'AI 응답 생성 중 오류가 발생했습니다.',
      error: msg
    });
  }
});

// 일반 헬스체크: 서버 살아있음 확인
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// 🔹 로그인 API (POST /auth/login)
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}

    // 디버깅: 요청 데이터 확인
    console.log('[AUTH] 로그인 시도:', { 
      email, 
      passwordLength: password ? password.length : 0,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY 
    })

    if (!email || !password) {
      return res.status(400).json({ message: 'email과 password가 필요합니다.' })
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.warn('[AUTH] 이메일 형식 오류:', email)
      return res.status(400).json({ message: '올바른 이메일 형식이 아닙니다.' })
    }

    // Supabase Auth로 이메일/비밀번호 로그인 시도
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), // 공백 제거 및 소문자 변환
      password,
    })

    if (error || !data?.session || !data?.user) {
      console.error('[AUTH] 로그인 실패:', {
        error: error?.message || error,
        code: error?.code,
        status: error?.status,
        email: email
      })
      return res
        .status(401)
        .json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' })
    }

    const { session, user } = data

    // 선택: user_profiles 테이블에서 display_name, role 가져오기
    let profile = null
    try {
      const { data: profileRow, error: profileErr } = await supabase
        .from('user_profiles')
        .select('id, display_name, role')
        .eq('id', user.id)
        .single()

      if (!profileErr && profileRow) {
        profile = profileRow
      }
    } catch (e) {
      console.error('[AUTH] user_profiles 조회 에러:', e)
    }

    const responseUser = {
      id: user.id,
      email: user.email,
      display_name:
        profile?.display_name ||
        user.user_metadata?.display_name ||
        (user.email ? user.email.split('@')[0] : ''),
      role: profile?.role || user.user_metadata?.role || 'observer',
    }

    // 프론트(Login.jsx)가 기대하는 형태로 응답
    // { token, user }
    return res.json({
      token: session.access_token,
      user: responseUser,
    })
  } catch (e) {
    console.error('POST /auth/login 에러:', e)
    return res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() })
  }
})

// 기본 동작 확인용 엔드포인트
app.get('/', (req, res) => {
  res.send('Node + Supabase 서버 동작 중');
});

// DB 연결 테스트용 API
app.get('/api/users', async (req, res) => {
  const { data, error } = await supabase
    .from('user_profiles') // 나중에 students, log_entries 등으로 변경
    .select('*')
    .limit(20);

  if (error) {
    console.error('DB 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json(data);
});

// 서버 시작 전에 필요한 컬럼 확인 및 추가
async function ensureGroupNameColumn() {
  try {
    // 컬럼 존재 여부 확인 (간접적으로 확인)
    const { data, error } = await supabase
      .from('students')
      .select('group_name')
      .limit(1);
    
    // 에러가 없으면 컬럼이 존재하는 것으로 간주
    if (!error) {
      console.log('[초기화] group_name 컬럼이 이미 존재합니다.');
      return true;
    }
    
    // PGRST204 에러는 컬럼이 없다는 의미
    if (error && error.code === 'PGRST204') {
      console.log('[초기화] group_name 컬럼이 없습니다. SQL을 사용하여 추가해주세요.');
      console.log('[초기화] Supabase SQL Editor에서 다음 SQL을 실행하세요:');
      console.log('[초기화] ALTER TABLE students ADD COLUMN group_name TEXT;');
      return false;
    }
    
    // 다른 에러는 무시 (테이블이 비어있을 수도 있음)
    console.log('[초기화] group_name 컬럼 확인 중... (에러 무시)');
    return true;
  } catch (e) {
    console.warn('[초기화] group_name 컬럼 확인 실패:', e.message);
    return false;
  }
}

// 서버 시작
async function startServer() {
  // 컬럼 확인 (비동기로 실행, 서버 시작을 막지 않음)
  ensureGroupNameColumn().catch(err => {
    console.warn('[초기화] 컬럼 확인 중 오류 (무시):', err.message);
  });
  
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`서버 실행됨: http://localhost:${port}`);
  });
  
  server.on('error', (err) => {
    console.error('[server.listen error]', err && err.stack ? err.stack : err);
  });
}

startServer();

// 프로세스가 즉시 종료되는 환경을 방지하기 위한 임시 keep-alive
// 일부 환경에서 이벤트 루프가 바로 종료되는 문제가 있어 stdin을 유지합니다.
try { process.stdin.resume(); } catch (_) {}
setInterval(() => {}, 60 * 1000);


// 1. students API
// 학생 목록 조회
// 예시: GET /api/students?status=재학중
app.get('/api/students', async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('students')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('students 목록 조회 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json({
    count,
    items: data,
  });
});

// 모든 학생의 기록수 조회 (대시보드 최적화용)
// GET /api/students/record-counts
app.get('/api/students/record-counts', async (req, res) => {
  try {
    // 모든 학생 목록 가져오기 (status 필터 없이 모든 학생)
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id');

    if (studentsError) {
      console.error('[기록수] 학생 목록 조회 에러:', studentsError);
      return res.status(500).json({ message: 'DB Error', error: studentsError });
    }

    if (!students || students.length === 0) {
      return res.json({});
    }

    const studentIds = students.map(s => s.id);

    // 학생별 기록수 집계 (초기값 0으로 설정)
    const recordCounts = {};
    studentIds.forEach(studentId => {
      recordCounts[studentId] = 0;
    });

    // 모든 학생의 기록수를 한 번에 조회하여 집계
    const { data: logs, error: logsError } = await supabase
      .from('log_entries')
      .select('student_id')
      .in('student_id', studentIds)
      .eq('status', 'success');

    if (logsError) {
      console.error('[기록수] log_entries 조회 에러:', logsError);
      return res.status(500).json({ message: 'DB Error', error: logsError });
    }

    // 학생별로 기록수 집계
    if (logs && Array.isArray(logs)) {
      console.log('[기록수] log_entries 조회 결과:', logs.length, '개')
      logs.forEach(log => {
        if (log.student_id && recordCounts[log.student_id] !== undefined) {
          recordCounts[log.student_id] = (recordCounts[log.student_id] || 0) + 1;
        }
      });
    } else {
      console.log('[기록수] log_entries 데이터 없음 또는 배열 아님')
    }

    console.log('[기록수] 최종 집계 결과:', recordCounts)
    res.json(recordCounts);
  } catch (e) {
    console.error('/api/students/record-counts 에러:', e);
    return res.status(500).json({ message: 'Server Error', error: e.toString() });
  }
});

// 학생 한 명 상세 조회
// GET /api/students/:id
app.get('/api/students/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('students 상세 조회 에러:', error);
    return res.status(404).json({ message: '학생을 찾을 수 없습니다.', error });
  }

  res.json(data);
});

// 학생 추가 코드
// POST /api/students
// body 예시:
// {
//   "name": "배짱",
//   "status": "재학중",
//   "admission_date": "2023-03-02",
//   "birth_date": "2010-01-01",
//   "notes": "테스트용"
// }

// 학생 생성
// POST /api/students
app.post('/api/students', async (req, res) => {
  try {
    const {
      name,
      status = '재학',        // 기존 status 컬럼 계속 사용
      admission_date,
      birth_date,
      notes,
      alias,
      school_level,
      memo,
      group_name,
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ message: 'name 은 필수입니다.' });
    }

    // 단체명 검증 (초등부, 중등부, 고등부만 허용)
    const allowedGroupNames = ['초등부', '중등부', '고등부'];
    if (group_name && group_name.trim() && !allowedGroupNames.includes(group_name.trim())) {
      return res.status(400).json({ 
        message: '단체명은 "초등부", "중등부", "고등부" 중 하나만 선택 가능합니다.',
        error: 'Invalid group_name'
      });
    }

    const insertData = {
      name,
      status,
      admission_date: admission_date || null,
      birth_date: birth_date || null,
      notes: notes ?? null,
      alias: alias ?? null,
      school_level: school_level ?? null,
      memo: memo ?? null,
    };
    
    // group_name 컬럼이 존재하는 경우에만 추가 (Supabase 스키마에 따라 선택적)
    // group_name이 있고 유효한 값이면 추가
    if (group_name && group_name.trim()) {
      insertData.group_name = group_name.trim();
    }

    console.log('[학생 추가] insertData:', insertData);
    
    const { data, error } = await supabase
      .from('students')
      .insert([insertData])
      .select('*')
      .single();

    if (error) {
      console.error('학생 생성 에러:', error);
      console.error('학생 생성 에러 상세:', JSON.stringify(error, null, 2));
      // Supabase 에러 메시지 추출
      const errorMessage = error.message || error.details || '데이터베이스 오류가 발생했습니다.';
      const errorCode = error.code || 'UNKNOWN';
      return res.status(500).json({ 
        message: `학생 추가 실패: ${errorMessage}`,
        error: error,
        errorCode: errorCode
      });
    }

    console.log('[학생 추가] 저장된 데이터:', data);
    console.log('[학생 추가] group_name 확인:', data?.group_name);
    
    return res.status(201).json(data);
  } catch (e) {
    console.error('POST /api/students 에러:', e);
    console.error('POST /api/students 에러 스택:', e.stack);
    return res.status(500).json({ 
      message: `서버 오류: ${e.message || e.toString()}`,
      error: e.toString(),
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
});

// 학생 정보 수정
// PATCH /api/students/:id
// body에 온 필드만 선택적으로 업데이트
// 학생 수정
// PATCH /api/students/:id
app.patch('/api/students/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const {
      name,
      status,
      admission_date,
      birth_date,
      notes,
      alias,
      school_level,
      memo,
      group_name,
    } = req.body || {};

    // 단체명 검증 (초등부, 중등부, 고등부만 허용)
    const allowedGroupNames = ['초등부', '중등부', '고등부'];
    if (group_name !== undefined) {
      if (group_name && group_name.trim() && !allowedGroupNames.includes(group_name.trim())) {
        return res.status(400).json({ 
          message: '단체명은 "초등부", "중등부", "고등부" 중 하나만 선택 가능합니다.',
          error: 'Invalid group_name'
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (admission_date !== undefined) updateData.admission_date = admission_date;
    if (birth_date !== undefined) updateData.birth_date = birth_date;
    if (notes !== undefined) updateData.notes = notes;
    if (alias !== undefined) updateData.alias = alias;
    if (school_level !== undefined) updateData.school_level = school_level;
    if (memo !== undefined) updateData.memo = memo;
    // group_name 컬럼이 존재하는 경우에만 추가 (Supabase 스키마에 따라 선택적)
    if (group_name !== undefined && group_name && group_name.trim()) {
      updateData.group_name = group_name.trim();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: '수정할 필드가 없습니다.' });
    }

    const { data, error } = await supabase
      .from('students')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('학생 수정 에러:', error);
      return res.status(500).json({ message: 'DB Error', error });
    }

    return res.json(data);
  } catch (e) {
    console.error('PATCH /api/students/:id 에러:', e);
    return res.status(500).json({ message: 'Server Error', error: e.toString() });
  }
});

// 학생 삭제
// DELETE /api/students/:id
app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('students 삭제 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.status(204).send();
});

// 2. log_entries API
// 일지 목록 조회
// 예시: GET /api/log_entries?student_id=...&from=2025-01-01&to=2025-01-31
app.get('/api/log_entries', async (req, res) => {
  const {
    student_id,
    from, // 시작 날짜 (log_date >= from)
    to,   // 끝 날짜 (log_date <= to)
    status,
    limit = 50,
    offset = 0,
  } = req.query;

  let query = supabase
    .from('log_entries')
    .select('*', { count: 'exact' })
    .order('log_date', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (student_id) {
    query = query.eq('student_id', student_id);
  }
  if (from) {
    query = query.gte('log_date', from);
  }
  if (to) {
    query = query.lte('log_date', to);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('log_entries 목록 조회 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json({
    count,
    items: data,
  });
});

// 일지 한 건 상세 조회
// GET /api/log_entries/:id
app.get('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('log_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('log_entries 상세 조회 에러:', error);
    return res.status(404).json({ message: '일지를 찾을 수 없습니다.', error });
  }

  res.json(data);
});

// 일지 추가 코드
// POST /api/log_entries
// body 예시:
// {
//   "log_date": "2025-11-19",
//   "student_id": "학생 uuid",
//   "observer_id": "교사 uuid (옵션)",
//   "emotion_tag": "기쁨",
//   "activity_tags": ["물주기", "정리"],
//   "log_content": "오늘은 ~~~",
//   "related_metrics": ["집중도:높음"],
//   "status": "success",
//   "source_file_path": null
// }
app.post('/api/log_entries', async (req, res) => {
  const body = req.body || {}; // req.body unifined 방지
  const {
    log_date,
    student_id,
    observer_id,
    emotion_tag,
    activity_tags,
    log_content,
    related_metrics,
    status = 'success',
    source_file_path,
  } = req.body;

  if (!log_date || !student_id) {
    return res.status(400).json({ message: 'log_date와 student_id는 필수입니다.' });
  }

  const { data, error } = await supabase
    .from('log_entries')
    .insert([
      {
        log_date,
        student_id,
        observer_id,
        emotion_tag,
        activity_tags,
        log_content,
        related_metrics,
        status,
        source_file_path,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('log_entries 추가 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.status(201).json(data);
});

// 일지 수정
// PATCH /api/log_entries/:id
app.patch('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params;
  const {
    log_date,
    student_id,
    observer_id,
    emotion_tag,
    activity_tags,
    log_content,
    related_metrics,
    status,
    source_file_path,
  } = req.body;

  const updateData = {};
  if (log_date !== undefined) updateData.log_date = log_date;
  if (student_id !== undefined) updateData.student_id = student_id;
  if (observer_id !== undefined) updateData.observer_id = observer_id;
  if (emotion_tag !== undefined) updateData.emotion_tag = emotion_tag;
  if (activity_tags !== undefined) updateData.activity_tags = activity_tags;
  if (log_content !== undefined) updateData.log_content = log_content;
  if (related_metrics !== undefined) updateData.related_metrics = related_metrics;
  if (status !== undefined) updateData.status = status;
  if (source_file_path !== undefined) updateData.source_file_path = source_file_path;

  const { data, error } = await supabase
    .from('log_entries')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('log_entries 수정 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.json(data);
});

// 일지 삭제
// DELETE /api/log_entries/:id
app.delete('/api/log_entries/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('log_entries')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('log_entries 삭제 에러:', error);
    return res.status(500).json({ message: 'DB Error', error });
  }

  res.status(204).send();
});

// 3. emotion tags API (Supabase 테이블: tags)
// GET /rest/v1/tags?select=*
app.get(['/rest/v1/tags'], async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('tags 조회 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    return res.json(data || [])
  } catch (e) {
    console.error('GET /rest/v1/tags 에러:', e)
    return res.status(500).json({ message: 'Server Error', error: e.toString() })
  }
})

// POST /rest/v1/tags  body: { name: "감정" }
// 헤더 Prefer: return=representation 지원
app.post(['/rest/v1/tags'], async (req, res) => {
  try {
    const { name } = req.body || {}
    const label = (name || '').trim()
    if (!label) {
      return res.status(400).json({ message: 'name 필드가 필요합니다.' })
    }

    const { data, error } = await supabase
      .from('tags')
      .insert([{ name: label }])
      .select('*')
      .single()

    if (error) {
      console.error('tags 추가 에러:', error)
      return res.status(500).json({ message: 'DB Error', error })
    }

    const prefer = String(req.headers['prefer'] || '').toLowerCase()
    if (prefer.includes('return=representation')) {
      return res.status(201).json(data)
    }
    return res.status(201).json({ ok: true })
  } catch (e) {
    console.error('POST /rest/v1/tags 에러:', e)
    return res.status(500).json({ message: 'Server Error', error: e.toString() })
  }
})

function splitRawTextByDateBlocks(rawText) {
  if (!rawText) return [];

  const lines = rawText.split(/\r?\n/);
  const blocks = [];
  let currentDate = null;
  let currentLines = [];

  for (const line of lines) {
    // "2025-03-10" 이런 형식 찾기
    const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      // 이전 날짜 블록 저장
      if (currentDate && currentLines.length > 0) {
        blocks.push({
          date: currentDate,
          text: currentLines.join('\n').trim(),
        });
      }
      currentDate = dateMatch[1]; // "2025-03-10"
      const rest = line.replace(currentDate, '').trim();
      currentLines = rest ? [rest] : [];
    } else {
      currentLines.push(line);
    }
  }

  // 마지막 블록 저장
  if (currentDate && currentLines.length > 0) {
    blocks.push({
      date: currentDate,
      text: currentLines.join('\n').trim(),
    });
  }

  return blocks;
}

// =======================
// 🔻 여기부터 업로드 + AI 분석 관련 추가 코드
// =======================

// JSON 응답에서 records 구조 안전하게 파싱
function parseJsonFromText(text) {
  if (!text) return null;

  // 1) ```json ... ``` 코드블록에 담긴 경우 먼저 파싱 (AI가 마크다운 형식으로 반환하는 경우가 많음)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    try {
      const obj = JSON.parse(inner);
      if (Array.isArray(obj)) {
        return { records: obj };
      }
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj.records)) return obj;
        const alt = obj.data || obj.items || obj.logs || null;
        if (Array.isArray(alt)) return { records: alt };
        return obj;
      }
    } catch (e) {
      console.warn('parseJsonFromText: code block JSON parse 실패:', e);
    }
  }

  // 2) 전체를 순수 JSON으로 시도
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) {
      return { records: obj };
    }
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj.records)) return obj;
      const alt = obj.data || obj.items || obj.logs || null;
      if (Array.isArray(alt)) return { records: alt };
      return obj;
    }
  } catch (e) {
    console.warn('parseJsonFromText: raw JSON parse 실패:', e);
  }

  // 3) 텍스트에서 첫 { ... } 블록만 잘라 JSON 시도
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const possible = text.slice(firstBrace, lastBrace + 1);
    try {
      const obj = JSON.parse(possible);
      if (Array.isArray(obj)) {
        return { records: obj };
      }
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj.records)) return obj;
        const alt = obj.data || obj.items || obj.logs || null;
        if (Array.isArray(alt)) return { records: alt };
        return obj;
      }
    } catch (e) {
      console.warn('parseJsonFromText: brace range JSON parse 실패:', e);
    }
  }

  return null;
}

// PDF / TXT에서 텍스트 추출
async function extractPlainTextFromFile(file) {
  if (!file) {
    console.warn('[extractPlainTextFromFile] file이 null입니다.');
    return null;
  }
  
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  
  console.log(`[extractPlainTextFromFile] 파일 정보: ext=${ext}, mime=${mime}, buffer크기=${file.buffer ? file.buffer.length : 'null'}`);

  if (ext === '.pdf' || mime === 'application/pdf') {
    try {
      console.log('[extractPlainTextFromFile] PDF 파싱 시작...');
      const data = await pdfParse(file.buffer);
      const text = (data.text || '').trim();
      console.log(`[extractPlainTextFromFile] PDF 파싱 완료: ${text.length}자 추출`);
      if (text.length === 0) {
        console.warn('[extractPlainTextFromFile] PDF에서 텍스트를 추출할 수 없습니다. 이미지 기반 PDF일 수 있습니다.');
      }
      return text;
    } catch (e) {
      console.error('[extractPlainTextFromFile] PDF 파싱 에러:', e);
      throw e;
    }
  }

  // TXT 파일
  try {
    const text = file.buffer.toString('utf8');
    console.log(`[extractPlainTextFromFile] TXT 파일 읽기 완료: ${text.length}자`);
    return text;
  } catch (e) {
    console.error('[extractPlainTextFromFile] TXT 파일 읽기 에러:', e);
    throw e;
  }
}

// "10:00-10:30" / "30분" 등 → 대략적인 분 단위 시간
function estimateDurationMinutesFromActivityTime(activityTime) {
  if (!activityTime) return null;
  const text = String(activityTime).trim();

  // "30분", "약 45분"
  const m1 = text.match(/(\d+)\s*분/);
  if (m1) {
    const v = parseInt(m1[1], 10);
    if (!Number.isNaN(v)) return v;
  }

  // "10:00-10:30", "10:00 ~ 11:15"
  const m2 = text.match(/(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})/);
  if (m2) {
    const [_, h1, m11, h2, m22] = m2;
    const start = parseInt(h1, 10) * 60 + parseInt(m11, 10);
    const end = parseInt(h2, 10) * 60 + parseInt(m22, 10);
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      return end - start;
    }
  }

  return null;
}

// "홍길동(길동이)" → { name: '홍길동', alias: '길동이' }
function normalizeNameAndAlias(studentNameRaw, studentAliasRaw) {
  let name = (studentNameRaw || '').trim();
  let alias = (studentAliasRaw || '').trim();

  if (!name) return { name: '', alias: '' };

  const bracketMatch = name.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (bracketMatch) {
    const realName = bracketMatch[1].trim();
    const inBracket = bracketMatch[2].trim();
    if (realName) name = realName;
    if (!alias && inBracket) alias = inBracket;
  }

  return { name, alias };
}

// 날짜 문자열 → YYYY-MM-DD
function normalizeDate(dateStr) {
  if (!dateStr) {
    return new Date().toISOString().slice(0, 10);
  }
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

// (name, alias) → 고유 키
function makeStudentKey(name, alias) {
  return `${(name || '').trim()}|||${(alias || '').trim()}`;
}

/**
 * 🔸 runAutoExtractionForUpload
 * - 업로드 1건에 대해 rawText를 Gemini에 보내서 records JSON을 받고
 *   students / log_entries / ingest_uploads 를 업데이트한다.
 *
 * records 스키마:
 * {
 *   "records": [
 *     {
 *       "date": "YYYY-MM-DD",
 *       "student_name": "홍길동",
 *       "student_alias": "길동이",
 *       "activities": [
 *         {
 *           "activity_name": "파종",
 *           "activity_time": "10:00-10:30",
 *           "activity_emotion": ["즐거움","집중"]
 *         }
 *       ],
 *       "note": "이 학생에 대한 특이사항/요약"
 *     }
 *   ]
 * }
 */
async function runAutoExtractionForUpload(uploadRow, rawText) {
  if (!uploadRow || !uploadRow.id || !rawText) {
    console.log('[AUTO AI] 잘못된 인자, 실행하지 않음.');
    return;
  }

  try {
    // 0) 최신 ingest_uploads 상태 다시 확인 (이미 처리된 업로드 중복 처리 방지)
    const { data: latestUpload, error: latestErr } = await supabase
      .from('ingest_uploads')
      .select('id, file_name, status')
      .eq('id', uploadRow.id)
      .single();

    if (latestErr) {
      console.error('[AUTO AI] ingest_uploads 최신 상태 조회 에러:', latestErr);
    }

    const effectiveUpload = latestUpload || uploadRow;

    // 이미 success + log_entries 존재하면 재분석 스킵
    if (effectiveUpload.status === 'success') {
      const { data: existingLogs, error: logsErr } = await supabase
        .from('log_entries')
        .select('id')
        .eq('source_file_path', effectiveUpload.file_name)
        .limit(1);

      if (!logsErr && Array.isArray(existingLogs) && existingLogs.length > 0) {
        console.log(
          `[AUTO AI] 업로드 ${effectiveUpload.id} 는 이미 success + log_entries 존재. 재분석 생략.`,
        );
        return;
      }
    }

    console.log(
      `[AUTO AI] 업로드 ${effectiveUpload.id} 자동 분석 시작 (파일명: ${effectiveUpload.file_name})`,
    );

    // 1) raw_text 로그 + 길이 제한 (너무 긴 경우 토큰 초과 방지)
    const RAW_MAX_CHARS = 8000;
    let safeRaw = rawText || '';
    const _len = safeRaw.length;
    const _head = safeRaw.slice(0, 300);
    console.log(`[AUTO AI] raw_text length=${_len}`);
    console.log('[AUTO AI] raw_text head sample:\n' + _head);

    // ======= 🔽 여기부터 추가 (날짜별 원문 저장) 🔽 =======
    try {
      const dateBlocks = splitRawTextByDateBlocks(rawText);

      if (dateBlocks.length > 0) {
        const dailyRows = dateBlocks.map(b => ({
          log_date: normalizeDate(b.date),          // "2025-03-10" → Date
          source_file_path: effectiveUpload.file_name,
          raw_text: b.text,                         // 해당 날짜의 원문 전체
        }));

        const { error: dailyErr } = await supabase
          .from('daily_raw_logs')
          .insert(dailyRows);

        if (dailyErr) {
          console.error(
            '[AUTO AI] daily_raw_logs insert 에러:',
            dailyErr,
          );
        } else {
          console.log(
            `[AUTO AI] daily_raw_logs 저장 완료. 개수=${dailyRows.length}`,
          );
        }
      } else {
        console.log(
          '[AUTO AI] splitRawTextByDateBlocks 결과가 비어 있습니다. 날짜 패턴(YYYY-MM-DD)을 찾지 못했을 수 있습니다.',
        );
      }
    } catch (e) {
      console.error(
        '[AUTO AI] 날짜별 원문 저장 중 예외 발생:',
        e,
      );
    }
    // ======= 🔼 여기까지 추가 (날짜별 원문 저장) 🔼 =======

    if (safeRaw.length > RAW_MAX_CHARS) {
      console.log(
        `[AUTO AI] raw_text가 너무 길어 앞 ${RAW_MAX_CHARS}자만 사용합니다.`,
      );
      safeRaw = safeRaw.slice(0, RAW_MAX_CHARS);
    }

    // 2) 프롬프트 구성
    const extractionPrompt = PDF_TXT_EXTRACTION_PROMPT.replace(
      '{raw_text}',
      safeRaw,
    ).trim();

    if (!genAI) {
      console.warn('[AUTO AI] Gemini 비활성화(GEMINI_API_KEY 없음). 분석 생략.');
      await supabase
        .from('ingest_uploads')
        .update({
          status: 'error',
          error: 'AI 비활성화: GEMINI_API_KEY 미설정으로 분석 불가',
          updated_at: new Date().toISOString(),
        })
        .eq('id', effectiveUpload.id);
      return;
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    console.log('[AUTO AI] Gemini 호출 시작. model=', GEMINI_MODEL);

    // 3) Gemini 호출 (JSON-only는 프롬프트로 강하게 요구, responseMimeType는 제거)
    // 503 에러 재시도 로직 포함
    const maxRetries = 3;
    let result;
    let lastApiError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [{ text: extractionPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            // maxOutputTokens 명시 안 함 → 기본값 사용
            // responseMimeType: 'application/json', // JSON 모드는 일단 사용하지 않음
          },
        });
        break; // 성공 시 루프 종료
      } catch (apiError) {
        lastApiError = apiError;
        const errorMessage = apiError.message || apiError.toString() || '';
        
        // 429 에러 (할당량 초과) 특별 처리 - 재시도 불가
        if (errorMessage.includes('429') || 
            errorMessage.includes('quota') || 
            errorMessage.includes('Quota exceeded') ||
            errorMessage.includes('Too Many Requests')) {
          const quotaErrorMsg = 'Gemini API 일일 할당량(250회)을 초과했습니다. 내일까지 기다리시거나 유료 플랜으로 업그레이드해주세요.';
          console.error('[AUTO AI] Gemini API 할당량 초과:', apiError.message);
          await supabase
            .from('ingest_uploads')
            .update({
              status: 'error',
              error: quotaErrorMsg,
              updated_at: new Date().toISOString(),
            })
            .eq('id', effectiveUpload.id);
          return;
        }
        
        // 503 에러 (서버 과부하) - 재시도 가능
        const is503Error = errorMessage.includes('503') || 
                          errorMessage.includes('Service Unavailable') ||
                          errorMessage.includes('overloaded');
        
        if (is503Error && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 지수 백오프: 1초, 2초, 4초
          console.warn(`[AUTO AI] Gemini API 503 에러 (시도 ${attempt}/${maxRetries}), ${delay}ms 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // 재시도
        }
        
        // 재시도 불가능하거나 503이 아닌 다른 에러
        if (attempt === maxRetries) {
          throw apiError; // 최대 재시도 횟수 초과 시 에러 던지기
        }
      }
    }
    
    if (!result) {
      throw lastApiError || new Error('Gemini API 호출 실패');
    }

    // 4) 응답에서 텍스트 안전하게 꺼내기
    const response = result?.response;
    let text = '';

    try {
      if (response && typeof response.text === 'function') {
        const maybe = response.text();
        if (typeof maybe === 'string') {
          text = maybe;
        } else if (maybe && typeof maybe.then === 'function') {
          text = await maybe; // Promise<string> 인 경우
        }
      }
    } catch (e) {
      console.warn('[AUTO AI] response.text() 호출 중 에러:', e);
    }

    // fallback: candidates[0].content.parts[*].text 에 JSON이 들어있는 경우
    if (
      !text &&
      Array.isArray(response?.candidates) &&
      response.candidates.length > 0
    ) {
      try {
        const parts = response.candidates[0].content?.parts || [];
        text = parts
          .map(p =>
            typeof p === 'string'
              ? p
              : typeof p.text === 'string'
              ? p.text
              : '',
          )
          .join('')
          .trim();
        if (text) {
          console.log(
            '[AUTO AI] candidates[0].content.parts 에서 텍스트 fallback 사용. length=',
            text.length,
          );
        } else {
          console.log(
            '[AUTO AI] candidates[0].content.parts 에 text 필드가 없습니다.',
          );
        }
      } catch (e) {
        console.warn(
          '[AUTO AI] candidates[0].content.parts fallback 파싱 실패:',
          e,
        );
      }
    }

    const rawLen = (text || '').length;
    const rawHeadResp = (text || '').slice(0, 500);
    console.log(`[AUTO AI] model raw response length=${rawLen}`);
    if (rawHeadResp) {
      console.log('[AUTO AI] model raw response head:\n' + rawHeadResp);
    }

    // 4-1) 응답이 완전히 비어있는 경우 (MAX_TOKENS 등)
    if (!rawLen) {
      console.warn(
        '[AUTO AI] text가 비어 있음. usageMetadata 등 전체 응답 덤프(앞 2000자):',
      );
      try {
        console.warn(
          JSON.stringify(result, null, 2).slice(0, 2000),
        );
      } catch (e) {
        console.warn('[AUTO AI] result JSON.stringify 중 에러:', e);
      }

      await supabase
        .from('ingest_uploads')
        .update({
          status: 'error',
          error:
            'AI 응답이 비어 있습니다. (MAX_TOKENS 또는 안전 필터 등으로 실패 가능성, 서버 로그 참고)',
          updated_at: new Date().toISOString(),
        })
        .eq('id', effectiveUpload.id);
      return;
    }

    // 5) JSON 파싱 시도
    const parsed = parseJsonFromText(text);

    if (!parsed || !Array.isArray(parsed.records)) {
      console.warn('[AUTO AI] records 배열이 없는 응답. parsed=', parsed);
      const errSnippet = (text || '').slice(0, 300);
      await supabase
        .from('ingest_uploads')
        .update({
          status: 'error',
          error:
            'AI 분석 결과에 records 배열이 없습니다. 응답 선두: ' +
            errSnippet,
          updated_at: new Date().toISOString(),
        })
        .eq('id', effectiveUpload.id);
      return;
    }

    const records = parsed.records || [];
    console.log(
      `[AUTO AI] 업로드 ${effectiveUpload.id} records 개수:`,
      records.length,
    );

    if (records.length === 0) {
      await supabase
        .from('ingest_uploads')
        .update({
          status: 'success',
          progress: 100,
          updated_at: new Date().toISOString(),
        })
        .eq('id', effectiveUpload.id);
      return;
    }

    // --------- (1) (name, alias) 쌍 수집 ---------
    const nameAliasList = [];
    const nameSet = new Set();

    for (const rec of records) {
      const { name, alias } = normalizeNameAndAlias(
        rec.student_name,
        rec.student_alias,
      );
      if (!name) continue;
      const key = makeStudentKey(name, alias);
      if (!nameSet.has(key)) {
        nameSet.add(key);
        nameAliasList.push({ name, alias });
      }
    }

    // --------- (2) 기존 students 조회 ---------
    let existingStudents = [];
    if (nameAliasList.length > 0) {
      const distinctNames = [
        ...new Set(nameAliasList.map(p => p.name).filter(Boolean)),
      ];
      if (distinctNames.length > 0) {
        const { data: sData, error: sErr } = await supabase
          .from('students')
          .select('id, name, alias')
          .in('name', distinctNames);

        if (sErr) {
          console.error('[AUTO AI] students 기존 조회 에러:', sErr);
        } else if (Array.isArray(sData)) {
          existingStudents = sData;
        }
      }
    }

    const studentMap = {};

    // (2-1) alias까지 있는 경우 우선 매칭
    for (const pair of nameAliasList) {
      const { name, alias } = pair;
      const key = makeStudentKey(name, alias);

      if (alias) {
        const candidates = existingStudents.filter(
          s =>
            (s.name || '').trim() === name &&
            (s.alias || '').trim() === alias,
        );
        if (candidates.length === 1) {
          studentMap[key] = candidates[0].id;
        }
        continue;
      }

      const candidates = existingStudents.filter(
        s => (s.name || '').trim() === name,
      );
      if (candidates.length === 1) {
        studentMap[key] = candidates[0].id;
      }
    }

    console.log('[AUTO AI] studentMap:', studentMap);

    // --------- (3) log_entries row 생성 ---------
const logRows = [];

for (const rec of records) {
  const normalizedDate = normalizeDate(rec.date);
  const { name, alias } = normalizeNameAndAlias(
    rec.student_name,
    rec.student_alias,
  );
  const key = makeStudentKey(name, alias);
  const studentId = studentMap[key] || null;

  // log_entries.student_id 는 NOT NULL 이라서, 학생 ID 없으면 스킵
  if (!studentId) {
    console.warn(
      '[AUTO AI] student_id 없음. 해당 record는 log_entries에 저장하지 않음. record=',
      rec,
    );
    continue;
  }

  // 기본 베이스: log_entries 스키마 기준
  const base = {
    student_id: studentId,
    log_date: normalizedDate, // ← log_entries.log_date
    source_file_path: effectiveUpload.file_name,
    status: 'success',        // 기본값이 있긴 하지만 명시적으로 넣어줌
  };

  // rec.activities 배열이 있으면 그걸 사용, 없으면 1개짜리 기본 활동 생성
  let activities = rec.activities || [];
  if (!Array.isArray(activities) || activities.length === 0) {
    activities = [
      {
        activity_name: rec.activity_title || '기록된 활동',
        activity_type: rec.activity_type || null,
        activity_time: rec.minutes || null,
        activity_emotion: rec.emotions || [],
      },
    ];
  }

  for (const act of activities) {
    // 감정 리스트 결정
    const emotionList =
      Array.isArray(act.activity_emotion) &&
      act.activity_emotion.length > 0
        ? act.activity_emotion
        : Array.isArray(rec.emotions)
        ? rec.emotions
        : [];

    // emotion_tag: 문자열 하나로 저장 (예: "긴장, 설렘")
    const emotionTag =
      emotionList && emotionList.length > 0
        ? emotionList.join(', ')
        : null;

    // activity_tags: 활동 유형/이름을 배열로 저장
    const activityTags = [];
    if (act.activity_type) {
      activityTags.push(act.activity_type);
    } else if (rec.activity_type) {
      activityTags.push(rec.activity_type);
    } else if (act.activity_name || rec.activity_title) {
      // 타입이 없으면 이름이라도 태그로 넣어둠
      activityTags.push(
        act.activity_name || rec.activity_title || '활동',
      );
    }

    // 활동 이름 / 시간 / 감정 / 메모를 합쳐서 log_content에 저장
    const activityName =
      act.activity_name || rec.activity_title || '활동';
    const timeText =
      act.activity_time ||
      (rec.minutes ? `${rec.minutes}분` : null);
    const noteText =
      rec.teacher_notes || rec.note || null;

    let logContent = `[${activityName}]`;
    if (timeText) {
      logContent += ` 시간: ${timeText}`;
    }
    if (emotionTag) {
      logContent += ` / 감정: ${emotionTag}`;
    }
    if (noteText) {
      logContent += ` / 메모: ${noteText}`;
    }

    logRows.push({
      ...base,
      emotion_tag: emotionTag,
      activity_tags:
        activityTags.length > 0 ? activityTags : null, // ARRAY 컬럼
      log_content: logContent,
      related_metrics: null, // 나중에 지표 쓰고 싶으면 여기 확장
    });
  }
}

console.log(
  `[AUTO AI] 업로드 ${effectiveUpload.id} log_rows 생성 완료. 개수=${logRows.length}`,
);

    // --------- (4) 새 학생(students) 생성 ---------
    const newStudentsToInsert = nameAliasList.filter(pair => {
      const key = makeStudentKey(pair.name, pair.alias);
      return !studentMap[key];
    });

    if (newStudentsToInsert.length > 0) {
      const now = new Date().toISOString();
      const toInsert = newStudentsToInsert.map(ns => ({
        name: ns.name,
        alias: ns.alias || null,
        created_at: now,
        updated_at: now,
      }));

      console.log(
        `[AUTO AI] 새 student insert 예정 개수=${toInsert.length}`,
      );

      const { data: insertedStudents, error: insErr } = await supabase
        .from('students')
        .insert(toInsert)
        .select('id, name, alias');

      if (insErr) {
        console.error('[AUTO AI] students insert 에러:', insErr);
      } else if (Array.isArray(insertedStudents)) {
        for (const s of insertedStudents) {
          const key = makeStudentKey(s.name, s.alias);
          studentMap[key] = s.id;
        }
        console.log(
          '[AUTO AI] students insert 완료. studentMap 갱신:',
          studentMap,
        );
      }
    }

    // --------- (5) 기존 log_entries 삭제 후 새로 insert ---------
    const { error: delErr } = await supabase
      .from('log_entries')
      .delete()
      .eq('source_file_path', effectiveUpload.file_name);

    if (delErr) {
      console.error('[AUTO AI] 기존 log_entries 삭제 에러:', delErr);
    }

    const { data: insertedLogs, error: insErr } = await supabase
      .from('log_entries')
      .insert(logRows)
      .select('id, student_id');

    if (insErr) {
      console.error('[AUTO AI] log_entries insert 에러:', insErr);
      await supabase
        .from('ingest_uploads')
        .update({
          status: 'error',
          error: 'log_entries 저장 실패',
          updated_at: new Date().toISOString(),
        })
        .eq('id', effectiveUpload.id);
      return;
    }

    const firstStudentId =
      insertedLogs && insertedLogs[0] ? insertedLogs[0].student_id : null;

    // --------- (6) details JSONB 필드에 AI 분석 결과 저장 ---------
    // records를 details 형식으로 변환 (프론트엔드에서 사용하기 위해)
    const detailsData = {
      dates: []
    };

    // records를 날짜별로 그룹화
    const recordsByDate = {};
    records.forEach(rec => {
      const date = normalizeDate(rec.date);
      if (!recordsByDate[date]) {
        recordsByDate[date] = [];
      }
      recordsByDate[date].push(rec);
    });

    // 각 날짜별로 details 구조 생성
    Object.keys(recordsByDate).forEach(date => {
      const dateRecords = recordsByDate[date];
      
      // 학생별로 그룹화
      const studentsMap = {};
      dateRecords.forEach(rec => {
        const { name, alias } = normalizeNameAndAlias(
          rec.student_name,
          rec.student_alias,
        );
        const studentKey = `${name}${alias ? `(${alias})` : ''}`;
        
        if (!studentsMap[studentKey]) {
          studentsMap[studentKey] = {
            student_name: name,
            student_alias: alias || null,
            activities: []
          };
        }

        // 활동 정보 추가
        const activity = {
          activity_name: rec.activity_title || '기록된 활동',
          activity_type: rec.activity_type || null,
          minutes: rec.minutes || null,
          emotions: Array.isArray(rec.emotions) ? rec.emotions : [],
          teacher_notes: rec.teacher_notes || '' // AI가 분석한 특이사항 (학생이 한 말, 특이사항 포함)
        };

        studentsMap[studentKey].activities.push(activity);
      });

      detailsData.dates.push({
        date: date,
        students: Object.values(studentsMap)
      });
    });

    // details와 함께 업데이트
    await supabase
      .from('ingest_uploads')
      .update({
        status: 'success',
        progress: 100,
        student_id: firstStudentId,
        details: detailsData, // AI 분석 결과를 details JSONB에 저장
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', effectiveUpload.id);

    console.log(
      `[AUTO AI] 업로드 ${effectiveUpload.id} 자동 분석 완료. log_rows=${logRows.length}, details 저장 완료`,
    );
  } catch (e) {
    console.error('[AUTO AI] runAutoExtractionForUpload 예외:', e);
    
    // 429 에러 (할당량 초과) 특별 처리
    const errorMessage = e.message || e.toString() || '';
    const isQuotaError = errorMessage.includes('429') || 
                        errorMessage.includes('quota') || 
                        errorMessage.includes('Quota exceeded') ||
                        errorMessage.includes('Too Many Requests');
    
    let errorMsg = '자동 AI 분석 중 예외 발생: ' + errorMessage;
    
    if (isQuotaError) {
      errorMsg = 'Gemini API 일일 할당량(250회)을 초과했습니다. 내일까지 기다리시거나 유료 플랜으로 업그레이드해주세요.';
      console.error('[AUTO AI] Gemini API 할당량 초과 - 더 이상 재시도하지 않습니다.');
    }
    
    try {
      await supabase
        .from('ingest_uploads')
        .update({
          status: 'error',
          error: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uploadRow.id);
    } catch (e2) {
      console.error(
        '[AUTO AI] ingest_uploads 에러 상태 업데이트 실패:',
        e2,
      );
    }
  }
}

// =======================
// 🔻 업로드 라우트들
// =======================

/**
 * POST /uploads, /api/uploads
 * - ingest_uploads 에 메타데이터 저장
 * - 파일에서 raw_text 추출하여 ingest_uploads.raw_text 업데이트
 * - 그 직후 runAutoExtractionForUpload(uploadRow, rawText) 1회 호출
 */
app.post(
  ['/uploads', '/api/uploads'],
  upload.single('file'),
  async (req, res) => {
    console.log('[업로드] POST /api/uploads 요청 받음');
    console.log('[업로드] 요청 헤더:', req.headers['content-type']);
    console.log('[업로드] 파일 존재:', !!req.file);
    
    try {
      const file = req.file;
      if (!file) {
        console.warn('[업로드] 파일이 없습니다.');
        return res.status(400).json({ message: '파일이 필요합니다.' });
      }
      
      console.log('[업로드] 파일 정보:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        bufferLength: file.buffer ? file.buffer.length : 0
      });

      const originalName = Buffer.from(
        file.originalname,
        'latin1',
      ).toString('utf8');

      const storageKey = `uploads/${Date.now()}-${originalName}`;
      const now = new Date().toISOString();

      const uploadedBy =
        (req.body &&
          (req.body.uploaded_by ||
            req.body.user_id ||
            req.body.uploader_id)) ||
        null;

      const { data: uploadRow, error } = await supabase
        .from('ingest_uploads')
        .insert([
          {
            file_name: originalName,
            storage_key: storageKey,
            student_id: null,
            uploaded_by: uploadedBy,
            status: 'queued',
            progress: 0,
            error: null,
            created_at: now,
            updated_at: now,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('ingest_uploads insert 에러:', error);
        return res.status(500).json({ message: 'DB Error', error });
      }

      let rawText = null;
      try {
        console.log(`[업로드] 파일 텍스트 추출 시작: ${originalName}, 타입: ${file.mimetype}, 크기: ${file.size} bytes`);
        rawText = await extractPlainTextFromFile(file);
        console.log(`[업로드] 텍스트 추출 완료: ${rawText ? rawText.length + '자' : '실패 (null)'}`);
      } catch (e) {
        console.error('[업로드] extractPlainTextFromFile 에러:', e);
        console.error('[업로드] 에러 상세:', e.stack || e.message);
      }

      if (rawText) {
        try {
          const { error: upErr } = await supabase
            .from('ingest_uploads')
            .update({
              raw_text: rawText,
              status: 'processing',
              updated_at: new Date().toISOString(),
            })
            .eq('id', uploadRow.id);

          if (upErr) {
            console.error('[업로드] ingest_uploads raw_text 업데이트 에러:', upErr);
          } else {
            uploadRow.raw_text = rawText;
            console.log(`[업로드] raw_text DB 업데이트 완료: ${uploadRow.id}`);
          }
        } catch (e) {
          console.error('[업로드] ingest_uploads raw_text 업데이트 예외:', e);
        }

        // 🔸 업로드 직후 자동 AI 분석 (다른 라우트에서는 호출 X)
        console.log(`[업로드] AI 분석 시작: ${uploadRow.id}`);
        runAutoExtractionForUpload(uploadRow, rawText).catch(err => {
          console.error(
            `[AUTO AI] 업로드 ${uploadRow.id} 자동 분석 실패:`,
            err,
          );
        });
      } else {
        // rawText가 없을 때 에러 상태로 업데이트
        console.warn(`[업로드] 텍스트 추출 실패: ${uploadRow.id}, 파일명: ${originalName}`);
        try {
          await supabase
            .from('ingest_uploads')
            .update({
              status: 'error',
              error: 'PDF 텍스트 추출 실패: 파일이 이미지 기반 PDF이거나 손상된 파일일 수 있습니다.',
              updated_at: new Date().toISOString(),
            })
            .eq('id', uploadRow.id);
          console.log(`[업로드] 에러 상태로 업데이트 완료: ${uploadRow.id}`);
        } catch (e) {
          console.error('[업로드] 에러 상태 업데이트 실패:', e);
        }
      }

      return res.status(201).json(uploadRow);
    } catch (e) {
      console.error('POST /uploads 에러:', e);
      return res
        .status(500)
        .json({ message: 'Upload Error', error: e.toString() });
    }
  },
);

/**
 * GET /uploads, /api/uploads
 * - ingest_uploads 목록 + 대표 학생 이름 + 업로더 이름
 */
app.get(['/uploads', '/api/uploads'], async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ingest_uploads')
      .select(
        'id, file_name, status, progress, error, created_at, student_id, uploaded_by',
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error('ingest_uploads 목록 조회 에러:', error);
      return res.status(500).json({ message: 'DB Error', error });
    }

    const uploadsRaw = data || [];

    const studentIds = [
      ...new Set(uploadsRaw.map(u => u.student_id).filter(Boolean)),
    ];
    const uploaderIds = [
      ...new Set(uploadsRaw.map(u => u.uploaded_by).filter(Boolean)),
    ];

    let studentsById = {};
    if (studentIds.length > 0) {
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, name')
        .in('id', studentIds);

      if (sErr) {
        console.error('students 조회 에러:', sErr);
      } else if (students) {
        studentsById = Object.fromEntries(
          students.map(s => [s.id, s.name]),
        );
      }
    }

    let uploaderById = {};
    if (uploaderIds.length > 0) {
      const { data: profiles, error: pErr } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', uploaderIds);

      if (pErr) {
        console.error('user_profiles 조회 에러:', pErr);
      } else if (profiles) {
        uploaderById = Object.fromEntries(
          profiles.map(p => [p.id, p.display_name || '']),
        );
      }
    }

    const uploads = uploadsRaw.map(u => ({
      id: u.id,
      file_name: u.file_name,
      status: u.status,
      progress: u.progress,
      error: u.error,
      created_at: u.created_at,
      uploaded_at: u.created_at,
      uploaded_by: u.uploaded_by,
      uploader_name: uploaderById[u.uploaded_by] || null,
      student_id: u.student_id,
      student_name: studentsById[u.student_id] || null,
    }));

    res.json(uploads);
  } catch (e) {
    console.error('GET /uploads 에러:', e);
    res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() });
  }
});

// 저장된 파일 목록 조회 (log_entries가 있는 uploads)
// GET /api/uploads/saved
// ⚠️ 이 엔드포인트는 /api/uploads/:id 보다 앞에 있어야 함 (라우트 순서 중요)
app.get(['/uploads/saved', '/api/uploads/saved'], async (req, res) => {
  try {
    // log_entries가 있는 uploads 조회
    const { data: logEntries, error: logErr } = await supabase
      .from('log_entries')
      .select('source_file_path, created_at, student_id, students(id, name)')
      .not('source_file_path', 'is', null)
      .order('created_at', { ascending: false });

    if (logErr) {
      console.error('[GET SAVED] log_entries 조회 에러:', logErr);
      return res.status(500).json({ message: 'DB Error', error: logErr });
    }

    // source_file_path별로 그룹화
    const fileMap = new Map();
    if (Array.isArray(logEntries)) {
      logEntries.forEach(entry => {
        const filePath = entry.source_file_path;
        if (filePath) {
          if (!fileMap.has(filePath)) {
            fileMap.set(filePath, {
              file_name: filePath,
              saved_at: entry.created_at,
              log_entry_count: 0,
              students: new Set()
            });
          }
          const fileInfo = fileMap.get(filePath);
          fileInfo.log_entry_count++;
          if (entry.students && entry.students.name) {
            fileInfo.students.add(entry.students.name);
          }
        }
      });
    }

    // uploads 테이블에서 상세 정보 가져오기
    const savedFiles = [];
    for (const [filePath, fileInfo] of fileMap.entries()) {
      // file_name으로 uploads 조회
      const { data: uploads, error: uploadErr } = await supabase
        .from('ingest_uploads')
        .select('id, file_name, created_at, status, raw_text')
        .eq('file_name', filePath)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!uploadErr && uploads && uploads.length > 0) {
        const upload = uploads[0];
        savedFiles.push({
          id: upload.id,
          file_name: upload.file_name || filePath,
          created_at: upload.created_at,
          saved_at: fileInfo.saved_at,
          status: upload.status,
          log_entry_count: fileInfo.log_entry_count,
          students: Array.from(fileInfo.students),
          source_file_path: filePath
        });
      } else {
        // uploads에 없어도 log_entries가 있으면 포함
        savedFiles.push({
          id: null,
          file_name: filePath,
          created_at: fileInfo.saved_at,
          saved_at: fileInfo.saved_at,
          status: 'saved',
          log_entry_count: fileInfo.log_entry_count,
          students: Array.from(fileInfo.students),
          source_file_path: filePath
        });
      }
    }

    // 저장 날짜순으로 정렬 (최신순)
    savedFiles.sort((a, b) => new Date(b.saved_at) - new Date(a.saved_at));

    return res.json(savedFiles);
  } catch (e) {
    console.error('GET /uploads/saved 에러:', e);
    return res.status(500).json({ message: 'Server Error', error: e.toString() });
  }
});

// 저장된 파일 삭제 (log_entries 삭제)
// DELETE /api/uploads/saved/:filePath
app.delete(['/uploads/saved/:filePath', '/api/uploads/saved/:filePath'], async (req, res) => {
  try {
    const { filePath } = req.params;
    const decodedFilePath = decodeURIComponent(filePath);

    // 해당 파일의 log_entries 삭제
    const { data: deletedEntries, error: deleteErr } = await supabase
      .from('log_entries')
      .delete()
      .eq('source_file_path', decodedFilePath)
      .select('id');

    if (deleteErr) {
      console.error('[DELETE SAVED] log_entries 삭제 에러:', deleteErr);
      return res.status(500).json({ message: 'DB Error', error: deleteErr });
    }

    const deletedCount = deletedEntries ? deletedEntries.length : 0;

    return res.json({
      ok: true,
      message: '저장된 파일 데이터가 삭제되었습니다.',
      deleted_count: deletedCount,
      file_path: decodedFilePath
    });
  } catch (e) {
    console.error('DELETE /uploads/saved/:filePath 에러:', e);
    return res.status(500).json({ message: 'Server Error', error: e.toString() });
  }
});

/**
 * GET /uploads/:id, /api/uploads/:id
 * - ingest_uploads 1건 + 해당 파일에서 생성된 log_entries + 학생 정보(alias 포함)
 */
app.get(['/uploads/:id', '/api/uploads/:id'], async (req, res) => {
  const { id } = req.params;

  try {
    const { data: upload, error: uploadErr } = await supabase
      .from('ingest_uploads')
      .select('*')
      .eq('id', id)
      .single();

    if (uploadErr || !upload) {
      console.error('uploads 단일 조회 에러:', uploadErr);
      return res
        .status(404)
        .json({ message: '업로드를 찾을 수 없습니다.' });
    }

    // source_file_path 조회: 새로운 형식({upload_id}::{file_name})과 기존 형식(file_name) 모두 처리
    const newFormatPath = `${upload.id}::${upload.file_name}`;
    const { data: logs, error: logsErr } = await supabase
      .from('log_entries')
      .select(
        'id, log_date, student_id, emotion_tag, activity_tags, log_content, related_metrics, source_file_path, student:students(name,alias)',
      )
      .or(`source_file_path.eq.${newFormatPath},source_file_path.eq.${upload.file_name}`)
      .order('log_date', { ascending: true });

    if (logsErr) {
      console.error('log_entries 조회 에러 (uploads/:id):', logsErr);
    }

    const logEntriesRaw = logs || [];

    let rawText = upload.raw_text || null;
    if (!rawText && logEntriesRaw.length > 0) {
      rawText = logEntriesRaw[0].log_content || null;
    }

    const logEntries = logEntriesRaw.map(entry => {
      const rmRaw = entry.related_metrics;
      const baseAnalysis =
        Array.isArray(rmRaw) && rmRaw.length > 0
          ? rmRaw[0] || {}
          : rmRaw || entry.analysis || {};

      const studentName =
        entry.student_name ||
        (entry.student && entry.student.name) ||
        null;

      const studentAlias =
        entry.student_alias ||
        (entry.student && entry.student.alias) ||
        null;

      const emotionTags = Array.isArray(baseAnalysis.emotionTags)
        ? baseAnalysis.emotionTags
        : Array.isArray(baseAnalysis.emotion_tags)
        ? baseAnalysis.emotion_tags
        : [];

      const emotionSummary =
        baseAnalysis.emotionSummary ||
        baseAnalysis.emotion_summary ||
        entry.emotion_tag ||
        (emotionTags.length > 0 ? emotionTags[0] : null);

      const activities = Array.isArray(baseAnalysis.activities)
        ? baseAnalysis.activities
        : [];

      const note = baseAnalysis.note || '';

      const durationMinutes =
        typeof baseAnalysis.duration_minutes === 'number'
          ? baseAnalysis.duration_minutes
          : typeof baseAnalysis.durationMinutes === 'number'
          ? baseAnalysis.durationMinutes
          : null;

      const analysis = {
        ...baseAnalysis,
        activities,
        note,
        emotionTags,
        emotionSummary,
        duration_minutes: durationMinutes,
      };

      return {
        ...entry,
        student_name: studentName,
        student_alias: studentAlias,
        analysis,
      };
    });

    const studentMap = {};
    for (const entry of logEntries) {
      const sid = entry.student_id;
      if (!sid) continue;
      const name =
        entry.student_name ||
        (entry.student && entry.student.name) ||
        '';
      if (!name) continue;
      const alias =
        entry.student_alias ||
        (entry.student && entry.student.alias) ||
        null;

      if (!studentMap[sid]) {
        studentMap[sid] = {
          id: sid,
          name,
          alias,
          label: alias ? `${name}(${alias})` : name,
        };
      }
    }
    const students = Object.values(studentMap);

    return res.json({
      ...upload,
      raw_text: rawText,
      log_entries: logEntries,
      students,
      details: upload.details || null, // AI 분석 결과가 저장된 details JSONB 필드
    });
  } catch (e) {
    console.error('GET /uploads/:id 에러:', e);
    return res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() });
  }
});

// --------------------------------------------------
// 업로드별 "활동 유형 상세 집계" API
// GET /activity_types?upload_id=...
// --------------------------------------------------
app.get('/activity_types', async (req, res) => {
  try {
    const { upload_id } = req.query;

    if (!upload_id) {
      return res.status(400).json({ message: 'upload_id 쿼리 파라미터가 필요합니다.' });
    }

    // 1) 업로드 행에서 details(JSONB) 읽기
    const { data: upload, error: uploadError } = await supabase
      .from('ingest_uploads')
      .select('id, details')
      .eq('id', upload_id)
      .single();

    if (uploadError || !upload) {
      console.error('ingest_uploads 조회 에러:', uploadError);
      return res.status(404).json({ message: '업로드를 찾을 수 없습니다.', error: uploadError });
    }

    const details = upload.details || {};
    const datesArray = Array.isArray(details.dates) ? details.dates : [];

    const records = [];
    const countByType = {};

    // 활동명으로 대분류 추론
    function guessActivityType(name) {
      const n = (name || '').toString();
      if (n.includes('수확')) return '수확';
      if (n.includes('파종') || n.includes('심기') || n.includes('모종')) return '파종';
      if (n.includes('관리') || n.includes('정리') || n.includes('잡초') || n.includes('물')) return '관리';
      if (n.includes('관찰') || n.includes('기록')) return '관찰';
      return '기타';
    }

    // 2) details JSON을 날짜/학생/활동 단위로 펼쳐서 레코드 생성
    for (const d of datesArray) {
      const date = d.date || d.log_date || null;
      const students = Array.isArray(d.students) ? d.students : [];

      for (const stu of students) {
        const studentName =
          stu.student_name ||
          stu.name ||
          stu.label ||
          '이름 미상';

        const acts = Array.isArray(stu.activities) ? stu.activities : [];

        for (const act of acts) {
          const activityName = act.activity_name || act.activity || '활동';
          const type =
            act.activity_type ||
            act.category ||
            guessActivityType(activityName);

          const minutes =
            typeof act.minutes === 'number'
              ? act.minutes
              : typeof act.activity_time === 'number'
              ? act.activity_time
              : null;

          const rawEmotions =
            act.emotions ||
            act.activity_emotion ||
            [];

          const emotions = Array.isArray(rawEmotions)
            ? rawEmotions
            : rawEmotions
            ? String(rawEmotions)
                .split(/[,\s]+/)
                .filter(Boolean)
            : [];

          records.push({
            date,
            student_name: studentName,
            activity_name: activityName,
            activity_type: type,
            minutes,
            emotions,
          });

          countByType[type] = (countByType[type] || 0) + 1;
        }
      }
    }

    // 3) 간단 요약 생성
    const total = records.length;
    let top_activity = null;
    let maxCount = 0;

    Object.entries(countByType).forEach(([t, c]) => {
      if (c > maxCount) {
        maxCount = c;
        top_activity = t;
      }
    });

    const summary = {
      total,
      top_activity,
      activity_types: Object.keys(countByType).length,
    };

    const analysis =
      total === 0
        ? '이 업로드에는 아직 활동 기록이 없습니다.'
        : `이 업로드에는 총 ${total}개의 활동 기록이 있습니다. 가장 많이 나타난 활동 유형은 「${top_activity || '활동'}」이며, 총 ${Object.keys(countByType).length}가지 유형의 활동이 발견되었습니다.`;

    return res.json({
      records,
      summary,
      analysis,
    });
  } catch (e) {
    console.error('GET /activity_types 에러:', e);
    return res.status(500).json({ message: 'Server Error', error: e.toString() });
  }
});

// DELETE /uploads/:id, /api/uploads/:id
// - 업로드 메타와 해당 파일에서 생성된 log_entries를 삭제
app.delete(['/uploads/:id', '/api/uploads/:id'], async (req, res) => {
  const { id } = req.params
  try {
    const { data: upload, error: findErr } = await supabase
      .from('ingest_uploads')
      .select('id, file_name')
      .eq('id', id)
      .single()

    if (findErr || !upload) {
      return res.status(404).json({ message: '업로드를 찾을 수 없습니다.' })
    }

    if (upload.file_name) {
      const { error: delLogsErr } = await supabase
        .from('log_entries')
        .delete()
        .eq('source_file_path', upload.file_name)
      if (delLogsErr) {
        console.error('삭제 중 log_entries 에러:', delLogsErr)
      }
    }

    const { error: delUploadErr } = await supabase
      .from('ingest_uploads')
      .delete()
      .eq('id', id)

    if (delUploadErr) {
      console.error('ingest_uploads 삭제 에러:', delUploadErr)
      return res.status(500).json({ message: 'DB Error', error: delUploadErr })
    }

    return res.status(204).send()
  } catch (e) {
    console.error('DELETE /uploads/:id 에러:', e)
    return res.status(500).json({ message: 'Server Error', error: e.toString() })
  }
})

/**
 * POST /uploads/:id/log, /api/uploads/:id/log
 * - 프론트에서 편집한 log_entries를 log_entries 테이블에 저장
 * - students 이름 기준으로 student_id 매핑 (필요시 새 학생 생성)
 */
app.post(['/uploads/:id/log', '/api/uploads/:id/log'], async (req, res) => {
  const { id } = req.params;
  const { upload_id, file_name, raw_text, log_entries } = req.body || {};

  // 1) 필수 파라미터 검사
  if (!Array.isArray(log_entries) || log_entries.length === 0) {
    return res
      .status(400)
      .json({ message: 'log_entries 배열이 필요합니다.' });
  }

  try {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // 2) 이름으로 student_id 매핑 준비 (AI 임시 ID 처리)
    const nameSet = new Set();
    for (const entry of log_entries) {
      const sid = entry.student_id;
      const sname = (entry.student_name || '').trim();
      if (!sid && sname) {
        nameSet.add(sname);
      }
    }

    let nameToId = {};

    if (nameSet.size > 0) {
      const names = [...nameSet];
      
      // 모든 학생 목록 가져오기 (부분 매칭을 위해)
      const { data: allStudents, error: allStudentsErr } = await supabase
        .from('students')
        .select('id, name, nickname');

      if (allStudentsErr) {
        console.error('[SAVE LOG] 전체 학생 조회 에러:', allStudentsErr);
      } else if (Array.isArray(allStudents)) {
        // 부분 매칭 함수
        const findMatchingStudent = (searchName) => {
          const searchTrimmed = searchName.trim();
          
          // 1. 정확히 일치
          let match = allStudents.find(s => 
            s.name === searchTrimmed || 
            s.nickname === searchTrimmed ||
            `${s.name}이` === searchTrimmed ||
            `${s.name}가` === searchTrimmed ||
            `${s.name}는` === searchTrimmed ||
            `${s.name}을` === searchTrimmed ||
            `${s.name}를` === searchTrimmed
          );
          if (match) return match;
          
          // 2. 이름이 포함된 경우 (예: "재성"이 "재성이"에 포함)
          match = allStudents.find(s => {
            const sName = s.name || '';
            const sNickname = s.nickname || '';
            return searchTrimmed.includes(sName) || sName.includes(searchTrimmed) ||
                   searchTrimmed.includes(sNickname) || sNickname.includes(searchTrimmed);
          });
          if (match) return match;
          
          return null;
        };
        
        // 각 이름에 대해 매칭 시도
        names.forEach(name => {
          const matched = findMatchingStudent(name);
          if (matched) {
            nameToId[name] = matched.id;
          }
        });
      }

      // 매칭되지 않은 이름은 새 학생으로 생성
      const toInsert = names.filter(n => !nameToId[n]).map(n => ({
        name: n,
        is_active: true,
      }));

      if (toInsert.length > 0) {
        const { data: inserted, error: insertErr } = await supabase
          .from('students')
          .insert(toInsert)
          .select('id, name');

        if (insertErr) {
          console.error('[SAVE LOG] 새 학생 생성 에러:', insertErr);
        } else if (Array.isArray(inserted)) {
          for (const row of inserted) {
            nameToId[row.name] = row.id;
          }
        }
      }
    }

    // 3) ingest_uploads에서 file_name 가져오기 (upload_id로 정확한 파일 식별)
    const uploadId = id || upload_id;
    let actualFileName = file_name || null;
    
    if (uploadId && !actualFileName) {
      const { data: uploadData, error: uploadErr } = await supabase
        .from('ingest_uploads')
        .select('file_name')
        .eq('id', uploadId)
        .single();

      if (!uploadErr && uploadData && uploadData.file_name) {
        actualFileName = uploadData.file_name;
      }
    }

    // 3) log_entries 테이블에 들어갈 row 배열 생성
    const logRows = [];

    for (const entry of log_entries) {
      // student_id 결정
      let studentId = null;
      if (entry.student_id && uuidRegex.test(String(entry.student_id))) {
        studentId = entry.student_id;
      } else {
        const sname = (entry.student_name || '').trim();
        if (sname && nameToId[sname]) {
          studentId = nameToId[sname];
        }
      }

      // log_entries.student_id 는 NOT NULL 이므로 없으면 스킵
      if (!studentId) {
        console.warn(
          '[SAVE LOG] student_id 없음. 해당 entry는 log_entries에 저장하지 않음. entry=',
          entry,
        );
        continue;
      }

      // 날짜 정규화 (YYYY-MM-DD)
      const logDate = normalizeDate(entry.log_date);

      // 감정/활동/지표 정리
      const emotionTag = entry.emotion_tag || null;
      const activityTags = Array.isArray(entry.activity_tags)
        ? entry.activity_tags.filter(Boolean)
        : [];

      const rawMetrics = entry.related_metrics;
      let metricsArray = [];
      if (Array.isArray(rawMetrics)) {
        metricsArray = rawMetrics;
      } else if (rawMetrics) {
        metricsArray = [rawMetrics];
      }

      // source_file_path에 upload_id 포함하여 정확한 파일 식별
      // 형식: "{upload_id}::{file_name}" (기존 데이터와 구분하기 위해 :: 구분자 사용)
      const sourceFilePath = uploadId && actualFileName 
        ? `${uploadId}::${actualFileName}` 
        : (actualFileName || entry.source_file_path || null);

      logRows.push({
        // 🔹 log_entries 테이블 스키마에 존재하는 컬럼만 전달
        log_date: logDate, // date NOT NULL
        student_id: studentId, // uuid NOT NULL
        emotion_tag: emotionTag, // text
        activity_tags: activityTags.length > 0 ? activityTags : null, // ARRAY
        log_content: entry.log_content || raw_text || '', // text
        related_metrics: metricsArray && metricsArray.length > 0 ? metricsArray : null, // ARRAY
        source_file_path: sourceFilePath, // text (upload_id 포함)
        status: 'success', // text, 기본값과 동일
      });
    }

    if (logRows.length === 0) {
      return res
        .status(400)
        .json({ message: '저장할 log_entries 가 없습니다.' });
    }

    // 4) 해당 upload_id의 기존 기록만 삭제 (upload_id로 특정 파일만 식별)
    // source_file_path에 upload_id가 포함된 경우와 기존 형식 모두 처리
    if (uploadId && actualFileName) {
      // 새로운 형식: "{upload_id}::{file_name}"로 시작하는 항목 삭제
      const newFormatPath = `${uploadId}::${actualFileName}`;
      const { error: delErr1 } = await supabase
        .from('log_entries')
        .delete()
        .eq('source_file_path', newFormatPath);

      if (delErr1) {
        console.error('[SAVE LOG] 기존 log_entries 삭제 에러 (새 형식):', delErr1);
      }

      // 기존 형식 (하위 호환성): file_name만으로 저장된 경우도 삭제
      // 단, upload_id가 포함된 형식이 아닌 경우에만 (기존 데이터 보호)
      const { error: delErr2 } = await supabase
        .from('log_entries')
        .delete()
        .eq('source_file_path', actualFileName)
        .not('source_file_path', 'like', '%::%'); // :: 구분자가 없는 경우만 (기존 형식)

      if (delErr2) {
        console.error('[SAVE LOG] 기존 log_entries 삭제 에러 (기존 형식):', delErr2);
      } else {
        console.log(`[SAVE LOG] upload_id ${uploadId}의 기존 log_entries 삭제 완료 (file_name: ${actualFileName})`);
      }
    }

    // 5) 새 log_entries insert
    const { data: inserted, error: insErr } = await supabase
      .from('log_entries')
      .insert(logRows)
      .select('id, student_id');

    if (insErr) {
      console.error('[SAVE LOG] log_entries insert 에러:', insErr);
      return res
        .status(500)
        .json({ message: 'DB Error(log_entries insert)', error: insErr });
    }

    // 6) ingest_uploads 상태 업데이트
    await supabase
      .from('ingest_uploads')
      .update({
        status: 'success',
        raw_text: raw_text || null,
      })
      .eq('id', id);

    return res.json({
      ok: true,
      count: inserted.length,
      upload_id: id,
      saved_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('POST /uploads/:id/log 에러:', e);
    return res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() });
  }
});


// 🧾 리포트 실행 이력 조회 API
// GET /report-runs
// (필요하면 나중에 ?status=success 같은 필터 추가 가능)
app.get(['/report-runs', '/api/report-runs'], async (req, res) => {
  try {
    let query = supabase
      .from('report_runs')
      .select(
        'id, template_id, status, error, params, created_at, updated_at',
      )
      .order('created_at', { ascending: false })
      .limit(100);

    const { data, error } = await query;

    if (error) {
      console.error('report_runs 조회 에러:', error);
      return res.status(500).json({ message: 'DB Error', error });
    }

    // 프론트에서 배열만 기대할 수도 있고, { items: [] }를 기대할 수도 있어서
    // 일단 둘 다 쓰기 좋게 items로 감싸서 내려줌.
    return res.json({
      items: data || [],
    });
  } catch (e) {
    console.error('/report-runs 에러:', e);
    return res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() });
  }
});

// 📊 대시보드용 로그 집계 API
// GET /api/dashboard?studentId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
app.get('/api/dashboard', async (req, res) => {
  try {
    const { studentId, from, to, skipAiAnalysis } = req.query;

    if (!studentId) {
      return res
        .status(400)
        .json({ message: '학생 선택은 필수입니다.' });
    }

    // log_entries 테이블에서 학생 + 기간 필터로 조회
    let query = supabase
      .from('log_entries')
      .select(
        'id, log_date, student_id, emotion_tag, activity_tags, log_content, related_metrics, status',
        { count: 'exact' },
      )
      .eq('student_id', studentId)
      .order('log_date', { ascending: true });

    // status가 있으면 success만 보고 싶을 경우
    query = query.eq('status', 'success');

    if (from) {
      query = query.gte('log_date', from);
    }
    if (to) {
      query = query.lte('log_date', to);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      console.error('대시보드 log_entries 조회 에러:', error);
      return res.status(500).json({ message: 'DB Error', error });
    }

    // 데이터 없을 때도 프론트에서 처리하기 쉽게 기본 구조로 응답
    if (!logs || logs.length === 0) {
      return res.json({
        metrics: { recordCount: 0 },
        emotionDistribution: [],
        activitySeries: [],
        activityAbilityList: [],
        emotionDetails: [],
        activityDetails: [],
      });
    }

    // ---------- 집계 로직 ----------

    const metrics = {
      // 총 기록 수
      recordCount: typeof count === 'number' ? count : logs.length,
    };

    const emotionCounts = {};      // { 감정: 개수 }
    const activityPerDate = {};    // { 'YYYY-MM-DD': 총 활동 수(또는 건수) }
    const emotionDetailsMap = {};  // { 감정: { emotion, totalCount, items: [] } }
    const activityDetails = [];    // 활동 상세 리스트

    for (const row of logs) {
      const dateLabel = row.log_date; // date 타입은 Supabase에서 문자열로 내려옴 (YYYY-MM-DD)
      const emo = row.emotion_tag ? String(row.emotion_tag).trim() : null; // emotion_tag가 없으면 null

      const activities = Array.isArray(row.activity_tags)
        ? row.activity_tags.filter(Boolean)
        : [];

      // 1) 감정 분포 집계 (emotion_tag가 있는 경우만)
      // emotion_tag가 쉼표로 구분된 여러 감정을 포함할 수 있으므로 분리하여 집계
      // '기타'는 감정 키워드가 아니므로 제외
      if (emo) {
        const emotions = emo.split(/[,，\s]+/).filter(Boolean);
        emotions.forEach(e => {
          const eTrimmed = e.trim();
          // '기타'는 감정 키워드가 아니므로 제외
          if (eTrimmed && eTrimmed !== '기타') {
            emotionCounts[eTrimmed] = (emotionCounts[eTrimmed] || 0) + 1;
          }
        });
      }

      // 2) 날짜별 활동(또는 기록) 수 집계
      //    - 각 기록은 1회로 카운트 (활동 태그 개수와 무관)
      activityPerDate[dateLabel] = (activityPerDate[dateLabel] || 0) + 1;

      // 3) 감정 상세(emotionDetails) - 각 감정별로 집계 (emotion_tag가 있는 경우만)
      // '기타'는 감정 키워드가 아니므로 제외
      if (emo) {
        const emotions = emo.split(/[,，\s]+/).filter(Boolean);
        emotions.forEach(e => {
          const eTrimmed = e.trim();
          // '기타'는 감정 키워드가 아니므로 제외
          if (eTrimmed && eTrimmed !== '기타') {
            if (!emotionDetailsMap[eTrimmed]) {
              emotionDetailsMap[eTrimmed] = {
                emotion: eTrimmed,
                totalCount: 0,
                items: [],
              };
            }
            emotionDetailsMap[eTrimmed].totalCount += 1;
            emotionDetailsMap[eTrimmed].items.push({
              id: row.id,
              date: dateLabel,
              activities,
              logContent: row.log_content || '',
            });
          }
        });
      }

      // 4) 활동 상세(activityDetails) – Dashboard.jsx에서 사용하는 리스트
      if (activities.length > 0) {
        for (const act of activities) {
          activityDetails.push({
            id: `${row.id}:${act}`,
            date: dateLabel,
            activity: act,
            category: act, // 지금은 활동명을 그대로 category로 사용
            emotion: emo,
            note: row.log_content || '',
          });
        }
      } else {
        // 활동 태그가 없을 때도 한 줄은 만들어줌
        activityDetails.push({
          id: row.id,
          date: dateLabel,
          activity: '기록 있음',
          category: '기타',
          emotion: emo,
          note: row.log_content || '',
        });
      }
    }

    // 1) 감정 분포 배열로 변환
    const emotionDistribution = Object.entries(emotionCounts).map(
      ([name, count]) => ({ name, count }),
    );

    // 2) 날짜별 활동 시계열 정렬 후 변환
    const activitySeries = Object.entries(activityPerDate)
      .sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
      .map(([date, total]) => ({
        date,
        // 현재는 "활동 건수"를 분으로 보고 있음. 나중에 duration_minutes 같은 값을
        // related_metrics에 넣으면 실제 시간을 계산해서 넣을 수 있음.
        minutes: total,
      }));

    const emotionDetails = Object.values(emotionDetailsMap);

    // 5) 활동별 능력 분석 생성 (AI 사용) - skipAiAnalysis가 true이면 건너뛰기
    let activityAbilityList = [];
    if (activityDetails.length > 0 && genAI && skipAiAnalysis !== 'true') {
      try {
        // 활동별로 그룹화
        const activityMap = {};
        activityDetails.forEach(detail => {
          const activityName = detail.activity || detail.category || '활동';
          if (!activityMap[activityName]) {
            activityMap[activityName] = {
              activity: activityName,
              date: detail.date || '',
              logs: []
            };
          }
          activityMap[activityName].logs.push({
            date: detail.date,
            emotion: detail.emotion,
            note: detail.note || ''
          });
        });

        // 각 활동별로 AI 분석 수행 (재시도 로직 포함)
        const abilityPromises = Object.values(activityMap).map(async (activity) => {
          const maxRetries = 3;
          let lastError = null;
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              const logsText = activity.logs.map(log => 
                `날짜: ${log.date}, 감정: ${log.emotion}, 내용: ${log.note}`
              ).join('\n');

              const prompt = `다음은 학생의 활동 기록입니다. 이 활동에서 학생의 수행 수준과 주요 능력을 분석해주세요.

활동명: ${activity.activity}
기록:
${logsText}

다음 JSON 형식으로 응답해주세요:
{
  "performanceLevel": "매우 우수" 또는 "우수" 또는 "보통",
  "abilityDistribution": {
    "difficult": 0-100 사이 숫자,
    "normal": 0-100 사이 숫자,
    "good": 0-100 사이 숫자
  },
  "keyAbilities": ["능력1", "능력2", "능력3"]
}

능력 분포의 합은 100이어야 합니다.
수행 수준 판단 기준:
- "매우 우수": 긍정적인 감정이 많고, 활동이 여러 번 반복되며, 특이사항이 긍정적인 경우
- "우수": 긍정적인 감정이 있고, 활동이 안정적으로 수행된 경우
- "보통": 기본적인 활동 수행이 이루어진 경우`;

              const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
              
              // 503 에러 재시도 로직
              let result;
              try {
                result = await model.generateContent(prompt);
              } catch (apiErr) {
                const errorMessage = apiErr.message || apiErr.toString() || '';
                const is503Error = errorMessage.includes('503') || 
                                 errorMessage.includes('Service Unavailable') ||
                                 errorMessage.includes('overloaded');
                
                if (is503Error && attempt < maxRetries) {
                  const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 지수 백오프: 1초, 2초, 4초
                  console.warn(`[대시보드] 활동 ${activity.activity} 능력 분석 503 에러 (시도 ${attempt}/${maxRetries}), ${delay}ms 후 재시도...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  lastError = apiErr;
                  continue; // 재시도
                }
                throw apiErr; // 재시도 불가능하거나 503이 아닌 경우
              }
              
              const response = result.response;
              const text = response.text();
              
              // JSON 추출 (코드 블록 처리 포함)
              let jsonText = text.trim();
              
              // 코드 블록 제거
              const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
              if (codeBlockMatch) {
                jsonText = codeBlockMatch[1].trim();
              } else {
                // 코드 블록이 없으면 첫 번째 { ... } 블록 추출
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  jsonText = jsonMatch[0];
                }
              }
              
              const analysis = JSON.parse(jsonText);
              
              return {
                id: `ability_${activity.activity}_${Date.now()}`,
                activity: activity.activity,
                date: activity.date,
                performanceLevel: analysis.performanceLevel || '보통', // "매우 우수", "우수", "보통" 중 하나
                abilityDistribution: analysis.abilityDistribution || { difficult: 20, normal: 50, good: 30 },
                keyAbilities: Array.isArray(analysis.keyAbilities) ? analysis.keyAbilities : []
              };
            } catch (err) {
              lastError = err;
              const errorMessage = err.message || err.toString() || '';
              const is503Error = errorMessage.includes('503') || 
                               errorMessage.includes('Service Unavailable') ||
                               errorMessage.includes('overloaded');
              
              if (is503Error && attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.warn(`[대시보드] 활동 ${activity.activity} 능력 분석 503 에러 (시도 ${attempt}/${maxRetries}), ${delay}ms 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue; // 재시도
              }
              
              // 재시도 불가능하거나 503이 아닌 경우
              if (attempt === maxRetries) {
                console.error(`[대시보드] 활동 ${activity.activity} 능력 분석 실패 (최대 재시도 횟수 초과):`, err);
              }
            }
          }
          
          // 모든 재시도 실패 시 기본값 반환
          return {
            id: `ability_${activity.activity}_${Date.now()}`,
            activity: activity.activity,
            date: activity.date,
            performanceLevel: '보통',
            abilityDistribution: { difficult: 20, normal: 50, good: 30 },
            keyAbilities: []
          };
        });

        activityAbilityList = await Promise.all(abilityPromises);
        console.log('[대시보드] 활동별 능력 분석 생성 완료:', activityAbilityList.length, '개');
      } catch (err) {
        console.error('[대시보드] 활동별 능력 분석 생성 실패:', err);
        activityAbilityList = [];
      }
    }

    return res.json({
      metrics,
      emotionDistribution,
      activitySeries,
      activityAbilityList,
      emotionDetails,
      activityDetails,
    });
  } catch (e) {
    console.error('/api/dashboard 에러:', e);
    return res
      .status(500)
      .json({ message: 'Server Error', error: e.toString() });
  }
});

// --------------------------------------------------
// 대시보드용 간단 AI(요약) 대화 API
// POST /api/dashboard/chat
// body: { studentId, studentName, startDate, endDate, message, history }
// --------------------------------------------------
app.post('/api/dashboard/chat', async (req, res) => {
  try {
    const {
      studentId,
      studentName,
      startDate,
      endDate,
      message,
      // history: [{ role, content } ...]  // 지금은 사용 안 함
    } = req.body || {};

    if (!studentId || !startDate || !endDate) {
      return res.status(400).json({
        message:
          'studentId, startDate, endDate 가 모두 필요합니다. (대시보드에서 먼저 조회한 뒤 채팅을 호출해 주세요.)',
      });
    }

    // 대시보드 조회와 같은 기준으로 로그를 다시 읽어옴
    let query = supabase
      .from('log_entries')
      .select('*')
      .eq('student_id', studentId)
      .gte('log_date', startDate)
      .lte('log_date', endDate)
      .order('log_date', { ascending: true });

    const { data: logs, error } = await query;

    if (error) {
      console.error('POST /api/dashboard/chat log_entries 조회 에러:', error);
      return res.status(500).json({ message: 'DB Error', error });
    }

    if (!logs || logs.length === 0) {
      const name = studentName || '해당 학생';
      return res.json({
        answer: `${name} 학생의 ${startDate} ~ ${endDate} 기간에는 저장된 활동 기록이 없습니다.`,
      });
    }

    // 간단한 통계 (위 /api/dashboard 와 동일 로직 요약 버전)
    const daysSet = new Set();
    const emotionCounts = {};
    let totalMinutes = 0;
    let totalActivities = 0;

    function ensureArray(v) {
      if (!v) return [];
      return Array.isArray(v) ? v : [v];
    }

    for (const log of logs) {
      const date = log.log_date;
      daysSet.add(date);

      const metricsArr = Array.isArray(log.related_metrics) ? log.related_metrics : [];
      const m0 = metricsArr.length > 0 ? metricsArr[0] : null;
      const baseDuration =
        typeof m0?.duration_minutes === 'number' ? m0.duration_minutes : 0;
      const activities = Array.isArray(m0?.activities) ? m0.activities : [];

      if (activities.length > 0) {
        for (const act of activities) {
          const duration =
            typeof act.minutes === 'number'
              ? act.minutes
              : typeof act.activity_time === 'number'
              ? act.activity_time
              : baseDuration || 0;

          const rawEmotions =
            act.emotions ||
            act.activity_emotion ||
            (Array.isArray(m0?.emotionTags) ? m0.emotionTags : []) ||
            (log.emotion_tag ? [log.emotion_tag] : []);

          const emotions = ensureArray(rawEmotions).filter(Boolean);

          totalMinutes += duration;
          totalActivities += 1;

          for (const emo of emotions) {
            emotionCounts[emo] = (emotionCounts[emo] || 0) + 1;
          }
        }
      } else {
        const duration = baseDuration || 0;
        totalMinutes += duration;
        totalActivities += 1;

        const rawEmotions =
          (Array.isArray(m0?.emotionTags) ? m0.emotionTags : []) ||
          (log.emotion_tag ? [log.emotion_tag] : []);

        const emotions = ensureArray(rawEmotions).filter(Boolean);

        for (const emo of emotions) {
          emotionCounts[emo] = (emotionCounts[emo] || 0) + 1;
        }
      }
    }

    const daysCount = daysSet.size || 1;
    const averageMinutesPerDay = Math.round(totalMinutes / daysCount);

    const emotionDistribution = Object.entries(emotionCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const topEmotion = emotionDistribution[0]?.name || null;

    const name = studentName || '해당 학생';

    const baseSummary = [
      `${name} 학생의 ${startDate} ~ ${endDate} 활동 기록을 정리해 보면,`,
      `총 ${logs.length}개의 일지가 있으며,`,
      `참여한 활동은 대략 ${totalActivities}회 정도입니다.`,
      `하루 평균 활동 시간은 약 ${averageMinutesPerDay}분 수준입니다.`,
    ].join(' ');

    const emotionSummary = topEmotion
      ? `이 기간 동안 가장 자주 기록된 감정은 「${topEmotion}」입니다.`
      : '이 기간에는 감정 태그가 충분히 기록되어 있지 않습니다.';

    const userRequest = message
      ? `\n\n질문하신 내용: "${message}"\n위 통계를 참고해 학생의 강점과 어려움을 함께 살펴보세요.`
      : '';

    const answer = `${baseSummary} ${emotionSummary}${userRequest}`;

    return res.json({ answer });
  } catch (e) {
    console.error('POST /api/dashboard/chat 에러:', e);
    return res.status(500).json({ message: 'Server Error', error: e.toString() });
  }
});
