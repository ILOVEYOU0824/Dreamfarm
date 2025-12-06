// src/pages/Login.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoImg from '../assets/logo.png' 
import { apiFetch } from '../lib/api' 

export default function Login() {
  const navigate = useNavigate()
  
  // 상태 관리
  const [userType] = useState('admin') // 운영자만 사용
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // 로그인 함수
  async function handleLogin(e) {
    e.preventDefault() 
    if (!email || !password) {
      alert('아이디와 비밀번호를 모두 입력해주세요.')
      return
    }
    setLoading(true)
    try {
      // 개발 편의를 위해 고정 계정(123/123) 우선 처리
      if (email === '123' && password === '123') {
        const mockUser = {
          display_name: '테스트 사용자',
          role: userType === 'admin' ? 'admin' : 'sub_admin',
        }
        localStorage.setItem('token', 'local-demo-token')
        localStorage.setItem('user', JSON.stringify(mockUser))
        alert('환영합니다, 테스트 사용자님!')
        navigate('/upload')
        return
      }

      const data = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (data.token) {
        try {
          localStorage.setItem('token', data.token)
          localStorage.setItem('user', JSON.stringify(data.user))
        } catch (storageErr) {
          console.warn('localStorage 오류', storageErr)
        }
        alert(`환영합니다, ${data.user.display_name || '선생님'}!`)
        navigate('/upload')
      } else {
        alert('로그인에 실패했습니다. (토큰 없음)')
      }
    } catch (err) {
      console.error(err)
      alert('로그인 오류: 아이디와 비밀번호를 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  // 🎨 스타일 객체
  const styles = {
    page: {
      width: '100vw',
      height: '100vh',
      backgroundColor: '#F9F9F7',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'  // 스크롤 방지
    },
    logoAbsolute: {
      position: 'absolute',
      top: '20px',
      left: '30px'
    },
    logoImg: {
      width: '80px',
      objectFit: 'contain'
    },
    card: {
      backgroundColor: 'white',
      width: '90%',
      maxWidth: '420px',
      padding: '40px 30px',
      borderRadius: '30px',
      textAlign: 'center',
      boxShadow: '0 10px 30px rgba(0,0,0,0.03)',
      position: 'relative',
      zIndex: 1
    },
    title: {
      fontSize: '32px',
      fontWeight: '800',
      marginBottom: '30px',
      color: '#000'
    },
    inputGroup: {
      textAlign: 'left',
      marginBottom: '15px'
    },
    label: {
      display: 'block',
      fontSize: '13px',
      fontWeight: '700',
      marginBottom: '6px',
      color: '#333'
    },
    input: {
      width: '100%',
      padding: '14px',
      background: '#F5F5F5',
      border: 'none',
      borderRadius: '12px',
      fontSize: '14px',
      outline: 'none',
      boxSizing: 'border-box'
    },
    optionsRow: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '12px',
      color: '#666',
      marginBottom: '25px',
      flexWrap: 'wrap',
      gap: '10px'
    },
    submitBtn: {
      width: '100%',
      padding: '18px',
      backgroundColor: '#8DA92C',
      color: 'white',
      border: 'none',
      borderRadius: '15px',
      fontSize: '16px',
      fontWeight: '700',
      cursor: 'pointer',
      marginBottom: '25px'
    },
    footerText: {
      fontSize: '11px',
      color: '#888',
      marginBottom: '30px',
      lineHeight: '1.4'
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.logoAbsolute}>
        <img src={logoImg} alt="꿈이자라는뜰" style={styles.logoImg} />
      </div>

      <div style={styles.card}>
        <h1 style={styles.title}>로그인</h1>

        <form onSubmit={handleLogin}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>아이디</label>
            <input 
              type="text" 
              placeholder="꿈이 자라는 뜰 운영자 아이디를 입력하세요." 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>비밀번호</label>
            <input 
              type="password" 
              placeholder="비밀번호를 입력하세요." 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.optionsRow}>
            <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
              <label style={{display:'flex', alignItems:'center', gap:'4px', cursor:'pointer'}}>
                <input type="checkbox" /> 아이디 저장
              </label>
              <label style={{display:'flex', alignItems:'center', gap:'4px', cursor:'pointer'}}>
                <input type="checkbox" /> 보안 로그인
              </label>
            </div>
          </div>

          <button type="submit" style={styles.submitBtn} disabled={loading}>
            {loading ? '로그인 중...' : '운영자 로그인'}
          </button>
        </form>

        <p style={styles.footerText}>
          장애인과 비장애인들이 함께 어울리는 농장. 꿈이 자라는 뜰
        </p>
      </div>
    </div>
  )
}