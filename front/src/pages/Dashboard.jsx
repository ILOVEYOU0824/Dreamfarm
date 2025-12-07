// src/pages/Dashboard.jsx
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import Layout from '../components/Layout'
import AIChat from '../components/AIChat'
import './Dashboard.css'
import { apiFetch } from '../lib/api.js'
import harvestIcon from '../assets/harvest_icon.png'
import sowingIcon from '../assets/sowing_icon.png'
import shovelIcon from '../assets/shovel_icon.png'
import observeIcon from '../assets/observe_icon.png'
import etcIcon from '../assets/etc_icon.png'
import sproutIcon from '../assets/sprout_icon.png'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

export default function Dashboard() {
  // -----------------------------
  // 1) 학생 데이터 상태
  // -----------------------------
  const [students, setStudents] = useState([])
  const [activeTab, setActiveTab] = useState('emotion-keywords')
  const [activeSection, setActiveSection] = useState('emotion-keywords') // 사이드바 섹션 관리
  const [positiveRate, setPositiveRate] = useState(89)
  const [avgScore, setAvgScore] = useState(85)

  // 학생 분석 필터 상태
  const [searchName, setSearchName] = useState('')

  // 기간 선택 및 조회 상태 (현재 프로젝트 기능 유지)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedStudents, setSelectedStudents] = useState([]) // 여러 학생 선택 (학생 ID 배열)
  const [studentNamesMap, setStudentNamesMap] = useState({}) // 학생 ID -> 이름 매핑
  const [currentPage, setCurrentPage] = useState(0) // 현재 페이지 (8개씩 표시)
  const [filteredStudents, setFilteredStudents] = useState([]) // 필터링된 학생 ID 배열
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [metrics, setMetrics] = useState({ recordCount: 0 })
  const [studentRecordCounts, setStudentRecordCounts] = useState({}) // 각 학생별 기록수 { studentId: count }
  const [activitySeries, setActivitySeries] = useState([])
  const [activityAbilityList, setActivityAbilityList] = useState([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true) // 초기 로딩 상태 (페이지 첫 진입 시에만 사용)
  const [isDataLoading, setIsDataLoading] = useState(false) // 데이터 로딩 상태 (학생 선택, 날짜 변경 시 사용)
  const [user, setUser] = useState({ name: '선생님' })
  const [activityAbilityAnalysis, setActivityAbilityAnalysis] = useState([]) // 활동별 능력 분석 데이터
  const [activityDetails, setActivityDetails] = useState([]) // 활동 상세 내역 데이터
  const [selectedEmotionKeywords, setSelectedEmotionKeywords] = useState([]) // 개별분석에 표시할 선택한 감정 키워드
  const [activityEmotionAiComment, setActivityEmotionAiComment] = useState('') // 활동별 감정 분석 AI 코멘트
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false) // AI 분석 중 상태
  const [datesWithRecords, setDatesWithRecords] = useState(new Set()) // 기록이 있는 날짜 목록 (YYYY-MM-DD 형식)
  
  // API 요청 취소를 위한 AbortController 관리
  const abortControllerRef = useRef(null)
  const aiAbortControllerRef = useRef(null)
  // 기록이 있는 날짜를 Date 객체 배열로 변환 (react-datepicker용)
  const datesWithRecordsArray = useMemo(() => {
    return Array.from(datesWithRecords).map(dateStr => {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    })
  }, [datesWithRecords])

  // 학생 데이터 불러오기 함수 (재사용 가능하도록 분리)
  const loadStudents = useCallback(async () => {
    try {
      // 백엔드 API에서 학생 목록 가져오기 (우선)
      let apiStudents = []
      try {
        const res = await apiFetch('/api/students?limit=1000')
        const items = Array.isArray(res.items) ? res.items : (Array.isArray(res) ? res : [])
        apiStudents = items.map(item => ({
          id: String(item.id ?? item.student_id ?? item.uuid),
          name: item.name ?? item.display_name ?? item.student_name ?? '이름 없음',
          nickname: item.alias || item.nickname || '',
          group_name: item.group_name || ''
        })).filter(item => item.id)
        
        console.log('[대시보드] API에서 가져온 학생 수:', apiStudents.length)
      } catch (err) {
        console.log('[대시보드] API에서 학생 데이터 로드 실패:', err)
      }

      // API 데이터만 사용 (배포 환경에서는 API가 source of truth)
      setStudents(apiStudents)
      
      // 학생 목록만 설정 (자동 선택 및 데이터 로드하지 않음)
      if (apiStudents.length > 0) {
        // 학생 이름 매핑 생성
        const namesMap = {}
        apiStudents.forEach(s => {
          namesMap[s.id] = s.name || s.student_name || s.display_name || '학생'
        })
        setStudentNamesMap(namesMap)
        
        // 필터링된 목록은 전체 학생으로 설정 (학생 카드 표시용)
        setFilteredStudents(apiStudents.map(s => s.id))
        
        // 첫 페이지로 초기화
        setCurrentPage(0)
        
        // 학생은 자동 선택하지 않음 (사용자가 카드를 클릭할 때만 선택)
        // 모든 학생의 기록수는 useEffect에서 로드 (함수 선언 순서 문제 방지)
      }
    } catch (err) {
      console.error('학생 데이터 로드 실패:', err)
    }
  }, [])

  // react-datepicker에서 특정 날짜에 클래스를 추가하는 함수
  const dayClassName = useCallback((date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return datesWithRecords.has(dateStr) ? 'has-record' : ''
  }, [datesWithRecords])
  
  // 학생 데이터 불러오기 (초기 로드)
  useEffect(() => {
    setInitialLoading(true)
    const userData = JSON.parse(localStorage.getItem('user') || '{}')
    if (userData.name) setUser(userData)

    // 학생 목록 로드
    loadStudents().then(() => {
      // 학생 목록 로드 완료 후 모든 학생의 기록수 미리 로드
      // students 상태가 업데이트되면 별도 useEffect에서 처리
    })
    
    // 활동 상세 내역 데이터는 대시보드 API에서 가져오므로 여기서는 제거
    // (loadStudentDashboardData에서 처리됨)
    
    // 예시 데이터 제거 - 실제 데이터만 사용
    setActivityAbilityAnalysis([])
    setInitialLoading(false)
  }, [])
  
  // 학생 목록이 로드되면 모든 학생의 기록수 즉시 로드
  useEffect(() => {
    if (students.length > 0 && Object.keys(studentRecordCounts).length === 0) {
      console.log('[대시보드] 초기 로드: 모든 학생 기록수 로드 시작')
      const studentIds = students.map(s => s.id)
      loadAllStudentRecordCounts(studentIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students]) // studentRecordCounts는 의존성에서 제외 (무한 루프 방지)

  // 페이지 포커스 시 학생 목록 갱신 (학생 추가/업로드 후 자동 반영)
  // 디바운싱 적용하여 너무 자주 호출되지 않도록
  useEffect(() => {
    let timeoutId = null
    
    const handleFocus = () => {
      // 이미 타이머가 있으면 취소
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      // 1초 후에 실행 (디바운싱)
      timeoutId = setTimeout(() => {
        console.log('[대시보드] 페이지 포커스 감지, 학생 목록 갱신')
        loadStudents()
      }, 1000)
    }

    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [loadStudents])

  // -----------------------------
  // 2) 감정 키워드 데이터 상태
  // -----------------------------
  // 예시 감정 키워드 데이터 (이미지와 동일한 형식)
  const exampleEmotionKeywords = [
    { keyword: '행복한', count: 3 },
    { keyword: '뿌듯한', count: 2 },
    { keyword: '즐거운', count: 2 },
    { keyword: '신나는', count: 2 },
    { keyword: '활기찬', count: 2 },
    { keyword: '만족스런', count: 2 },
    { keyword: '기쁜', count: 1 },
    { keyword: '황홀한', count: 1 },
    { keyword: '감격스런', count: 1 },
    { keyword: '흐뭇한', count: 1 },
    { keyword: '편안한', count: 1 },
    { keyword: '여유로운', count: 1 },
    { keyword: '따뜻한', count: 1 },
    { keyword: '푸근한', count: 1 },
  ]

  // 활동별 감정 키워드 빈도 예시 데이터
  const exampleActivityEmotionData = [
    {
      type: 'harvest',
      label: '수확',
      icon: harvestIcon,
      description: '결실의 기쁨을 느끼는 순간',
      emotions: [
        { keyword: '뿌듯한', count: 2 },
        { keyword: '즐거운', count: 2 },
        { keyword: '행복한', count: 1 },
      ]
    },
    {
      type: 'sow',
      label: '파종',
      icon: sowingIcon,
      description: '새로운 시작의 설렘',
      emotions: [
        { keyword: '황홀한', count: 1 },
        { keyword: '감격스런', count: 1 },
        { keyword: '흐뭇한', count: 1 },
      ]
    },
    {
      type: 'manage',
      label: '관리',
      icon: shovelIcon,
      description: '정성스럽게 돌보는 시간',
      emotions: [
        { keyword: '행복한', count: 2 },
        { keyword: '신나는', count: 1 },
        { keyword: '활기찬', count: 1 },
      ]
    },
    {
      type: 'observe',
      label: '관찰',
      icon: observeIcon,
      description: '자연의 변화를 발견하는 순간',
      emotions: []
    },
    {
      type: 'other',
      label: '기타',
      icon: etcIcon,
      description: '다양한 활동의 기록',
      emotions: [
        { keyword: '편안한', count: 1 },
        { keyword: '여유로운', count: 1 },
      ]
    },
  ]

  const [emotionKeywords, setEmotionKeywords] = useState([]) // 예시 데이터 제거
  // 활동별 감정 데이터 초기값: 구조만 유지하고 emotions는 빈 배열
  const [activityEmotionData, setActivityEmotionData] = useState(() => {
    return exampleActivityEmotionData.map(activity => ({
      ...activity,
      emotions: [] // 초기값은 빈 배열
    }))
  })

  // 활동 유형별 통계를 위한 state 추가
  const [activityTypeStats, setActivityTypeStats] = useState([])

  // 활동 유형별 통계 계산 (log_entries의 activity_tags 기반)
  const calculateActivityTypeStats = (logs) => {
    if (!Array.isArray(logs) || logs.length === 0) {
      return exampleActivityEmotionData.map(activity => ({
        type: activity.type,
        label: activity.label,
        icon: activity.icon,
        count: 0,
        description: activity.description,
        percentage: 0
      }))
    }

    // 활동 유형별 카운트
    const activityTypeCounts = {
      harvest: 0,
      sow: 0,
      manage: 0,
      observe: 0,
      other: 0
    }

    // 각 log_entry의 activity_tags를 기반으로 활동 유형별 횟수 집계
    logs.forEach(log => {
      const activityTags = Array.isArray(log.activity_tags) ? log.activity_tags : []
      
      if (activityTags.length > 0) {
        // 각 활동 태그를 활동 유형으로 분류
        activityTags.forEach(activityName => {
          const activityLower = String(activityName).toLowerCase()
          
          if (activityLower.includes('수확') || activityLower.includes('harvest')) {
            activityTypeCounts.harvest += 1
          } else if (activityLower.includes('파종') || activityLower.includes('sowing') || activityLower.includes('심기')) {
            activityTypeCounts.sow += 1
          } else if (activityLower.includes('관리') || activityLower.includes('manage') || activityLower.includes('물주')) {
            activityTypeCounts.manage += 1
          } else if (activityLower.includes('관찰') || activityLower.includes('observe') || activityLower.includes('보기')) {
            activityTypeCounts.observe += 1
          } else {
            activityTypeCounts.other += 1
          }
        })
      } else {
        // 활동 태그가 없으면 '기타'로 분류
        activityTypeCounts.other += 1
      }
    })

    // 총 활동 횟수 계산
    const totalCount = Object.values(activityTypeCounts).reduce((sum, count) => sum + count, 0)

    // exampleActivityEmotionData를 기반으로 통계 생성
    const stats = exampleActivityEmotionData.map(activity => {
      const count = activityTypeCounts[activity.type] || 0
      return {
        type: activity.type,
        label: activity.label,
        icon: activity.icon,
        count: count,
        description: activity.description,
        percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
      }
    })

    return stats
  }

  // 활동 능력 통계 계산 (매우 우수, 우수, 도전적)
  // 개별분석 레이아웃의 activityAbilityAnalysis 데이터를 사용하여 계산
  const activityAbilityStats = useMemo(() => {
    // activityAbilityAnalysis 데이터가 없으면 빈 결과 반환
    if (!Array.isArray(activityAbilityAnalysis) || activityAbilityAnalysis.length === 0) {
      return {
        excellent: [],
        good: [],
        challenging: []
      }
    }
    
    // 각 활동을 abilityDistribution.good 퍼센테이지가 높은 순서로 정렬
    const sortedActivities = [...activityAbilityAnalysis].sort((a, b) => {
      const goodA = a.abilityDistribution?.good || 0
      const goodB = b.abilityDistribution?.good || 0
      return goodB - goodA // 내림차순 정렬
    })
    
    // performanceLevel에 따라 분류
    const excellent = []  // 매우 우수 활동
    const good = []        // 우수 활동
    const challenging = []  // 도전적 활동
    
    sortedActivities.forEach(activity => {
      const performanceLevel = activity.performanceLevel || ''
      const activityData = {
        activity: activity.activity || '활동',
        date: activity.date || '',
        goodPercentage: activity.abilityDistribution?.good || 0
      }
      
      if (performanceLevel.includes('매우 우수') || performanceLevel === '매우 우수') {
        excellent.push(activityData)
      } else if (performanceLevel.includes('우수') || performanceLevel === '우수') {
        good.push(activityData)
      } else if (performanceLevel.includes('도전') || performanceLevel.includes('도전적') || performanceLevel === '도전적') {
        challenging.push(activityData)
      }
    })
    
    // 각 카테고리별로 TOP3만 추출
    return {
      excellent: excellent.slice(0, 3),
      good: good.slice(0, 3),
      challenging: challenging.slice(0, 3)
    }
  }, [activityAbilityAnalysis])

  // 사이드바 하위 메뉴 클릭 이벤트 리스너
  useEffect(() => {
    const handleDashboardSection = (event) => {
      const section = event.detail
      setActiveSection(section)
      // localStorage에 현재 섹션 저장 (사이드바 활성화 상태 관리용)
      localStorage.setItem('dashboard-active-section', section)
      if (section === 'emotion-keywords') {
        setActiveTab('emotion-keywords')
      } else if (section === 'activity-types') {
        setActiveTab('activity-abilities')
      } else if (section === 'activity-abilities') {
        setActiveTab('activity-types')
      }
    }

    window.addEventListener('dashboard-section', handleDashboardSection)
    return () => {
      window.removeEventListener('dashboard-section', handleDashboardSection)
    }
  }, [])

  // activeSection 변경 시 localStorage에 저장
  useEffect(() => {
    if (activeSection) {
      localStorage.setItem('dashboard-active-section', activeSection)
    }
  }, [activeSection])

  // 전체 분석 요약 생성 함수
  const generateAnalysisSummary = () => {
    if (emotionKeywords.length === 0) {
      return '데이터가 없어 분석 요약을 생성할 수 없습니다.'
    }
    
    // 가장 많이 나타난 감정 찾기
    const topEmotion = emotionKeywords.sort((a, b) => b.count - a.count)[0]
    const totalCount = emotionKeywords.reduce((sum, item) => sum + item.count, 0)
    
    // 선택된 학생 정보 (현재는 첫 번째 학생 또는 선택된 학생)
    const currentStudent = students.find(s => s.id === selectedStudentId) || students[0]
    const studentDisplayName = currentStudent 
      ? (currentStudent.nickname ? `${currentStudent.nickname}(${currentStudent.name})` : currentStudent.name)
      : '학생'
    
    return `${studentDisplayName}은(는) 선택한 기간 동안 총 ${totalCount}개의 감정 키워드를 경험했습니다. 가장 많이 나타난 감정은 "${topEmotion.keyword}" (${topEmotion.count}회)입니다.`
  }

  // 활동별 감정 분석 요약 생성 함수 (DB 데이터 기반)
  const generateActivityEmotionSummary = () => {
    // 선택된 학생 정보
    const currentStudent = students.find(s => s.id === selectedStudentId) || students[0]
    const studentDisplayName = currentStudent 
      ? (currentStudent.nickname ? `${currentStudent.nickname}(${currentStudent.name})` : currentStudent.name)
      : '학생'

    // 각 활동별로 감정이 있는 활동만 필터링
    const activitiesWithEmotions = activityEmotionData.filter(activity => activity.emotions.length > 0)

    if (activitiesWithEmotions.length === 0) {
      return `${studentDisplayName}은(는) 선택한 기간 동안 활동 기록이 없습니다.`
    }

    // 각 활동별로 가장 높은 감정 찾기
    const activitySummaries = activitiesWithEmotions.map(activity => {
      const topEmotion = activity.emotions.sort((a, b) => b.count - a.count)[0]
      const totalCount = activity.emotions.reduce((sum, e) => sum + e.count, 0)
      const avgScore = totalCount > 0 ? ((totalCount / activity.emotions.length) * 10).toFixed(1) : '0.0'
      
      return {
        type: activity.type,
        label: activity.label,
        topEmotion: topEmotion.keyword,
        avgScore: avgScore,
        totalCount: totalCount
      }
    })

    // 수확 활동이 있으면 수확 활동을 중심으로 요약
    const harvestActivity = activitySummaries.find(a => a.type === 'harvest')
    if (harvestActivity) {
      let summary = `${studentDisplayName}은(는) `
      summary += `<span style="color: #ef4444; font-weight: 600;">수확 활동</span>에서 가장 높은 긍정 감정(평균 ${harvestActivity.avgScore}/10)을 경험했으며, 특히 "<span style="font-weight: 600;">${harvestActivity.topEmotion}</span>" 감정이 강하게 나타났습니다. `
      
      // 다른 활동들 추가
      const otherActivities = activitySummaries.filter(a => a.type !== 'harvest')
      if (otherActivities.length > 0) {
        otherActivities.forEach((activity, idx) => {
          const colorMap = {
            'sow': '#22c55e',
            'manage': '#3b82f6',
            'observe': '#a855f7',
            'other': '#9ca3af'
          }
          const color = colorMap[activity.type] || '#9ca3af'
          
          if (idx === 0) {
            summary += `<span style="color: ${color}; font-weight: 600;">${activity.label} 활동</span>에서는 `
          } else {
            summary += `, <span style="color: ${color}; font-weight: 600;">${activity.label} 활동</span>에서는 `
          }
          
          const emotionMap = {
            'sow': '미래에 대한 기대감이',
            'manage': '안정감과 여유를',
            'observe': '호기심과 탐구심이',
            'other': '다양한 감정이'
          }
          summary += emotionMap[activity.type] || '다양한 감정이'
        })
        summary += ' 두드러졌습니다.'
      }
      
      return summary
    }

    // 수확 활동이 없으면 첫 번째 활동을 중심으로 요약
    const firstActivity = activitySummaries[0]
    return `${studentDisplayName}은(는) <span style="color: #ef4444; font-weight: 600;">${firstActivity.label} 활동</span>에서 "<span style="font-weight: 600;">${firstActivity.topEmotion}</span>" 감정이 가장 많이 나타났습니다.`
  }

  // activityDetails를 기반으로 능력 분석 데이터 생성 (임시)
  function generateAbilityAnalysisFromDetails(activityDetails) {
    if (!Array.isArray(activityDetails) || activityDetails.length === 0) return []
    
    // 활동별로 그룹화
    const activityMap = {}
    activityDetails.forEach(detail => {
      const activityName = detail.activity || detail.category || '활동'
      if (!activityMap[activityName]) {
        activityMap[activityName] = {
          activity: activityName,
          date: detail.date || '',
          details: []
        }
      }
      activityMap[activityName].details.push(detail)
    })
    
    // 각 활동별로 능력 분석 생성
    return Object.values(activityMap).map((activity, index) => {
      // 기본값 설정 (실제로는 AI 분석 결과를 사용해야 함)
      const detailCount = activity.details.length
      const hasPositiveEmotion = activity.details.some(d => {
        const emotion = String(d.emotion || '').toLowerCase()
        return emotion.includes('기쁨') || emotion.includes('행복') || emotion.includes('즐거움') || emotion.includes('뿌듯')
      })
      
      // 수행 수준 판단 (간단한 로직)
      let performanceLevel = '보통'
      let abilityDistribution = { difficult: 20, normal: 50, good: 30 }
      
      if (hasPositiveEmotion && detailCount >= 2) {
        performanceLevel = '매우 우수'
        abilityDistribution = { difficult: 3, normal: 11, good: 86 }
      } else if (hasPositiveEmotion) {
        performanceLevel = '우수'
        abilityDistribution = { difficult: 10, normal: 30, good: 60 }
      } else if (detailCount >= 3) {
        performanceLevel = '우수'
        abilityDistribution = { difficult: 15, normal: 35, good: 50 }
      }
      
      // 주요 능력 추론 (활동 유형에 따라)
      const activityLower = activity.activity.toLowerCase()
      let keyAbilities = []
      if (activityLower.includes('수확') || activityLower.includes('harvest')) {
        keyAbilities = ['협동', '체력', '집중력']
      } else if (activityLower.includes('파종') || activityLower.includes('sowing') || activityLower.includes('심기')) {
        keyAbilities = ['섬세함', '집중력', '인내']
      } else if (activityLower.includes('관리') || activityLower.includes('manage') || activityLower.includes('물주')) {
        keyAbilities = ['책임감', '문제해결', '인내']
      } else if (activityLower.includes('관찰') || activityLower.includes('observe') || activityLower.includes('보기')) {
        keyAbilities = ['집중력', '관찰력', '호기심']
      } else {
        keyAbilities = ['협동', '집중력']
      }
      
      return {
        id: `ability_${index}_${Date.now()}`,
        activity: activity.activity,
        date: activity.date,
        performanceLevel,
        abilityDistribution,
        keyAbilities
      }
    })
  }

  // 모든 학생의 기록수 로드 함수 (최적화: 한 번의 API 호출)
  const loadAllStudentRecordCounts = useCallback(async (studentIds) => {
    if (!studentIds || studentIds.length === 0) return
    
    try {
      console.log('[대시보드] 모든 학생 기록수 로드 시작:', studentIds.length, '명')
      
      // 모든 학생의 기록수를 한 번에 가져오기
      const recordCounts = await apiFetch('/api/students/record-counts')
      
      // 결과를 state에 반영
      console.log('[대시보드] 받은 기록수 데이터:', recordCounts)
      console.log('[대시보드] 학생 ID 목록:', studentIds)
      
      setStudentRecordCounts(prev => {
        const updated = { ...prev }
        studentIds.forEach(studentId => {
          const count = recordCounts[studentId] || 0
          updated[studentId] = count
          console.log(`[대시보드] 학생 ${studentId} 기록수: ${count}`)
        })
        console.log('[대시보드] 업데이트된 기록수:', updated)
        return updated
      })
      
      console.log('[대시보드] 모든 학생 기록수 로드 완료:', recordCounts)
    } catch (err) {
      console.error('[대시보드] 모든 학생 기록수 로드 실패:', err)
      // 실패 시 빈 객체로 설정
      setStudentRecordCounts(prev => {
        const updated = { ...prev }
        studentIds.forEach(studentId => {
          updated[studentId] = 0
        })
        return updated
      })
    }
  }, [])

  // AbortController를 지원하는 fetch 헬퍼 함수
  const fetchWithAbort = useCallback(async (url, signal, options = {}) => {
    // signal이 이미 abort되었는지 확인
    if (signal.aborted) {
      const err = new Error('Request aborted')
      err.name = 'AbortError'
      throw err
    }
    
    const token = localStorage.getItem('token')
    const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '')
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? url : '/' + url}`
    
    const headers = { ...(options.headers || {}) }
    if (!headers['Content-Type'] && options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json'
    }
    if (token) headers.Authorization = `Bearer ${token}`
    
    const fetchOptions = {
      ...options,
      signal,
      headers
    }
    
    // body가 객체면 JSON 문자열로 변환
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      fetchOptions.body = JSON.stringify(options.body)
    }
    
    try {
      const res = await fetch(fullUrl, fetchOptions)
      
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
    } catch (err) {
      // AbortError인 경우 그대로 전달
      if (err.name === 'AbortError' || signal.aborted) {
        const abortErr = new Error('Request aborted')
        abortErr.name = 'AbortError'
        throw abortErr
      }
      throw err
    }
  }, [])

  // 활동별 감정 분석 AI 요약 생성 함수 (버튼 클릭 시 호출)
  const handleGenerateAiSummary = useCallback(async () => {
    if (!selectedStudentId || activityEmotionData.length === 0) {
      return
    }
    
    // 이전 AI 분석 취소
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort()
    }
    
    // 새로운 AI AbortController 생성
    const aiAbortController = new AbortController()
    aiAbortControllerRef.current = aiAbortController
    
    try {
      setIsAiAnalyzing(true)
      const currentStudent = students.find(s => s.id === selectedStudentId) || students[0]
      const studentName = currentStudent ? (currentStudent.nickname || currentStudent.name) : '학생'
      
      // 활동별 감정 데이터를 AI에 전달
      const activityEmotionSummary = activityEmotionData
        .filter(activity => activity.emotions.length > 0)
        .map(activity => ({
          type: activity.label,
          emotions: activity.emotions.map(e => `${e.keyword}(${e.count}회)`).join(', ')
        }))
      
      if (activityEmotionSummary.length > 0) {
        const aiPrompt = `${studentName} 학생의 활동별 감정 분석 결과입니다:\n\n${activityEmotionSummary.map(a => `- ${a.type}: ${a.emotions}`).join('\n')}\n\n위 데이터를 바탕으로 ${studentName} 학생의 감정 상태에 대한 전문적인 코멘트를 2-3문장으로 작성해주세요.`
        
        const aiRes = await fetchWithAbort('/api/ai/chat', aiAbortController.signal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: aiPrompt,
            context: {
              selectedStudentId,
              selectedStudentName: studentName,
              startDate,
              endDate
            }
          })
        })
        
        // 요청이 취소되었는지 확인
        if (aiAbortController.signal.aborted) {
          return
        }
        
        if (aiRes && aiRes.message) {
          setActivityEmotionAiComment(aiRes.message)
        } else {
          setActivityEmotionAiComment('')
        }
      } else {
        setActivityEmotionAiComment('')
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[대시보드] AI 분석 취소됨')
        return
      }
      console.error('[대시보드] 활동별 감정 분석 AI 코멘트 생성 실패:', err)
      setActivityEmotionAiComment('')
      alert('AI 분석 생성에 실패했습니다. 다시 시도해주세요.')
    } finally {
      if (!aiAbortController.signal.aborted) {
        setIsAiAnalyzing(false)
      }
    }
  }, [selectedStudentId, activityEmotionData, students, startDate, endDate, fetchWithAbort])

  // 학생별 대시보드 데이터 로드 (감정 키워드, 활동 유형, 활동별 능력 등)
  useEffect(() => {
    async function loadStudentDashboardData() {
      // 학생이 선택되지 않았으면 API 호출하지 않음
      if (!selectedStudentId) {
        console.log('[대시보드] 학생이 선택되지 않아 데이터 로드 스킵')
        // 학생이 선택되지 않았을 때 모든 데이터 초기화
        setEmotionKeywords([])
        setSelectedEmotionKeywords([])
        setActivityEmotionData(exampleActivityEmotionData.map(activity => ({
          ...activity,
          emotions: []
        })))
        setActivityTypeStats(exampleActivityEmotionData.map(activity => ({
          type: activity.type,
          label: activity.label,
          icon: activity.icon,
          count: 0,
          description: activity.description,
          percentage: 0
        })))
        setActivityAbilityAnalysis([])
        setActivityDetails([])
        setActivityEmotionAiComment('')
        setInitialLoading(false)
        return
      }
      
      try {
        // 이전 요청 취소
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }
        if (aiAbortControllerRef.current) {
          aiAbortControllerRef.current.abort()
          setIsAiAnalyzing(false)
        }
        
        // 새로운 AbortController 생성
        const abortController = new AbortController()
        abortControllerRef.current = abortController
        
        // 초기 로드가 완료된 후에는 로딩 화면을 표시하지 않음 (데이터만 업데이트)
        // initialLoading이 false가 된 후에는 다시 true로 설정하지 않음
        if (!initialLoading) {
          // 초기 로드 완료 후에는 로딩 화면 없이 데이터만 업데이트
          setIsDataLoading(true)
        }
        // initialLoading이 true인 경우는 초기 로드 중이므로 그대로 유지
        console.log('[대시보드] 학생별 데이터 로드 시작:', selectedStudentId)
        
        // 기간 필터 적용 (startDate, endDate가 있으면 사용)
        // skipAiAnalysis=true로 설정하여 빠른 응답 (AI 분석은 나중에 별도 처리)
        let apiUrl = `/api/dashboard?studentId=${selectedStudentId}&skipAiAnalysis=true`
        if (startDate) {
          apiUrl += `&from=${startDate}`
        }
        if (endDate) {
          apiUrl += `&to=${endDate}`
        }
        
        const logsUrl = `/api/log_entries?student_id=${selectedStudentId}${startDate ? `&from=${startDate}` : ''}${endDate ? `&to=${endDate}` : ''}&status=success`
        
        // 두 API를 병렬로 호출하여 속도 개선 (AbortController 지원)
        console.log('[대시보드] 병렬 API 호출 시작')
        let res, logsRes
        try {
          [res, logsRes] = await Promise.all([
            fetchWithAbort(apiUrl, abortController.signal),
            fetchWithAbort(logsUrl, abortController.signal).catch(err => {
              if (err.name === 'AbortError') {
                throw err
              }
              console.error('[대시보드] log_entries 조회 실패:', err)
              return { items: [] }
            })
          ])
        } catch (err) {
          if (err.name === 'AbortError') {
            console.log('[대시보드] 요청 취소됨')
            return
          }
          throw err
        }
        
        // 요청이 취소되었는지 확인
        if (abortController.signal.aborted) {
          console.log('[대시보드] 요청 취소됨')
          return
        }
        
        console.log('[대시보드] 병렬 API 호출 완료')
        
        const logs = Array.isArray(logsRes.items) ? logsRes.items : []
        
        // ===== 핵심 데이터 먼저 표시 (빠른 렌더링) =====
        
        // 1. 메트릭 업데이트 (총 기록수 등) - 가장 먼저 표시
        if (res.metrics) {
          setMetrics(res.metrics)
          setStudentRecordCounts(prev => ({
            ...prev,
            [selectedStudentId]: res.metrics.recordCount || 0
          }))
        } else {
          setStudentRecordCounts(prev => ({
            ...prev,
            [selectedStudentId]: 0
          }))
        }
        
        // 2. 활동 시계열 데이터 업데이트 - 빠르게 표시
        if (Array.isArray(res.activitySeries)) {
          setActivitySeries(res.activitySeries)
        }
        
        // 3. 감정 키워드 데이터 업데이트 (전체 감정 키워드 TOP3용)
        if (Array.isArray(res.emotionDistribution) && res.emotionDistribution.length > 0) {
          const emotionKeywordsData = res.emotionDistribution
            .map(item => ({
              keyword: item.name || item.emotion || '',
              count: item.count || 0
            }))
            .filter(item => item.keyword && item.keyword !== '기타' && item.keyword.trim() !== '')
            .sort((a, b) => b.count - a.count)
          setEmotionKeywords(emotionKeywordsData)
        } else {
          setEmotionKeywords([])
        }
        
        // ===== DB 데이터 즉시 처리 (AI 제외) =====
        
        // 4. 활동 상세 내역 업데이트 (즉시 처리)
        if (Array.isArray(res.activityDetails)) {
          const formattedDetails = res.activityDetails.map(item => ({
            id: item.id || `detail_${Date.now()}_${Math.random()}`,
            date: item.date || '',
            activity: item.activity || item.category || '기록 있음',
            type: item.category || '기타',
            activityType: '개별활동',
            studentComment: item.note || '',
            studentName: studentNamesMap[selectedStudentId] || '학생',
            studentId: selectedStudentId
          }))
          setActivityDetails(formattedDetails)
          
          // 기록이 있는 날짜 목록 추출
          const datesSet = new Set()
          formattedDetails.forEach(detail => {
            if (detail.date) {
              const dateStr = detail.date.includes('T') 
                ? detail.date.split('T')[0] 
                : detail.date.split(' ')[0]
              if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                datesSet.add(dateStr)
              }
            }
          })
          if (Array.isArray(logs) && logs.length > 0) {
            logs.forEach(log => {
              if (log.log_date) {
                const dateStr = log.log_date.includes('T') 
                  ? log.log_date.split('T')[0] 
                  : log.log_date.split(' ')[0]
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                  datesSet.add(dateStr)
                }
              }
            })
          }
          setDatesWithRecords(datesSet)
        } else {
          setDatesWithRecords(new Set())
        }
        
        // 5. 개별분석용 선택한 감정 키워드 추출 (즉시 처리)
        if (Array.isArray(logs) && logs.length > 0) {
          const selectedEmotions = new Map()
          logs.forEach(log => {
            if (log.emotion_tag) {
              const emotionTag = String(log.emotion_tag).trim()
              if (emotionTag && emotionTag !== '기타') {
                const emotions = emotionTag.split(/[,，\s]+/).filter(Boolean)
                emotions.forEach(emo => {
                  const emoTrimmed = emo.trim()
                  if (emoTrimmed && emoTrimmed !== '기타') {
                    selectedEmotions.set(emoTrimmed, (selectedEmotions.get(emoTrimmed) || 0) + 1)
                  }
                })
              }
            }
          })
          
          const selectedEmotionKeywordsData = Array.from(selectedEmotions.entries())
            .map(([keyword, count]) => ({ keyword, count }))
            .sort((a, b) => b.count - a.count)
          
          setSelectedEmotionKeywords(selectedEmotionKeywordsData)
        } else {
          setSelectedEmotionKeywords([])
        }
        
        // 6. 활동 유형별 통계 및 활동별 감정 키워드 빈도 (DB 데이터 - 즉시 처리)
        // 6-1. 활동 유형별 통계 계산
        const calculatedActivityTypeStats = calculateActivityTypeStats(logs)
        setActivityTypeStats(calculatedActivityTypeStats)
        
        // 6-2. 활동별 감정 키워드 빈도 업데이트
        const activityEmotionMap = {}
        
        if (Array.isArray(logs) && logs.length > 0) {
          logs.forEach(log => {
            const emotionTag = log.emotion_tag || ''
            if (!emotionTag) return
            
            const activityTags = Array.isArray(log.activity_tags) ? log.activity_tags : []
            
            if (activityTags.length > 0) {
              activityTags.forEach(activityName => {
                let activityType = 'other'
                const activityLower = String(activityName).toLowerCase()
                
                if (activityLower.includes('수확') || activityLower.includes('harvest')) {
                  activityType = 'harvest'
                } else if (activityLower.includes('파종') || activityLower.includes('sowing') || activityLower.includes('심기')) {
                  activityType = 'sow'
                } else if (activityLower.includes('관리') || activityLower.includes('manage') || activityLower.includes('물주')) {
                  activityType = 'manage'
                } else if (activityLower.includes('관찰') || activityLower.includes('observe') || activityLower.includes('보기')) {
                  activityType = 'observe'
                }
                
                if (!activityEmotionMap[activityType]) {
                  activityEmotionMap[activityType] = {}
                }
                
                const emotions = String(emotionTag).split(/[,，\s]+/).filter(Boolean)
                emotions.forEach(emo => {
                  const emoTrimmed = emo.trim()
                  if (emoTrimmed && emoTrimmed !== '기타') {
                    activityEmotionMap[activityType][emoTrimmed] = (activityEmotionMap[activityType][emoTrimmed] || 0) + 1
                  }
                })
              })
            } else {
              if (!activityEmotionMap['other']) {
                activityEmotionMap['other'] = {}
              }
              
              const emotions = String(emotionTag).split(/[,，\s]+/).filter(Boolean)
              emotions.forEach(emo => {
                const emoTrimmed = emo.trim()
                if (emoTrimmed && emoTrimmed !== '기타') {
                  activityEmotionMap['other'][emoTrimmed] = (activityEmotionMap['other'][emoTrimmed] || 0) + 1
                }
              })
            }
          })
        }
        
        const updatedActivityEmotionData = exampleActivityEmotionData.map(activity => {
          const emotionCounts = activityEmotionMap[activity.type] || {}
          const emotions = Object.entries(emotionCounts)
            .map(([keyword, count]) => ({ keyword, count }))
            .sort((a, b) => b.count - a.count)
          
          return {
            ...activity,
            emotions: emotions
          }
        })
        
        setActivityEmotionData(updatedActivityEmotionData)
        
        // AI 분석은 버튼 클릭 시에만 실행 (자동 실행 제거)
        setActivityEmotionAiComment('')
        setIsAiAnalyzing(false)
        
        // 6. 활동별 능력 분석 업데이트 (activityAbilityList)
        if (Array.isArray(res.activityAbilityList) && res.activityAbilityList.length > 0) {
          // 백엔드에서 AI 분석 결과가 있으면 사용
          const abilityAnalysis = res.activityAbilityList.map(item => ({
            id: item.id || `ability_${Date.now()}_${Math.random()}`,
            activity: item.activity || item.activity_name || '활동',
            date: item.date || item.log_date || '',
            performanceLevel: item.performanceLevel || item.performance_level || '보통', // "매우 우수", "우수", "보통" 중 하나
            abilityDistribution: item.abilityDistribution || item.ability_distribution || { difficult: 0, normal: 50, good: 50 },
            keyAbilities: Array.isArray(item.keyAbilities) ? item.keyAbilities : (item.key_abilities ? item.key_abilities.split(',').map(a => a.trim()) : [])
          }))
          setActivityAbilityAnalysis(abilityAnalysis)
          console.log('[대시보드] 활동별 능력 분석 업데이트 (백엔드):', abilityAnalysis.length, '개')
        } else if (Array.isArray(res.activityDetails) && res.activityDetails.length > 0) {
          // 백엔드 데이터가 없으면 activityDetails를 기반으로 기본 분석 생성
          const abilityAnalysis = generateAbilityAnalysisFromDetails(res.activityDetails)
          setActivityAbilityAnalysis(abilityAnalysis)
          console.log('[대시보드] 활동별 능력 분석 업데이트 (프론트엔드 생성):', abilityAnalysis.length, '개')
        } else {
          // 데이터가 없으면 빈 배열
          setActivityAbilityAnalysis([])
          console.log('[대시보드] 활동별 능력 분석 데이터 없음')
        }
        
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('[대시보드] 요청 취소됨')
          return
        }
        console.error('[대시보드] 학생별 데이터 로드 실패:', err)
        // 에러 발생 시 빈 데이터로 설정
        setEmotionKeywords([])
        setSelectedEmotionKeywords([])
        setActivityEmotionData(exampleActivityEmotionData.map(activity => ({
          ...activity,
          emotions: []
        })))
        setActivityTypeStats(exampleActivityEmotionData.map(activity => ({
          type: activity.type,
          label: activity.label,
          icon: activity.icon,
          count: 0,
          description: activity.description,
          percentage: 0
        })))
        setActivityAbilityAnalysis([])
        setActivityEmotionAiComment('')
        setIsAiAnalyzing(false)
        setDatesWithRecords(new Set())
      } finally {
        if (initialLoading) {
          setInitialLoading(false)
        } else {
          setIsDataLoading(false)
        }
      }
    }
    
    loadStudentDashboardData()
  }, [selectedStudentId, startDate, endDate, studentNamesMap])

  // flowItems는 더 이상 사용하지 않음 (emotionKeywords 직접 사용)

  // 학생별 색상 할당 함수
  const getStudentColor = (studentId) => {
    const warmColors = [
      '#f27904', // 주황색
      '#fbbf24', // 노란색
      '#a8d5ba', // 초록색
      '#d4a574', // 베이지색
      '#ff6b6b', // 코랄색
      '#ffb84d', // 피치색
      '#8b6f47', // 브라운
      '#ff8c42', // 오렌지
    ]
    // 학생 ID를 기반으로 색상 선택
    const index = studentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % warmColors.length
    return warmColors[index]
  }

  // 학생 이름 필터링 (실시간)
  useEffect(() => {
    // students가 비어있으면 아무것도 하지 않음
    if (students.length === 0) {
      return
    }

    if (!searchName.trim()) {
      // 검색어가 없으면 모든 학생 표시
      setFilteredStudents(students.map(s => s.id))
      setCurrentPage(0)
      return
    }

    // 검색어에 맞는 학생 필터링
    const filtered = students
      .filter(student => {
        // 이름 또는 닉네임으로 검색
        const name = student.name || student.student_name || student.display_name || ''
        const nickname = student.nickname || ''
        const searchLower = searchName.toLowerCase().trim()
        
        return name.toLowerCase().includes(searchLower) || 
               nickname.toLowerCase().includes(searchLower)
      })
      .map(s => s.id)
    
    setFilteredStudents(filtered)
    setCurrentPage(0) // 필터링 시 첫 페이지로 리셋
  }, [searchName, students])

  // 기간 조회 핸들러 (현재 프로젝트 기능)
  const handleSearch = async () => {
    if(!selectedStudentId) return
    
    setLoading(true)
    try {
      const query = `studentId=${selectedStudentId}&startDate=${startDate}&endDate=${endDate}`
      const res = await apiFetch(`/api/dashboard?${query}`)
      
      setMetrics({ recordCount: res.metrics?.recordCount ?? 0 })
      setActivitySeries(Array.isArray(res.activitySeries) ? res.activitySeries : [])
      setActivityAbilityList(Array.isArray(res.activityAbilityList) ? res.activityAbilityList.map(item => ({
        id: item.id || Math.random(),
        activity: item.activity ?? '활동',
        date: item.date ?? '',
        levelLabel: item.levelLabel ?? '보통',
        mainSkills: item.mainSkills ?? [],
      })) : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // 선택된 학생 정보
  const currentStudent = students.find(s => s.id === selectedStudentId)

  // -----------------------------
  // 렌더링
  // -----------------------------
  
  // 로딩 화면
  if (initialLoading) {
    return (
      <Layout>
        <div className="dash-root">
          <div className="dashboard-loading-container">
            <div className="dashboard-loading-spinner">
              <div className="loading-dot"></div>
              <div className="loading-dot"></div>
              <div className="loading-dot"></div>
            </div>
            <div className="dashboard-loading-text">
              데이터가 꿈틀꿈틀 이동중...
            </div>
          </div>
        </div>
      </Layout>
    )
  }
  
  return (
    <Layout>
      <div className="dash-root">
        
        {/* 1) 학생 분석 (헤더 오른쪽 필터 + 왼쪽 카드) */}
        <section className="card myflow-card">
          <div className="myflow-header">
            <h2>학생 분석</h2>
          
            {/* 왼쪽 상단 필터 한 줄 */}
            <div className="student-filter-row">
              <div className="student-filter-field">
                <span className="student-filter-label">시작일</span>
                <div className="date-input-wrapper">
                  <DatePicker
                    selected={startDate ? new Date(startDate + 'T00:00:00') : null}
                    onChange={(date) => {
                      if (date) {
                        // 로컬 타임존을 사용하여 날짜 문자열 생성 (타임존 문제 해결)
                        const year = date.getFullYear()
                        const month = String(date.getMonth() + 1).padStart(2, '0')
                        const day = String(date.getDate()).padStart(2, '0')
                        const dateStr = `${year}-${month}-${day}`
                        if (dateStr !== startDate) {
                          setStartDate(dateStr)
                        }
                      } else {
                        setStartDate('')
                      }
                    }}
                    dateFormat="yyyy-MM-dd"
                    className="student-filter-input student-filter-date-input"
                    dayClassName={dayClassName}
                    highlightDates={datesWithRecordsArray}
                    placeholderText="날짜 선택"
                    isClearable
                  />
                </div>
              </div>

              <div className="student-filter-field">
                <span className="student-filter-label">종료일</span>
                <div className="date-input-wrapper">
                  <DatePicker
                    selected={endDate ? new Date(endDate + 'T00:00:00') : null}
                    onChange={(date) => {
                      if (date) {
                        // 로컬 타임존을 사용하여 날짜 문자열 생성 (타임존 문제 해결)
                        const year = date.getFullYear()
                        const month = String(date.getMonth() + 1).padStart(2, '0')
                        const day = String(date.getDate()).padStart(2, '0')
                        const dateStr = `${year}-${month}-${day}`
                        if (dateStr !== endDate) {
                          setEndDate(dateStr)
                        }
                      } else {
                        setEndDate('')
                      }
                    }}
                    dateFormat="yyyy-MM-dd"
                    className="student-filter-input student-filter-date-input"
                    dayClassName={dayClassName}
                    highlightDates={datesWithRecordsArray}
                    placeholderText="날짜 선택"
                    isClearable
                  />
                </div>
              </div>

              <div className="student-filter-field">
                <span className="student-filter-label">학생 이름</span>
                <input
                  type="text"
                  className="student-filter-input"
                  placeholder="예: 홍길동"
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="student-filter-search-btn"
                onClick={() => {
                  // 검색 로직 (필요시 추가)
                  console.log('검색:', { startDate, endDate, searchName })
                }}
              >
                검색
            </button>
            </div>
          </div>

          {/* 학생 카드들 */}
          <div className="student-cards-container">
            <div className="recent-list student-cards-list">
              {(filteredStudents || []).slice(currentPage * 8, (currentPage + 1) * 8).map((studentId) => {
                // 먼저 students 배열에서 찾고, 없으면 studentNamesMap에서 찾기
                const student = students.find(s => s.id === studentId)
                const studentName = student 
                  ? (student.name || student.student_name || student.display_name || '학생')
                  : (studentNamesMap[studentId] || '학생')
                // 닉네임이 있으면 닉네임 우선 표시, 없으면 이름 표시
                const displayName = student?.nickname || studentName
                const firstChar = displayName.charAt(0) || '학'
                const studentColor = getStudentColor(studentId)
                
                const isSelected = selectedStudentId === studentId
                
                return (
                  <div 
                    key={studentId} 
                    className={`recent-item student-card-item ${isSelected ? 'student-card-selected' : ''}`}
                    onClick={() => {
                      // 학생 카드 클릭 시 해당 학생 선택
                      setSelectedStudentId(studentId)
                      console.log('[대시보드] 학생 선택:', studentId, studentName)
                    }}
                    style={{ 
                      cursor: 'pointer',
                      border: isSelected ? '2px solid var(--accent-green)' : '1px solid rgba(221, 201, 166, 0.3)',
                      backgroundColor: isSelected ? 'rgba(139, 191, 123, 0.1)' : 'transparent'
                    }}
                  >
                    <button
                      className="student-card-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        // 필터링된 목록에서만 제거 (학생 목록 자체는 유지)
                        const newFiltered = filteredStudents.filter(id => id !== studentId)
                        setFilteredStudents(newFiltered)
                        // 선택된 학생이 삭제되면 다른 학생 선택
                        if (selectedStudentId === studentId && newFiltered.length > 0) {
                          setSelectedStudentId(newFiltered[0])
                        } else if (selectedStudentId === studentId) {
                          setSelectedStudentId('')
                        }
                        // 페이지 조정 (삭제 후 현재 페이지에 카드가 없으면 이전 페이지로)
                        if (newFiltered.length <= currentPage * 8 && currentPage > 0) {
                          setCurrentPage(currentPage - 1)
                        }
                      }}
                      title="카드에서 제거"
                    >
                      ×
                    </button>
                    <div className="student-select-with-avatar">
                      <div 
                        className="student-avatar-small" 
                        style={{ backgroundColor: '#ffffff' }}
                      >
                        <img 
                          src={sproutIcon} 
                          alt="sprout" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                        />
                      </div>
                      <div className="student-name-display">{displayName}</div>
                    </div>
                    
                    <div className="student-record-count-display">
                      <div 
                        className="student-record-count-number"
                        style={{ color: studentColor }}
                      >
                        {(() => {
                          const count = studentRecordCounts[studentId]
                          // 디버깅: 기록수 확인
                          if (count === undefined) {
                            console.log(`[대시보드] 학생 ${studentId} 기록수 없음, 전체 기록수:`, studentRecordCounts)
                          }
                          return count !== undefined ? count : '-'
                        })()}
                      </div>
                      <div className="student-record-count-label">총 기록수</div>
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* 다음 페이지 화살표 */}
            {filteredStudents.length > (currentPage + 1) * 8 && (
              <button
                className="student-cards-nav-btn student-cards-nav-next"
                onClick={() => setCurrentPage(currentPage + 1)}
                title="다음 페이지"
              >
                &gt;
              </button>
            )}
            
            {/* 이전 페이지 화살표 */}
            {currentPage > 0 && (
              <button
                className="student-cards-nav-btn student-cards-nav-prev"
                onClick={() => setCurrentPage(currentPage - 1)}
                title="이전 페이지"
              >
                &lt;
              </button>
            )}
          </div>
        </section>

        {/* 2) 개별 분석 + 도넛 차트 (학생 선택 시에만 표시) */}
        {selectedStudentId ? (
        <section className={`dash-row ${activeSection === 'activity-abilities' ? 'dash-row-activity-abilities' : ''}`}>
          {/* 감정 Top 3 / 활동 유형 Top 3 */}
          {activeSection === 'emotion-keywords' ? (
            <div className="card donut-card">
              <div className="card-header">
                <h2>전체 감정 키워드 Top 3</h2>
              </div>

              <div className="emotion-top5-list">
                {emotionKeywords.length > 0 ? (
                  emotionKeywords
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3)
                    .map((item, idx) => (
                      <div key={idx} className="emotion-top5-item">
                        <div className="emotion-top5-rank">{idx + 1}</div>
                        <div className="emotion-top5-content">
                          <span className="emotion-top5-keyword">{item.keyword}</span>
                          <span className="emotion-top5-count">×{item.count}</span>
                        </div>
                      </div>
                    ))
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                    데이터가 없습니다
                  </div>
                )}
              </div>
            </div>
          ) : activeSection === 'activity-types' ? (
            <div className="card donut-card">
              <div className="card-header">
                <h2>활동별 능력 Top 3</h2>
              </div>

              {/* 통계 카드 3개 */}
              <div className="activity-stats-cards">
                <div className="activity-stat-card activity-stat-card--total">
                  <div className="activity-stat-label">총 활동 횟수</div>
                  <div className="activity-stat-value">
                    {activityTypeStats.reduce((sum, stat) => sum + stat.count, 0)}회
                  </div>
                </div>
                <div className="activity-stat-card activity-stat-card--most">
                  <div className="activity-stat-label">가장 많은 활동</div>
                  <div className="activity-stat-value">
                    {activityTypeStats.length > 0 
                      ? activityTypeStats.sort((a, b) => b.count - a.count)[0]?.label || '-'
                      : '-'}
                  </div>
                </div>
                <div className="activity-stat-card activity-stat-card--types">
                  <div className="activity-stat-label">활동 유형 수</div>
                  <div className="activity-stat-value">
                    {activityTypeStats.filter(stat => stat.count > 0).length}가지
                  </div>
                </div>
              </div>
            </div>
          ) : activeSection === 'activity-abilities' ? (
            <div className="card donut-card donut-card-activity-abilities">
              <div className="card-header">
                <h2>활동 유형 Top 3</h2>
              </div>

              {/* 활동 능력 카드 3개 */}
              <div className="activity-ability-cards">
                <div className="activity-ability-card activity-ability-card--excellent">
                  <div className="activity-ability-label">매우 우수 활동</div>
                  <div className="activity-ability-value">{activityAbilityStats.excellent.length}개</div>
                  <div className="activity-ability-desc">빠르고 효율적으로 수행</div>
                  {activityAbilityStats.excellent.length > 0 && (
                    <div className="activity-ability-top3-list">
                      {activityAbilityStats.excellent.map((item, idx) => (
                        <div key={idx} className="activity-ability-top3-item">
                          <span className="activity-ability-top3-rank">{idx + 1}</span>
                          <span className="activity-ability-top3-name">{item.activity}</span>
                          <span className="activity-ability-top3-percentage">{item.goodPercentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="activity-ability-card activity-ability-card--good">
                  <div className="activity-ability-label">우수 활동</div>
                  <div className="activity-ability-value">{activityAbilityStats.good.length}개</div>
                  <div className="activity-ability-desc">안정적인 수행력</div>
                  {activityAbilityStats.good.length > 0 && (
                    <div className="activity-ability-top3-list">
                      {activityAbilityStats.good.map((item, idx) => (
                        <div key={idx} className="activity-ability-top3-item">
                          <span className="activity-ability-top3-rank">{idx + 1}</span>
                          <span className="activity-ability-top3-name">{item.activity}</span>
                          <span className="activity-ability-top3-percentage">{item.goodPercentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="activity-ability-card activity-ability-card--challenging">
                  <div className="activity-ability-label">도전적 활동</div>
                  <div className="activity-ability-value">{activityAbilityStats.challenging.length}개</div>
                  <div className="activity-ability-desc">노력이 필요한 영역</div>
                  {activityAbilityStats.challenging.length > 0 && (
                    <div className="activity-ability-top3-list">
                      {activityAbilityStats.challenging.map((item, idx) => (
                        <div key={idx} className="activity-ability-top3-item">
                          <span className="activity-ability-top3-rank">{idx + 1}</span>
                          <span className="activity-ability-top3-name">{item.activity}</span>
                          <span className="activity-ability-top3-percentage">{item.goodPercentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card donut-card">
              <div className="card-header">
                <h2>전체 감정 키워드 Top 3</h2>
              </div>

              <div className="emotion-top5-list">
                {emotionKeywords.length > 0 ? (
                  emotionKeywords
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3)
                    .map((item, idx) => (
                      <div key={idx} className="emotion-top5-item">
                        <div className="emotion-top5-rank">{idx + 1}</div>
                        <div className="emotion-top5-content">
                          <span className="emotion-top5-keyword">{item.keyword}</span>
                          <span className="emotion-top5-count">×{item.count}</span>
                        </div>
                      </div>
                    ))
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                    데이터가 없습니다
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 개별 분석 */}
          <div className={`card flow-card ${activeSection === 'activity-abilities' ? 'flow-card-activity-abilities' : ''}`}>
            <div className="card-header">
              <h2>개별 분석</h2>
              <div className="tab-group">
                <button 
                  className={`tab ${activeTab === 'emotion-keywords' ? 'tab--active' : ''}`}
                  onClick={() => {
                    setActiveTab('emotion-keywords')
                    setActiveSection('emotion-keywords')
                    localStorage.setItem('dashboard-active-section', 'emotion-keywords')
                  }}
                >
                  감정 키워드
                </button>
                <button 
                  className={`tab ${activeTab === 'activity-abilities' ? 'tab--active' : ''}`}
                  onClick={() => {
                    setActiveTab('activity-abilities')
                    setActiveSection('activity-types')
                    localStorage.setItem('dashboard-active-section', 'activity-types')
                  }}
                >
                  활동 유형 분포
                </button>
                <button 
                  className={`tab ${activeTab === 'activity-types' ? 'tab--active' : ''}`}
                  onClick={() => {
                    setActiveTab('activity-types')
                    setActiveSection('activity-abilities')
                    localStorage.setItem('dashboard-active-section', 'activity-abilities')
                  }}
                >
                  활동별 능력 분석
                </button>
              </div>
            </div>

            {/* 탭별 콘텐츠 */}
            {activeTab === 'emotion-keywords' && (
              <>
                <div className="flow-search-row">
                  <div className="flow-tab-sub">
                    {selectedEmotionKeywords.length > 0
                      ? '선택한 감정 키워드'
                      : '데이터가 없습니다'}
                  </div>
                </div>

                <div className="flow-grid">
                  {selectedEmotionKeywords.length > 0 ? (
                    selectedEmotionKeywords.map((item, idx) => (
                      <button key={idx} className="flow-pill">
                        {item.keyword}
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            color: '#9ca3af',
                          }}
                        >
                          ×{item.count}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px', width: '100%' }}>
                      데이터가 없습니다
                    </div>
                  )}
                </div>

                {/* 전체 분석 요약 */}
                <div className="analysis-summary-section">
                  <div className="analysis-summary-header">
                    <h3>전체 분석 요약</h3>
                  </div>
                  <div className="analysis-summary-content">
                    <p>{generateAnalysisSummary()}</p>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'activity-types' && (
              <>
                <div className="flow-search-row">
                  <div className="flow-tab-sub">
                    각 활동에서 나타난 능력 수행 수준
                  </div>
                </div>

                <div className="activity-ability-analysis-table-container">
                  <table className="activity-ability-analysis-table">
                    <thead>
                      <tr>
                        <th>활동</th>
                        <th>수행 수준</th>
                        <th>능력 분포</th>
                        <th>주요 능력</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityAbilityAnalysis.length > 0 ? (
                        activityAbilityAnalysis.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div className="activity-ability-activity-cell">
                                <div className="activity-ability-activity-name">{item.activity}</div>
                                <div className="activity-ability-activity-date">
                                  {item.date ? (item.date.includes('/') ? item.date : item.date.split('-').slice(1).join('/')) : ''}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="activity-ability-performance-level">
                                <span className="performance-level-emoji">😊</span>
                                <span className="performance-level-text">{item.performanceLevel}</span>
                              </div>
                            </td>
                            <td>
                              <div className="activity-ability-distribution">
                                <div className="ability-distribution-bar">
                                  {item.abilityDistribution.difficult > 0 && (
                                    <div 
                                      className="ability-distribution-segment ability-distribution-difficult"
                                      style={{ width: `${item.abilityDistribution.difficult}%` }}
                                    >
                                      <span className="ability-distribution-label">어려움 {item.abilityDistribution.difficult}%</span>
                                    </div>
                                  )}
                                  <div 
                                    className="ability-distribution-segment ability-distribution-normal"
                                    style={{ width: `${item.abilityDistribution.normal}%` }}
                                  >
                                    <span className="ability-distribution-label">보통 {item.abilityDistribution.normal}%</span>
                                  </div>
                                  <div 
                                    className="ability-distribution-segment ability-distribution-good"
                                    style={{ width: `${item.abilityDistribution.good}%` }}
                                  >
                                    <span className="ability-distribution-label">잘함 {item.abilityDistribution.good}%</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="activity-ability-key-abilities">
                                {item.keyAbilities.map((ability, idx) => (
                                  <span key={idx} className="ability-tag">{ability}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                            활동별 능력 분석 데이터가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {activeTab === 'activity-abilities' && (
              <>
                <div className="flow-search-row">
                  <div className="flow-tab-sub">
                    선택 기간 동안 참여한 활동 유형별 횟수
                  </div>
                </div>

                <div className="activity-frequency-chart-container">
                  <h3 className="activity-frequency-chart-title">활동 유형별 참여 빈도</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={activityTypeStats.map(stat => {
                        const colors = {
                          '수확': '#22c55e',
                          '파종': '#3b82f6',
                          '관리': '#f97316',
                          '관찰': '#a855f7',
                          '기타': '#9ca3af'
                        }
                        return {
                          name: stat.label,
                          '참여 횟수': stat.count,
                          fill: colors[stat.label] || '#98B285'
                        }
                      })}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis 
                        label={{ value: '횟수', angle: -90, position: 'insideLeft', style: { fontSize: '12px', fill: '#6b7280' } }}
                        stroke="#6b7280"
                        style={{ fontSize: '12px' }}
                        domain={[0, 'dataMax + 1']}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                      />
                      <Bar 
                        dataKey="참여 횟수"
                        radius={[8, 8, 0, 0]}
                      >
                        {activityTypeStats.map((stat, index) => {
                          const colors = {
                            '수확': '#22c55e',
                            '파종': '#3b82f6',
                            '관리': '#f97316',
                            '관찰': '#a855f7',
                            '기타': '#9ca3af'
                          }
                          return (
                            <Cell key={`cell-${index}`} fill={colors[stat.label] || '#98B285'} />
                          )
                        })}
                      </Bar>
                 </BarChart>
               </ResponsiveContainer>
               </div>
              </>
             )}
          </div>
        </section>
        ) : (
          <section className="dash-row dash-row-full">
            <div className="card" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', color: '#6b7280', marginBottom: '10px' }}>
                학생을 선택해주세요
              </div>
              <div style={{ fontSize: '14px', color: '#9ca3af' }}>
                위의 학생 카드를 클릭하면 해당 학생의 분석 데이터를 확인할 수 있습니다.
              </div>
            </div>
          </section>
        )}

        {/* 3) 활동별 감정 키워드 빈도 / 활동 유형 분포 (학생 선택 시에만 표시) */}
        {selectedStudentId && (activeSection === 'emotion-keywords' ? (
          <section className="dash-row dash-row-full">
            <div className="card recent-card">
              <div className="card-header">
                <h2>활동별 감정 키워드 빈도</h2>
                <button className="link-btn">활동 유형별 분석</button>
              </div>

              <div className="activity-emotion-grid">
                {activityEmotionData.map((activity, idx) => (
                  <div key={idx} className={`activity-emotion-card activity-emotion-card--${activity.type}`}>
                    <div className="activity-emotion-header">
                      <div className="activity-emotion-icon">
                        <img 
                          src={activity.icon} 
                          alt={activity.label}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      </div>
                      <div>
                        <h3 className="activity-emotion-title">{activity.label} 활동</h3>
                        <p className="activity-emotion-desc">{activity.description}</p>
                      </div>
                    </div>
                    <div className="activity-emotion-list">
                      {activity.emotions.length > 0 ? (
                        activity.emotions.map((emotion, eIdx) => (
                          <div key={eIdx} className="activity-emotion-item">
                            <span className="activity-emotion-keyword">{emotion.keyword}</span>
                            <span className="activity-emotion-count">×{emotion.count}</span>
                          </div>
                        ))
                      ) : (
                        <div className="activity-emotion-empty">선택한 기간에 {activity.label} 활동이 없습니다</div>
                      )}
                    </div>
                  </div>
                ))}
          </div>

              {/* 활동별 감정 분석 요약 */}
              <div className="activity-analysis-summary-section">
                <div className="activity-analysis-summary-header">
                  <h3>활동별 감정 분석</h3>
                  {!isAiAnalyzing && !activityEmotionAiComment && (
                    <button 
                      className="ai-summary-button"
                      onClick={handleGenerateAiSummary}
                      disabled={!selectedStudentId || activityEmotionData.length === 0}
                    >
                      AI 요약 분석
                    </button>
                  )}
                </div>
                <div className="activity-analysis-summary-content">
                  {isAiAnalyzing ? (
                    <div className="ai-analyzing">
                      <div className="loading-spinner"></div>
                      <p>AI 분석 중입니다...</p>
                    </div>
                  ) : activityEmotionAiComment ? (
                    <div>
                      <p>{activityEmotionAiComment}</p>
                      <button 
                        className="ai-summary-button ai-summary-button-secondary"
                        onClick={handleGenerateAiSummary}
                        style={{ marginTop: '12px' }}
                      >
                        다시 분석
                      </button>
                    </div>
                  ) : (
                    <p dangerouslySetInnerHTML={{ __html: generateActivityEmotionSummary() }}></p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : activeSection === 'activity-types' ? (
          <section className="dash-row dash-row-full">
            <div className="card recent-card">
              <div className="activity-details-header">
                <div>
                  <h3>활동 상세 내역</h3>
                  {currentStudent && (
                    <div className="activity-details-student-name">
                      {currentStudent.nickname ? `${currentStudent.nickname}(${currentStudent.name})` : currentStudent.name}의 일자별 활동 기록
                    </div>
                  )}
                </div>
              </div>

              <div className="activity-details-table-wrapper">
                <table className="activity-details-table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>활동</th>
                      <th>유형</th>
                      <th>활동 유형</th>
                      <th>학생 코멘트</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityDetails
                      .filter(detail => {
                        // 선택된 학생의 데이터만 표시 (학생이 선택되지 않았으면 아무것도 표시하지 않음)
                        return selectedStudentId && detail.studentId === selectedStudentId
                      })
                      .length > 0 ? (
                        activityDetails
                          .filter(detail => {
                            // 선택된 학생의 데이터만 표시
                            return selectedStudentId && detail.studentId === selectedStudentId
                          })
                          .map((detail) => {
                            const dateStr = detail.date ? new Date(detail.date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '-'
                            const typeClass = detail.type === '수확' ? 'harvest' : 
                                             detail.type === '파종' ? 'sowing' : 
                                             detail.type === '관리' ? 'manage' : 
                                             detail.type === '관찰' ? 'observe' : 'etc'
                            const activityTypeClass = detail.activityType === '단체활동' ? 'group' : 'individual'
                            
                            return (
                              <tr key={detail.id}>
                                <td>{dateStr}</td>
                                <td>{detail.activity || '-'}</td>
                                <td>
                                  <span className={`activity-type-badge activity-type-badge--${typeClass}`}>
                                    {detail.type || '-'}
                                  </span>
                                </td>
                                <td>
                                  <span className={`activity-group-badge activity-group-badge--${activityTypeClass}`}>
                                    {detail.activityType || '-'}
                                  </span>
                                </td>
                                <td>{detail.studentComment || '-'}</td>
                              </tr>
                            )
                          })
                      ) : (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                            활동 상세 내역이 없습니다.
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null)}

      </div>

      {/* AI 채팅 컴포넌트 */}
      <AIChat
        students={students}
        startDate={startDate}
        endDate={endDate}
        selectedStudentId={selectedStudentId}
      />
    </Layout>
  )
}


