// src/utils/uploadHelpers.js

// 진행 단계 정의
export const STEP_DEFS = [
  { key: 'extract', label: '텍스트 추출' },
  { key: 'ai', label: 'AI 자동 분석' },
  { key: 'save', label: '데이터베이스 저장' },
]

export const ACTIVITY_TYPE_PRESETS = {
  harvest: { label: '수확', icon: '🍅', placeholder: '예: 토마토 수확, 감자 캐기' },
  sowing: { label: '파종', icon: '🌱', placeholder: '예: 씨앗 뿌리기, 모종 심기' },
  manage: { label: '관리', icon: '🧺', placeholder: '예: 물주기, 잡초 제거, 비료 주기' },
  observe: { label: '관찰', icon: '👀', placeholder: '예: 작물 상태 관찰, 날씨 관찰' },
  etc: { label: '기타', icon: '✏️', placeholder: '예: 활동 기록 작성, 그림 그리기' },
}

// -------------------- 헬퍼 함수들 --------------------

export function computeOverallFromSteps(steps, fallbackProgress) {
  const keys = STEP_DEFS.map(s => s.key)
  if (!keys.length) return typeof fallbackProgress === 'number' ? fallbackProgress : 0
  let sum = 0
  keys.forEach(k => {
    const v = steps && typeof steps[k] === 'number' ? steps[k] : 0
    sum += v
  })
  return Math.round(sum / keys.length)
}

export function normalizeUploads(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.items)) return data.items
  if (data && Array.isArray(data.uploads)) return data.uploads
  return []
}

export function normalizeEmotionTags(rawValue) {
  if (!rawValue) return []
  if (Array.isArray(rawValue)) {
    return rawValue.map(v => String(v || '').trim()).filter(Boolean)
  }
  if (typeof rawValue === 'string') {
    return rawValue.split(/[,\s/]+/).map(v => v.trim()).filter(Boolean)
  }
  return []
}

export function normalizeAnalysis(raw) {
  const a = raw.analysis || {}
  const legacyEmotion = raw.emotion_tag || a.emotion || a.emotionSummary
  const emotionTagsRaw = a.emotionTags || raw.emotion_tags || a.emotion_keywords || raw.emotion_keywords || null

  return {
    students: a.students || raw.students || [],
    date: a.date || raw.date || raw.log_date || null,
    activityName: a.activityName || raw.activityName || raw.activity_name || raw.title || '',
    durationMinutes: a.durationMinutes || raw.durationMinutes || raw.duration_minutes || null,
    activityType: a.activityType || raw.activityType || raw.activity_type || '',
    note: a.note || raw.note || '',
    level: a.level || raw.level || '',
    ability: a.ability || a.abilities || raw.ability || raw.abilities || [],
    score: typeof a.score === 'number' ? a.score : typeof raw.score === 'number' ? raw.score : null,
    scoreExplanation: a.scoreExplanation || raw.scoreExplanation || raw.score_explanation || '',
    emotionSummary: a.emotionSummary || legacyEmotion || '',
    emotionCause: a.emotionCause || a.emotion_reason || raw.emotionCause || '',
    observedBehaviors: a.observedBehaviors || a.behavior || raw.observedBehaviors || '',
    emotionTags: normalizeEmotionTags(emotionTagsRaw),
    rawTextCleaned: a.rawTextCleaned || raw.rawTextCleaned || raw.log_content || raw.raw_text_cleaned || raw.raw_text || '',
  }
}

export function hydrateUpload(raw) {
  const id = raw.id || raw.upload_id || raw.uuid || String(raw.file_name || raw.filename || raw.name || Math.random())
  const fileName = raw.file_name || raw.filename || '이름 없는 파일'
  const studentName = raw.student_name || raw.student?.name || '학생 미확인'
  const uploadedAt = raw.created_at || raw.uploaded_at || raw.uploadDate || raw.createdAt || null
  const status = raw.status || 'queued'
  const progress = typeof raw.progress === 'number' ? raw.progress : raw.overall_progress

  let steps = raw.steps
  if (!steps) {
    const base = typeof progress === 'number' ? progress : 0
    steps = { upload: base, extract: 100, ocr: base, sentiment: base }
  }

  const overall = typeof progress === 'number' ? progress : Math.round((steps.upload + steps.extract + steps.ocr + steps.sentiment) / 4)
  const analysis = normalizeAnalysis(raw)

  return {
    ...raw,
    id,
    file_name: fileName,
    student_name: studentName,
    uploaded_at: uploadedAt,
    status,
    steps,
    overall_progress: overall,
    raw_text: analysis.rawTextCleaned || raw.raw_text || '',
    analysis,
  }
}

export function formatDate(value) {
  if (!value) return ''
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toISOString().slice(0, 10)
  } catch {
    return String(value)
  }
}

export function splitDuration(mins) {
  const total = Number(mins)
  if (Number.isNaN(total) || total < 0) return { hours: 0, minutes: 0 }
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return { hours, minutes }
}

export function buildActivityTypeState(rawTypes = null, rawDetails = null) {
  const base = {}
  Object.entries(ACTIVITY_TYPE_PRESETS).forEach(([key, config]) => {
    let selected = false
    let detail = ''
    if (rawTypes && Object.prototype.hasOwnProperty.call(rawTypes, key)) {
      const item = rawTypes[key]
      if (typeof item === 'object' && item !== null) {
        selected = item.selected ?? !!item.detail ?? false
        detail = item.detail || item.description || ''
      } else if (typeof item === 'boolean') {
        selected = item
      } else if (typeof item === 'string') {
        selected = true
        detail = item
      }
    }
    if (rawDetails && Object.prototype.hasOwnProperty.call(rawDetails, key) && !detail) {
      detail = rawDetails[key] || ''
    }
    base[key] = { ...config, selected, detail }
  })
  return base
}

export function serializeEmotionTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags.map(v => String(v || '').trim()).filter(Boolean)
}

export function createDetailState(overrides = {}) {
  return {
    open: false, loading: false, upload: null, error: '', saving: false, saved: false,
    editedText: '', students: [], activeStudentId: null, analysisByStudent: {}, ...overrides,
  }
}

export const INITIAL_ACTIVITY_DETAIL_MODAL = {
  open: false, loading: false, records: [], summary: null, analysisText: '', error: '',
}

export function getActiveStudentState(detail) {
  const students = detail.students || []
  const map = detail.analysisByStudent || {}
  let activeId = detail.activeStudentId
  if (!activeId && students.length > 0) {
    activeId = students[0].id
  }
  const current = map[activeId] || { analysis: {}, activityTypes: buildActivityTypeState() }
  return { activeId, analysis: current.analysis || {}, activityTypes: current.activityTypes || buildActivityTypeState() }
}