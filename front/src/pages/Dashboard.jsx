// src/pages/Dashboard.jsx
import React, { useEffect, useState, useMemo } from 'react'
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
  const [initialLoading, setInitialLoading] = useState(true) // 초기 로딩 상태
  const [user, setUser] = useState({ name: '선생님' })
  const [activityAbilityAnalysis, setActivityAbilityAnalysis] = useState([]) // 활동별 능력 분석 데이터
  const [activityDetails, setActivityDetails] = useState([]) // 활동 상세 내역 데이터
  const [selectedEmotionKeywords, setSelectedEmotionKeywords] = useState([]) // 개별분석에 표시할 선택한 감정 키워드
  const [activityEmotionAiComment, setActivityEmotionAiComment] = useState('') // 활동별 감정 분석 AI 코멘트

  // 학생 데이터 불러오기
  useEffect(() => {
    setInitialLoading(true)
    const userData = JSON.parse(localStorage.getItem('user') || '{}')
    if (userData.name) setUser(userData)

    async function loadStudents() {
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
          console.log('[대시보드] API에서 학생 데이터 로드 실패, localStorage 사용:', err)
        }

        // localStorage에서 학생 데이터 가져오기 (백업용)
        const storedStudents = JSON.parse(localStorage.getItem('students') || '[]')
        const normalizedStored = storedStudents.map((item, index) => ({
          id: String(item.id || `student_${index}`),
          name: item.name || item.student_name || item.display_name || '이름 없음',
          nickname: item.nickname || item.alias || '',
          group_name: item.group_name || '',
          birth_date: item.birth_date || ''
        }))

        // API 데이터와 localStorage 데이터 병합 (API 우선, 중복 제거)
        const allStudents = [...apiStudents, ...normalizedStored]
        const uniqueStudents = Array.from(
          new Map(allStudents.map(s => [s.id, s])).values()
        )

        // API 데이터가 있으면 localStorage도 업데이트 (동기화)
        if (apiStudents.length > 0) {
          localStorage.setItem('students', JSON.stringify(uniqueStudents))
        }

        setStudents(uniqueStudents)
        
        // 학생 분석 레이아웃에 자동으로 추가 (모든 학생 추가)
        if (uniqueStudents.length > 0) {
          // 모든 학생을 selectedStudents에 추가 (페이지네이션으로 표시)
          const allStudentIds = uniqueStudents.map(s => s.id)
          setSelectedStudents(allStudentIds)
          setFilteredStudents(allStudentIds) // 초기에는 모든 학생 표시
          
          // 학생 이름 매핑 생성
          const namesMap = {}
          uniqueStudents.forEach(s => {
            namesMap[s.id] = s.name || s.student_name || s.display_name || '학생'
          })
          setStudentNamesMap(namesMap)
          
          // 모든 학생의 기록수를 0으로 초기화
          const initialRecordCounts = {}
          uniqueStudents.forEach(s => {
            initialRecordCounts[s.id] = 0
          })
          setStudentRecordCounts(initialRecordCounts)
          
          // 모든 학생의 기록수 로드 (병렬로)
          loadAllStudentRecordCounts(uniqueStudents.map(s => s.id))
          
          // 첫 페이지로 초기화
          setCurrentPage(0)
          
          if(uniqueStudents.length > 0) setSelectedStudentId(uniqueStudents[0].id) // 첫 학생 자동 선택
        }
      } catch (err) {
        console.error('학생 데이터 로드 실패:', err)
      }
    }
    loadStudents()
    
    // 활동 상세 내역 데이터 로드
    function loadActivityDetails() {
      try {
        // localStorage에서 업로드 데이터 가져오기
        const storedUploads = JSON.parse(localStorage.getItem('uploads') || '[]')
        
        // 활동 상세 내역 데이터 변환
        const details = []
        storedUploads.forEach(upload => {
          // analysisByStudent에서 데이터 추출
          if (upload.analysisByStudent) {
            Object.entries(upload.analysisByStudent).forEach(([studentId, studentData]) => {
              const studentAnalysis = studentData || {}
              const analysis = studentAnalysis.analysis || {}
              const activityTypes = studentAnalysis.activityTypes || {}
              const students = upload.analysis?.students || [{ id: studentId, name: upload.student_name || '학생' }]
              
              // 각 활동 유형별로 데이터 생성
              Object.entries(activityTypes).forEach(([typeKey, typeData]) => {
                if (typeData && typeData.selected && typeData.detail) {
                  const activityTypeMap = {
                    harvest: '수확',
                    sowing: '파종',
                    manage: '관리',
                    observe: '관찰',
                    etc: '기타'
                  }
                  
                  details.push({
                    id: `${upload.id}_${studentId}_${typeKey}`,
                    date: analysis.date || upload.uploaded_at || upload.created_at || '',
                    activity: typeData.detail || analysis.activityName || '',
                    type: activityTypeMap[typeKey] || '기타',
                    activityType: students.length > 1 ? '단체활동' : '개별활동',
                    studentComment: analysis.note || analysis.emotionSummary || '',
                    studentName: students.find(s => s.id === studentId)?.name || upload.student_name || '학생',
                    studentId: studentId
                  })
                }
              })
              
              // 활동 유형이 없는 경우 기본 데이터 추가
              if (Object.values(activityTypes).every(t => !t || !t.selected)) {
                if (analysis.activityName || analysis.date) {
                  details.push({
                    id: `${upload.id}_${studentId}_default`,
                    date: analysis.date || upload.uploaded_at || upload.created_at || '',
                    activity: analysis.activityName || '',
                    type: analysis.activityType || '기타',
                    activityType: students.length > 1 ? '단체활동' : '개별활동',
                    studentComment: analysis.note || analysis.emotionSummary || '',
                    studentName: students.find(s => s.id === studentId)?.name || upload.student_name || '학생',
                    studentId: studentId
                  })
                }
              }
            })
          }
          
          // 기존 analysis 구조도 확인
          if (upload.analysis && !upload.analysisByStudent) {
            const analysis = upload.analysis
            const students = analysis.students || []
            
            if (students.length > 0) {
              students.forEach(student => {
                if (analysis.activityName || analysis.date) {
                  details.push({
                    id: `${upload.id}_${student.id}_default`,
                    date: analysis.date || upload.uploaded_at || upload.created_at || '',
                    activity: analysis.activityName || '',
                    type: analysis.activityType || '기타',
                    activityType: students.length > 1 ? '단체활동' : '개별활동',
                    studentComment: analysis.note || analysis.emotionSummary || '',
                    studentName: student.name || student.student_name || '학생',
                    studentId: student.id
                  })
                }
              })
            } else if (analysis.activityName || analysis.date) {
              details.push({
                id: `${upload.id}_default`,
                date: analysis.date || upload.uploaded_at || upload.created_at || '',
                activity: analysis.activityName || '',
                type: analysis.activityType || '기타',
                activityType: '개별활동',
                studentComment: analysis.note || analysis.emotionSummary || '',
                studentName: upload.student_name || '학생',
                studentId: null
              })
            }
          }
        })
        
        // 예시 데이터 제거 - 실제 데이터만 표시
        
        // 날짜순 정렬 (최신순)
        details.sort((a, b) => {
          const dateA = new Date(a.date || 0)
          const dateB = new Date(b.date || 0)
          return dateB - dateA
        })
        
        setActivityDetails(details)
      } catch (err) {
        console.error('활동 상세 내역 로드 실패:', err)
      }
    }
    
    loadActivityDetails()
    
    // 예시 데이터 제거 - 실제 데이터만 사용
    setActivityAbilityAnalysis([])
    setInitialLoading(false)
  }, [])

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
  const [activityEmotionData, setActivityEmotionData] = useState(exampleActivityEmotionData) // 구조는 유지하되 emotions는 빈 배열로 시작

  // 활동 유형별 통계 계산
  const calculateActivityTypeStats = () => {
    const stats = activityEmotionData.map(activity => {
      const totalEmotions = activity.emotions.reduce((sum, e) => sum + e.count, 0)
      return {
        type: activity.type,
        label: activity.label,
        icon: activity.icon,
        count: totalEmotions,
        description: activity.description
      }
    })
    const totalCount = stats.reduce((sum, s) => sum + s.count, 0)
    return stats.map(stat => ({
      ...stat,
      percentage: totalCount > 0 ? Math.round((stat.count / totalCount) * 100) : 0
    }))
  }

  const activityTypeStats = calculateActivityTypeStats()

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

  // 모든 학생의 기록수 로드 함수
  async function loadAllStudentRecordCounts(studentIds) {
    if (!studentIds || studentIds.length === 0) return
    
    try {
      console.log('[대시보드] 모든 학생 기록수 로드 시작:', studentIds.length, '명')
      
      // 모든 학생에 대해 병렬로 기록수 가져오기
      const recordCountPromises = studentIds.map(async (studentId) => {
        try {
          const res = await apiFetch(`/api/dashboard?studentId=${studentId}`)
          const recordCount = res.metrics?.recordCount || 0
          return { studentId, recordCount }
        } catch (err) {
          console.error(`[대시보드] 학생 ${studentId} 기록수 로드 실패:`, err)
          return { studentId, recordCount: 0 }
        }
      })
      
      const results = await Promise.all(recordCountPromises)
      
      // 결과를 state에 반영
      setStudentRecordCounts(prev => {
        const updated = { ...prev }
        results.forEach(({ studentId, recordCount }) => {
          updated[studentId] = recordCount
        })
        return updated
      })
      
      console.log('[대시보드] 모든 학생 기록수 로드 완료:', results)
    } catch (err) {
      console.error('[대시보드] 모든 학생 기록수 로드 실패:', err)
    }
  }

  // 학생별 대시보드 데이터 로드 (감정 키워드, 활동 유형, 활동별 능력 등)
  useEffect(() => {
    async function loadStudentDashboardData() {
      // 학생이 선택되지 않았으면 API 호출하지 않음
      if (!selectedStudentId) {
        console.log('[대시보드] 학생이 선택되지 않아 데이터 로드 스킵')
        setInitialLoading(false)
        return
      }
      
      try {
        setInitialLoading(true)
        console.log('[대시보드] 학생별 데이터 로드 시작:', selectedStudentId)
        
        // 기간 필터 적용 (startDate, endDate가 있으면 사용)
        let apiUrl = `/api/dashboard?studentId=${selectedStudentId}`
        if (startDate) {
          apiUrl += `&from=${startDate}`
        }
        if (endDate) {
          apiUrl += `&to=${endDate}`
        }
        
        const res = await apiFetch(apiUrl)
        console.log('[대시보드] API 응답:', res)
        
        // logs 데이터도 함께 가져오기 (개별분석용 감정 키워드 추출을 위해)
        let logs = []
        try {
          const logsRes = await apiFetch(`/api/log_entries?student_id=${selectedStudentId}${startDate ? `&from=${startDate}` : ''}${endDate ? `&to=${endDate}` : ''}&status=success`)
          logs = Array.isArray(logsRes.items) ? logsRes.items : []
        } catch (err) {
          console.error('[대시보드] log_entries 조회 실패:', err)
        }
        
        // 1. 감정 키워드 데이터 업데이트 (전체 감정 키워드 TOP3용)
        // emotionDistribution은 실제로 저장된 emotion_tag만 포함 (기본값 '기타' 제외)
        if (Array.isArray(res.emotionDistribution) && res.emotionDistribution.length > 0) {
          const emotionKeywordsData = res.emotionDistribution
            .map(item => ({
              keyword: item.name || item.emotion || '',
              count: item.count || 0
            }))
            .filter(item => item.keyword && item.keyword !== '기타' && item.keyword.trim() !== '') // '기타' 제외
            .sort((a, b) => b.count - a.count) // 빈도순 정렬
          setEmotionKeywords(emotionKeywordsData)
          console.log('[대시보드] 감정 키워드 업데이트:', emotionKeywordsData)
        } else {
          // 데이터가 없으면 빈 배열로 설정 (예시 데이터 표시 안 함)
          setEmotionKeywords([])
          console.log('[대시보드] 감정 키워드 데이터 없음, 빈 배열로 설정')
        }
        
        // 1-1. 개별분석용 선택한 감정 키워드 추출 (log_entries에서 emotion_tag 가져오기)
        if (Array.isArray(logs) && logs.length > 0) {
          const selectedEmotions = new Map()
          logs.forEach(log => {
            if (log.emotion_tag) {
              const emotionTag = String(log.emotion_tag).trim()
              // '기타'는 감정 키워드가 아니므로 제외
              if (emotionTag && emotionTag !== '기타') {
                // 쉼표로 구분된 감정 키워드 분리
                const emotions = emotionTag.split(/[,，\s]+/).filter(Boolean)
                emotions.forEach(emo => {
                  const emoTrimmed = emo.trim()
                  // '기타'가 아닌 실제 감정 키워드만 추가
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
          console.log('[대시보드] 선택한 감정 키워드 업데이트:', selectedEmotionKeywordsData)
          console.log('[대시보드] log_entries 원본 데이터:', logs.map(l => ({ id: l.id, emotion_tag: l.emotion_tag, activity_tags: l.activity_tags })))
        } else {
          setSelectedEmotionKeywords([])
        }
        
        // 2. 메트릭 업데이트 (총 기록수 등)
        if (res.metrics) {
          setMetrics(res.metrics)
          // 선택된 학생의 기록수만 업데이트
          setStudentRecordCounts(prev => ({
            ...prev,
            [selectedStudentId]: res.metrics.recordCount || 0
          }))
          console.log('[대시보드] 메트릭 업데이트:', res.metrics)
        } else {
          // 데이터가 없으면 기록수 0으로 설정
          setStudentRecordCounts(prev => ({
            ...prev,
            [selectedStudentId]: 0
          }))
        }
        
        // 3. 활동 시계열 데이터 업데이트
        if (Array.isArray(res.activitySeries)) {
          setActivitySeries(res.activitySeries)
          console.log('[대시보드] 활동 시계열 업데이트:', res.activitySeries.length, '개')
        }
        
        // 4. 활동 상세 내역 업데이트
        if (Array.isArray(res.activityDetails)) {
          const formattedDetails = res.activityDetails.map(item => ({
            id: item.id || `detail_${Date.now()}_${Math.random()}`,
            date: item.date || '',
            activity: item.activity || item.category || '기록 있음',
            type: item.category || '기타',
            activityType: '개별활동', // 나중에 단체/개별 구분 로직 추가 가능
            studentComment: item.note || '',
            studentName: studentNamesMap[selectedStudentId] || '학생',
            studentId: selectedStudentId
          }))
          setActivityDetails(formattedDetails)
          console.log('[대시보드] 활동 상세 내역 업데이트:', formattedDetails.length, '개')
        }
        
        // 5. 활동별 감정 키워드 빈도 업데이트 (log_entries에서 직접 추출)
        // log_entries의 emotion_tag와 activity_tags를 사용하여 정확한 데이터 추출
        const activityEmotionMap = {}
        
        if (Array.isArray(logs) && logs.length > 0) {
          logs.forEach(log => {
            // emotion_tag 추출
            const emotionTag = log.emotion_tag || ''
            if (!emotionTag) return
            
            // activity_tags 추출
            const activityTags = Array.isArray(log.activity_tags) ? log.activity_tags : []
            
            // 활동 태그가 있으면 각 활동별로 감정 매핑
            if (activityTags.length > 0) {
              activityTags.forEach(activityName => {
                // 활동 유형 추론 (activity_name에서)
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
                
                // 감정 키워드 집계 (감정이 여러 개일 수 있으므로 분리)
                const emotions = String(emotionTag).split(/[,，\s]+/).filter(Boolean)
                emotions.forEach(emo => {
                  const emoTrimmed = emo.trim()
                  if (emoTrimmed) {
                    activityEmotionMap[activityType][emoTrimmed] = (activityEmotionMap[activityType][emoTrimmed] || 0) + 1
                  }
                })
              })
            } else {
              // 활동 태그가 없으면 '기타' 활동으로 분류
              if (!activityEmotionMap['other']) {
                activityEmotionMap['other'] = {}
              }
              
              const emotions = String(emotionTag).split(/[,，\s]+/).filter(Boolean)
              emotions.forEach(emo => {
                const emoTrimmed = emo.trim()
                if (emoTrimmed) {
                  activityEmotionMap['other'][emoTrimmed] = (activityEmotionMap['other'][emoTrimmed] || 0) + 1
                }
              })
            }
          })
        }
        
        // 활동별 감정 데이터 형식으로 변환
        const updatedActivityEmotionData = exampleActivityEmotionData.map(activity => {
          const emotionCounts = activityEmotionMap[activity.type] || {}
          const emotions = Object.entries(emotionCounts)
            .map(([keyword, count]) => ({ keyword, count }))
            .sort((a, b) => b.count - a.count)
          
          return {
            ...activity,
            emotions: emotions // 데이터가 없으면 빈 배열
          }
        })
        
        setActivityEmotionData(updatedActivityEmotionData)
        console.log('[대시보드] 활동별 감정 키워드 업데이트:', updatedActivityEmotionData)
        
        // 6-1. 활동별 감정 분석 AI 코멘트 생성
        if (updatedActivityEmotionData.length > 0 && selectedStudentId) {
          try {
            const currentStudent = students.find(s => s.id === selectedStudentId) || students[0]
            const studentName = currentStudent ? (currentStudent.nickname || currentStudent.name) : '학생'
            
            // 활동별 감정 데이터를 AI에 전달
            const activityEmotionSummary = updatedActivityEmotionData
              .filter(activity => activity.emotions.length > 0)
              .map(activity => ({
                type: activity.label,
                emotions: activity.emotions.map(e => `${e.keyword}(${e.count}회)`).join(', ')
              }))
            
            if (activityEmotionSummary.length > 0) {
              const aiPrompt = `${studentName} 학생의 활동별 감정 분석 결과입니다:\n\n${activityEmotionSummary.map(a => `- ${a.type}: ${a.emotions}`).join('\n')}\n\n위 데이터를 바탕으로 ${studentName} 학생의 감정 상태에 대한 전문적인 코멘트를 2-3문장으로 작성해주세요.`
              
              const aiRes = await apiFetch('/api/ai/chat', {
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
              
              if (aiRes && aiRes.message) {
                setActivityEmotionAiComment(aiRes.message)
              } else {
                setActivityEmotionAiComment('')
              }
            } else {
              setActivityEmotionAiComment('')
            }
          } catch (err) {
            console.error('[대시보드] 활동별 감정 분석 AI 코멘트 생성 실패:', err)
            setActivityEmotionAiComment('')
          }
        } else {
          setActivityEmotionAiComment('')
        }
        
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
        console.error('[대시보드] 학생별 데이터 로드 실패:', err)
        // 에러 발생 시 예시 데이터 유지 (이미 초기값으로 설정됨)
      } finally {
        setInitialLoading(false)
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
    // selectedStudents가 비어있으면 아무것도 하지 않음
    if (selectedStudents.length === 0) {
      return
    }

    if (!searchName.trim()) {
      // 검색어가 없으면 모든 학생 표시
      setFilteredStudents(selectedStudents)
      setCurrentPage(0)
      return
    }

    // 검색어에 맞는 학생 필터링
    const filtered = selectedStudents.filter(studentId => {
      const student = students.find(s => s.id === studentId)
      if (!student) {
        // studentNamesMap에서 찾기
        const name = studentNamesMap[studentId] || ''
        return name.toLowerCase().includes(searchName.toLowerCase().trim())
      }
      
      // 이름 또는 닉네임으로 검색
      const name = student.name || student.student_name || student.display_name || ''
      const nickname = student.nickname || ''
      const searchLower = searchName.toLowerCase().trim()
      
      return name.toLowerCase().includes(searchLower) || 
             nickname.toLowerCase().includes(searchLower)
    })
    
    setFilteredStudents(filtered)
    setCurrentPage(0) // 필터링 시 첫 페이지로 리셋
  }, [searchName, selectedStudents, students, studentNamesMap])

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
                <input
                  type="date"
                  className="student-filter-input student-filter-date-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="student-filter-field">
                <span className="student-filter-label">종료일</span>
                <input
                  type="date"
                  className="student-filter-input student-filter-date-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
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
                        const newSelected = selectedStudents.filter(id => id !== studentId)
                        setSelectedStudents(newSelected)
                        // 필터링된 목록에서도 제거
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
                        // studentNamesMap에서도 제거
                        const newMap = { ...studentNamesMap }
                        delete newMap[studentId]
                        setStudentNamesMap(newMap)
                      }}
                      title="카드 삭제"
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
                        {studentRecordCounts[studentId] !== undefined ? studentRecordCounts[studentId] : 0}
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

        {/* 2) 개별 분석 + 도넛 차트 */}
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

        {/* 3) 활동별 감정 키워드 빈도 / 활동 유형 분포 */}
        {activeSection === 'emotion-keywords' ? (
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
                </div>
                <div className="activity-analysis-summary-content">
                  {activityEmotionAiComment ? (
                    <p>{activityEmotionAiComment}</p>
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
        ) : null}

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
