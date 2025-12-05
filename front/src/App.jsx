// src/App.jsx: 라우팅(페이지 이동) 담당 파일
import './App.css'

import React from 'react'


import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import RequireAuth from './components/RequireAuth.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import UploadPage from './pages/UploadPage.jsx'
import Report from './pages/Report.jsx'
import StudentList from './pages/StudentList.jsx'

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 로그인 페이지 */}
        <Route path="/login" element={<Login />} />

        {/* 기본 진입시 업로드 페이지로 리다이렉트 */}
        <Route path="/" element={<Navigate to="/upload" replace />} />

        {/* 활동 업로드 페이지 */}
        <Route
          path="/upload"
          element={
            <RequireAuth>
              <UploadPage />
            </RequireAuth>
          }
        />

        {/* 대시보드 */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />

        {/* AI 리포트 생성 및 조회 */}
        <Route
          path="/report"
          element={
            <RequireAuth>
              <Report />
            </RequireAuth>
          }
        />

        {/* 관리자(학생 목록) | 메모 관리 페이지 */}
        <Route
          path="/students"
          element={
            <RequireAuth>
              <StudentList />
            </RequireAuth>
          }
        />

        {/* 나머지 모든 경로에서 업로드로 보내기 */}
        <Route path="*" element={<Navigate to="/upload" replace />} />
      </Routes>
    </Router>
  )
}
