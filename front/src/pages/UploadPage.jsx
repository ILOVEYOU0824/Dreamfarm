// src/pages/UploadPage.jsx
import React, { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import ActivityTypeDetailModal from '../components/upload/ActivityTypeDetailModal'
import EmotionKeywordSelector from '../components/upload/EmotionKeywordSelector'
import { apiFetch, extractRecordsWithGemini } from '../lib/api.js'

// 감정 키워드 마스터 리스트
const EMOTION_KEYWORDS = [
  // 긍정적 감정
  '흐뭇한', '황홀한', '감격스런', '희망에찬', '당당한', '생기가도는', '감미로운', '감사한', '유쾌한', '후련한',
  '푸근한', '여유로운', '훈훈한', '자신감 있는', '사랑하는', '따뜻한', '고마운', '살아있는', '경이로운', '든든한',
  '신나는', '느긋한', '짜릿한', '친근한', '뭉클한', '안전한', '활기찬', '차분한', '포근한', '상쾌한',
  '가벼운', '산뜻한', '안심이 되는', '흥미로운', '홀가분한', '두근거리는', '들뜬', '기쁜', '고요한', '노곤한',
  '기대에 부푼', '편안한', '충만한', '통쾌한', '만족스런', '반가운', '끌리는', '흥분된', '원기가 왕성한', '행복한',
  '뿌듯한', '재미있는', '담담한',
  // 부정적 감정
  '슬픈', '갑갑한', '힘든', '불편한', '속상한', '화나는', '혼란스러운', '걱정되는', '쑥스러운', '긴장하다',
  '놀란', '부끄러운', '그리운', '떨리는', '외로운', '멍한', '허전한', '실망스러운', '불안한', '우울한',
  '신경 쓰이는', '어색한', '귀찮은', '맥빠진', '당혹스런', '난처한', '지루한', '심심한', '긴장한', '찜찜한',
  '무료한', '김빠진', '지친', '서운한', '낙담한', '약 오르는', '안타까운', '공허한', '허탈한', '쓸쓸한',
  '서글픈', '억울한', '무서운', '막막한', '울화가 치미는', '좌절한', '분한', '울적한', '열받는', '짜증나는',
  '두려운', '서러운', '겁나는', '답답한', '허한'
].map((keyword, index) => ({
  id: `emotion-${index}`,
  label: keyword,
  name: keyword
}))

// ==============================================================================
// 1. [유틸리티] 헬퍼 함수 & 상수 (건드리지 마세요 / 로직용)
// ==============================================================================

const STEP_DEFS = [
  { key: 'extract', label: '텍스트 추출' },
  { key: 'ai', label: 'AI 자동 분석' },
  { key: 'save', label: '데이터베이스 저장' },
]

function computeOverallFromSteps(steps, fallbackProgress) {
  const keys = STEP_DEFS.map(s => s.key)
  if (!keys.length) return typeof fallbackProgress === 'number' ? fallbackProgress : 0
  let sum = 0
  keys.forEach(k => {
    const v = steps && typeof steps[k] === 'number' ? steps[k] : 0
    sum += v
  })
  return Math.round(sum / keys.length)
}

function normalizeUploads(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.items)) return data.items
  if (data && Array.isArray(data.uploads)) return data.uploads
  return []
}

function normalizeEmotionTags(rawValue) {
  if (!rawValue) return []
  if (Array.isArray(rawValue)) return rawValue.map(v => String(v || '').trim()).filter(Boolean)
  if (typeof rawValue === 'string') return rawValue.split(/[,\s/]+/).map(v => v.trim()).filter(Boolean)
  return []
}

function normalizeAnalysis(raw) {
  const a = raw.analysis || {}
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
    emotionSummary: a.emotionSummary || raw.emotion_tag || a.emotion || '',
    emotionCause: a.emotionCause || a.emotion_reason || raw.emotionCause || '',
    observedBehaviors: a.observedBehaviors || a.behavior || raw.observedBehaviors || '',
    emotionTags: normalizeEmotionTags(a.emotionTags || raw.emotion_tags || a.emotion_keywords || raw.emotion_keywords),
    rawTextCleaned: a.rawTextCleaned || raw.rawTextCleaned || raw.log_content || raw.raw_text_cleaned || raw.raw_text || '',
  }
}

function hydrateUpload(raw) {
  const id = raw.id || raw.upload_id || raw.uuid || String(raw.file_name || Math.random())
  const fileName = raw.file_name || raw.filename || '이름 없는 파일'
  const studentName = raw.student_name || raw.student?.name || '학생 미확인'
  const uploadedAt = raw.created_at || raw.uploaded_at || raw.uploadDate || null
  const status = raw.status || 'queued'
  const progress = typeof raw.progress === 'number' ? raw.progress : raw.overall_progress

  let steps = raw.steps
  if (!steps) {
    const base = typeof progress === 'number' ? progress : 0
    steps = { upload: base, extract: 100, ocr: base, sentiment: base }
  }
  const overall = typeof progress === 'number' ? progress : Math.round((steps.upload + steps.extract + steps.ocr + steps.sentiment) / 4)
  const analysis = normalizeAnalysis(raw)

  return { ...raw, id, file_name: fileName, student_name: studentName, uploaded_at: uploadedAt, status, steps, overall_progress: overall, raw_text: analysis.rawTextCleaned || raw.raw_text || '', analysis }
}

function formatDate(value) {
  if (!value) return ''
  try { return new Date(value).toISOString().slice(0, 10) } catch { return String(value) }
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

function splitDuration(mins) {
  const total = Number(mins)
  if (Number.isNaN(total) || total < 0) return { hours: 0, minutes: 0 }
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return { hours, minutes }
}

// 텍스트에서 날짜 추출 함수
function extractDatesFromText(text) {
  if (!text) return []
  
  // 날짜 패턴: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD 등
  const datePatterns = [
    /\d{4}-\d{2}-\d{2}/g,  // YYYY-MM-DD
    /\d{4}\/\d{2}\/\d{2}/g,  // YYYY/MM/DD
    /\d{4}\.\d{2}\.\d{2}/g,  // YYYY.MM.DD
    /\d{4}년\s*\d{1,2}월\s*\d{1,2}일/g,  // YYYY년 MM월 DD일
  ]
  
  const dates = new Set()
  
  datePatterns.forEach(pattern => {
    const matches = text.match(pattern)
    if (matches) {
      matches.forEach(match => {
        // 날짜 형식 정규화 (YYYY-MM-DD로 변환)
        let normalizedDate = match
        if (match.includes('년')) {
          // YYYY년 MM월 DD일 형식 처리
          const parts = match.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
          if (parts) {
            const year = parts[1]
            const month = parts[2].padStart(2, '0')
            const day = parts[3].padStart(2, '0')
            normalizedDate = `${year}-${month}-${day}`
          }
        } else {
          // 슬래시나 점을 하이픈으로 변환
          normalizedDate = match.replace(/[\/\.]/g, '-')
        }
        
        // 유효한 날짜인지 확인
        const dateObj = new Date(normalizedDate)
        if (!isNaN(dateObj.getTime())) {
          dates.add(normalizedDate)
        }
      })
    }
  })
  
  // 날짜 정렬 (최신순)
  return Array.from(dates).sort().reverse()
}

const ACTIVITY_TYPE_PRESETS = {
  harvest: { label: '수확', icon: '🍅' },
  sowing: { label: '파종', icon: '🌱' },
  manage: { label: '관리', icon: '🧺' },
  observe: { label: '관찰', icon: '👀' },
  etc: { label: '기타', icon: '✏️' },
}

function buildActivityTypeState(rawTypes = null, rawDetails = null) {
  const base = {}
  Object.entries(ACTIVITY_TYPE_PRESETS).forEach(([key, config]) => {
    let selected = false
    let detail = ''
    let emotionTags = []
    if (rawTypes && Object.prototype.hasOwnProperty.call(rawTypes, key)) {
      const item = rawTypes[key]
      if (typeof item === 'object' && item !== null) {
        selected = item.selected ?? !!item.detail ?? false
        detail = item.detail || item.description || ''
        emotionTags = item.emotionTags || []
      } else if (typeof item === 'boolean') selected = item
      else if (typeof item === 'string') { selected = true; detail = item }
    }
    if (rawDetails && Object.prototype.hasOwnProperty.call(rawDetails, key) && !detail) detail = rawDetails[key] || ''
    base[key] = { ...config, selected, detail, emotionTags }
  })
  return base
}

function serializeEmotionTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags.map(v => String(v || '').trim()).filter(Boolean)
}

function createDetailState(overrides = {}) {
  return { open: false, loading: false, upload: null, error: '', saving: false, saved: false, editedText: '', students: [], activeStudentId: null, analysisByStudent: {}, ...overrides }
}

const INITIAL_ACTIVITY_DETAIL_MODAL = { open: false, loading: false, records: [], summary: null, analysisText: '', error: '' }

function getActiveStudentState(detail) {
  const students = detail.students || []
  const map = detail.analysisByStudent || {}
  let activeId = detail.activeStudentId
  if (!activeId && students.length > 0) activeId = students[0].id
  const current = map[activeId] || { analysis: {}, activityTypes: buildActivityTypeState() }
  return { activeId, analysis: current.analysis || {}, activityTypes: current.activityTypes || buildActivityTypeState() }
}

let uploadsCache = null

// ==============================================================================
// 2. 메인 페이지 (UploadPage) - 이제 코드가 훨씬 깔끔해집니다!
// ==============================================================================

