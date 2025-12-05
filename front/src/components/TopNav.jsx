// src/components/TopNav.jsx
import React, { useEffect, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import logoImg from '../assets/logo.png'

function NavTab({ to, icon, label, isActive }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      className={isActive ? 'nav-tab active' : 'nav-tab'}
      onClick={() => navigate(to)}
    >
      {icon && <span className="nav-tab-icon">{icon}</span>}
      <span>{label}</span>
    </button>
  )
}

function ProfileMenu({ onClose, onSelectUsers, onSelectProfile, onSelectLogout }) {
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose()
      }
    }
    function handleEsc(e) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose])

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-menu-item"
        onClick={onSelectUsers}
      >
        사용자
      </button>
      <button
        type="button"
        className="profile-menu-item"
        onClick={onSelectProfile}
      >
        프로필
      </button>
      <button
        type="button"
        className="profile-menu-item"
        onClick={onSelectLogout}
      >
        로그아웃
      </button>
    </div>
  )
}

function ProfileModal({ user, onClose, onSave }) {
  const [nickname, setNickname] = useState(
    user?.display_name || user?.name || '사용자'
  )
  const [newId, setNewId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')

  function handleSubmit(e) {
    e.preventDefault()

    if (newPassword && newPassword !== newPasswordConfirm) {
      alert('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.')
      return
    }

    const nextUser = {
      ...(user || {}),
      display_name: nickname || (user && (user.display_name || user.name)),
      name: nickname || (user && (user.display_name || user.name)),
      id: newId || user?.id,
      // 비밀번호는 데모라 실제 저장/전송은 하지 않음
    }

    onSave(nextUser)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card profile-settings-modal"
        onClick={e => e.stopPropagation()}
      >
        <button
          className="modal-close"
          aria-label="닫기"
          type="button"
          onClick={onClose}
        >
          ✕
        </button>

        <h3>프로필 설정</h3>
        <p className="muted">사용자 정보를 수정할 수 있습니다</p>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label htmlFor="nickname">별명</label>
          <input
            id="nickname"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="화면에 표시할 이름"
          />

          <p className="profile-settings-helper">ID/PW 재설정 (선택사항)</p>

          <label htmlFor="newId">새 아이디</label>
          <input
            id="newId"
            value={newId}
            onChange={e => setNewId(e.target.value)}
            placeholder="변경할 아이디 입력 (선택)"
          />

          <label htmlFor="newPassword">새 비밀번호</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="변경할 비밀번호 입력 (선택)"
          />

          <label htmlFor="newPasswordConfirm">비밀번호 확인</label>
          <input
            id="newPasswordConfirm"
            type="password"
            value={newPasswordConfirm}
            onChange={e => setNewPasswordConfirm(e.target.value)}
            placeholder="비밀번호 확인"
          />

          <div className="modal-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={onClose}
            >
              취소
            </button>
            <button type="submit" className="btn">
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TopNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname || '/'

  const [user, setUser] = useState(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      if (raw) {
        setUser(JSON.parse(raw))
      }
    } catch (e) {
      console.error('사용자 정보를 불러오는 중 오류', e)
    }
  }, [])

  const isUpload = path.startsWith('/upload')
  const isDashboard = path === '/dashboard'
  const isReport = path === '/report'
  const isAdmin = path.startsWith('/students')

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    setIsMenuOpen(false)
    setIsProfileOpen(false)
    navigate('/login')
  }

  function handleSaveProfile(nextUser) {
    setUser(nextUser)
    try {
      localStorage.setItem('user', JSON.stringify(nextUser))
    } catch (e) {
      console.error('사용자 정보를 저장하는 중 오류', e)
    }
  }

  return (
    <>
      <header className="top-nav">
        <div className="top-nav-left">
          <div
            className="brand"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/upload')}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/upload')
            }}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              cursor: 'pointer',
              gap: '8px' }} 
          >
            <img 
              src={logoImg} 
              alt="로고" 
              style={{ height: '60px', objectFit: 'contain' }} 
            />
          </div>
        </div>

        <nav className="top-nav-center">
          <NavTab to="/upload" label="업로드" isActive={isUpload} />
          <NavTab to="/dashboard" label="대시보드" isActive={isDashboard} />
          <NavTab to="/report" label="리포트" isActive={isReport} />
          <NavTab to="/students" label="관리자" isActive={isAdmin} />
        </nav>

        <div className="top-nav-right">
          <button
            className="avatar-btn"
            aria-label="내 계정"
            type="button"
            onClick={() => setIsMenuOpen(prev => !prev)}
            style={{ 
              width: '45px',  
              height: '45px',
              outline: 'none',          // 클릭했을 때 생기는 굵은 검은 테두리 삭제
              padding: 0,               // 불필요한 여백 삭제
              cursor: 'pointer',        // 마우스 올리면 손가락 모양
              display: 'flex',          // 이미지를 가운데 정렬
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <img 
              src={logoImg} 
              alt="프로필 이미지" 
              style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '32%', /* 동그랗게 만들기 (원하지 않으면 빼세요) */
                objectFit: 'contain' 
              }} 
            />
          </button>
        </div>
      </header>

      {isMenuOpen && (
        <ProfileMenu
          onClose={() => setIsMenuOpen(false)}
          onSelectUsers={() => {
            navigate('/students')
            setIsMenuOpen(false)
          }}
          onSelectProfile={() => {
            setIsMenuOpen(false)
            setIsProfileOpen(true)
          }}
          onSelectLogout={handleLogout}
        />
      )}

      {isProfileOpen && (
        <ProfileModal
          user={user}
          onClose={() => setIsProfileOpen(false)}
          onSave={handleSaveProfile}
        />
      )}
    </>
  )
}
