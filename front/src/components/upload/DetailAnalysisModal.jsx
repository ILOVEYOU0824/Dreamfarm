// src/components/upload/DetailAnalysisModal.jsx
import React from 'react'
import EmotionKeywordSelector from './EmotionKeywordSelector'
import { formatDate, splitDuration, getActiveStudentState } from '../../utils/uploadHelpers'

export default function DetailAnalysisModal({
  detail,
  setDetail,
  aiLoading,
  downloading,
  handleRunAiExtraction,
  handleDownloadOriginal,
  closeDetail,
  aiError,
  studentPickerOpen,
  setStudentPickerOpen,
  studentPickerValue,
  setStudentPickerValue,
  studentsMaster,
  handleAddStudent,
  handleAddStudentFromPicker,
  handleSelectStudent,
  handleRemoveStudent,
  emotionKeywords,
  addEmotionKeywordInSupabase,
  toggleEmotionTagInDetail,
  toggleActivityTypeSelection,
  updateEditedAnalysis,
  updateActivityTypeDetail,
  handleSaveLogEntry
}) {
  if (!detail.open || !detail.upload) return null

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closeDetail}>
      <div className="modal-card modal-card-wide detail-analysis-modal" onClick={e => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div className="detail-analysis-header">
          <div>
            <h3>상세 편집 및 AI 분석</h3>
            <p className="card-subtitle detail-analysis-meta">
              {detail.upload.file_name} · {formatDate(detail.upload.uploaded_at)} · ID {detail.upload.id.slice(0, 8)}
            </p>
          </div>
          <div className="detail-header-actions">
            <button type="button" className="btn secondary" onClick={handleRunAiExtraction} disabled={aiLoading}>
              {aiLoading ? '분석 중...' : 'AI 재분석'}
            </button>
            <button type="button" className="btn secondary" onClick={handleDownloadOriginal} disabled={downloading}>
              다운로드
            </button>
            <button type="button" className="btn ghost" onClick={closeDetail}>
              닫기
            </button>
          </div>
        </div>

        {detail.error && <div className="error">{detail.error}</div>}
        {aiError && <div className="error">{aiError}</div>}

        {/* 학생 탭 영역 */}
        <div className="student-tabs-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="student-tabs" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(detail.students || []).map(stu => (
              <button
                key={stu.id}
                className={`emotion-chip ${stu.id === detail.activeStudentId ? 'emotion-chip-selected' : 'emotion-chip-unselected'}`}
                onClick={() => handleSelectStudent(stu.id)}
              >
                {stu.name}
                <span style={{ marginLeft: 5, opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); handleRemoveStudent(stu.id) }}>×</span>
              </button>
            ))}
            <button className="btn ghost small" onClick={handleAddStudent}>+ 학생 추가</button>
          </div>

          {/* 학생 추가 피커 */}
          {studentPickerOpen && (
            <div style={{ display: 'flex', gap: 5 }}>
              <select className="analysis-input" value={studentPickerValue} onChange={e => setStudentPickerValue(e.target.value)}>
                <option value="">학생 선택</option>
                {studentsMaster.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn secondary small" onClick={handleAddStudentFromPicker}>추가</button>
            </div>
          )}
        </div>

        {/* 본문 영역 */}
        {detail.loading ? <div className="muted">로딩 중...</div> : (
          <div className="detail-layout detail-layout-modern">
            {/* [왼쪽] 텍스트 에디터 */}
            <section className="detail-left">
              <div className="detail-panel">
                <h4>원본 텍스트</h4>
                <textarea
                  className="detail-textarea"
                  value={detail.editedText}
                  onChange={e => setDetail(p => ({ ...p, editedText: e.target.value, saved: false }))}
                  placeholder="AI가 추출한 텍스트입니다. 자유롭게 수정하세요."
                />
              </div>
            </section>

            {/* [오른쪽] 분석 폼 */}
            <section className="detail-right">
              {(() => {
                const { activeId, analysis: a, activityTypes } = getActiveStudentState(detail)
                if (!activeId) return <div className="muted">학생을 선택해주세요</div>

                const { hours, minutes } = splitDuration(a.durationMinutes)
                const safeHours = Number.isNaN(hours) ? 0 : hours
                const safeMinutes = Number.isNaN(minutes) ? 0 : minutes

                return (
                  <div className="analysis-panel">
                    <div className="analysis-section">
                      <h5>활동 기본 정보</h5>
                      <div className="analysis-grid">
                        <label>활동일</label>
                        <input type="date" className="analysis-input" value={a.date ? formatDate(a.date) : ''} onChange={e => updateEditedAnalysis({ date: e.target.value })} />

                        <label>활동명</label>
                        <input type="text" className="analysis-input" value={a.activityName || ''} onChange={e => updateEditedAnalysis({ activityName: e.target.value })} />

                        <label>소요시간</label>
                        <div className="time-input-group">
                          <input type="number" min="0" className="analysis-input time-input" value={safeHours} 
                            onChange={e => updateEditedAnalysis({ durationMinutes: Number(e.target.value) * 60 + safeMinutes })} />
                          <span className="time-separator">시간</span>
                          <input type="number" min="0" max="59" className="analysis-input time-input" value={safeMinutes} 
                            onChange={e => updateEditedAnalysis({ durationMinutes: safeHours * 60 + Number(e.target.value) })} />
                          <span className="time-separator">분</span>
                        </div>

                        <label>비고</label>
                        <input type="text" className="analysis-input" value={a.note || ''} onChange={e => updateEditedAnalysis({ note: e.target.value })} />
                      </div>
                    </div>

                    <div className="analysis-section">
                      <h5>감정 키워드</h5>
                      <EmotionKeywordSelector
                        masterList={emotionKeywords}
                        selected={a.emotionTags || []}
                        onToggle={toggleEmotionTagInDetail}
                        onAddNew={addEmotionKeywordInSupabase}
                      />
                    </div>

                    <div className="analysis-section">
                      <h5>활동 유형</h5>
                      <div className="activity-type-grid">
                        {Object.entries(activityTypes || {}).map(([key, item]) => (
                          <div key={key} className={`activity-type-card ${item.selected ? 'selected' : ''}`}>
                            <button type="button" className="activity-type-toggle" onClick={() => toggleActivityTypeSelection(key)}>
                              <span className="activity-type-icon">{item.icon}</span>
                              <span className="activity-type-label">{item.label}</span>
                              {item.selected && <span>✓</span>}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </section>
          </div>
        )}

        {/* 푸터 */}
        <div className="detail-modal-footer">
          <button className="btn" onClick={handleSaveLogEntry} disabled={detail.saving}>
            {detail.saving ? '저장 중...' : '데이터베이스 저장'}
          </button>
          {detail.saved && <span className="badge badge-success">저장 완료</span>}
        </div>

      </div>
    </div>
  )
}