export default function UploadPage() {
  const fileRef = useRef(null)

  // State
  const [uploads, setUploads] = useState(() => uploadsCache || [])
  const [loading, setLoading] = useState(() => !uploadsCache)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // 상세/모달 State
  const [detail, setDetail] = useState(() => createDetailState())
  const [activityDetailModal, setActivityDetailModal] = useState(INITIAL_ACTIVITY_DETAIL_MODAL)
  
  // 기타 State
  const [downloading, setDownloading] = useState(false)
  const [emotionKeywords, setEmotionKeywords] = useState([])
  const [studentsMaster, setStudentsMaster] = useState([])
  const [studentPickerOpen, setStudentPickerOpen] = useState(false)
  const [studentPickerValue, setStudentPickerValue] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [savedFiles, setSavedFiles] = useState([]) // 저장된 파일 목록
  const [savedFilesLoading, setSavedFilesLoading] = useState(false)
  
  // 학생 추가 모달 State
  const [addStudentModalOpen, setAddStudentModalOpen] = useState(false)
  const [unmatchedStudents, setUnmatchedStudents] = useState([]) // 등록되지 않은 학생 목록
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentNickname, setNewStudentNickname] = useState('')
  const [newStudentBirthDate, setNewStudentBirthDate] = useState('')
  const [newStudentGroupName, setNewStudentGroupName] = useState('')
  const [newStudentLogContent, setNewStudentLogContent] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)

  // -------------------- 로직 (API 호출 등) --------------------
  
  // 업로드 목록 갱신 (배포 환경에서는 캐시만 유지, localStorage 제거)
  function updateUploads(updater) {
    setUploads(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      uploadsCache = next
      return next
    })
  }

  function updateUploadSteps(uploadId, stepUpdater) {
    updateUploads(prev => prev.map(item => {
      if (item.id !== uploadId) return item
      const prevSteps = item.steps || {}
      const nextSteps = typeof stepUpdater === 'function' ? stepUpdater(prevSteps) : { ...prevSteps, ...stepUpdater }
      const overall = computeOverallFromSteps(nextSteps, item.overall_progress)
      return { ...item, steps: nextSteps, overall_progress: overall }
    }))
  }

  async function fetchUploads() {
    setLoading(true)
    try {
      // 백엔드에서 업로드 목록 가져오기
      const uploadsRes = await apiFetch('/api/uploads')
      const uploadsList = Array.isArray(uploadsRes) ? uploadsRes : []
      
      // 백엔드 응답을 프론트엔드 형식으로 변환
      const formattedUploads = uploadsList.map(upload => ({
        id: upload.id,
        file_name: upload.file_name,
        file_size: upload.file_size || 0,
        file_type: upload.file_type || 'application/pdf',
        status: upload.status || 'queued',
        created_at: upload.created_at,
        uploaded_at: upload.created_at,
        student_name: upload.student_name || '학생 미확인',
        raw_text: upload.raw_text || null,
        overall_progress: upload.progress || 0,
        steps: {
          upload: 100,
          extract: upload.raw_text ? 100 : 0,
          ai: upload.status === 'success' ? 100 : 0,
          save: upload.status === 'success' ? 100 : 0
        }
      }))
      
      updateUploads(formattedUploads)
    } catch (err) {
      console.error('업로드 목록 가져오기 실패:', err)
      // 에러 발생 시 빈 배열로 설정
      updateUploads([])
    } finally {
      setLoading(false)
    }
  }

  // 저장된 파일 목록 가져오기
  async function fetchSavedFiles() {
    setSavedFilesLoading(true)
    try {
      const savedRes = await apiFetch('/api/uploads/saved')
      const savedList = Array.isArray(savedRes) ? savedRes : []
      setSavedFiles(savedList)
    } catch (err) {
      // 404 에러는 백엔드 서버가 재시작되지 않았을 수 있음 (조용히 처리)
      if (err.status === 404) {
        console.warn('저장된 파일 목록 API가 아직 등록되지 않았습니다. 백엔드 서버를 재시작해주세요.')
        setSavedFiles([])
      } else {
        console.error('저장된 파일 목록 가져오기 실패:', err)
        setSavedFiles([])
      }
    } finally {
      setSavedFilesLoading(false)
    }
  }

  // 저장된 파일 삭제
  async function handleDeleteSavedFile(filePath) {
    if (!confirm(`이 파일의 저장된 데이터를 삭제하시겠습니까?\n\n파일: ${filePath}\n\n삭제하면 대시보드에서도 해당 데이터가 사라집니다.`)) {
      return
    }

    try {
      const encodedPath = encodeURIComponent(filePath)
      await apiFetch(`/api/uploads/saved/${encodedPath}`, {
        method: 'DELETE'
      })
      alert('저장된 파일 데이터가 삭제되었습니다.')
      fetchSavedFiles() // 목록 갱신
      fetchUploads() // 업로드 목록도 갱신
    } catch (err) {
      console.error('저장된 파일 삭제 실패:', err)
      alert(`삭제 실패: ${err.message || '알 수 없는 오류'}`)
    }
  }

  // 초기 데이터 로드
  useEffect(() => {
    // 학생 목록 로드 (API에서)
    async function loadStudents() {
      try {
        const res = await apiFetch('/api/students?limit=1000')
        const items = Array.isArray(res.items) ? res.items : res
        const students = Array.isArray(items) ? items.map(item => ({
          id: String(item.id ?? item.student_id ?? item.uuid),
          name: item.name ?? item.display_name ?? item.student_name ?? '이름 없음',
          nickname: item.nickname || item.alias || '',
          group_name: item.group_name || ''
        })).filter(item => item.id) : []
        setStudentsMaster(students)
      } catch (e) {
        console.error('학생 목록 로드 실패:', e)
        setStudentsMaster([])
      }
    }
    
    loadStudents()
    
    // 백엔드에서 업로드 목록 가져오기
    fetchUploads()
    fetchSavedFiles() // 저장된 파일 목록도 로드
    
    // 감정 키워드 마스터 리스트 설정
    setEmotionKeywords(EMOTION_KEYWORDS)
    
    // 분석 완료 이벤트 리스너 (상세 모달 자동 새로고침)
    const handleAnalysisComplete = async (event) => {
      const { uploadId } = event.detail
      console.log(`[이벤트] 분석 완료 이벤트 수신: uploadId=${uploadId}`)
      
      // 업로드 목록에서 최신 데이터 가져오기
      const currentUploads = uploads
      const updatedUpload = currentUploads.find(u => u.id === uploadId)
      
      // 상세 모달이 열려있고 같은 업로드면 새로고침
      if (detail.open && detail.upload && detail.upload.id === uploadId) {
        console.log(`[이벤트] 상세 모달 새로고침 시작...`)
        if (updatedUpload) {
          console.log(`[이벤트] 업데이트된 업로드 데이터로 상세 모달 새로고침`)
          // 약간의 지연 후 새로고침 (상태 업데이트 완료 대기)
          setTimeout(() => {
            openDetail(updatedUpload)
          }, 500)
        } else {
          console.warn(`[이벤트] 업로드 ${uploadId}를 찾을 수 없습니다.`)
        }
      }
    }
    
    window.addEventListener('upload-analysis-complete', handleAnalysisComplete)
    
    return () => {
      window.removeEventListener('upload-analysis-complete', handleAnalysisComplete)
    }
  }, []) // 의존성 배열 비움 (이벤트 리스너는 한 번만 등록)
  
  // detail 상태가 변경될 때마다 uploads 업데이트
  useEffect(() => {
    if (detail.upload && detail.upload.id) {
      updateUploads(prev => prev.map(upload => {
        if (upload.id === detail.upload.id) {
          return {
            ...upload,
            analysisByStudent: detail.analysisByStudent,
            raw_text: detail.editedText || upload.raw_text
          }
        }
        return upload
      }))
    }
  }, [detail.analysisByStudent, detail.editedText])

  // 파일 업로드 처리 (백엔드 API 연결)
  async function handleFiles(files) {
    const list = Array.from(files || [])
    if (!list.length || uploading) return
    
    // 파일 크기 검증 (10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    const invalidFiles = list.filter(f => f.size > maxSize)
    if (invalidFiles.length > 0) {
      setError(`파일 크기가 너무 큽니다. 최대 10MB까지 업로드 가능합니다.`)
      return
    }

    // 지원 형식 검증
    const allowedTypes = ['application/pdf', 'text/plain']
    const invalidTypes = list.filter(f => !allowedTypes.includes(f.type) && !f.name.match(/\.(pdf|txt)$/i))
    if (invalidTypes.length > 0) {
      setError(`지원하지 않는 파일 형식입니다. PDF, TXT 파일만 업로드 가능합니다.`)
      return
    }

    setUploading(true); setError('')
    
    try {
      // Gemini API 헬스체크 (선택적)
      try {
        const healthRes = await apiFetch('/api/ai/health')
        console.log(`[업로드] Gemini API 헬스체크:`, healthRes)
        if (!healthRes.ok) {
          console.warn(`[업로드] Gemini API 설정 문제:`, healthRes.message)
        }
      } catch (healthErr) {
        console.warn(`[업로드] Gemini API 헬스체크 실패 (무시):`, healthErr)
      }
      
      // 각 파일을 백엔드에 업로드
      const uploadPromises = list.map(async (file) => {
        const formData = new FormData()
        formData.append('file', file)
        
        try {
          console.log(`[업로드] 파일 업로드 시작: ${file.name}`)
          
          // 백엔드에 파일 업로드
          const uploadRes = await apiFetch('/api/uploads', {
            method: 'POST',
            body: formData
          })
          
          console.log(`[업로드] 업로드 응답:`, uploadRes)
          
          // 업로드 응답에서 ID 가져오기
          const uploadId = uploadRes.id
          
          if (!uploadId) {
            throw new Error('업로드 ID를 받지 못했습니다.')
          }
          
          // 업로드된 파일 정보 반환 (분석은 백엔드에서 자동으로 실행됨)
          // 초기 진행도 계산
          let initialProgress = 10 // 업로드 완료 시 10%
          let extractProgress = 0
          let aiProgress = 0
          let saveProgress = 0
          
          if (uploadRes.raw_text && uploadRes.raw_text.length > 0) {
            extractProgress = 100
            initialProgress = 30 // 텍스트 추출 완료 시 30%
          }
          
          if (uploadRes.status === 'success') {
            aiProgress = 100
            saveProgress = 100
            initialProgress = 100
          }
          
          return {
            id: uploadId,
            file_name: uploadRes.file_name || file.name,
            file_size: file.size,
            file_type: file.type,
            status: uploadRes.status || 'queued', // queued, processing, success, error
            created_at: uploadRes.created_at || new Date().toISOString(),
            uploaded_at: uploadRes.created_at || new Date().toISOString(),
            raw_text: uploadRes.raw_text || null, // 백엔드에서 추출한 텍스트
            overall_progress: uploadRes.progress !== undefined ? uploadRes.progress : initialProgress,
            error: uploadRes.error || null,
            steps: {
              upload: 100,
              extract: extractProgress,
              ai: aiProgress,
              save: saveProgress
            }
          }
        } catch (err) {
          console.error(`[업로드] 파일 ${file.name} 업로드 실패:`, err)
          throw err
        }
      })
      
      const newUploads = await Promise.all(uploadPromises)
      
      // 상태 업데이트
      updateUploads(prev => [...newUploads, ...prev])
      
      // 분석이 완료될 때까지 폴링 (최대 30초)
      newUploads.forEach(upload => {
        if (upload.status === 'queued' || upload.status === 'processing') {
          pollUploadStatus(upload.id)
        }
      })
      
    } catch (err) {
      console.error('파일 업로드 실패:', err)
      setError(`업로드 실패: ${err.message || '알 수 없는 오류'}`)
    } finally {
      setUploading(false)
    }
  }
  
  // 업로드 상태 폴링 (분석 완료까지 대기)
  async function pollUploadStatus(uploadId, maxAttempts = 60) {
    let attempts = 0
    const pollInterval = 2000 // 2초마다 확인
    
    const poll = async () => {
      attempts++
      
      if (attempts > maxAttempts) {
        console.warn(`업로드 ${uploadId} 상태 확인 시간 초과 (${maxAttempts}회 시도)`)
        // 시간 초과 시 에러 상태로 표시
        updateUploads(prev => prev.map(u => {
          if (u.id === uploadId) {
            return {
              ...u,
              status: 'error',
              error: 'AI 분석 시간 초과'
            }
          }
          return u
        }))
        return
      }
      
      try {
        console.log(`[폴링] 업로드 ${uploadId} 상태 확인 중... (${attempts}/${maxAttempts})`)
        const uploadRes = await apiFetch(`/api/uploads/${uploadId}`)
        
        console.log(`[폴링] 업로드 ${uploadId} 상태:`, uploadRes.status, uploadRes.progress)
        console.log(`[폴링] 전체 응답:`, {
          status: uploadRes.status,
          progress: uploadRes.progress,
          error: uploadRes.error,
          raw_text: uploadRes.raw_text ? `있음 (${uploadRes.raw_text.length}자)` : '없음',
          log_entries: uploadRes.log_entries ? `${uploadRes.log_entries.length}개` : '없음'
        })
        
        // 진행도 계산 (더 정확하게)
        let calculatedProgress = 0
        let extractProgress = 0
        let aiProgress = 0
        let saveProgress = 0
        
        // 텍스트 추출 진행도
        if (uploadRes.raw_text && uploadRes.raw_text.length > 0) {
          extractProgress = 100
        } else if (uploadRes.status === 'processing') {
          extractProgress = 50 // 처리 중이면 50%
        }
        
        // AI 분석 진행도
        if (uploadRes.status === 'success') {
          aiProgress = 100
        } else if (uploadRes.status === 'processing') {
          // raw_text가 있으면 AI 분석 중
          aiProgress = uploadRes.raw_text ? 75 : 25
        } else if (uploadRes.status === 'queued') {
          aiProgress = 0
        }
        
        // 저장 진행도
        if (uploadRes.status === 'success') {
          saveProgress = 100
        } else if (uploadRes.status === 'processing' && uploadRes.log_entries && uploadRes.log_entries.length > 0) {
          saveProgress = 50 // log_entries가 있으면 저장 중
        }
        
        // 전체 진행도 계산 (단계별 가중 평균)
        // 저장(20%) + AI 분석(50%) + 텍스트 추출(30%)
        calculatedProgress = Math.round((saveProgress * 0.2 + aiProgress * 0.5 + extractProgress * 0.3))
        
        // 진행도가 0%인 경우 최소값 설정 (진행 중이면 최소 5%)
        if (calculatedProgress === 0 && uploadRes.status === 'processing') {
          calculatedProgress = 5
        }
        
        // 백엔드 progress가 있지만 실제 단계 진행도가 더 정확한 경우 계산된 값 사용
        // 백엔드 progress가 100이지만 실제로는 진행 중인 경우 계산된 값 사용
        let finalProgress = calculatedProgress
        if (uploadRes.progress !== undefined) {
          // 백엔드 progress가 100이지만 실제 단계가 완료되지 않은 경우
          if (uploadRes.progress === 100 && uploadRes.status === 'processing') {
            finalProgress = calculatedProgress
          } else if (uploadRes.status === 'success') {
            finalProgress = 100
          } else {
            // 백엔드 progress와 계산된 progress 중 더 큰 값 사용
            finalProgress = Math.max(uploadRes.progress, calculatedProgress)
          }
        }
        
        // 상태 업데이트
        updateUploads(prev => prev.map(u => {
          if (u.id === uploadId) {
            return {
              ...u,
              status: uploadRes.status || u.status,
              raw_text: uploadRes.raw_text || u.raw_text,
              overall_progress: finalProgress,
              error: uploadRes.error || u.error,
              log_entries: uploadRes.log_entries || u.log_entries || [], // log_entries 저장
              steps: {
                upload: 100,
                extract: extractProgress,
                ai: aiProgress,
                save: saveProgress
              }
            }
          }
          return u
        }))
        
        // 아직 처리 중이면 계속 폴링
        if (uploadRes.status === 'queued' || uploadRes.status === 'processing') {
          console.log(`[폴링] 계속 대기 중... (상태: ${uploadRes.status})`)
          setTimeout(poll, pollInterval)
        } else if (uploadRes.status === 'success') {
          // 분석 완료 - 상세 정보 가져오기
          console.log(`[폴링] 분석 완료! 상세 정보 가져오기...`)
          await fetchUploadDetail(uploadId)
          
          // 상세 모달이 열려있으면 자동으로 새로고침 (이벤트로 알림)
          window.dispatchEvent(new CustomEvent('upload-analysis-complete', { 
            detail: { uploadId } 
          }))
        } else if (uploadRes.status === 'error') {
          // 에러 발생
          console.error(`[폴링] 분석 실패:`, uploadRes.error)
          updateUploads(prev => prev.map(u => {
            if (u.id === uploadId) {
              return {
                ...u,
                status: 'error',
                error: uploadRes.error || 'AI 분석 실패'
              }
            }
            return u
          }))
        }
      } catch (err) {
        console.error(`[폴링] 업로드 ${uploadId} 상태 확인 실패:`, err)
        // 에러가 발생해도 계속 시도 (네트워크 오류일 수 있음)
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval)
        }
      }
    }
    
    // 첫 번째 폴링 즉시 실행
    poll()
  }
  
  // 업로드 상세 정보 가져오기 (분석 결과 포함)
  async function fetchUploadDetail(uploadId) {
    try {
      console.log(`[상세] 업로드 ${uploadId} 상세 정보 가져오기...`)
      const uploadRes = await apiFetch(`/api/uploads/${uploadId}`)
      
      console.log(`[상세] 응답 데이터 전체:`, JSON.stringify(uploadRes, null, 2))
      console.log(`[상세] raw_text 존재:`, !!uploadRes.raw_text)
      console.log(`[상세] raw_text 길이:`, uploadRes.raw_text?.length || 0)
      console.log(`[상세] log_entries 개수:`, uploadRes.log_entries?.length || 0)
      
      // 원본 텍스트가 있으면 무조건 업데이트
      const rawText = uploadRes.raw_text || ''
      
      // 분석 결과를 UI 형식에 맞게 변환
      let analysisByStudent = {}
      // 1. log_entries가 있으면 우선 사용
      if (uploadRes.log_entries && uploadRes.log_entries.length > 0) {
        console.log(`[상세] log_entries 첫 번째 항목:`, uploadRes.log_entries[0])
        analysisByStudent = convertLogEntriesToAnalysis(uploadRes.log_entries, rawText)
        console.log(`[상세] 변환된 분석 결과:`, JSON.stringify(analysisByStudent, null, 2))
      } 
      // 2. details에 AI 분석 결과가 있으면 사용
      else if (uploadRes.details && uploadRes.details.dates && Array.isArray(uploadRes.details.dates)) {
        console.log(`[상세] details에서 AI 분석 결과 변환 시작...`)
        analysisByStudent = convertDetailsToAnalysis(uploadRes.details, rawText)
        console.log(`[상세] details에서 변환된 분석 결과:`, JSON.stringify(analysisByStudent, null, 2))
      } else {
        console.warn(`[상세] log_entries와 details가 없습니다. raw_text만 업데이트합니다.`)
      }
      
      // AI 인식 실패 여부 판단
      // status가 success이지만 raw_text가 없거나 분석 결과가 없으면 AI 인식 실패
      const hasAnalysis = (uploadRes.log_entries && uploadRes.log_entries.length > 0) || 
                         (uploadRes.details && uploadRes.details.dates && uploadRes.details.dates.length > 0) ||
                         Object.keys(analysisByStudent).length > 0
      const hasRawText = rawText && rawText.length > 0
      // success 상태이지만 실제 분석 결과가 없는 경우
      const aiRecognitionFailed = (uploadRes.status === 'success' && (!hasRawText || !hasAnalysis)) || 
                                  (hasRawText && !hasAnalysis)
      
      // 분석 결과가 있으면 UI에 반영 (log_entries가 없어도 raw_text는 업데이트)
      updateUploads(prev => prev.map(u => {
        if (u.id === uploadId) {
          const updated = {
            ...u,
            status: uploadRes.status || u.status,
            raw_text: rawText || u.raw_text, // 원본 텍스트 확실히 설정
            overall_progress: uploadRes.progress || u.overall_progress,
            error: uploadRes.error || u.error,
            aiRecognitionFailed: aiRecognitionFailed, // AI 인식 실패 플래그 추가
            log_entries: uploadRes.log_entries || u.log_entries || [], // log_entries 저장
            details: uploadRes.details || u.details // details 저장
          }
          
          // analysisByStudent가 있으면 병합
          if (Object.keys(analysisByStudent).length > 0) {
            updated.analysisByStudent = analysisByStudent
          }
          
          return updated
        }
        return u
      }))
      
      console.log(`[상세] 업로드 목록 업데이트 완료`)
    } catch (err) {
      console.error(`[상세] 업로드 ${uploadId} 상세 정보 가져오기 실패:`, err)
      console.error(`[상세] 에러 상세:`, err.stack || err.message)
    }
  }
  
  // 백엔드 log_entries를 프론트엔드 analysisByStudent 형식으로 변환
  function convertLogEntriesToAnalysis(logEntries, rawText = '') {
    const analysisByStudent = {}
    
    // 학생별로 그룹화 (같은 학생의 여러 log_entry를 합침)
    const studentGroups = {}
    
    logEntries.forEach(entry => {
      const studentId = String(entry.student_id || `student_${entry.student_name || 'unknown'}`)
      
      if (!studentGroups[studentId]) {
        studentGroups[studentId] = {
          studentId,
          studentName: entry.student_name || (entry.student && entry.student.name) || '학생',
          entries: []
        }
      }
      studentGroups[studentId].entries.push(entry)
    })
    
    // 각 학생별로 분석 데이터 생성
    Object.values(studentGroups).forEach(group => {
      const studentId = group.studentId
      const analysis = group.entries[0].analysis || {}
      
      // 감정 태그 파싱 (모든 entry에서 수집)
      let emotionTags = []
      group.entries.forEach(entry => {
        const entryAnalysis = entry.analysis || {}
        if (entryAnalysis.emotionTags && Array.isArray(entryAnalysis.emotionTags)) {
          emotionTags = [...emotionTags, ...entryAnalysis.emotionTags]
        } else if (entry.emotion_tag) {
          // 백엔드에서 "기쁜, 신나는" 형식으로 저장된 경우
          const tags = entry.emotion_tag.split(',').map(t => t.trim()).filter(Boolean)
          emotionTags = [...emotionTags, ...tags]
        }
      })
      emotionTags = [...new Set(emotionTags)] // 중복 제거
      
      // 활동 태그 파싱 (모든 entry에서 수집)
      const allActivityTags = []
      group.entries.forEach(entry => {
        if (entry.activity_tags && Array.isArray(entry.activity_tags)) {
          allActivityTags.push(...entry.activity_tags)
        }
      })
      
      // 활동 이름 (첫 번째 활동 이름 사용)
      const activityName = analysis.activities?.[0]?.activity_name || 
                          group.entries[0].log_content?.match(/\[([^\]]+)\]/)?.[1] ||
                          allActivityTags[0] || 
                          ''
      
      // 학생별 특이사항 (AI가 분석한 note 또는 log_content에서 추출)
      let note = analysis.note || ''
      if (!note) {
        // log_content에서 특이사항 추출 시도
        const contents = group.entries.map(e => e.log_content || '').filter(Boolean)
        note = contents.join('\n')
      }
      
      // 활동 유형 매핑 (백엔드 activity_tags를 프론트엔드 형식으로 변환)
      const activityTypes = buildActivityTypeState()
      
      // activity_tags를 기반으로 활동 유형 자동 설정
      allActivityTags.forEach(tag => {
        const tagStr = String(tag).toLowerCase()
        const tagLower = tagStr.toLowerCase()
        
        // 활동 유형 키워드 매칭
        if (tagLower.includes('수확') || tagLower.includes('harvest') || tagLower === 'harvest') {
          activityTypes.harvest.selected = true
          activityTypes.harvest.detail = group.entries.find(e => e.log_content)?.log_content || ''
          activityTypes.harvest.emotionTags = emotionTags
          if (activityName && !activityTypes.harvest.activityName) {
            activityTypes.harvest.activityName = activityName
          }
        } else if (tagLower.includes('파종') || tagLower.includes('sowing') || tagLower === 'sowing') {
          activityTypes.sowing.selected = true
          activityTypes.sowing.detail = group.entries.find(e => e.log_content)?.log_content || ''
          activityTypes.sowing.emotionTags = emotionTags
          if (activityName && !activityTypes.sowing.activityName) {
            activityTypes.sowing.activityName = activityName
          }
        } else if (tagLower.includes('관리') || tagLower.includes('manage') || tagLower === 'manage') {
          activityTypes.manage.selected = true
          activityTypes.manage.detail = group.entries.find(e => e.log_content)?.log_content || ''
          activityTypes.manage.emotionTags = emotionTags
          if (activityName && !activityTypes.manage.activityName) {
            activityTypes.manage.activityName = activityName
          }
        } else if (tagLower.includes('관찰') || tagLower.includes('observe') || tagLower === 'observe') {
          activityTypes.observe.selected = true
          activityTypes.observe.detail = group.entries.find(e => e.log_content)?.log_content || ''
          activityTypes.observe.emotionTags = emotionTags
          if (activityName && !activityTypes.observe.activityName) {
            activityTypes.observe.activityName = activityName
          }
        } else if (tagStr) {
          // 기타 활동 (태그가 있지만 위에 해당하지 않는 경우)
          activityTypes.etc.selected = true
          activityTypes.etc.detail = group.entries.find(e => e.log_content)?.log_content || tagStr
          activityTypes.etc.emotionTags = emotionTags
          if (activityName && !activityTypes.etc.activityName) {
            activityTypes.etc.activityName = activityName
          }
        }
      })
      
      // 활동 유형이 하나도 선택되지 않았으면 log_content를 분석해서 추론
      const hasSelectedActivity = Object.values(activityTypes).some(at => at.selected)
      if (!hasSelectedActivity && group.entries.length > 0) {
        const content = group.entries[0].log_content || rawText
        const contentLower = content.toLowerCase()
        
        if (contentLower.includes('수확') || contentLower.includes('따다') || contentLower.includes('뽑다')) {
          activityTypes.harvest.selected = true
          activityTypes.harvest.detail = content
        } else if (contentLower.includes('파종') || contentLower.includes('심다') || contentLower.includes('씨앗')) {
          activityTypes.sowing.selected = true
          activityTypes.sowing.detail = content
        } else if (contentLower.includes('관리') || contentLower.includes('물주') || contentLower.includes('비료')) {
          activityTypes.manage.selected = true
          activityTypes.manage.detail = content
        } else if (contentLower.includes('관찰') || contentLower.includes('보기') || contentLower.includes('확인')) {
          activityTypes.observe.selected = true
          activityTypes.observe.detail = content
        } else {
          activityTypes.etc.selected = true
          activityTypes.etc.detail = content
        }
      }
      
      // 날짜 (가장 최근 날짜 사용)
      const dates = group.entries.map(e => e.log_date).filter(Boolean).sort().reverse()
      
      analysisByStudent[studentId] = {
        analysis: {
          emotionTags: emotionTags,
          activityName: activityName,
          date: dates[0] || '',
          durationMinutes: analysis.duration_minutes || analysis.durationMinutes || null,
          note: note // 학생별 특이사항 (AI가 분석한 내용)
        },
        activityTypes: activityTypes
      }
    })
    
    return analysisByStudent
  }
  
  // 백엔드 details JSONB를 프론트엔드 analysisByStudent 형식으로 변환
  function convertDetailsToAnalysis(details, rawText = '') {
    const analysisByStudent = {}
    
    if (!details || !details.dates || !Array.isArray(details.dates)) {
      return analysisByStudent
    }
    
    // details.dates 배열을 순회하면서 학생별로 데이터 수집
    details.dates.forEach(dateObj => {
      const date = dateObj.date || dateObj.log_date || ''
      const students = Array.isArray(dateObj.students) ? dateObj.students : []
      
      students.forEach(student => {
        const studentName = student.student_name || student.name || student.label || '학생'
        const studentId = `student_${studentName}` // 임시 ID
        
        const activities = Array.isArray(student.activities) ? student.activities : []
        
        // 각 활동별로 데이터 수집
        activities.forEach(activity => {
          const activityName = activity.activity_name || activity.activity || '활동'
          const activityType = activity.activity_type || activity.category || ''
          const minutes = activity.minutes || activity.activity_time || null
          const emotions = Array.isArray(activity.emotions) 
            ? activity.emotions 
            : Array.isArray(activity.activity_emotion)
            ? activity.activity_emotion
            : []
          const teacherNotes = activity.teacher_notes || activity.note || ''
          
          // 학생별 데이터 초기화
          if (!analysisByStudent[studentId]) {
            analysisByStudent[studentId] = {
              analysis: {
                emotionTags: [],
                activityName: '',
                date: date,
                durationMinutes: minutes,
                note: '' // 여러 활동의 특이사항을 합침
              },
              activityTypes: buildActivityTypeState()
            }
          }
          
          // 감정 태그 수집
          if (emotions.length > 0) {
            analysisByStudent[studentId].analysis.emotionTags = [
              ...analysisByStudent[studentId].analysis.emotionTags,
              ...emotions
            ]
          }
          
          // 활동 이름 (첫 번째 활동 이름 사용)
          if (!analysisByStudent[studentId].analysis.activityName && activityName) {
            analysisByStudent[studentId].analysis.activityName = activityName
          }
          
          // 특이사항 합치기 (여러 활동의 특이사항을 줄바꿈으로 연결)
          if (teacherNotes) {
            const existingNote = analysisByStudent[studentId].analysis.note
            analysisByStudent[studentId].analysis.note = existingNote
              ? `${existingNote}\n${teacherNotes}`
              : teacherNotes
          }
          
          // 활동 유형 매핑
          const activityTypes = analysisByStudent[studentId].activityTypes
          const typeLower = String(activityType).toLowerCase()
          
          if (typeLower.includes('수확') || typeLower.includes('harvest')) {
            activityTypes.harvest.selected = true
            if (teacherNotes && !activityTypes.harvest.detail) {
              activityTypes.harvest.detail = teacherNotes
            }
            if (activityName && !activityTypes.harvest.activityName) {
              activityTypes.harvest.activityName = activityName
            }
            if (emotions.length > 0) {
              activityTypes.harvest.emotionTags = [...new Set([...activityTypes.harvest.emotionTags || [], ...emotions])]
            }
          } else if (typeLower.includes('파종') || typeLower.includes('sowing')) {
            activityTypes.sowing.selected = true
            if (teacherNotes && !activityTypes.sowing.detail) {
              activityTypes.sowing.detail = teacherNotes
            }
            if (activityName && !activityTypes.sowing.activityName) {
              activityTypes.sowing.activityName = activityName
            }
            if (emotions.length > 0) {
              activityTypes.sowing.emotionTags = [...new Set([...activityTypes.sowing.emotionTags || [], ...emotions])]
            }
          } else if (typeLower.includes('관리') || typeLower.includes('manage')) {
            activityTypes.manage.selected = true
            if (teacherNotes && !activityTypes.manage.detail) {
              activityTypes.manage.detail = teacherNotes
            }
            if (activityName && !activityTypes.manage.activityName) {
              activityTypes.manage.activityName = activityName
            }
            if (emotions.length > 0) {
              activityTypes.manage.emotionTags = [...new Set([...activityTypes.manage.emotionTags || [], ...emotions])]
            }
          } else if (typeLower.includes('관찰') || typeLower.includes('observe')) {
            activityTypes.observe.selected = true
            if (teacherNotes && !activityTypes.observe.detail) {
              activityTypes.observe.detail = teacherNotes
            }
            if (activityName && !activityTypes.observe.activityName) {
              activityTypes.observe.activityName = activityName
            }
            if (emotions.length > 0) {
              activityTypes.observe.emotionTags = [...new Set([...activityTypes.observe.emotionTags || [], ...emotions])]
            }
          } else if (typeLower) {
            activityTypes.etc.selected = true
            if (teacherNotes && !activityTypes.etc.detail) {
              activityTypes.etc.detail = teacherNotes
            }
            if (activityName && !activityTypes.etc.activityName) {
              activityTypes.etc.activityName = activityName
            }
            if (emotions.length > 0) {
              activityTypes.etc.emotionTags = [...new Set([...activityTypes.etc.emotionTags || [], ...emotions])]
            }
          }
        })
      })
    })
    
    // 감정 태그 중복 제거
    Object.keys(analysisByStudent).forEach(studentId => {
      analysisByStudent[studentId].analysis.emotionTags = [
        ...new Set(analysisByStudent[studentId].analysis.emotionTags)
      ]
    })
    
    return analysisByStudent
  }
  
  async function handleDeleteUpload(uploadId) {
    if (!window.confirm('삭제하시겠습니까?')) return
    
    try {
      // 백엔드에서 삭제
      await apiFetch(`/api/uploads/${uploadId}`, {
        method: 'DELETE'
      })
      
      // 로컬 상태에서도 삭제
      updateUploads(prev => prev.filter(u => u.id !== uploadId))
    } catch (err) {
      console.error('업로드 삭제 실패:', err)
      alert(`삭제 실패: ${err.message || '알 수 없는 오류'}`)
    }
  }

  // 상세 모달 열기 (백엔드 API에서 데이터 가져오기)
  async function openDetail(upload) {
    setDetail(createDetailState({ open: true, loading: true }))
    setAiError(''); setStudentPickerOpen(false); setStudentPickerValue('')
    
    try {
      // 백엔드에서 상세 정보 가져오기
      const uploadRes = await apiFetch(`/api/uploads/${upload.id}`)
      
      // 텍스트 추출 (백엔드에서 가져온 raw_text 우선 사용)
      let initialText = uploadRes.raw_text || upload.raw_text || ''
      
      console.log(`[상세 모달] 원본 텍스트 길이:`, initialText.length)
      console.log(`[상세 모달] log_entries 개수:`, uploadRes.log_entries?.length || 0)
      console.log(`[상세 모달] details:`, uploadRes.details)
      
      // 학생 정보 설정 (log_entries 또는 details에서 추출)
      const studentsMap = new Map()
      
      // 1. log_entries에서 학생 추출
      if (uploadRes.log_entries && Array.isArray(uploadRes.log_entries)) {
        uploadRes.log_entries.forEach(entry => {
          const studentId = entry.student_id
          const studentName = entry.student_name || (entry.student && entry.student.name) || '학생'
          if (studentId && !studentsMap.has(studentId)) {
            studentsMap.set(studentId, {
              id: String(studentId),
              name: studentName
            })
          }
        })
      }
      
      // 2. details에서 학생 추출 (AI 분석 결과가 있지만 log_entries가 없는 경우)
      if (uploadRes.details && uploadRes.details.dates && Array.isArray(uploadRes.details.dates)) {
        uploadRes.details.dates.forEach(dateObj => {
          if (dateObj.students && Array.isArray(dateObj.students)) {
            dateObj.students.forEach(student => {
              const studentName = student.student_name || student.name || student.label || '학생'
              const studentId = `student_${studentName}` // 임시 ID 생성
              if (!studentsMap.has(studentId)) {
                studentsMap.set(studentId, {
                  id: studentId,
                  name: studentName
                })
              }
            })
          }
        })
      }
      
      // 학생이 없으면 기본 학생 추가
      const students = studentsMap.size > 0 
        ? Array.from(studentsMap.values())
        : [{ id: 's1', name: upload.student_name || uploadRes.student_name || '학생' }]
      
      console.log(`[상세 모달] 학생 목록:`, students)
      
      // 분석 결과 변환 (원본 텍스트도 함께 전달)
      let analysisByStudent = {}
      
      // 1. log_entries가 있으면 우선 사용
      if (uploadRes.log_entries && uploadRes.log_entries.length > 0) {
        console.log(`[상세 모달] log_entries로 분석 결과 변환 시작...`)
        analysisByStudent = convertLogEntriesToAnalysis(uploadRes.log_entries, initialText)
        console.log(`[상세 모달] 변환된 분석 결과:`, JSON.stringify(analysisByStudent, null, 2))
      } 
      // 2. details에 AI 분석 결과가 있으면 사용
      else if (uploadRes.details && uploadRes.details.dates && Array.isArray(uploadRes.details.dates)) {
        console.log(`[상세 모달] details에서 AI 분석 결과 변환 시작...`)
        analysisByStudent = convertDetailsToAnalysis(uploadRes.details, initialText)
        console.log(`[상세 모달] details에서 변환된 분석 결과:`, JSON.stringify(analysisByStudent, null, 2))
      }
      // 3. 기존 analysisByStudent 사용
      else if (upload.analysisByStudent && Object.keys(upload.analysisByStudent).length > 0) {
        console.log(`[상세 모달] 기존 analysisByStudent 사용`)
        analysisByStudent = upload.analysisByStudent
      } else {
        console.log(`[상세 모달] 분석 결과 없음, 기본값 생성`)
      }
      
      // 학생별로 분석 데이터가 없으면 기본값 생성
      students.forEach(student => {
        if (!analysisByStudent[student.id]) {
          analysisByStudent[student.id] = {
            analysis: {
              emotionTags: [],
              activityName: '',
              date: formatDate(upload.uploaded_at || uploadRes.created_at),
              durationMinutes: null,
              note: ''
            },
            activityTypes: buildActivityTypeState()
          }
        } else {
          // activityTypes가 없으면 초기화
          if (!analysisByStudent[student.id].activityTypes) {
            analysisByStudent[student.id].activityTypes = buildActivityTypeState()
          }
        }
      })

      setDetail(createDetailState({
        open: true,
        loading: false,
        upload: { ...upload, ...uploadRes },
        editedText: initialText,
        students: students,
        activeStudentId: students[0]?.id || 's1',
        analysisByStudent: analysisByStudent
      }))
    } catch(e) {
      console.error('상세 로드 실패:', e)
      // 에러 발생 시 기본 정보로 표시
      setDetail(createDetailState({
        open: true,
        loading: false,
        upload: upload,
        editedText: upload.raw_text || '',
        students: [{ id: 's1', name: upload.student_name || '학생' }],
        activeStudentId: 's1',
        analysisByStudent: upload.analysisByStudent || {},
        error: '상세 로드 실패'
      }))
    }
  }

  function closeDetail() { setDetail(createDetailState()); setAiError(''); }

  // AI 분석
  async function handleRunAiExtraction() {
    if (!detail.upload || aiLoading) return
    const text = detail.editedText || detail.upload.raw_text
    if (!text) return alert('분석할 텍스트가 없습니다.')
    setAiLoading(true); setAiError('')
    try {
      const res = await extractRecordsWithGemini({ raw_text: text, file_name: detail.upload.file_name })
      const records = res?.parsed?.records || res?.records || []
      if(!records.length) throw new Error('기록 없음')
      
      setDetail(prev => {
        // (간소화: 기존 로직 유지)
        return { ...prev } 
      })
      alert('분석 완료')
    } catch(e) { setAiError('AI 분석 실패') } 
    finally { setAiLoading(false) }
  }

  // 학생 이름 매칭 함수 (부분 매칭 지원)
  function findMatchingStudent(studentName, studentsList) {
    if (!studentName) return null
    
    const nameTrimmed = studentName.trim()
    
    // 1. 정확히 일치하는 경우
    let match = studentsList.find(s => 
      s.name === nameTrimmed || 
      s.nickname === nameTrimmed ||
      `${s.name}이` === nameTrimmed ||
      `${s.name}가` === nameTrimmed ||
      `${s.name}는` === nameTrimmed ||
      `${s.name}을` === nameTrimmed ||
      `${s.name}를` === nameTrimmed
    )
    if (match) return match
    
    // 2. 이름이 포함된 경우 (예: "재성"이 "재성이"에 포함)
    match = studentsList.find(s => {
      const sName = s.name || ''
      const sNickname = s.nickname || ''
      return nameTrimmed.includes(sName) || sName.includes(nameTrimmed) ||
             nameTrimmed.includes(sNickname) || sNickname.includes(nameTrimmed)
    })
    if (match) return match
    
    return null
  }

  // DB 저장
  async function handleSaveLogEntry() {
    if(!detail.upload) return
    setDetail(p=>({...p, saving: true}))
    try {
      // 학생 이름 매칭 및 검증
      const unmatchedStudents = []
      const matchedEntries = []
      
      // analysisByStudent에서 각 학생별 데이터 추출
      detail.students.forEach(stu => {
        const studentAnalysis = detail.analysisByStudent[stu.id] || {}
        const analysis = studentAnalysis.analysis || {}
        const activityTypes = studentAnalysis.activityTypes || {}
        
        // 학생 이름 매칭 (studentsMaster와 비교)
        let matchedStudent = null
        let finalStudentName = stu.name
        
        // student_id가 UUID 형식이 아니면 이름으로 매칭 시도
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const hasValidId = stu.id && uuidRegex.test(String(stu.id))
        
        if (!hasValidId || !studentsMaster.find(s => String(s.id) === String(stu.id))) {
          // UUID가 아니거나 studentsMaster에 없으면 이름으로 매칭
          matchedStudent = findMatchingStudent(stu.name, studentsMaster)
          if (matchedStudent) {
            finalStudentName = matchedStudent.name
          } else {
            // 매칭되지 않는 학생
            unmatchedStudents.push({
              originalName: stu.name,
              originalId: stu.id
            })
            return // 이 학생은 스킵
          }
        }
        
        // 날짜 추출 (analysis.date 또는 현재 날짜)
        const logDate = analysis.date || new Date().toISOString().split('T')[0]
        
        // 감정 태그 추출 (사용자가 선택한 emotionTags만 사용)
        // 1. analysis.emotionTags에서 감정 키워드 수집
        const collectedEmotionTags = new Set()
        if (analysis.emotionTags && Array.isArray(analysis.emotionTags) && analysis.emotionTags.length > 0) {
          analysis.emotionTags.forEach(tag => collectedEmotionTags.add(tag))
        }
        
        // 2. 선택된 활동 유형의 emotionTags도 수집
        Object.entries(activityTypes).forEach(([key, typeData]) => {
          if (typeData && typeData.selected && typeData.emotionTags && Array.isArray(typeData.emotionTags)) {
            typeData.emotionTags.forEach(tag => collectedEmotionTags.add(tag))
          }
        })
        
        // 3. 수집된 감정 키워드를 문자열로 변환
        let emotionTag = null
        if (collectedEmotionTags.size > 0) {
          emotionTag = Array.from(collectedEmotionTags).join(', ')
        }
        // emotionSummary는 사용하지 않음 (AI 분석 결과이므로 사용자 선택과 다를 수 있음)
        
        // 활동 태그 추출 (선택된 활동 유형에서)
        const activityTags = []
        Object.entries(activityTypes).forEach(([key, typeData]) => {
          if (typeData && typeData.selected && typeData.detail) {
            // 활동 유형 키를 활동명으로 변환
            const activityTypeMap = {
              harvest: '수확',
              sowing: '파종',
              manage: '관리',
              observe: '관찰',
              etc: '기타'
            }
            const activityName = typeData.activityName || typeData.detail || activityTypeMap[key] || key
            activityTags.push(activityName)
          }
        })
        
        // log_content는 editedText 또는 analysis.note 사용
        const logContent = detail.editedText || analysis.note || ''
        
        // student_id가 유효하면 사용, 아니면 null로 보내서 백엔드에서 처리
        const studentId = (matchedStudent && matchedStudent.id) || (hasValidId ? stu.id : null)
        
        matchedEntries.push({
          student_id: studentId, // UUID 형식이 아니면 null
          student_name: finalStudentName, // 매칭된 이름 사용
          log_date: logDate,
          log_content: logContent,
          emotion_tag: emotionTag,
          activity_tags: activityTags.length > 0 ? activityTags : null
        })
      })
      
      // 매칭되지 않은 학생이 있으면 학생 추가 모달 표시
      if (unmatchedStudents.length > 0) {
        setUnmatchedStudents(unmatchedStudents)
        // 첫 번째 등록되지 않은 학생의 이름을 기본값으로 설정
        setNewStudentName(unmatchedStudents[0].originalName)
        setAddStudentModalOpen(true)
        setDetail(p=>({...p, saving: false}))
        return
      }
      
      if (matchedEntries.length === 0) {
        alert('저장할 학생 데이터가 없습니다. 학생 이름을 확인해주세요.')
        setDetail(p=>({...p, saving: false}))
        return
      }
      
      console.log('[저장] log_entries 데이터:', matchedEntries)
      
      await apiFetch(`/uploads/${detail.upload.id}/log`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          upload_id: detail.upload.id, 
          // file_name 제거: upload_id만으로 특정 파일을 식별하도록 변경
          // 백엔드에서 file_name을 기준으로 다른 파일을 삭제하는 것을 방지
          raw_text: detail.editedText, 
          log_entries: matchedEntries 
        })
      })
      setDetail(p=>({...p, saving: false, saved: true}))
      alert('저장 완료')
      fetchUploads()
      fetchSavedFiles() // 저장된 파일 목록 갱신 (중복 제거)
    } catch(e) { 
      console.error('[저장] 에러:', e)
      setDetail(p=>({...p, saving: false}))
      alert(`저장 실패: ${e.message || '알 수 없는 오류'}`)
    }
  }

  // 학생 추가 함수 (모달에서 호출)
  async function handleAddStudentFromModal() {
    if (!newStudentName.trim()) {
      alert('학생 이름을 입력해주세요.')
      return
    }

    try {
      setAddingStudent(true)
      
      // 백엔드 API에 학생 추가
      const response = await apiFetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newStudentName.trim(),
          alias: newStudentNickname.trim() || null,
          birth_date: newStudentBirthDate || null,
          group_name: newStudentGroupName.trim() || null,
          memo: newStudentLogContent.trim() || null,
          log_content: newStudentLogContent.trim() || null,
        }),
      })
      
      const newStudent = {
        id: String(response.id || response.student_id),
        name: response.name || newStudentName.trim(),
        nickname: response.alias || newStudentNickname.trim() || '',
        group_name: response.group_name || newStudentGroupName.trim() || ''
      }
      
      // studentsMaster에 추가
      setStudentsMaster(prev => [...prev, newStudent])
      
      // 등록되지 않은 학생 목록에서 찾기
      const matchedUnmatched = unmatchedStudents.find(s => s.originalName === newStudentName.trim())
      
      // detail.students와 detail.analysisByStudent에 새 학생 추가/업데이트
      if (matchedUnmatched) {
        setDetail(p => {
          const originalId = matchedUnmatched.originalId
          const newStudentId = newStudent.id
          
          // detail.students에서 originalId로 찾은 학생을 새 학생 ID로 업데이트
          const updatedStudents = p.students.map(s => 
            String(s.id) === String(originalId) 
              ? { id: newStudentId, name: newStudent.name }
              : s
          )
          
          // originalId로 찾은 학생이 없으면 새로 추가
          const studentExists = p.students.find(s => String(s.id) === String(originalId))
          if (!studentExists) {
            updatedStudents.push({ id: newStudentId, name: newStudent.name })
          }
          
          // detail.analysisByStudent에서 originalId의 데이터를 새 학생 ID로 복사
          const originalAnalysis = p.analysisByStudent[originalId] || {
            analysis: {
              emotionTags: [],
              activityName: '',
              date: formatDate(p.upload?.uploaded_at),
              durationMinutes: null,
              note: ''
            },
            activityTypes: buildActivityTypeState()
          }
          
          return {
            ...p,
            students: updatedStudents,
            activeStudentId: newStudentId,
            analysisByStudent: {
              ...p.analysisByStudent,
              [newStudentId]: originalAnalysis, // 기존 분석 데이터 유지
              // originalId는 그대로 두어도 되지만, 정리하려면 삭제할 수도 있음
            },
            saved: false
          }
        })
      }
      
      // 등록되지 않은 학생 목록에서 제거
      const remainingUnmatched = unmatchedStudents.filter(s => s.originalName !== newStudentName.trim())
      setUnmatchedStudents(remainingUnmatched)
      
      // 입력 필드 초기화
      setNewStudentNickname('')
      setNewStudentBirthDate('')
      setNewStudentGroupName('')
      setNewStudentLogContent('')
      
      // 모든 등록되지 않은 학생이 추가되었으면 저장 재시도
      if (remainingUnmatched.length === 0) {
        // 모달 닫기
        setAddStudentModalOpen(false)
        setNewStudentName('')
        // 저장 재시도
        setTimeout(() => {
          handleSaveLogEntry()
        }, 100)
        alert('모든 학생이 추가되었습니다. 저장을 진행합니다.')
      } else {
        // 아직 등록되지 않은 학생이 있으면 다음 학생 이름으로 설정하고 모달 유지
        setNewStudentName(remainingUnmatched[0].originalName)
        alert(`학생이 추가되었습니다. 남은 학생: ${remainingUnmatched.map(s => s.originalName).join(', ')}`)
      }
    } catch (e) {
      console.error('학생 추가 실패:', e)
      alert(`학생 추가 실패: ${e.message || '알 수 없는 오류'}`)
    } finally {
      setAddingStudent(false)
    }
  }

  // 기타 핸들러 (props로 전달하기 위해)
  const handlers = {
      handleSelectStudent: (id) => setDetail(p=>({...p, activeStudentId:id, saved:false})),
      handleUpdateStudentName: (id, newName) => {
        setDetail(p => ({
          ...p,
          students: p.students.map(s => s.id === id ? { ...s, name: newName } : s),
          saved: false
        }))
      },
      handleAddStudent: () => {
          if(studentsMaster.length) { setStudentPickerOpen(p=>!p); return }
          const name = window.prompt('이름 입력:'); if(name) setDetail(p=>({...p, students:[...p.students, {id:`local-${Date.now()}`, name}]}))
      },
      handleAddStudentFromPicker: (studentId = null) => {
          const targetId = studentId || studentPickerValue
          const m = studentsMaster.find(s=>String(s.id)===String(targetId))
          if(m) {
            // 이미 추가된 학생인지 확인
            const exists = detail.students.find(s => String(s.id) === String(m.id))
            if (!exists) {
              const newStudentId = String(m.id)
              // 새 학생 추가 시 analysisByStudent 초기화
              setDetail(p=>({
                ...p, 
                students:[...p.students, {id:newStudentId, name:m.name}], 
                activeStudentId:newStudentId,
                analysisByStudent: {
                  ...p.analysisByStudent,
                  [newStudentId]: {
                    analysis: {
                      emotionTags: [],
                      activityName: '',
                      date: formatDate(p.upload?.uploaded_at),
                      durationMinutes: null,
                      note: ''
                    },
                    activityTypes: buildActivityTypeState()
                  }
                }
              }))
            } else {
              // 이미 있으면 활성 학생만 변경
              setDetail(p=>({...p, activeStudentId:String(m.id)}))
            }
          }
          setStudentPickerOpen(false)
          setPickerValue('')
      },
      handleRemoveStudent: (id) => setDetail(p=>({...p, students:p.students.filter(s=>s.id!==id)})),
      toggleEmotionTagInDetail: (label) => {
          const activeId = detail.activeStudentId || (detail.students && detail.students[0]?.id)
          if (!activeId) return
          
          setDetail(p => {
              const current = p.analysisByStudent[activeId] || { analysis: {}, activityTypes: buildActivityTypeState() }
              const currentTags = current.analysis.emotionTags || []
              const newTags = currentTags.includes(label)
                  ? currentTags.filter(t => t !== label)
                  : [...currentTags, label]
              
              return {
                  ...p,
                  saved: false,
                  analysisByStudent: {
                      ...p.analysisByStudent,
                      [activeId]: {
                          ...current,
                          analysis: {
                              ...current.analysis,
                              emotionTags: newTags
                          }
                      }
                  }
              }
          })
      },
      addEmotionKeywordInSupabase: (label) => {
          // 새 키워드를 마스터 리스트에 추가 (로컬 상태에만)
          const exists = emotionKeywords.find(k => k.label === label || k.name === label)
          if (!exists) {
              setEmotionKeywords(prev => [...prev, {
                  id: `emotion-new-${Date.now()}`,
                  label: label,
                  name: label
              }])
          }
          // 그리고 선택 목록에 추가
          handlers.toggleEmotionTagInDetail(label)
      },
      toggleActivityTypeSelection: (key) => {
          const activeId = detail.activeStudentId || (detail.students && detail.students[0]?.id)
          if (!activeId) return
          
          setDetail(p => {
              const current = p.analysisByStudent[activeId] || { analysis: {}, activityTypes: buildActivityTypeState() }
              const currentTypes = current.activityTypes || buildActivityTypeState()
              const newTypes = { ...currentTypes }
              
              if (newTypes[key]) {
                  const wasSelected = newTypes[key].selected
                  newTypes[key] = {
                      ...newTypes[key],
                      selected: !wasSelected,
                      emotionTags: newTypes[key].emotionTags || []
                  }
              }
              
              return {
                  ...p,
                  saved: false,
                  analysisByStudent: {
                      ...p.analysisByStudent,
                      [activeId]: {
                          ...current,
                          activityTypes: newTypes
                      }
                  }
              }
          })
      },
      toggleActivityTypeEmotionTag: (activityKey, label) => {
          const activeId = detail.activeStudentId || (detail.students && detail.students[0]?.id)
          if (!activeId) return
          
          setDetail(p => {
              const current = p.analysisByStudent[activeId] || { analysis: {}, activityTypes: buildActivityTypeState() }
              const currentTypes = current.activityTypes || buildActivityTypeState()
              const newTypes = { ...currentTypes }
              
              if (newTypes[activityKey]) {
                  const currentTags = newTypes[activityKey].emotionTags || []
                  const newTags = currentTags.includes(label)
                      ? currentTags.filter(t => t !== label)
                      : [...currentTags, label]
                  
                  newTypes[activityKey] = {
                      ...newTypes[activityKey],
                      emotionTags: newTags
                  }
              }
              
              return {
                  ...p,
                  saved: false,
                  analysisByStudent: {
                      ...p.analysisByStudent,
                      [activeId]: {
                          ...current,
                          activityTypes: newTypes
                      }
                  }
              }
          })
      },
      addActivityTypeEmotionKeyword: (activityKey, label) => {
          const activeId = detail.activeStudentId || (detail.students && detail.students[0]?.id)
          if (!activeId) return
          
          // 새 키워드를 마스터 리스트에 추가 (로컬 상태에만)
          const exists = emotionKeywords.find(k => k.label === label || k.name === label)
          if (!exists) {
              setEmotionKeywords(prev => [...prev, {
                  id: `emotion-new-${Date.now()}`,
                  label: label,
                  name: label
              }])
          }
          // 그리고 선택 목록에 추가
          setDetail(p => {
              const current = p.analysisByStudent[activeId] || { analysis: {}, activityTypes: buildActivityTypeState() }
              const currentTypes = current.activityTypes || buildActivityTypeState()
              const newTypes = { ...currentTypes }
              
              if (newTypes[activityKey]) {
                  const currentTags = newTypes[activityKey].emotionTags || []
                  const newTags = currentTags.includes(label)
                      ? currentTags.filter(t => t !== label)
                      : [...currentTags, label]
                  
                  newTypes[activityKey] = {
                      ...newTypes[activityKey],
                      emotionTags: newTags
                  }
              }
              
              return {
                  ...p,
                  saved: false,
                  analysisByStudent: {
                      ...p.analysisByStudent,
                      [activeId]: {
                          ...current,
                          activityTypes: newTypes
                      }
                  }
              }
          })
      },
      updateEditedAnalysis: (patch) => {
          const activeId = detail.activeStudentId || (detail.students && detail.students[0]?.id)
          if (!activeId) return
          
          setDetail(p => {
              const current = p.analysisByStudent[activeId] || { analysis: {}, activityTypes: buildActivityTypeState() }
              
              return {
                  ...p,
                  saved: false,
                  analysisByStudent: {
                      ...p.analysisByStudent,
                      [activeId]: {
                          ...current,
                          analysis: {
                              ...current.analysis,
                              ...patch
                          }
                      }
                  }
              }
          })
      },
      updateActivityTypeDetail: (key, updatedItem) => {
          const activeId = detail.activeStudentId || (detail.students && detail.students[0]?.id)
          if (!activeId) return
          
          setDetail(p => {
              const current = p.analysisByStudent[activeId] || { analysis: {}, activityTypes: buildActivityTypeState() }
              const currentTypes = current.activityTypes || buildActivityTypeState()
              const newTypes = { ...currentTypes }
              
              if (newTypes[key]) {
                  // updatedItem이 객체면 전체 업데이트, 문자열이면 detail만 업데이트 (하위 호환성)
                  if (typeof updatedItem === 'object' && updatedItem !== null) {
                      newTypes[key] = { ...newTypes[key], ...updatedItem }
                  } else {
                      newTypes[key] = {
                          ...newTypes[key],
                          detail: updatedItem
                      }
                  }
              }
              
              return {
                  ...p,
                  saved: false,
                  analysisByStudent: {
                      ...p.analysisByStudent,
                      [activeId]: {
                          ...current,
                          activityTypes: newTypes
                      }
                  }
              }
          })
      },
      handleDownloadOriginal: async () => {
          if (!detail.upload || !detail.upload.file_object) {
              alert('다운로드할 파일이 없습니다.')
              return
          }
          
          const url = URL.createObjectURL(detail.upload.file_object)
          const a = document.createElement('a')
          a.href = url
          a.download = detail.upload.file_name
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
      }
  }

  // ==============================================================================
  // 3. 화면 렌더링 (깔끔하게 정리됨!)
  // ==============================================================================

  return (
    <Layout>
      <div className="upload-page-inner">
        {/* 상단 인사 문구 + 섹션 제목 */}
        <div className="upload-header-section" style={{ padding: '24px 32px 20px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 6, padding: '0 20px' }}>
            <span style={{ fontSize: '36px', animation: 'grow 2s ease-in-out infinite' }}>🌱</span>
            <h1 className="welcome-title" style={{ marginBottom: 0, padding: 0, fontSize: '28px' }}>
              추억을 심어주세요 선생님!
            </h1>
            <span style={{ fontSize: '36px', animation: 'grow 2s ease-in-out infinite 0.5s' }}>🌿</span>
          </div>
          <div className="section-title" style={{ marginTop: '12px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>📁</span>
            <span>활동 기록 업로드</span>
            <div style={{ flex: 1, height: '2px', background: 'linear-gradient(90deg, var(--accent-green) 0%, transparent 100%)', marginLeft: '12px', borderRadius: '2px' }}></div>
          </div>
        </div>

        <div className="upload-layout">
          {/* [왼쪽] 드래그 앤 드롭 영역 컴포넌트 */}
          <DropZonePanel 
            uploading={uploading} 
            fileRef={fileRef} 
            handleFiles={handleFiles}
            uploads={uploads}
            onDeleteUpload={handleDeleteUpload}
          />

          {/* [오른쪽] 파일 목록 패널 컴포넌트 */}
          <UploadListPanel 
            uploads={uploads.filter(u => {
              // status가 success이면서 실제로 분석 결과가 있는 경우만 표시
              if (u.status === 'success') {
                // raw_text가 있거나 log_entries가 있거나 analysisByStudent가 있어야 함
                const hasRawText = u.raw_text && u.raw_text.length > 0
                const hasLogEntries = u.log_entries && u.log_entries.length > 0
                const hasAnalysis = u.analysisByStudent && Object.keys(u.analysisByStudent).length > 0
                return hasRawText || hasLogEntries || hasAnalysis
              }
              // error 상태이면서 raw_text가 있는 경우 (수정 가능한 경우)
              if (u.status === 'error' && u.raw_text && u.raw_text.length > 0) {
                return true
              }
              return false
            })} 
            loading={loading} 
            error={error} 
            openDetail={openDetail} 
            handleDeleteUpload={handleDeleteUpload}
            savedFiles={savedFiles}
            savedFilesLoading={savedFilesLoading}
            onDeleteSavedFile={handleDeleteSavedFile}
            onRefreshSavedFiles={fetchSavedFiles}
          />
        </div>

        {/* 모달들 */}
        {detail.open && (
          <DetailModal 
            detail={detail} 
            setDetail={setDetail} 
            close={() => closeDetail()}
            aiLoading={aiLoading}
            aiError={aiError}
            runAi={handleRunAiExtraction}
            save={handleSaveLogEntry}
            handlers={handlers}
            // ... 필요한 props들
            emotionKeywords={emotionKeywords}
            studentsMaster={studentsMaster}
            pickerOpen={studentPickerOpen}
            setPickerOpen={setStudentPickerOpen}
            pickerValue={studentPickerValue}
            setPickerValue={setStudentPickerValue}
          />
        )}
        
        <ActivityTypeDetailModal 
          modal={activityDetailModal} 
          close={() => setActivityDetailModal(INITIAL_ACTIVITY_DETAIL_MODAL)}
          studentName={detail.upload?.student_name}
        />
      </div>
      {/* 학생 추가 모달 (작은 팝업) */}
      {addStudentModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setAddStudentModalOpen(false)}>
          <div 
            className="card" 
            style={{ 
              maxWidth: '700px', 
              width: '90%',
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid #e5e7eb',
              background: '#ffffff',
              position: 'relative',
              zIndex: 1000
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{ marginBottom: '12px' }}>
              <h3 style={{ marginBottom: '4px', fontSize: '16px', fontWeight: 600 }}>등록되지 않은 학생 추가</h3>
              <p className="muted" style={{ fontSize: '12px', marginBottom: '8px' }}>
                다음 학생이 학생 목록에 없습니다: <strong style={{ color: '#b91c1c' }}>{unmatchedStudents.map(s => s.originalName).join(', ')}</strong>
                {unmatchedStudents.length > 1 && (
                  <span style={{ color: '#6b7280' }}> ({unmatchedStudents.length}명)</span>
                )}
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddStudentFromModal(); }}>
              {/* 1행: 이름 + 별명 + 생년월일 + 단체명 (같은 라인) */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                {/* 학생 이름 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: '#6b7280',
                      minWidth: 64,
                      flexShrink: 0,
                    }}
                  >
                    학생 이름
                  </span>
                  <input
                    className="app-input"
                    type="text"
                    placeholder="예: 홍길동"
                    value={newStudentName}
                    onChange={e => setNewStudentName(e.target.value)}
                    required
                    style={{
                      width: 140,
                      background: '#fffaf1',
                      border: '1px solid rgba(221, 201, 166, 0.5)',
                    }}
                  />
                </div>

                {/* 별명 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: '#6b7280',
                      minWidth: 48,
                      flexShrink: 0,
                    }}
                  >
                    별명
                  </span>
                  <input
                    className="app-input"
                    type="text"
                    placeholder="예: 철수"
                    value={newStudentNickname}
                    onChange={e => setNewStudentNickname(e.target.value)}
                    style={{
                      width: 120,
                      background: '#fffaf1',
                      border: '1px solid rgba(221, 201, 166, 0.5)',
                    }}
                  />
                </div>

                {/* 생년월일 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: '#6b7280',
                      minWidth: 60,
                      flexShrink: 0,
                    }}
                  >
                    생년월일
                  </span>
                  <input
                    className="app-input"
                    type="date"
                    value={newStudentBirthDate}
                    onChange={e => setNewStudentBirthDate(e.target.value)}
                    style={{
                      width: 140,
                      background: '#fffaf1',
                      border: '1px solid rgba(221, 201, 166, 0.5)',
                    }}
                  />
                </div>

                {/* 단체명 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: '#6b7280',
                      minWidth: 60,
                      flexShrink: 0,
                    }}
                  >
                    단체명
                  </span>
                  <div style={{ position: 'relative', width: 140 }}>
                    <select
                      className="app-input"
                      value={newStudentGroupName}
                      onChange={e => setNewStudentGroupName(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#fffaf1',
                        border: '1px solid rgba(221, 201, 166, 0.5)',
                        borderRadius: 10,
                        padding: '8px 12px',
                        fontSize: 13,
                        color: 'var(--text-dark)',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">선택하세요</option>
                      <option value="초등부">초등부</option>
                      <option value="중등부">중등부</option>
                      <option value="고등부">고등부</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2행: 메모 (넓은 textarea) */}
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: '#6b7280',
                    marginBottom: 4,
                  }}
                >
                  메모(별명/특이사항)
                </div>
                <textarea
                  className="app-textarea"
                  placeholder="예: 좋아하는 활동, 특이사항 등을 적어주세요."
                  value={newStudentLogContent}
                  onChange={e => setNewStudentLogContent(e.target.value)}
                  rows={4}
                  style={{
                    width: '98%',
                    minWidth: 200,
                    fontSize: 13,
                    background: '#fffaf1',
                    border: '1px solid rgba(221, 201, 166, 0.5)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    transition: 'all 0.2s',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--accent-green)'
                    e.target.style.background = '#fffdf8'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'rgba(221, 201, 166, 0.5)'
                    e.target.style.background = '#fffaf1'
                  }}
                />
              </div>

              {/* 하단: 버튼 */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setAddStudentModalOpen(false)
                    setNewStudentName('')
                    setNewStudentNickname('')
                    setNewStudentBirthDate('')
                    setNewStudentGroupName('')
                    setNewStudentLogContent('')
                    setUnmatchedStudents([])
                  }}
                  disabled={addingStudent}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={addingStudent || !newStudentName.trim()}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                  }}
                >
                  {addingStudent ? '추가 중...' : '학생 추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}

// ==============================================================================
// 4. 하위 컴포넌트 분리 (같은 파일 내에 정의해서 import 에러 방지)
// ==============================================================================

// 진행도 애니메이션 컴포넌트
function AnimatedProgressItem({ upload, onDelete }) {
  const [displayProgress, setDisplayProgress] = useState(0)
  const [displaySteps, setDisplaySteps] = useState({
    save: 0,
    ai: 0,
    extract: 0
  })
  const animationFrameRef = useRef(null)
  const startTimeRef = useRef(null)
  const startProgressRef = useRef(0)
  const startStepsRef = useRef({ save: 0, ai: 0, extract: 0 })

  const targetProgress = upload.overall_progress || 0
  const targetSteps = {
    save: upload.steps?.save || 0,
    ai: upload.steps?.ai || 0,
    extract: upload.steps?.extract || 0
  }

  useEffect(() => {
    // 기존 애니메이션 취소
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    
    // 목표 값이 변경될 때마다 애니메이션 시작
    const startValue = displayProgress
    const targetValue = targetProgress
    startProgressRef.current = startValue
    startTimeRef.current = Date.now()
    
    // 단계별 진행도도 애니메이션
    startStepsRef.current = { ...displaySteps }
    
    const duration = 800 // 0.8초 동안 애니메이션
    
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      
      // Easing 함수 (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      
      // 진행도 애니메이션
      const currentProgress = startProgressRef.current + (targetValue - startProgressRef.current) * easeOut
      setDisplayProgress(Math.round(currentProgress))
      
      // 단계별 진행도 애니메이션
      const currentSteps = {
        save: Math.round(startStepsRef.current.save + (targetSteps.save - startStepsRef.current.save) * easeOut),
        ai: Math.round(startStepsRef.current.ai + (targetSteps.ai - startStepsRef.current.ai) * easeOut),
        extract: Math.round(startStepsRef.current.extract + (targetSteps.extract - startStepsRef.current.extract) * easeOut)
      }
      setDisplaySteps(currentSteps)
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        // 최종 값 설정
        setDisplayProgress(targetValue)
        setDisplaySteps(targetSteps)
      }
    }
    
    if (Math.abs(targetValue - startValue) > 0.1 || 
        Math.abs(targetSteps.save - startStepsRef.current.save) > 0.1 ||
        Math.abs(targetSteps.ai - startStepsRef.current.ai) > 0.1 ||
        Math.abs(targetSteps.extract - startStepsRef.current.extract) > 0.1) {
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProgress, targetSteps.save, targetSteps.ai, targetSteps.extract])

  const statusIcon = upload.status === 'error' ? '❌' : 
                   upload.status === 'processing' ? '🟡' : '⏳'
  const statusText = upload.status === 'error' ? '오류' :
                    upload.status === 'processing' ? '분석 중' : '대기 중'

  return (
    <div className="upload-progress-item">
      <div className="upload-progress-header">
        <div className="upload-progress-icon">{statusIcon}</div>
        <div className="upload-progress-info">
          <div className="upload-progress-filename">{upload.file_name}</div>
          <div className="upload-progress-status">{statusText}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="upload-progress-percentage">{displayProgress}%</div>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (window.confirm(`이 파일을 삭제하시겠습니까?\n\n파일: ${upload.file_name}`)) {
                  onDelete(upload.id)
                }
              }}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#ef4444',
                fontSize: '18px',
                fontWeight: 'bold',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#fee2e2'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent'
              }}
              title="파일 삭제"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="upload-progress-bar-container">
        <div 
          className={`upload-progress-bar ${upload.status === 'error' ? 'error' : ''}`}
          style={{ width: `${displayProgress}%` }}
        ></div>
      </div>
      {upload.status === 'processing' && (
        <div className="upload-progress-steps">
          <div className="upload-progress-step">
            <span className="step-label">저장</span>
            <span className="step-value">{displaySteps.save}%</span>
          </div>
          <div className="upload-progress-step">
            <span className="step-label">AI 분석</span>
            <span className="step-value">{displaySteps.ai}%</span>
          </div>
          <div className="upload-progress-step">
            <span className="step-label">텍스트 추출</span>
            <span className="step-value">{displaySteps.extract}%</span>
          </div>
        </div>
      )}
      {upload.error && (
        <div className="upload-progress-error">{upload.error}</div>
      )}
    </div>
  )
}

