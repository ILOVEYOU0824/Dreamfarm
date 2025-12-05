// src/pages/Report.jsx
import React, { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { apiFetch, generateReportWithGemini } from '../lib/api.js'

// 백엔드 베이스 URL
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  'http://localhost:3000'

// 로그인한 사용자 정보를 localStorage에서 가져오는 유틸
function getCurrentUser() {
  if (typeof window === 'undefined') return null
  try {
    const raw =
      window.localStorage.getItem('auth') ||
      window.localStorage.getItem('user') ||
      window.localStorage.getItem('dreamgarden_auth')

    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.user || parsed
  } catch {
    return null
  }
}

// 🔹 리포트 카테고리 메타 정보
const REPORT_CATEGORY_CONFIG = {
  all: {
    code: 'all',
    label: '전체',
    description: '기간 동안의 전반적인 활동, 감정, 능력 변화를 종합적으로 요약합니다.',
  },
  full: {
    code: 'full',
    label: '전체 리포트',
    description: '감정, 활동, 능력 변화를 모두 포함하는 전체 종합 리포트입니다.',
  },
  emotion: {
    code: 'emotion',
    label: '감정 변화',
    description: '기간 동안의 감정 분포와 변화 양상을 중심으로 리포트를 생성합니다.',
  },
  activity_ratio: {
    code: 'activity_ratio',
    label: '활동 비율 변화',
    description: '어떤 활동을 얼마나 했는지, 활동 유형의 비율 변화를 중심으로 리포트를 생성합니다.',
  },
  ability_growth: {
    code: 'ability_growth',
    label: '능력 성장 곡선',
    description: '학생의 활동 수행 능력이 시간에 따라 어떻게 변화했는지를 중심으로 리포트를 생성합니다.',
  },
}

// 🔹 남은 시간 계산
function getRemainingInfo(report, nowTs) {
  if (!report.expiresAt) {
    return { expired: false, label: '만료 기간 정보 없음' }
  }
  const expiresAtTs = new Date(report.expiresAt).getTime()
  const diffMs = expiresAtTs - nowTs
  if (diffMs <= 0) return { expired: true, label: '만료됨' }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (diffDays > 0) return { expired: false, label: `${diffDays}일 남음` }
  if (diffHours > 0) return { expired: false, label: `${diffHours}시간 남음` }
  return { expired: false, label: '곧 만료' }
}

// 🔹 백엔드에서 내려온 report-runs 데이터를 화면용으로 정규화
function normalizeReportRuns(rawRuns) {
  if (!Array.isArray(rawRuns)) return []

  return rawRuns
    .filter(run => !!run) // null 제거
    .map(run => {    

    const params = run.params || run.filters || {}
    const template = run.template || {}
    const outputs = Array.isArray(run.outputs) ? run.outputs : []

    const studentName =
      run.student_name ||
      params.student_name ||
      (run.student && run.student.name) ||
      '학생 이름 미상'

    const categoryCode = params.category_code || template.category_code
    const categoryLabel =
      params.category_label ||
      template.category_label ||
      REPORT_CATEGORY_CONFIG[categoryCode]?.label ||
      '리포트'

    const purposeCode = params.purpose || template.purpose || run.purpose || 'other'
    const purposeLabel =
      purposeCode === 'parent'
        ? '학부모 상담용'
        : purposeCode === 'school'
        ? '학교 제출용'
        : null

    const createdAt = run.created_at

    let expiresAt = null
     try{ 
      if (run.expires_at) {
    expiresAt = run.expires_at
      } else if (createdAt) {
        const createdDate = new Date(createdAt)
        if (!isNaN(createdDate.getTime())) {
          const expireDate = new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          expiresAt = expireDate.toISOString()
        }
     }
} catch (err) {
  expiresAt = null
}

    const firstMd =
      outputs.find(o => o.format === 'md' || o.format === 'markdown') || run.md_output

    const analysisFrom = params.from || params.date_from || params.start_date || null
    const analysisTo = params.to || params.date_to || params.end_date || null

    return {
      id: run.id,
      templateCode: template.code || params.template_code || 'custom',
      templateName: template.name || categoryLabel,
      studentName,
      summary: run.summary || params.summary || '',
      createdAt,
      expiresAt,
      status: run.status || 'completed',
      // 백엔드의 다운로드 경로 (params.markdown이 있으면 거기서 다운로드됨)
      mdDownloadPath:
        firstMd?.download_path ||
        (run.id ? `/report-runs/${run.id}/download?format=md` : null),
      raw: run, // 원본 데이터 보존 (params 접근용)
      purposeLabel,
      analysisFrom,
      analysisTo,
    }
  })
}

export default function Report() {
  const [currentUser] = useState(() => getCurrentUser())

  // 필터/생성용 상태
  const [filterMode, setFilterMode] = useState('range')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [singleDate, setSingleDate] = useState('')
  const [category, setCategory] = useState('all')
  const [studentId, setStudentId] = useState('all')
  const [purpose, setPurpose] = useState('all')

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [students, setStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)

  const [nowTs, setNowTs] = useState(Date.now())

  const isInvalidRange =
    filterMode === 'range' && startDate && endDate && startDate > endDate

  async function fetchReports() {
    setLoading(true)
    setError(null)
    try {
      // 백엔드 없이 로컬 상태만 사용
      // 임시 리포트 데이터 생성
      const tempReport = {
        id: 'temp-report-001',
        templateCode: 'ai_markdown',
        templateName: '전체 리포트',
        studentName: '김철수',
        summary: '2024년 3월 활동 종합 리포트',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
        mdDownloadPath: null,
        raw: {
          id: 'temp-report-001',
          params: {
            title: '김철수 2024-03-15 ~ 2024-03-25 전체 리포트',
            from: '2024-03-15',
            to: '2024-03-25',
            category_code: 'full',
            category_label: '전체 리포트',
            purpose: 'parent',
            student_id: 's1',
            student_name: '김철수',
            markdown: `# 김철수 학생 활동 리포트

## 📅 분석 기간
**2024년 3월 15일 ~ 2024년 3월 25일**

## 👤 학생 정보
- **이름**: 김철수
- **리포트 용도**: 학부모 상담용

## 🌱 활동 요약

### 주요 활동
이 기간 동안 김철수 학생은 농장 활동에 매우 적극적으로 참여했습니다. 특히 토마토 파종과 식물 관찰 활동에서 뛰어난 집중력을 보였습니다.

### 활동 유형별 분석
1. **파종 활동** (3월 15일)
   - 토마토 씨앗을 화분에 심는 활동
   - 소요 시간: 60분
   - 감정 키워드: 기쁜, 신나는
   - 학생들이 매우 적극적으로 참여했으며, 특히 김철수 학생은 집중력이 뛰어났습니다.

2. **관찰 활동** (3월 20일 ~ 3월 25일)
   - 싹이 나오는 과정을 꾸준히 관찰
   - 소요 시간: 30분
   - 감정 키워드: 뿌듯한, 기대에 부푼
   - 매일 아침마다 식물의 변화를 확인하며 성장 과정을 관찰했습니다.

## 💭 감정 변화 분석
이 기간 동안 학생은 주로 긍정적인 감정을 보였습니다:
- **기쁨**: 씨앗 심기 활동에서 큰 즐거움을 느꼈습니다.
- **뿌듯함**: 싹이 나오는 것을 확인했을 때 성취감을 느꼈습니다.
- **기대감**: 식물의 성장을 기대하며 관찰 활동에 적극적으로 참여했습니다.

## 📈 종합 평가
김철수 학생은 이 기간 동안 농장 활동에 매우 적극적으로 참여했으며, 특히 집중력과 관찰력이 뛰어났습니다. 식물의 성장 과정을 꾸준히 관찰하며 자연에 대한 관심과 배려심을 보였습니다.

## 💡 제안사항
- 앞으로도 다양한 농장 활동에 참여하여 자연과의 교감을 더욱 깊게 할 수 있도록 격려해주시기 바랍니다.
- 식물 관찰 활동에서 보인 집중력을 다른 학습 활동에도 적용할 수 있도록 도와주시면 좋겠습니다.
`
          }
        },
        purposeLabel: '학부모 상담용',
        analysisFrom: '2024-03-15',
        analysisTo: '2024-03-25'
      }

      // 임시 리포트를 정규화된 형식으로 변환
      const normalized = normalizeReportRuns([tempReport])
      
      // 최신순 정렬
      normalized.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setReports(normalized)
    } catch (err) {
      console.error(err)
      setError('리포트 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchStudents() {
    setStudentsLoading(true)
    setStudentsError(null)
    try {
      const data = await apiFetch('/api/students?limit=1000')
      console.log("students API response:", data)
      const items = Array.isArray(data?.items) ? data.items : data || []
      setStudents(items)
    } catch (err) {
      console.error(err)
      setStudentsError('학생 목록을 불러오지 못했습니다.')
    } finally {
      setStudentsLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
    fetchStudents()
  }, [currentUser])

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const totalCount = reports.length

  function handleResetFilters() {
    setFilterMode('range')
    setStartDate('')
    setEndDate('')
    setSingleDate('')
    setCategory('all')
    setStudentId('all')
    setPurpose('all')
  }

  async function handleDelete(report) {
    if (!window.confirm(`"${report.templateName}" 리포트를 삭제하시겠습니까?`)) return
    try {
      await apiFetch(`/report-runs/${report.id}`, { method: 'DELETE' })
      setReports(prev => prev.filter(r => r.id !== report.id))
    } catch (err) {
      console.error(err)
      alert('리포트 삭제 중 오류가 발생했습니다.')
    }
  }

  // 🔹 md 리포트 다운로드 (핵심 수정됨)
  async function handleDownloadMd(report) {
    const dateStr = report.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10)
    const fileName = `${report.studentName || 'report'}_${dateStr}.md`

    // 1) 이미 로드된 데이터(params.markdown)가 있는지 확인
    const markdownFromParams = report?.raw?.params?.markdown
    if (markdownFromParams && typeof markdownFromParams === 'string') {
      try {
        const blob = new Blob([markdownFromParams], { type: 'text/markdown;charset=utf-8' })
        const downloadUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(downloadUrl)
        return
      } catch (err) {
        console.error('클라이언트 다운로드 오류:', err)
        // 실패 시 서버 요청으로 폴백
      }
    }

    // 2) 데이터가 없으면 백엔드 다운로드 API 호출
    const path = report.mdDownloadPath
    if (!path) {
      alert('다운로드할 리포트 내용이 없습니다.')
      return
    }

    // 절대 URL이 아니면 API_BASE 붙이기
    const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (res.status === 404) throw new Error('서버에 저장된 마크다운 파일이 없습니다.')
        throw new Error('다운로드 실패')
      }
      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      console.error(err)
      alert(`리포트 다운로드 중 오류가 발생했습니다.\n(${err.message})`)
    }
  }

  async function handleGenerateAiReport() {
    if (filterMode === 'range' && isInvalidRange) {
      alert('시작일이 종료일보다 늦을 수 없습니다.')
      return
    }

    const from = filterMode === 'range' ? startDate || null : singleDate || null
    const to = filterMode === 'range' ? endDate || startDate || null : singleDate || null

    if (!from) {
      alert('날짜를 선택해 주세요.')
      return
    }
    if (!studentId || studentId === 'all') {
      alert('학생을 선택해 주세요.')
      return
    }

    const categoryConfig = REPORT_CATEGORY_CONFIG[category] || REPORT_CATEGORY_CONFIG.all
    setGenerating(true)
    setGenerateError(null)

    try {
      // 데이터 수집 (프로필, 통계, 로그)
      const [studentProfile, summaryStats, activityLogs] = await Promise.all([
        apiFetch(`/api/students/${encodeURIComponent(studentId)}`).catch(() => null),
        apiFetch(`/api/dashboard?studentId=${studentId}&from=${from}&to=${to}`).catch(() => null),
        apiFetch(`/api/log_entries?student_id=${studentId}&from=${from}&to=${to}&limit=50`).catch(() => null)
      ])

      const activitySamples = activityLogs?.items?.map(item => ({
        id: item.id,
        date: item.log_date,
        emotion_tag: item.emotion_tag,
        activity_tags: item.activity_tags,
        log_content: item.log_content,
        related_metrics: item.related_metrics,
      })) || []

      const tone =
        purpose === 'parent' ? '부드럽고 공감적인 학부모 상담용 톤' :
        purpose === 'school' ? '학교 제출용 공식적인 톤' : '교사가 참고하기 좋은 중립적인 톤'

      const aiPayload = {
        student_profile: studentProfile,
        date_range: { from, to },
        summary_stats: summaryStats,
        activity_samples: activitySamples,
        report_options: {
          purpose,
          tone,
          category_code: categoryConfig.code,
          category_label: categoryConfig.label,
          student_id: studentId,
          filter_mode: filterMode,
        },
      }

      // 1. Gemini로 리포트 생성
      const result = await generateReportWithGemini(aiPayload)
      const markdown = result.markdown || result.text || ''
      if (!markdown) throw new Error('AI가 리포트 내용을 반환하지 않았습니다.')

      // 2. DB 저장
      const studentName = studentProfile?.name || students.find(s => s.id === studentId)?.name || '학생'
      const dateLabel = from && to && from !== to ? `${from} ~ ${to}` : from || ''
      const categoryLabel = categoryConfig.label || '종합 리포트'
      const title = `${studentName} ${dateLabel} ${categoryLabel}`.trim()

      const reportParams = {
        title,
        from,
        to,
        filter_mode: filterMode,
        category_code: categoryConfig.code,
        category_label: categoryConfig.label,
        purpose,
        student_id: studentId,
        student_name: studentName,
        markdown, // 🚨 핵심: AI가 생성한 마크다운을 여기에 포함
        created_by_user_id: currentUser?.id,
        created_by_name: currentUser?.display_name || currentUser?.email,
      }

      await apiFetch('/report-runs', {
        method: 'POST',
        body: {
          template_code: 'ai_markdown',
          requested_by: currentUser?.id,
          params: reportParams, // params 내부에 markdown 포함됨
        },
      })

      // 목록 갱신
      await fetchReports()
      alert('AI 리포트가 성공적으로 생성되었습니다.')
    } catch (err) {
      console.error(err)
      setGenerateError('AI 리포트 생성 중 오류가 발생했습니다.')
      alert('AI 리포트 생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Layout>
      <div className="page-container">
        <header className="page-header">
          <div>
            <h1 className="page-title">AI 리포트</h1>
            <p className="page-subtitle">
              로그인한 사용자가 생성한 리포트들을 한눈에 보고, 새로운 AI 리포트를 제작해 보세요.
            </p>
          </div>
        </header>

        <div className="page-content report-layout">
          {/* 필터 섹션 */}
          <section className="report-filter-section">
            <div className="card report-filter-card">
              <form onSubmit={e => e.preventDefault()}>
                <div className="report-filter-title-row">
                  <div className="filter-icon">🧾</div>
                  <div>
                    <div className="card-title">리포트 제작 설정</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      날짜, 카테고리, 학생을 선택하여 AI 리포트를 생성합니다.
                    </div>
                  </div>
                </div>

                <div className="report-filter-block">
                  <div className="filter-label-row">
                    <span className="filter-label">날짜 필터 방식</span>
                  </div>
                  <div className="filter-radio-row">
                    <button
                      type="button"
                      className={`filter-toggle ${filterMode === 'range' ? 'active' : ''}`}
                      onClick={() => setFilterMode('range')}
                    >
                      날짜 범위
                    </button>
                    <button
                      type="button"
                      className={`filter-toggle ${filterMode === 'single' ? 'active' : ''}`}
                      onClick={() => setFilterMode('single')}
                    >
                      특정 날짜
                    </button>
                  </div>
                </div>

                <div className="report-filter-grid">
                  {filterMode === 'range' ? (
                    <>
                      <div className="filter-field">
                        <label>시작 날짜</label>
                        <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} />
                      </div>
                      <div className="filter-field">
                        <label>종료 날짜</label>
                        <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
                      </div>
                    </>
                  ) : (
                    <div className="filter-field">
                      <label>날짜</label>
                      <input type="date" value={singleDate} onChange={e => setSingleDate(e.target.value)} />
                    </div>
                  )}

                  <div className="filter-field">
                    <label>카테고리</label>
                    <select value={category} onChange={e => setCategory(e.target.value)} className="report-select">
                      <option value="all">전체</option>
                      <option value="full">전체 리포트</option>
                      <option value="emotion">감정 변화</option>
                      <option value="activity_ratio">활동 비율 변화</option>
                      <option value="ability_growth">능력 성장 곡선</option>
                    </select>
                  </div>

                  <div className="filter-field">
                    <label>학생</label>
                    <select value={studentId} onChange={e => setStudentId(e.target.value)} className="report-select">
                      <option value="all">전체</option>
                      {Array.isArray(students) && students.length > 0 &&
                        students.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-field">
                    <label>용도</label>
                    <select value={purpose} onChange={e => setPurpose(e.target.value)} className="report-select">
                      <option value="all">전체</option>
                      <option value="parent">학부모 상담용</option>
                      <option value="school">학교 제출용</option>
                    </select>
                  </div>
                </div>

                <div className="report-filter-footer">
                  <span className="muted">현재 리포트 수: <strong>{totalCount}</strong>개</span>
                  <div className="report-filter-actions">
                    <button 
                      type="button" 
                      className="btn secondary report-reset-btn" 
                      onClick={handleResetFilters}
                      style={{
                        border: '1px solid var(--accent-green)',
                        color: 'var(--accent-green-dark)',
                        background: 'transparent',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
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
                      필터 초기화
                    </button>
                    <button
                      type="button"
                      className="btn secondary report-ai-btn"
                      onClick={handleGenerateAiReport}
                      disabled={generating}
                      style={{
                        border: '1px solid var(--accent-green)',
                        color: generating ? 'var(--text-gray)' : 'var(--accent-green-dark)',
                        background: generating ? '#f5f5f5' : 'transparent',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: generating ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        opacity: generating ? 0.7 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!generating) {
                          e.target.style.background = '#f0f7ed'
                          e.target.style.borderColor = 'var(--accent-green-dark)'
                          e.target.style.color = 'var(--accent-green-dark)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!generating) {
                          e.target.style.background = 'transparent'
                          e.target.style.borderColor = 'var(--accent-green)'
                          e.target.style.color = 'var(--accent-green-dark)'
                        }
                      }}
                    >
                      {generating ? '생성 중...' : 'AI 리포트 생성(.md)'}
                    </button>
                  </div>
                </div>
                {isInvalidRange && <div className="error" style={{ fontSize: 12, marginTop: 4 }}>날짜 범위를 확인해주세요.</div>}
                {generateError && <div className="error" style={{ marginTop: 4 }}>{generateError}</div>}
              </form>
            </div>
          </section>

          {/* 목록 섹션 */}
          <section className="report-list-section">
            <div className="card report-list-card">
              <div className="card-header-row">
                <div className="card-title">리포트 목록</div>
              </div>
              <p></p>

              {loading ? (
                <div className="card-body"><div className="loading-text">Loading...</div></div>
              ) : error ? (
                <div className="card-body"><div className="error">{error}</div></div>
              ) : totalCount === 0 ? (
                <div className="card-body"><div className="empty-state">생성된 리포트가 없습니다.</div></div>
              ) : (
                <div className="report-list">
                  {reports.map(report => {
                    const remaining = getRemainingInfo(report, nowTs)
                    const rangeText = report.analysisFrom || report.analysisTo ? `${report.analysisFrom || '?'} ~ ${report.analysisTo || '?'}` : null
                    return (
                      <article key={report.id} className={`report-card ${remaining.expired ? 'report-card-expired' : ''}`}>
                        <div className="report-card-main">
                          <div className="report-card-header">
                            <div className="report-card-title">
                              <span className="report-card-student">🔗 {report.studentName}</span>
                              {report.purposeLabel && <span className="report-chip report-chip-purpose">{report.purposeLabel}</span>}
                              <span className={`report-chip report-chip-state ${remaining.expired ? 'expired' : ''}`}>
                                {remaining.expired ? '만료됨' : '진행 중'}
                              </span>
                            </div>
                          </div>
                          {rangeText && <div className="report-card-meta-row">분석 기간: {rangeText}</div>}
                          <div className="report-card-remaining-row">
                            <span className="report-remaining-icon">⏱</span>
                            <span className={`report-remaining-text ${remaining.expired ? 'danger' : ''}`}>
                              남은 시간: {remaining.label}
                            </span>
                          </div>
                        </div>
                        <div className="report-card-actions">
                          <button 
                            type="button" 
                            className="btn secondary-outline report-btn" 
                            onClick={() => handleDownloadMd(report)}
                            style={{
                              border: '1px solid var(--accent-green)',
                              color: '#fffdf8',
                              background: 'var(--accent-green)',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              fontSize: '14px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = 'var(--accent-green-dark)'
                              e.target.style.borderColor = 'var(--accent-green-dark)'
                              e.target.style.transform = 'translateY(-1px)'
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = 'var(--accent-green)'
                              e.target.style.borderColor = 'var(--accent-green)'
                              e.target.style.transform = 'translateY(0)'
                            }}
                          >
                            다운로드
                          </button>
                          <button 
                            type="button" 
                            className="btn danger-outline report-btn" 
                            onClick={() => handleDelete(report)}
                            style={{
                              border: '1px solid #d97757',
                              color: '#fffdf8',
                              background: '#d97757',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              fontSize: '14px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = '#c2654a'
                              e.target.style.borderColor = '#c2654a'
                              e.target.style.transform = 'translateY(-1px)'
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = '#d97757'
                              e.target.style.borderColor = '#d97757'
                              e.target.style.transform = 'translateY(0)'
                            }}
                          >
                            삭제
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}

