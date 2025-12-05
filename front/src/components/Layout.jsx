// src/components/Layout.jsx
import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logoImg from '../assets/logo.png' // 이미지 경로 확인

// 아이콘 이미지 import (사용하지 않음)

// --- 프로필 설정 모달 (TopNav에서 가져옴) ---
function ProfileModal({ user, onClose, onSave }) {
  const [nickname, setNickname] = useState(user?.display_name || user?.name || '사용자')
  
  function handleSubmit(e) {
    e.preventDefault()
    const nextUser = {
      ...(user || {}),
      display_name: nickname,
      name: nickname,
    }
    onSave(nextUser)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3>프로필 설정</h3>
        <p style={{color:'#666', fontSize:14, marginBottom:20}}>화면에 표시될 이름을 변경할 수 있습니다.</p>
        
        <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:15}}>
          <div>
            <label style={{display:'block', marginBottom:5, fontWeight:600}}>별명</label>
            <input 
              value={nickname} 
              onChange={e => setNickname(e.target.value)} 
              style={{width:'100%', padding:10, border:'1px solid #ddd', borderRadius:8}}
            />
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:10}}>
            <button type="button" onClick={onClose} style={{padding:'10px 20px', borderRadius:8, border:'1px solid #ddd', background:'white', cursor:'pointer'}}>취소</button>
            <button type="submit" style={{padding:'10px 20px', borderRadius:8, border:'none', background:'#1F2937', color:'white', cursor:'pointer'}}>저장</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- 메인 레이아웃 (사이드바 포함) ---
export default function Layout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [user, setUser] = useState(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [expandedMenu, setExpandedMenu] = useState(location.pathname.startsWith('/dashboard') ? '대시보드' : null)
  const [activeDashboardSection, setActiveDashboardSection] = useState(() => {
    try {
      return localStorage.getItem('dashboard-active-section') || 'emotion-keywords'
    } catch {
      return 'emotion-keywords'
    }
  })

  // 사용자 정보 불러오기
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      if (raw) setUser(JSON.parse(raw))
    } catch (e) {
      console.error(e)
    }
  }, [])

  // 대시보드 섹션 변경 감지
  useEffect(() => {
    const handleDashboardSection = (event) => {
      const section = event.detail
      setActiveDashboardSection(section)
    }
    window.addEventListener('dashboard-section', handleDashboardSection)
    return () => {
      window.removeEventListener('dashboard-section', handleDashboardSection)
    }
  }, [])

  // location 변경 시 activeDashboardSection 업데이트
  useEffect(() => {
    if (location.pathname.startsWith('/dashboard')) {
      try {
        const savedSection = localStorage.getItem('dashboard-active-section')
        if (savedSection) {
          setActiveDashboardSection(savedSection)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }, [location.pathname])

  // 로그아웃 처리
  function handleLogout() {
    if(window.confirm('로그아웃 하시겠습니까?')){
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      navigate('/login')
    }
  }

  // 프로필 저장 처리
  function handleSaveProfile(nextUser) {
    setUser(nextUser)
    localStorage.setItem('user', JSON.stringify(nextUser))
  }

  const menuItems = [
    { label: '업로드', path: '/upload' },
    { 
      label: '대시보드', 
      path: '/dashboard',
      subItems: [
        { label: '감정키워드빈도', path: '/dashboard', section: 'emotion-keywords' },
        { label: '활동유형분포', path: '/dashboard', section: 'activity-types' },
        { label: '활동별능력분석', path: '/dashboard', section: 'activity-abilities' },
      ]
    },
    { label: '리포트', path: '/report' },
    { label: '학생 관리', path: '/students' },
  ]

  return (
    <div className="app-container">
      {/* 1. 왼쪽 사이드바 */}
      <nav className="sidebar">
        <div className="brand-logo" onClick={() => navigate('/upload')}>
        </div>

        {/* 사용자 프로필 (클릭 시 모달 열림) */}
        <div className="user-profile-mini">
          <div className="avatar-circle">
            <img src={logoImg} alt="Profile" className="user-avatar-img" />
          </div>
          <div style={{fontWeight: 700, fontSize: 16, marginTop: 5}}>
            {user ? (user.display_name || user.name) : '선생님'}
          </div>
          <button 
            onClick={() => setIsProfileOpen(true)}
            style={{border:'none', background:'none', color:'#666', fontSize:12, cursor:'pointer', textDecoration:'underline', marginTop:5}}
          >
            프로필 설정
          </button>
        </div>

        {/* 메뉴 리스트 */}
        <div className="nav-menu">
          {menuItems.map((item) => (
            <div key={item.label}>
              <div 
                className={`nav-item ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
                onClick={() => {
                  if (item.subItems) {
                    setExpandedMenu(expandedMenu === item.label ? null : item.label)
                  } else {
                    navigate(item.path)
                  }
                }}
              >
                {item.label}
              </div>
              {item.subItems && expandedMenu === item.label && (
                <div className="nav-submenu">
                  {item.subItems.map((subItem) => (
                    <div
                      key={subItem.label}
                      className={`nav-subitem ${location.pathname.startsWith(subItem.path) && activeDashboardSection === subItem.section ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(subItem.path)
                        // 섹션으로 스크롤하거나 상태 전달 (필요시)
                        if (subItem.section) {
                          // Dashboard 컴포넌트에서 처리할 수 있도록 이벤트 전달
                          window.dispatchEvent(new CustomEvent('dashboard-section', { detail: subItem.section }))
                          setActiveDashboardSection(subItem.section)
                        }
                      }}
                    >
                      {subItem.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 하단 로그아웃 */}
        <div style={{marginTop: 'auto', paddingLeft: 20, paddingRight: 20, display: 'flex', justifyContent: 'center'}}>
          <div className="nav-item nav-item-logout" onClick={handleLogout} style={{color: '#FF6B6B'}}>
            로그아웃
          </div>
        </div>
      </nav>

      {/* 2. 메인 콘텐츠 영역 */}
      <div className="page-wrapper">
        {children}
      </div>

      {/* 프로필 수정 모달 */}
      {isProfileOpen && (
        <ProfileModal 
          user={user} 
          onClose={() => setIsProfileOpen(false)} 
          onSave={handleSaveProfile} 
        />
      )}
    </div>
  )
}