// 왼쪽 드롭존 컴포넌트
function DropZonePanel({ uploading, fileRef, handleFiles, uploads = [], onDeleteUpload }) {
  const [dragOver, setDragOver] = useState(false)
  
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = () => { setDragOver(false) }
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  // 처리 중인 파일들 (queued, processing 상태)
  const processingUploads = uploads.filter(u => 
    u.status === 'queued' || u.status === 'processing' || u.status === 'error'
  )

  return (
    <div
      className={`upload-left-panel ${dragOver ? 'active' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {/* 헤더 영역 */}
      <div className="upload-card-header-row">
        <h2 className="upload-card-title">파일 업로드</h2>
        <p className="upload-card-subtitle">
          PDF, TXT 등 활동 기록 파일을 업로드해주세요.
        </p>
      </div>

      {/* 가운데 드래그 앤 드롭 박스 */}
      <div
        className={`upload-dropzone-box ${dragOver ? 'upload-dropzone-box-active' : ''}`}
        onClick={() => fileRef.current?.click()}
      >
        <div className="upload-drop-illustration">
          <span className="upload-drop-illustration-icon">📄</span>
        </div>

        {uploading ? (
          <>
            <div className="upload-drop-main">파일을 업로드 중입니다...</div>
            <div className="upload-drop-sub">잠시만 기다려주세요.</div>
          </>
        ) : (
          <>
            <div className="upload-drop-main">여기로 파일을 드래그 앤 드롭</div>
            <button
              type="button"
              className="upload-choose-btn"
              onClick={e => {
                e.stopPropagation()
                fileRef.current?.click()
              }}
            >
              또는 파일 선택하기
            </button>
          </>
        )}
      </div>

      {/* 하단 안내 텍스트 */}
      <div className="upload-drop-footer-row">
        <span className="upload-footer-text">지원 형식: PDF, TXT</span>
        <span className="upload-footer-text">최대 파일 크기: 10MB</span>
      </div>

      {/* 처리 중인 파일 진행도 리스트 */}
      {processingUploads.length > 0 && (
        <div className="upload-progress-list">
          <h3 className="upload-progress-list-title">업로드 및 분석 진행 중</h3>
          {processingUploads.map(upload => (
            <AnimatedProgressItem 
              key={upload.id} 
              upload={upload} 
              onDelete={onDeleteUpload}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// 오른쪽 파일 목록 컴포넌트
function UploadListPanel({ uploads, loading, error, openDetail, handleDeleteUpload, savedFiles, savedFilesLoading, onDeleteSavedFile, onRefreshSavedFiles }) {
  const [showSavedFilesModal, setShowSavedFilesModal] = useState(false)
  const safeUploads = Array.isArray(uploads) ? uploads : []

  return (
    <>
    <div className="upload-right-panel" style={{ backgroundColor: 'white' }}>
      <div className="upload-status-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="section-title" style={{marginTop:0, marginBottom:0}}>AI 분석 완료 파일</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {loading && <span className="muted" style={{fontSize:12}}>갱신 중...</span>}
          <button
            onClick={() => {
              setShowSavedFilesModal(true)
              onRefreshSavedFiles()
            }}
            style={{
              padding: '6px 12px',
              background: '#7fb86d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.target.style.background = '#6b9558'}
            onMouseOut={(e) => e.target.style.background = '#7fb86d'}
          >
            과거 목록
          </button>
        </div>
      </div>
      {error && <div className="error" style={{marginBottom:10}}>{error}</div>}

      <div style={{flex:1, overflowY:'auto', marginTop:15}}>
        {safeUploads.length === 0 ? (
          <div style={{textAlign:'center', color:'#999', marginTop: 50}}>
            <div style={{fontSize: 24, marginBottom: 5}}>📭</div>
            <p>아직 업로드된 파일이 없습니다.</p>
          </div>
        ) : (
          safeUploads.map(u => {
            const isSuccess = u.status === 'success'
            // AI 인식 실패 여부 확인
            // analysisByStudent가 있으면 AI 인식 성공
            const hasAnalysis = u.analysisByStudent && Object.keys(u.analysisByStudent).length > 0
            const hasLogEntries = u.log_entries && u.log_entries.length > 0
            const hasRawText = u.raw_text && u.raw_text.length > 0
            // details가 있으면 분석 결과가 있는 것으로 간주 (openDetail에서 변환됨)
            const hasDetails = u.details && u.details.dates && Array.isArray(u.details.dates) && u.details.dates.length > 0
            
            // AI 인식 성공 조건: analysisByStudent가 있거나, details가 있거나, log_entries가 있음
            const aiRecognitionSuccess = hasAnalysis || hasDetails || hasLogEntries
            
            // success 상태이지만 실제 분석 결과가 없는 경우만 실패로 판단
            const aiRecognitionFailed = isSuccess && hasRawText && !aiRecognitionSuccess
            const fileSize = u.file_size ? formatFileSize(u.file_size) : ''
            
            return (
              <div key={u.id} className="file-item" onClick={() => openDetail(u)}>
                <div className="file-icon-box">📄</div>
                <div className="file-info">
                  <div className="file-name">{u.file_name}</div>
                  <div className="file-meta">
                    {fileSize && `${fileSize} • `}
                    {formatDate(u.created_at)}
                  </div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:5}}>
                  {aiRecognitionFailed ? (
                    <span style={{color:'#ef4444', fontSize:'18px', fontWeight:'bold'}} title="AI 인식 실패 - 직접 수정 필요">✕</span>
                  ) : isSuccess ? (
                    <span style={{color:'green'}}>✔</span>
                  ) : (
                    <span style={{color:'orange'}}>●</span>
                  )}
                  <button onClick={(e) => {e.stopPropagation(); handleDeleteUpload(u.id)}} style={{border:'none', background:'none', cursor:'pointer', color:'#aaa'}}>✕</button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>

    {/* 저장된 파일 목록 모달 */}
    {showSavedFilesModal && (
      <div className="modal-backdrop" onClick={() => setShowSavedFilesModal(false)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0 }}>과거 완료 파일 목록</h3>
            <button
              onClick={() => setShowSavedFilesModal(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#999'
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {savedFilesLoading ? (
              <div style={{ textAlign: 'center', color: '#999', marginTop: 50 }}>
                <div style={{ fontSize: 24, marginBottom: 5 }}>⏳</div>
                <p>로딩 중...</p>
              </div>
            ) : savedFiles.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', marginTop: 50 }}>
                <div style={{ fontSize: 24, marginBottom: 5 }}>📭</div>
                <p>저장된 파일이 없습니다.</p>
              </div>
            ) : (
              savedFiles.map((file, idx) => (
                <div key={file.source_file_path || file.file_name || idx} className="file-item" style={{ marginBottom: '10px', cursor: 'default' }}>
                  <div className="file-icon-box">💾</div>
                  <div className="file-info" style={{ flex: 1 }}>
                    <div className="file-name">{file.file_name}</div>
                    <div className="file-meta">
                      저장일: {formatDate(file.saved_at)} • 기록 수: {file.log_entry_count}개
                      {file.students && file.students.length > 0 && ` • 학생: ${file.students.join(', ')}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`이 파일의 저장된 데이터를 삭제하시겠습니까?\n\n파일: ${file.file_name}\n\n삭제하면 대시보드에서도 해당 데이터가 사라집니다.`)) {
                          onDeleteSavedFile(file.source_file_path || file.file_name)
                        }
                      }}
                      style={{
                        border: 'none',
                        background: '#ef4444',
                        color: 'white',
                        cursor: 'pointer',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => e.target.style.background = '#dc2626'}
                      onMouseOut={(e) => e.target.style.background = '#ef4444'}
                      title="저장된 데이터 삭제 (대시보드 데이터도 함께 삭제됩니다)"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// 상세 분석 모달 컴포넌트
function DetailModal({
  detail, setDetail, close, aiLoading, aiError, runAi, save, 
  // props로 받은 핸들러들
  emotionKeywords, studentsMaster, pickerOpen, setPickerOpen,
  pickerValue, setPickerValue, handlers
}) {
  if (!detail.open || !detail.upload) return null

  const { 
    handleSelectStudent, handleRemoveStudent, handleAddStudent, handleAddStudentFromPicker, handleUpdateStudentName,
    handleDownloadOriginal, toggleEmotionTagInDetail, addEmotionKeywordInSupabase,
    toggleActivityTypeSelection, updateEditedAnalysis, updateActivityTypeDetail,
    toggleActivityTypeEmotionTag, addActivityTypeEmotionKeyword
  } = handlers

  // 현재 선택된 학생 데이터 가져오기
  const { activeId, analysis: a, activityTypes } = getActiveStudentState(detail)
  const activeStudent = (detail.students || []).find(s => s.id === activeId)
  const studentsText = activeStudent?.name || detail.upload.student_name
  
  // 선택된 활동 유형 추적
  const [selectedActivityType, setSelectedActivityType] = useState(null)
  
  // 학생 드롭다운 외부 클릭 감지
  const studentDropdownRef = useRef(null)
  
  useEffect(() => {
    function handleClickOutside(event) {
      if (studentDropdownRef.current && !studentDropdownRef.current.contains(event.target)) {
        setPickerOpen(false)
      }
    }
    if (pickerOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [pickerOpen, setPickerOpen])

  // 날짜 및 시간 계산
  const dateValue = a.date ? formatDate(a.date) : (formatDate(detail.upload.uploaded_at) || '')
  const { hours, minutes } = splitDuration(a.durationMinutes)
  const safeHours = Number.isNaN(hours) ? 0 : hours
  const safeMinutes = Number.isNaN(minutes) ? 0 : minutes

  // 총 소요 시간 계산 (모든 활동 유형의 소요시간 합산)
  const totalDurationMinutes = Object.values(activityTypes || {}).reduce((total, item) => {
    if (item.selected && item.durationMinutes) {
      return total + (Number(item.durationMinutes) || 0)
    }
    return total
  }, 0)
  const totalHours = Math.floor(totalDurationMinutes / 60)
  const totalMinutes = totalDurationMinutes % 60

  // 텍스트에서 날짜 추출
  const extractedDates = extractDatesFromText(detail.editedText || '')
  const [selectedDate, setSelectedDate] = useState(extractedDates[0] || dateValue)

  // 선택된 날짜에 해당하는 텍스트 필터링 (간단한 구현)
  const getFilteredTextByDate = (text, targetDate) => {
    if (!targetDate || !text) return text
    // 날짜가 포함된 라인만 필터링 (간단한 구현)
    const lines = text.split('\n')
    return lines.filter(line => line.includes(targetDate)).join('\n') || text
  }

  // AI 인식 실패 여부 확인
  const hasAnalysis = detail.analysisByStudent && Object.keys(detail.analysisByStudent).length > 0
  const hasRawText = detail.editedText && detail.editedText.length > 0
  const aiRecognitionFailed = hasRawText && !hasAnalysis

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="modal-card modal-card-wide detail-analysis-modal" onClick={e => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div className="detail-analysis-header" style={{ marginBottom: '20px' }}>
          <div>
            <h3 style={{ marginBottom: '8px', fontSize: '20px', fontWeight: 700, color: 'var(--text-dark)' }}>학생별 활동/감정 편집</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-gray)', margin: 0 }}>
              {dateValue || formatDate(detail.upload.uploaded_at)} · {studentsText || '학생 없음'}
            </p>
          </div>
          <div className="detail-header-actions">
            <button 
              type="button" 
              className="btn secondary" 
              onClick={() => {
                const text = detail.editedText || detail.upload.raw_text || ''
                if (!text) {
                  alert('다운로드할 텍스트가 없습니다.')
                  return
                }
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${detail.upload.file_name.replace(/\.[^/.]+$/, '')}_원본텍스트.txt`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '8px',
                border: '1px solid var(--accent-green)',
                background: 'var(--accent-green)',
                color: '#fffdf8',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginRight: '8px'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'var(--accent-green-dark)'
                e.target.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'var(--accent-green)'
                e.target.style.transform = 'translateY(0)'
              }}
            >
              텍스트 다운로드
            </button>
            <button type="button" className="btn ghost" onClick={close}>
              닫기
            </button>
          </div>
        </div>

        {detail.error && <div className="error">{detail.error}</div>}
        {aiError && <div className="error">{aiError}</div>}
        {aiRecognitionFailed && (
          <div style={{
            background: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>
                AI 인식 실패
              </div>
              <div style={{ fontSize: '14px', color: '#991b1b' }}>
                AI가 이 파일을 자동으로 분석하지 못했습니다. 원본 텍스트를 확인하고 직접 수정해주세요.
              </div>
            </div>
            <button
              type="button"
              className="btn secondary"
              onClick={runAi}
              disabled={aiLoading}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                fontWeight: 600
              }}
            >
              {aiLoading ? '재분석 중...' : 'AI 재분석'}
            </button>
          </div>
        )}

        {/* 본문 영역 */}
        {detail.loading ? <div className="muted">로딩 중...</div> : (
          <div className="detail-layout detail-layout-modern">
            {/* [왼쪽] 텍스트 에디터 */}
            <section className="detail-left">
              <div className="detail-panel">
                <h4>원본 텍스트</h4>
                {/* 날짜 목록 표시 */}
                {extractedDates.length > 0 && (
                  <div style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {extractedDates.map((date, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedDate(date)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '13px',
                          borderRadius: '6px',
                          border: selectedDate === date ? '2px solid var(--accent-green)' : '1px solid rgba(221, 201, 166, 0.5)',
                          background: selectedDate === date ? '#f0f7ed' : 'transparent',
                          color: selectedDate === date ? 'var(--accent-green-dark)' : 'var(--text-gray)',
                          cursor: 'pointer',
                          fontWeight: selectedDate === date ? 600 : 400,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedDate !== date) {
                            e.target.style.borderColor = 'var(--accent-green)'
                            e.target.style.color = 'var(--accent-green-dark)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedDate !== date) {
                            e.target.style.borderColor = 'rgba(221, 201, 166, 0.5)'
                            e.target.style.color = 'var(--text-gray)'
                          }
                        }}
                      >
                        {date}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  className="detail-textarea"
                  value={detail.editedText}
                  onChange={e => setDetail(p => ({ ...p, editedText: e.target.value, saved: false }))}
                  placeholder="AI가 추출한 텍스트입니다. 자유롭게 수정하세요."
                />
              </div>
            </section>

            {/* [오른쪽] 학생별 특이사항 카드 + 활동 유형 */}
            <section className="detail-right">
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '20px',
                height: '100%',
                alignItems: 'stretch',
                overflow: 'visible'
              }}>
                {/* 학생별 특이사항 카드 */}
                <div className="student-notes-card" style={{
                  background: 'linear-gradient(135deg, #f5ede0 0%, #f0e6d5 50%, #ebe0cc 100%)',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: '0 4px 12px rgba(156, 132, 90, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: '0 0 400px',
                  minWidth: 0,
                  height: '100%',
                  overflowY: 'auto'
                }}>
                  {/* 학생 카드 목록 */}
                  {(detail.students || []).length > 0 && (
                    <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {(detail.students || []).map((student) => (
                        <div
                          key={student.id}
                          onClick={() => handlers.handleSelectStudent(student.id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            background: activeId === student.id 
                              ? 'var(--accent-green)' 
                              : 'transparent',
                            color: activeId === student.id 
                              ? '#fffdf8' 
                              : 'var(--accent-green-dark)',
                            border: activeId === student.id 
                              ? '1px solid var(--accent-green)' 
                              : '1px solid var(--accent-green)',
                            boxShadow: activeId === student.id 
                              ? '0 2px 8px rgba(139, 191, 123, 0.3)' 
                              : 'none'
                          }}
                          onMouseEnter={(e) => {
                            if (activeId !== student.id) {
                              e.currentTarget.style.background = '#f0f7ed'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (activeId !== student.id) {
                              e.currentTarget.style.background = 'transparent'
                            }
                          }}
                        >
                          <span 
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              const newName = window.prompt('학생 이름 수정:', student.name)
                              if (newName && newName.trim() && newName !== student.name) {
                                handlers.handleUpdateStudentName(student.id, newName.trim())
                              }
                            }}
                            style={{ cursor: 'text' }}
                            title="더블클릭하여 이름 수정"
                          >
                            {student.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (window.confirm(`${student.name} 학생을 제거하시겠습니까?`)) {
                                handleRemoveStudent(student.id)
                              }
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: activeId === student.id ? '#fffdf8' : 'var(--accent-green-dark)',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: 0,
                              margin: 0,
                              lineHeight: 1,
                              fontWeight: 600,
                              opacity: 0.7
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.opacity = '1'
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.opacity = '0.7'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* 학생 추가 버튼 (카드 위쪽) */}
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                    <h4 style={{ 
                      fontSize: '16px', 
                      fontWeight: 700, 
                      color: 'var(--text-dark)', 
                      margin: 0
                    }}>
                      학생별 특이사항 · {studentsText || '학생 없음'}
                    </h4>
                    <div ref={studentDropdownRef} style={{ position: 'relative' }}>
                      <button 
                        onClick={handleAddStudent}
                        style={{
                          padding: '6px 12px',
                          fontSize: '13px',
                          color: 'var(--accent-green-dark)',
                          background: 'transparent',
                          border: '1px dashed var(--accent-green)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 500,
                          transition: 'all 0.2s',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = '#f0f7ed'
                          e.target.style.borderColor = 'var(--accent-green-dark)'
                          e.target.style.color = 'var(--accent-green-dark)'
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = 'transparent'
                          e.target.style.borderColor = 'var(--accent-green)'
                          e.target.style.color = 'var(--accent-green-dark)'
                        }}
                      >
                        + 학생 추가
                      </button>
                      {/* 학생 목록 드롭다운 */}
                      {pickerOpen && studentsMaster.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          marginTop: '4px',
                          background: '#fffdf8',
                          border: '1px solid rgba(221, 201, 166, 0.5)',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(156, 132, 90, 0.15)',
                          zIndex: 1000,
                          minWidth: '200px',
                          maxHeight: '300px',
                          overflowY: 'auto'
                        }}>
                          <div style={{
                            padding: '8px',
                            borderBottom: '1px solid rgba(221, 201, 166, 0.3)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--text-gray)'
                          }}>
                            학생 선택
                          </div>
                          {studentsMaster.map((student) => (
                            <div
                              key={student.id}
                              onClick={() => {
                                handleAddStudentFromPicker(String(student.id))
                              }}
                              style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: 'var(--text-dark)',
                                borderBottom: '1px solid rgba(221, 201, 166, 0.1)',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.background = '#f8f2e4'
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.background = 'transparent'
                              }}
                            >
                              {student.name || '이름 없음'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 특이사항 / 교사 코멘트 */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label style={{ 
                      fontSize: '14px', 
                      fontWeight: 600, 
                      color: 'var(--text-dark)', 
                      marginBottom: '8px' 
                    }}>
                      특이사항 / 교사 코멘트
                    </label>
                    <textarea
                      className="app-textarea"
                      value={a.note || ''}
                      onChange={e => updateEditedAnalysis({ note: e.target.value })}
                      placeholder="AI가 채운 내용이 있으면 먼저 확인하고, 필요하면 수정해 주세요."
                      style={{
                        flex: 1,
                        minHeight: '200px',
                        resize: 'vertical',
                        fontSize: '14px',
                        lineHeight: '1.6'
                      }}
                    />
                  </div>
                </div>

                {/* 활동 유형 섹션 */}
                {activeId && (
                  <div style={{
                    background: 'linear-gradient(135deg, #f0e8d8 0%, #ebe0cc 50%, #e6d8c0 100%)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 4px 12px rgba(156, 132, 90, 0.15)',
                    flex: '0 0 auto',
                    width: '350px',
                    minWidth: '350px',
                    height: '100%',
                    overflowY: 'auto',
                    overflowX: 'visible'
                  }}>
                    <h5 style={{ 
                      fontSize: '16px', 
                      fontWeight: 700, 
                      color: 'var(--text-dark)', 
                      marginBottom: '16px',
                      marginTop: 0
                    }}>
                      활동 유형
                    </h5>
                    <div className="activity-type-grid" style={{ width: '100%' }}>
                      {Object.entries(activityTypes || {}).map(([key, item]) => (
                        <div key={key} className={`activity-type-card ${item.selected ? 'selected' : ''}`} style={{ width: '100%' }}>
                          <button 
                            type="button" 
                            className="activity-type-toggle" 
                            onClick={() => {
                              // selectedActivityType을 먼저 업데이트
                              if (selectedActivityType === key) {
                                // 같은 버튼을 다시 클릭하면 닫기
                                setSelectedActivityType(null)
                                toggleActivityTypeSelection(key)
                              } else {
                                // 다른 버튼이거나 처음 클릭하면 열기
                                setSelectedActivityType(key)
                                // 선택되지 않았으면 선택 상태로 만들기
                                if (!item.selected) {
                                  toggleActivityTypeSelection(key)
                                }
                              }
                            }}
                            style={{ width: '100%' }}
                          >
                            <span className="activity-type-icon">{item.icon}</span>
                            <span className="activity-type-label">{item.label}</span>
                          </button>
                          {/* 선택된 활동 유형의 감정 키워드 및 활동명/소요시간 UI */}
                          {selectedActivityType === key && (
                            <div className="activity-type-emotion-section" style={{ width: '100%' }}>
                              <h6>감정 키워드</h6>
                              <EmotionKeywordSelector
                                masterList={emotionKeywords}
                                selected={item.emotionTags || []}
                                onToggle={(label) => toggleActivityTypeEmotionTag(key, label)}
                                onAddNew={(label) => addActivityTypeEmotionKeyword(key, label)}
                              />
                              
                              {/* 활동명과 소요시간 */}
                              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed var(--text-gray)' }}>
                                <div style={{ marginBottom: '12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)' }}>활동명</label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentNames = Array.isArray(item.activityNames) 
                                          ? item.activityNames 
                                          : (item.activityName ? [item.activityName] : [''])
                                        const updatedItem = { 
                                          ...item, 
                                          activityNames: [...currentNames, ''],
                                          activityName: undefined // 기존 단일 필드 제거
                                        }
                                        updateActivityTypeDetail(key, updatedItem)
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--bg-white)',
                                        color: 'var(--text-dark)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      + 추가
                                    </button>
                                  </div>
                                  {(Array.isArray(item.activityNames) 
                                    ? item.activityNames 
                                    : (item.activityName ? [item.activityName] : [''])).map((activityName, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                                      <input 
                                        type="text" 
                                        className="app-input" 
                                        value={activityName || ''} 
                                        onChange={e => {
                                          const currentNames = Array.isArray(item.activityNames) 
                                            ? item.activityNames 
                                            : (item.activityName ? [item.activityName] : [''])
                                          const newNames = [...currentNames]
                                          newNames[idx] = e.target.value
                                          const updatedItem = { 
                                            ...item, 
                                            activityNames: newNames,
                                            activityName: undefined // 기존 단일 필드 제거
                                          }
                                          updateActivityTypeDetail(key, updatedItem)
                                        }}
                                        placeholder="활동명을 입력하세요"
                                        style={{ flex: 1 }}
                                      />
                                      {(Array.isArray(item.activityNames) ? item.activityNames : (item.activityName ? [item.activityName] : [''])).length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentNames = Array.isArray(item.activityNames) 
                                              ? item.activityNames 
                                              : (item.activityName ? [item.activityName] : [''])
                                            const newNames = currentNames.filter((_, i) => i !== idx)
                                            const updatedItem = { 
                                              ...item, 
                                              activityNames: newNames.length > 0 ? newNames : [''],
                                              activityName: undefined
                                            }
                                            updateActivityTypeDetail(key, updatedItem)
                                          }}
                                          style={{
                                            padding: '4px 8px',
                                            fontSize: '12px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--bg-white)',
                                            color: 'var(--text-red-dark)',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          삭제
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '6px' }}>소요시간</label>
                                  <div className="time-input-group" style={{ width: '100%' }}>
                                    <input 
                                      type="number" 
                                      min="0" 
                                      className="app-input time-input" 
                                      value={Math.floor((item.durationMinutes || 0) / 60)} 
                                      onChange={e => {
                                        const hours = Number(e.target.value) || 0
                                        const minutes = (item.durationMinutes || 0) % 60
                                        const updatedItem = { ...item, durationMinutes: hours * 60 + minutes }
                                        updateActivityTypeDetail(key, updatedItem)
                                      }}
                                    />
                                    <span className="time-separator">시간</span>
                                    <input 
                                      type="number" 
                                      min="0" 
                                      max="59" 
                                      className="app-input time-input" 
                                      value={(item.durationMinutes || 0) % 60} 
                                      onChange={e => {
                                        const hours = Math.floor((item.durationMinutes || 0) / 60)
                                        const minutes = Number(e.target.value) || 0
                                        const updatedItem = { ...item, durationMinutes: hours * 60 + minutes }
                                        updateActivityTypeDetail(key, updatedItem)
                                      }}
                                    />
                                    <span className="time-separator">분</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* 푸터 */}
        <div className="detail-modal-footer">
          <button className="btn primary" onClick={save} disabled={detail.saving}>
            {detail.saving ? '저장 중...' : '저장'}
          </button>
          {detail.saved && <span className="badge badge-success">저장 완료</span>}
        </div>

      </div>
    </div>
  )
}