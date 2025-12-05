// src/pages/StudentList.jsx
import React, { useEffect, useState, useRef } from 'react'
import Layout from '../components/Layout'
import { apiFetch } from '../lib/api'

// 필터 드롭다운 컴포넌트
function FilterDropdown({ column, value, searchValue, options, onFilterChange, onSearchChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid rgba(221, 201, 166, 0.5)',
          background: '#fffaf1',
          fontSize: 12,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.target.style.borderColor = 'var(--accent-green)'
          e.target.style.background = '#fffdf8'
        }}
        onMouseLeave={(e) => {
          e.target.style.borderColor = 'rgba(221, 201, 166, 0.5)'
          e.target.style.background = '#fffaf1'
        }}
      >
        <span style={{ color: value ? 'var(--text-dark)' : 'var(--text-gray)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-gray)' }}>▼</span>
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: 'var(--bg-white)',
            border: '1px solid rgba(221, 201, 166, 0.5)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(156, 132, 90, 0.15)',
            zIndex: 1000,
            maxHeight: '200px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <input
            type="text"
            placeholder="검색..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: '6px 8px',
              border: 'none',
              borderBottom: '1px solid rgba(221, 201, 166, 0.3)',
              fontSize: 12,
              outline: 'none',
              background: '#fffaf1',
            }}
          />
          <div style={{ overflowY: 'auto', maxHeight: '150px' }}>
            <div
              onClick={() => {
                onFilterChange('')
                setIsOpen(false)
              }}
              style={{
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: 12,
                background: !value ? 'rgba(139, 191, 123, 0.15)' : 'transparent',
                color: !value ? 'var(--accent-green-dark)' : 'var(--text-dark)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (value) {
                  e.target.style.background = 'rgba(242, 180, 92, 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                if (value) {
                  e.target.style.background = 'transparent'
                }
              }}
            >
              전체
            </div>
            {options.length === 0 ? (
              <div style={{ padding: '6px 8px', fontSize: 12, color: 'var(--text-gray)' }}>결과 없음</div>
            ) : (
              options.map((option, index) => (
                <div
                  key={index}
                  onClick={() => {
                    onFilterChange(option)
                    setIsOpen(false)
                  }}
                  style={{
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: 12,
                    background: value === option ? 'rgba(139, 191, 123, 0.15)' : 'transparent',
                    color: value === option ? 'var(--accent-green-dark)' : 'var(--text-dark)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (value !== option) {
                      e.target.style.background = 'rgba(242, 180, 92, 0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (value !== option) {
                      e.target.style.background = 'transparent'
                    }
                  }}
                >
                  {option}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// 서버 응답 형태를 통합해서 students 배열로 변환
function normalizeStudentsResponse(res) {
  if (!res) return []
  if (Array.isArray(res.items)) return res.items
  if (Array.isArray(res.data)) return res.data
  if (Array.isArray(res)) return res
  return []
}

export default function StudentList() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ▶ 학생 추가용 상태들
  const [newNickname, setNewNickname] = useState('')
  const [newName, setNewName] = useState('')
  const [newBirthDate, setNewBirthDate] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newLogContent, setNewLogContent] = useState('')
  const [creating, setCreating] = useState(false)

  // ▶ 수정용 모달 상태
  const [editingStudent, setEditingStudent] = useState(null)
  const [editForm, setEditForm] = useState({
    nickname: '',
    name: '',
    birth_date: '',
    group_name: '',
    log_content: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)

  // ▶ 삭제 처리 중인 학생 id
  const [deletingId, setDeletingId] = useState(null)

  // ▶ 필터 상태
  const [filters, setFilters] = useState({
    nickname: '',
    name: '',
    birth_date: '',
    group_name: '',
    log_content: '',
  })
  const [filterSearch, setFilterSearch] = useState({
    nickname: '',
    name: '',
    birth_date: '',
    group_name: '',
    log_content: '',
  })

  // -------------------- 초기 학생 목록 조회 --------------------
  useEffect(() => {
    fetchStudents()
  }, [])

  async function fetchStudents() {
    try {
      setLoading(true)
      setError('')

      // 백엔드 API에서 학생 목록 가져오기
      let apiStudents = []
      try {
        const res = await apiFetch('/api/students?limit=1000')
        const items = normalizeStudentsResponse(res)
        apiStudents = items.map(item => ({
          id: String(item.id ?? item.student_id ?? item.uuid),
          nickname: item.alias || item.nickname || null,
          name: item.name ?? item.display_name ?? item.student_name ?? '이름 없음',
          birth_date: item.birth_date || null,
          group_name: item.group_name || null,
          log_content: item.log_content || item.memo || null,
          created_at: item.created_at || null,
          updated_at: item.updated_at || null,
        })).filter(item => item.id)
        
        console.log('[학생 목록] API에서 가져온 학생 수:', apiStudents.length)
        console.log('[학생 목록] 첫 번째 학생 group_name 예시:', apiStudents[0]?.group_name, '원본:', items[0]?.group_name)
        console.log('[학생 목록] 전체 items 원본:', items)
        
        // localStorage에서 group_name이 있는 학생 정보와 병합 (백엔드 응답에 group_name이 없을 경우)
        const storedStudents = JSON.parse(localStorage.getItem('students') || '[]')
        apiStudents = apiStudents.map(apiStudent => {
          const stored = storedStudents.find(s => s.id === apiStudent.id)
          if (stored && stored.group_name && !apiStudent.group_name) {
            console.log('[학생 목록] localStorage에서 group_name 복원:', apiStudent.name, stored.group_name)
            return { ...apiStudent, group_name: stored.group_name }
          }
          return apiStudent
        })
      } catch (apiErr) {
        console.error('[학생 목록] API 로드 실패:', apiErr)
      }

      // localStorage에서도 가져오기 (백엔드와 병합)
      const stored = localStorage.getItem('students')
      let storedStudents = []
      if (stored) {
        try {
          storedStudents = JSON.parse(stored)
        } catch (e) {
          console.error('[학생 목록] localStorage 파싱 실패:', e)
        }
      }

      // API 데이터 우선 사용 (Supabase가 source of truth)
      // localStorage는 백업용으로만 사용
      if (apiStudents.length > 0) {
        // Supabase에서 가져온 학생들만 표시
        setStudents(apiStudents)
        // localStorage도 Supabase 데이터로 동기화
        localStorage.setItem('students', JSON.stringify(apiStudents))
      } else {
        // API 데이터가 없으면 localStorage 데이터 사용 (오프라인 모드)
        const allStudents = [...apiStudents, ...storedStudents]
        const uniqueStudents = Array.from(
          new Map(allStudents.map(s => [s.id, s])).values()
        )
        setStudents(uniqueStudents)
      }
    } catch (e) {
      console.error(e)
      setError('학생 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // -------------------- 학생 추가 --------------------
  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) {
      setError('이름을 입력해주세요.')
      return
    }

    try {
      setCreating(true)
      setError('')

      // 백엔드 API에 학생 추가
      let savedStudent = null
      try {
        const response = await apiFetch('/api/students', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newName.trim(),
            alias: newNickname.trim() || null,
            birth_date: newBirthDate || null,
            group_name: newGroupName.trim() || null,
            memo: newLogContent.trim() || null,
            log_content: newLogContent.trim() || null,
          }),
        })
        
        // 백엔드 응답에서 학생 정보 가져오기
        console.log('[학생 추가] 백엔드 응답:', response)
        console.log('[학생 추가] 백엔드 응답 group_name:', response.group_name)
        console.log('[학생 추가] 프론트엔드 입력 group_name:', newGroupName.trim())
        
        // 백엔드 응답에 group_name이 없으면 프론트엔드에서 보낸 값을 사용
        const finalGroupName = response.group_name !== undefined && response.group_name !== null 
          ? response.group_name 
          : (newGroupName.trim() || null)
        
        savedStudent = {
          id: String(response.id || response.student_id || `student-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
          nickname: response.alias || newNickname.trim() || null,
          name: response.name || newName.trim(),
          birth_date: response.birth_date || newBirthDate || null,
          group_name: finalGroupName,
          log_content: response.log_content || response.memo || newLogContent.trim() || null,
          created_at: response.created_at || new Date().toISOString(),
          updated_at: response.updated_at || new Date().toISOString(),
        }
        
        console.log('[학생 추가] 백엔드에 저장 완료:', savedStudent)
        console.log('[학생 추가] group_name 최종값:', savedStudent.group_name)
      } catch (apiErr) {
        console.error('[학생 추가] 백엔드 저장 실패, localStorage만 사용:', apiErr)
        // 백엔드 저장 실패 시 localStorage만 사용
        savedStudent = {
          id: `student-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          nickname: newNickname.trim() || null,
          name: newName.trim(),
          birth_date: newBirthDate || null,
          group_name: newGroupName.trim() || null,
          log_content: newLogContent || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      }

      // 로컬 스토리지에도 저장 (백엔드와 동기화)
      const updatedStudents = [...students, savedStudent]
      localStorage.setItem('students', JSON.stringify(updatedStudents))
      setStudents(updatedStudents)

      // 백엔드에 저장 성공한 경우 최신 목록 다시 불러오기 (동기화)
      // 단, group_name이 백엔드 응답에 없을 수 있으므로 savedStudent를 유지
      if (savedStudent.id && !savedStudent.id.startsWith('student-')) {
        try {
          await fetchStudents()
          // fetchStudents 후에도 savedStudent의 group_name이 있으면 유지
          setStudents(prev => prev.map(s => 
            s.id === savedStudent.id && savedStudent.group_name && !s.group_name
              ? { ...s, group_name: savedStudent.group_name }
              : s
          ))
        } catch (fetchErr) {
          console.error('[학생 추가] 목록 다시 불러오기 실패:', fetchErr)
        }
      }

      // 입력창 초기화
      setNewNickname('')
      setNewName('')
      setNewBirthDate('')
      setNewGroupName('')
      setNewLogContent('')
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 추가 중 오류가 발생했습니다.')
    } finally {
      setCreating(false)
    }
  }

  // -------------------- 학생 수정 --------------------
  function openEditModal(student) {
    setEditingStudent(student || null)

    if (student) {
      setEditForm({
        nickname: student.nickname || '',
        name: student.name || '',
        birth_date: student.birth_date
          ? String(student.birth_date).slice(0, 10)
          : '',
        group_name: student.group_name || '',
        log_content: student.log_content || '',
      })
    } else {
      setEditForm({
        nickname: '',
        name: '',
        birth_date: '',
        group_name: '',
        log_content: '',
      })
    }
  }

  function closeEditModal() {
    setEditingStudent(null)
  }

  function handleEditChange(e) {
    const { name, value } = e.target
    setEditForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleEditSave(e) {
    e.preventDefault()
    if (!editingStudent) return

    try {
      setSavingEdit(true)
      setError('')

      const updated = {
        ...editingStudent,
        nickname: editForm.nickname || null,
        name: editForm.name,
        birth_date: editForm.birth_date || null,
        group_name: editForm.group_name || null,
        log_content: editForm.log_content || null,
        updated_at: new Date().toISOString(),
      }

      // 백엔드 API에 학생 수정 (PATCH 사용)
      try {
        await apiFetch(`/api/students/${editingStudent.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: editForm.name,
            alias: editForm.nickname || null,
            birth_date: editForm.birth_date || null,
            group_name: editForm.group_name || null,
            memo: editForm.log_content?.trim() || null,
            log_content: editForm.log_content?.trim() || null,
          }),
        })
        console.log('[학생 수정] 백엔드에 저장 완료')
      } catch (apiErr) {
        console.error('[학생 수정] 백엔드 저장 실패, localStorage만 사용:', apiErr)
      }

      // 로컬 스토리지에도 저장
      const updatedStudents = students.map(s => 
        s.id === editingStudent.id ? updated : s
      )
      localStorage.setItem('students', JSON.stringify(updatedStudents))
      setStudents(updatedStudents)

      // 백엔드에 저장 성공한 경우 최신 목록 다시 불러오기 (동기화)
      try {
        await fetchStudents()
      } catch (fetchErr) {
        console.error('[학생 수정] 목록 다시 불러오기 실패:', fetchErr)
      }

      closeEditModal()
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 수정 중 오류가 발생했습니다.')
    } finally {
      setSavingEdit(false)
    }
  }

  // -------------------- 학생 삭제 --------------------
  async function handleDelete(student) {
    if (!student) return
    if (!window.confirm(`"${student.name}" 학생을 정말 삭제하시겠어요?`)) return

    try {
      setDeletingId(student.id)
      setError('')

      // 백엔드 API에서 학생 삭제 (Supabase에서 삭제)
      try {
        await apiFetch(`/api/students/${student.id}`, {
          method: 'DELETE',
        })
        console.log('[학생 삭제] 백엔드에서 삭제 완료:', student.name)
        
        // 삭제 성공 후 즉시 UI에서 제거 (즉각적인 피드백)
        const updatedStudents = students.filter(s => s.id !== student.id)
        setStudents(updatedStudents)
        
        // localStorage에서도 제거
        localStorage.setItem('students', JSON.stringify(updatedStudents))
        
        // 백엔드에서 최신 목록 가져오기 (동기화)
        await fetchStudents()
      } catch (apiErr) {
        console.error('[학생 삭제] 백엔드 삭제 실패:', apiErr)
        setError(`삭제 실패: ${apiErr.message || '알 수 없는 오류'}`)
        
        // 백엔드 삭제 실패 시에는 UI에서 제거하지 않음 (데이터 일관성 유지)
        // 사용자가 에러 메시지를 보고 다시 시도할 수 있도록 함
      }
    } catch (e) {
      console.error(e)
      setError(e.message || '학생 삭제 중 오류가 발생했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  function getDisplayName(student) {
    return student.name || '이름 없음'
  }
  
  function getDisplayNickname(student) {
    return student.nickname || '-'
  }

  // -------------------- 필터링 로직 --------------------
  function getFilteredStudents() {
    return students.filter(student => {
      const nickname = student.nickname || '-'
      const name = student.name || ''
      const birthDate = student.birth_date ? String(student.birth_date).slice(0, 10) : ''
      const groupName = student.group_name || '-'
      const logContent = student.log_content || ''

      if (filters.nickname && nickname !== filters.nickname) return false
      if (filters.name && name !== filters.name) return false
      if (filters.birth_date && birthDate !== filters.birth_date) return false
      if (filters.group_name && groupName !== filters.group_name) return false
      if (filters.log_content && !logContent.toLowerCase().includes(filters.log_content.toLowerCase())) return false

      return true
    })
  }

  // 각 컬럼의 고유 값 추출
  function getUniqueValues(column) {
    const values = students.map(student => {
      switch (column) {
        case 'nickname':
          return student.nickname || '-'
        case 'name':
          return student.name || ''
        case 'birth_date':
          return student.birth_date ? String(student.birth_date).slice(0, 10) : ''
        case 'group_name':
          return student.group_name || '-'
        default:
          return ''
      }
    })
    const uniqueValues = [...new Set(values)]
    // 빈 문자열과 '-'를 제외하고 정렬
    return uniqueValues.filter(v => v && v !== '').sort()
  }

  // 필터 검색어로 필터링된 옵션 목록
  function getFilteredOptions(column) {
    const allOptions = getUniqueValues(column)
    const searchTerm = filterSearch[column] || ''
    if (!searchTerm) return allOptions
    return allOptions.filter(option => 
      String(option).toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  // -------------------- JSX --------------------
  return (
    <Layout title="학생 관리">
      <div className="page-container" style={{ padding: 16 }}>
        {/* 상단 헤더 */}
        <div
          className="page-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
              학생 관리
            </h1>
            <p className="muted" style={{ fontSize: 13 }}>
              학생을 추가/수정/삭제 할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 에러 / 로딩 */}
        {error && (
          <div
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              borderRadius: 10,
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
            학생 목록을 불러오는 중입니다...
          </div>
        )}

        {/* ▶ 학생 추가 폼 */}
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: 16,
            borderRadius: 16,
            border: '1px solid #e5e7eb',
            background: '#ffffff',
          }}
        >
          <form onSubmit={handleCreate}>
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
                 value={newName}
                 onChange={e => setNewName(e.target.value)}
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
                 value={newNickname}
                 onChange={e => setNewNickname(e.target.value)}
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
                 value={newBirthDate}
                 onChange={e => setNewBirthDate(e.target.value)}
                 style={{
                   width: 140,
                   background: '#fffaf1',
                   border: '1px solid rgba(221, 201, 166, 0.5)',
                 }}
               />
             </div>

             {/* 단체명 (입력 가능한 드롭다운) */}
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
                   value={newGroupName}
                   onChange={e => setNewGroupName(e.target.value)}
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
               value={newLogContent}
               onChange={e => setNewLogContent(e.target.value)}
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

            {/* 하단: 학생 추가 버튼 (컨테이너 하단 우측) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 4,
              }}
            >
              <button
                type="submit"
                className="btn secondary"
                disabled={creating}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                  background: 'var(--accent-orange)',
                  color: '#fffdf8',
                  cursor: creating ? 'default' : 'pointer',
                  opacity: creating ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(242, 180, 92, 0.3)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!creating) {
                    e.target.style.background = 'var(--accent-orange-dark)'
                    e.target.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!creating) {
                    e.target.style.background = 'var(--accent-orange)'
                    e.target.style.transform = 'translateY(0)'
                  }
                }}
              >
                {creating ? '추가 중...' : '학생 추가'}
              </button>
            </div>
          </form>
        </div>

        {/* ▶ 학생 목록 테이블 */}
        <div
          className="card"
          style={{
            borderRadius: 16,
            border: '1px solid rgba(221, 201, 166, 0.4)',
            background: 'var(--bg-white)',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(156, 132, 90, 0.1)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14,
            }}
          >
            <thead
              style={{
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontWeight: 500,
                    fontSize: 13,
                    color: '#6b7280',
                  }}
                >
                  이름
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontWeight: 500,
                    fontSize: 13,
                    color: '#6b7280',
                  }}
                >
                  별명
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontWeight: 500,
                    fontSize: 13,
                    color: '#6b7280',
                  }}
                >
                  생년월일
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontWeight: 500,
                    fontSize: 13,
                    color: '#6b7280',
                  }}
                >
                  단체명
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontWeight: 500,
                    fontSize: 13,
                    color: '#6b7280',
                  }}
                >
                  비고(메모)
                </th>
                <th
                  style={{
                    width: 180,
                    textAlign: 'right',
                    padding: '10px 12px',
                    fontWeight: 500,
                    fontSize: 13,
                    color: '#6b7280',
                  }}
                >
                  작업
                </th>
              </tr>
              {/* 필터 행 */}
              <tr>
                <th style={{ padding: '8px 12px', background: 'var(--bg-white)' }}>
                  <FilterDropdown
                    column="name"
                    value={filters.name}
                    searchValue={filterSearch.name}
                    options={getFilteredOptions('name')}
                    onFilterChange={(value) => setFilters(prev => ({ ...prev, name: value }))}
                    onSearchChange={(value) => setFilterSearch(prev => ({ ...prev, name: value }))}
                    placeholder="이름 필터"
                  />
                </th>
                <th style={{ padding: '8px 12px', background: 'var(--bg-white)' }}>
                  <FilterDropdown
                    column="nickname"
                    value={filters.nickname}
                    searchValue={filterSearch.nickname}
                    options={getFilteredOptions('nickname')}
                    onFilterChange={(value) => setFilters(prev => ({ ...prev, nickname: value }))}
                    onSearchChange={(value) => setFilterSearch(prev => ({ ...prev, nickname: value }))}
                    placeholder="별명 필터"
                  />
                </th>
                <th style={{ padding: '8px 12px', background: 'var(--bg-white)' }}>
                  <FilterDropdown
                    column="birth_date"
                    value={filters.birth_date}
                    searchValue={filterSearch.birth_date}
                    options={getFilteredOptions('birth_date')}
                    onFilterChange={(value) => setFilters(prev => ({ ...prev, birth_date: value }))}
                    onSearchChange={(value) => setFilterSearch(prev => ({ ...prev, birth_date: value }))}
                    placeholder="생년월일 필터"
                  />
                </th>
                <th style={{ padding: '8px 12px', background: 'var(--bg-white)' }}>
                  <FilterDropdown
                    column="group_name"
                    value={filters.group_name}
                    searchValue={filterSearch.group_name}
                    options={getFilteredOptions('group_name')}
                    onFilterChange={(value) => setFilters(prev => ({ ...prev, group_name: value }))}
                    onSearchChange={(value) => setFilterSearch(prev => ({ ...prev, group_name: value }))}
                    placeholder="단체명 필터"
                  />
                </th>
                <th style={{ padding: '8px 12px', background: 'var(--bg-white)' }}>
                  <input
                    type="text"
                    placeholder="비고 검색..."
                    value={filters.log_content}
                    onChange={(e) => setFilters(prev => ({ ...prev, log_content: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: '1px solid rgba(221, 201, 166, 0.5)',
                      background: '#fffaf1',
                      fontSize: 12,
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
                </th>
                <th style={{ padding: '8px 12px', background: '#ffffff' }}></th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '14px 12px',
                      fontSize: 13,
                      color: '#6b7280',
                    }}
                  >
                    학생이 없습니다. 상단에서 새 학생을 추가해보세요.
                  </td>
                </tr>
              ) : getFilteredStudents().length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '14px 12px',
                      fontSize: 13,
                      color: '#6b7280',
                    }}
                  >
                    필터 조건에 맞는 학생이 없습니다.
                  </td>
                </tr>
              ) : (
                getFilteredStudents().map(student => {
                  const displayName = getDisplayName(student)
                  const displayNickname = getDisplayNickname(student)
                  const birthDate = student.birth_date
                    ? String(student.birth_date).slice(0, 10)
                    : ''

                  return (
                    <tr
                      key={student.id}
                      style={{ borderBottom: '1px solid #f3f4f6' }}
                    >
                      <td style={{ padding: '10px 12px', color: 'var(--text-dark)' }}>{displayName}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-dark)' }}>{displayNickname}</td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 13,
                          color: 'var(--text-dark)',
                        }}
                      >
                        {birthDate || '-'}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 13,
                          color: 'var(--text-dark)',
                        }}
                      >
                        {student.group_name || '-'}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 13,
                          color: 'var(--text-gray)',
                          maxWidth: 260,
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                        }}
                        title={student.log_content || ''}
                      >
                        {student.log_content || ''}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => openEditModal(student)}
                          style={{
                            marginRight: 8,
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(242, 180, 92, 0.4)',
                            background: 'var(--accent-orange)',
                            color: '#fffdf8',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(242, 180, 92, 0.25)',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = 'var(--accent-orange-dark)'
                            e.target.style.transform = 'translateY(-1px)'
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'var(--accent-orange)'
                            e.target.style.transform = 'translateY(0)'
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => handleDelete(student)}
                          disabled={deletingId === student.id}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: 'none',
                            background: '#d97757',
                            color: '#fffdf8',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor:
                              deletingId === student.id ? 'default' : 'pointer',
                            opacity: deletingId === student.id ? 0.7 : 1,
                            boxShadow: '0 2px 8px rgba(217, 119, 87, 0.3)',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            if (deletingId !== student.id) {
                              e.target.style.background = '#c2654a'
                              e.target.style.transform = 'translateY(-1px)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (deletingId !== student.id) {
                              e.target.style.background = '#d97757'
                              e.target.style.transform = 'translateY(0)'
                            }
                          }}
                        >
                          {deletingId === student.id ? '삭제 중...' : '삭제'}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 수정 모달 */}
      {editingStudent && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(40, 30, 15, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            className="modal"
            style={{
              width: '100%',
              maxWidth: 480,
              borderRadius: 18,
              background: 'var(--bg-white)',
              padding: 20,
              boxShadow: '0 16px 34px rgba(120, 97, 59, 0.35)',
            }}
          >
            <div
              style={{
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                학생 정보 수정
              </h2>
              <button
                type="button"
                onClick={closeEditModal}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleEditSave}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <label style={{ fontSize: 13 }}>
                이름
                <input
                  type="text"
                  name="name"
                  value={editForm.name}
                  onChange={handleEditChange}
                  required
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(221, 201, 166, 0.5)',
                    background: '#fffaf1',
                    fontSize: 14,
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
              </label>

              <label style={{ fontSize: 13 }}>
                별명
                <input
                  type="text"
                  name="nickname"
                  value={editForm.nickname}
                  onChange={handleEditChange}
                  placeholder="예: 철수"
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(221, 201, 166, 0.5)',
                    background: '#fffaf1',
                    fontSize: 14,
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
              </label>

              <label style={{ fontSize: 13 }}>
                생년월일
                <input
                  type="date"
                  name="birth_date"
                  value={editForm.birth_date || ''}
                  onChange={handleEditChange}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(221, 201, 166, 0.5)',
                    background: '#fffaf1',
                    fontSize: 14,
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
              </label>

              <label style={{ fontSize: 13 }}>
                단체명
                <div style={{ position: 'relative', width: '100%', marginTop: 4 }}>
                  <select
                    name="group_name"
                    value={editForm.group_name || ''}
                    onChange={handleEditChange}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid rgba(221, 201, 166, 0.5)',
                      background: '#fffaf1',
                      fontSize: 14,
                      color: 'var(--text-dark)',
                      cursor: 'pointer',
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
                  >
                    <option value="">선택하세요</option>
                    <option value="초등부">초등부</option>
                    <option value="중등부">중등부</option>
                    <option value="고등부">고등부</option>
                  </select>
                </div>
              </label>

              <label style={{ fontSize: 13 }}>
                메모(별명/특이사항)
                <textarea
                  name="log_content"
                  value={editForm.log_content}
                  onChange={handleEditChange}
                  rows={4} // 메모 영역 조금 더 넓게
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(221, 201, 166, 0.5)',
                    background: '#fffaf1',
                    fontSize: 14,
                    resize: 'vertical',
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
                  placeholder="이 학생에 대한 간단한 메모를 남겨보세요."
                />
              </label>

              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="btn secondary"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: '1px solid rgba(221, 201, 166, 0.5)',
                    background: 'var(--bg-white)',
                    color: 'var(--text-dark)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#f8f2e4'
                    e.target.style.borderColor = 'var(--accent-orange)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'var(--bg-white)'
                    e.target.style.borderColor = 'rgba(221, 201, 166, 0.5)'
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={savingEdit}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: 'none',
                    background: 'var(--accent-green)',
                    color: '#fffdf8',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: savingEdit ? 'default' : 'pointer',
                    opacity: savingEdit ? 0.7 : 1,
                    boxShadow: '0 4px 12px rgba(139, 191, 123, 0.3)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!savingEdit) {
                      e.target.style.background = 'var(--accent-green-dark)'
                      e.target.style.transform = 'translateY(-1px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!savingEdit) {
                      e.target.style.background = 'var(--accent-green)'
                      e.target.style.transform = 'translateY(0)'
                    }
                  }}
                >
                  {savingEdit ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}

export { StudentList }
