// 백엔드 기본 URL
// - 개발/배포 환경 모두에서 VITE_API_BAS 를 우선 사용
//   예) http://localhost:3000, https://dreamproject-ia6s.onrender.com
// - 없으면 VITE_API_BASE 를 쓰고, 그것도 없으면 '/api' 를 기본값으로 사용
const RAW_BASE =
  import.meta.env.VITE_API_BAS ||
  import.meta.env.VITE_API_BASE ||
  '/api'

// 끝에 붙은 슬래시는 제거 (ex: https://.../ -> https://...)
const API_BASE = RAW_BASE.replace(/\/+$/, '')

// 디버깅: 환경 변수 확인 (개발 중에만)
if (typeof window !== 'undefined') {
  console.log('[API] VITE_API_BASE:', import.meta.env.VITE_API_BASE)
  console.log('[API] RAW_BASE:', RAW_BASE)
  console.log('[API] API_BASE:', API_BASE)
  console.log('[API] VITE_USE_MOCK:', import.meta.env.VITE_USE_MOCK)
}

// 모킹 사용 여부
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK || '0') === '1'

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function mockResponse(path, options) {
  // 아주 간단한 데모 모킹 (기존 코드 유지)
  await sleep(120)

  if (path.startsWith('/students')) {
    if (path === '/students' || path.startsWith('/students?')) {
      return {
        items: [
          { id: '1', name: '홍길동', school: '꿈초등학교', grade: '3' },
          { id: '2', name: '김미희', school: '꿈초등학교', grade: '2' },
        ],
      }
    }
    const m = path.match(/^\/students\/(\w+)(?:\/activities)?/)
    if (m) {
      if (path.endsWith('/activities')) {
        return [
          { id: 'a1', log_date: '2025-11-01', log_content: '미술 활동 참여' },
          { id: 'a2', log_date: '2025-10-28', log_content: '글쓰기 활동' },
        ]
      }
      return {
        id: m[1],
        name: '샘플 학생',
        school: '샘플학교',
        grade: '4',
      }
    }
  }

  if (path === '/metrics') {
    return { activities: 42, uploads: 7, engagement: '78%' }
  }

  if (path.startsWith('/uploads')) {
    if (options && options.method === 'POST') {
      return {
        id: `u-${Date.now()}`,
        file_name: options._formName || 'file.pdf',
        status: 'processing',
      }
    }
    if (/^\/uploads\/[^/]+\/text/.test(path)) {
      return { text: '여기에 OCR 결과 텍스트가 표시됩니다(모킹).' }
    }
    return [{ id: 'u1', file_name: 'report1.pdf', status: 'done' }]
  }

  if (path === '/auth/login' && options && options.method === 'POST') {
    try {
      const body = JSON.parse(options.body || '{}')
      return {
        token: 'demo-token',
        user: {
          username: body.username || 'demo',
          role: body.role || 'teacher',
        },
      }
    } catch (e) {
      return {
        token: 'demo-token',
        user: { username: 'demo', role: 'teacher' },
      }
    }
  }

  // Gemini 관련 모킹 응답
  if (path === '/ai/extract-records' && options && options.method === 'POST') {
    return {
      ok: true,
      model: 'mock-gemini',
      raw: JSON.stringify({ records: [] }),
      parsed: { records: [] },
    }
  }

  if (path === '/ai/generate-report' && options && options.method === 'POST') {
    return {
      ok: true,
      model: 'mock-gemini',
      markdown: '# Mock 리포트\n\n(이것은 목업 응답입니다)',
    }
  }

  if (path === '/ai/chat' && options && options.method === 'POST') {
    await sleep(1500) // AI 응답 시뮬레이션
    try {
      const body = JSON.parse(options.body || '{}')
      const message = body.message || ''
      const context = body.context || {}
      
      // 간단한 모킹 응답
      let response = '안녕하세요! 학생들의 활동과 감정에 대해 궁금한 점이 있으시면 언제든지 물어보세요.'
      
      if (message.includes('감정') || message.includes('어때')) {
        response = `${context.selectedStudentName || '학생'}의 ${context.startDate || '시작일'}부터 ${context.endDate || '종료일'}까지 기간 동안의 감정을 분석해보면, 주로 긍정적인 감정을 보였습니다. 활동에 적극적으로 참여하며 즐거움과 뿌듯함을 느꼈던 것으로 보입니다.`
      } else if (message.includes('활동')) {
        response = `${context.selectedStudentName || '학생'}의 활동 내역을 확인해보면, 다양한 활동에 참여했습니다. 특히 농장 활동과 관찰 활동에 적극적으로 참여한 것으로 보입니다.`
      } else {
        response = '학생들의 활동과 감정에 대한 더 자세한 정보를 원하시면 구체적으로 질문해주세요. 예를 들어 "재성 학생의 1일부터 10일까지 기간동안의 감정은 어때?" 같은 질문을 할 수 있습니다.'
      }
      
      return {
        message: response,
        model: 'mock-gemini'
      }
    } catch (e) {
      return {
        message: '죄송합니다. 답변을 생성하는데 실패했습니다.',
        model: 'mock-gemini'
      }
    }
  }

  // default mock
  return {}
}

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token')

  // Support passing absolute path without leading slash
  const p = path.startsWith('/') ? path : '/' + path

  if (USE_MOCK) {
    return mockResponse(p, options)
  }

  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  // If body is FormData, do not set Content-Type header (browser will set it)
  const isForm =
    typeof FormData !== 'undefined' && options.body instanceof FormData

  // If body is a plain object (and not FormData/Blob/etc), JSON-encode it
  const isPlainObject =
    options.body &&
    typeof options.body === 'object' &&
    !isForm &&
    !(typeof Blob !== 'undefined' && options.body instanceof Blob) &&
    !(typeof ArrayBuffer !== 'undefined' &&
      options.body instanceof ArrayBuffer) &&
    !(
      typeof URLSearchParams !== 'undefined' &&
      options.body instanceof URLSearchParams
    )

  const fetchOpts = { ...options, headers }
  if (isForm) {
    // ensure we don't override headers
    delete fetchOpts.headers['Content-Type']
  } else if (isPlainObject) {
    // ★ 여기서 JS 객체 body를 JSON 문자열로 변환
    fetchOpts.body = JSON.stringify(options.body)
    if (!fetchOpts.headers['Content-Type']) {
      fetchOpts.headers['Content-Type'] = 'application/json'
    }
  }

  // URL 조합:
  // - p 가 절대 URL이면 그대로 사용
  // - 아니면 API_BASE 를 prefix 로 붙임
  let url
  if (/^https?:\/\//.test(p)) {
    url = p
  } else if (API_BASE) {
    url = API_BASE + p
  } else {
    url = p
  }

  const res = await fetch(url, fetchOpts)

  if (!res.ok) {
    const text = await res.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch (e) {
      body = { message: text }
    }
    const err = new Error(body?.message || res.statusText || 'API error')
    err.status = res.status
    err.body = body
    throw err
  }

  if (res.status === 204) return null

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

// -------------------- Gemini AI helper APIs --------------------

/**
 * PDF/TXT 원본 텍스트를 Gemini로 분석해서
 * prompts.js 의 PDF_TXT_EXTRACTION_PROMPT 기반 JSON records 를 받는 헬퍼
 *
 * payload: { raw_text: string, file_name?: string }
 */
export async function extractRecordsWithGemini(payload) {
  return apiFetch('/ai/extract-records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
}

/**
 * Dashboard/Report 에서 집계된 데이터를 기반으로
 * prompts.js 의 GET_REPORT_PROMPT 기반 Markdown 리포트를 생성
 *
 * payload: {
 *   student_profile,
 *   date_range,
 *   summary_stats,
 *   activity_samples,
 *   report_options
 * }
 */
export async function generateReportWithGemini(payload) {
  return apiFetch('/ai/generate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
}

export { apiFetch }
