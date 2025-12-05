// src/main.jsx (HashRouter 버전)
import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './App.css'
import './index.css'
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from 'react-router-dom'

import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import UploadPage from './pages/UploadPage.jsx'
import Report from './pages/Report.jsx'
import StudentList from './pages/StudentList.jsx'
import RequireAuth from './components/RequireAuth.jsx'

function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        {/* 공개 라우트 */}
        <Route path="/login" element={<Login />} />

        {/* 보호 라우트(로그인 필요) */}
        <Route
          path="/upload"
          element={
            <RequireAuth>
              <UploadPage />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/report"
          element={
            <RequireAuth>
              <Report />
            </RequireAuth>
          }
        />
        <Route
          path="/students"
          element={
            <RequireAuth>
              <StudentList />
            </RequireAuth>
          }
        />

        {/* 루트 → 로그인 페이지로 리다이렉트 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 나머지 이상한 주소들은 전부 로그인으로 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
