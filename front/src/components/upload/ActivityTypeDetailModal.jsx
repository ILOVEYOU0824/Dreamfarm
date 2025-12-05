// src/components/upload/ActivityTypeDetailModal.jsx
import React from 'react'
import { formatDate } from '../../utils/uploadHelpers'

export default function ActivityTypeDetailModal({ modal, onClose, studentName }) {
  if (!modal.open) return null

  const records = modal.records || []
  const summary = modal.summary || {}
  const totalActivities = summary.total || records.length
  const topActivity = summary.top_activity || summary.topActivity || records[0]?.activity_name || '데이터 없음'
  const activityTypeCount = summary.activity_types || summary.activityTypes || new Set(records.map(r => r.activity_type)).size || 0

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-wide activity-detail-modal">
        <div className="detail-analysis-header">
          <div><h3>활동 유형 상세 집계</h3><p className="card-subtitle detail-analysis-meta">{studentName || '학생'} 활동 데이터 집계 결과입니다.</p></div>
          <div className="detail-header-actions"><button type="button" className="btn ghost" onClick={onClose}>닫기</button></div>
        </div>

        {modal.loading ? <div className="muted">상세 데이터를 불러오는 중입니다...</div> : modal.error ? <div className="error">{modal.error}</div> : (
          <>
            <div className="activity-detail-table">
              <div className="activity-detail-table-head"><span>날짜</span><span>활동명</span><span>활동 유형</span><span>비고</span></div>
              {records.length === 0 ? <div className="activity-detail-empty">아직 집계된 활동이 없습니다.</div> : records.map(item => (
                <div key={item.id || item.log_id} className="activity-detail-row">
                  <span>{formatDate(item.log_date) || '-'}</span>
                  <span>{item.activity_name || '-'}</span>
                  <span><span className="activity-type-chip">{item.activity_type || '미분류'}</span></span>
                  <span>{item.note || item.memo || '-'}</span>
                </div>
              ))}
            </div>
            <div className="activity-summary-grid">
              <div className="activity-summary-card"><p className="card-subtitle">총 활동 횟수</p><p className="card-title-main">{totalActivities}</p></div>
              <div className="activity-summary-card"><p className="card-subtitle">가장 많은 활동</p><p className="card-title-main">{topActivity}</p></div>
              <div className="activity-summary-card"><p className="card-subtitle">활동 유형 수</p><p className="card-title-main">{activityTypeCount}</p></div>
            </div>
            <div className="activity-analysis-box"><h5>활동 분석</h5><p>{modal.analysisText || `${studentName || '학생'}은 최근 활동 기간 동안 ${totalActivities || 0}회의 활동을 수행했으며, ${activityTypeCount || 0}가지 유형을 경험했습니다.`}</p></div>
          </>
        )}
      </div>
    </div>
  )
}