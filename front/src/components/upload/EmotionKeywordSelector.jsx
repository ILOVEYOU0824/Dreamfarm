// src/components/upload/EmotionKeywordSelector.jsx
import React, { useState } from 'react'

export default function EmotionKeywordSelector({ masterList, selected, onToggle, onAddNew }) {
  const [inputValue, setInputValue] = useState('')
  const safeSelected = Array.isArray(selected) ? selected : []
  const safeMaster = Array.isArray(masterList) ? masterList : []

  // 부분 일치 필터링 (대소문자 구분 없이, 한글 포함 검색)
  const suggestions = inputValue.trim().length === 0 ? [] : safeMaster.filter(item => {
    const label = (item.label || item.name || '').trim()
    if (!label || safeSelected.includes(label)) return false
    
    const searchValue = inputValue.trim()
    // 키워드에 입력값이 포함되어 있는지 확인 (한글 포함)
    return label.includes(searchValue) || label.startsWith(searchValue)
  }).slice(0, 10) // 최대 10개만 표시

  const handleSubmit = e => {
    e.preventDefault()
    const value = inputValue.trim()
    if (!value) return

    // 정확히 일치하는 키워드 찾기
    const exactMatch = safeMaster.find(item => {
      const label = (item.label || item.name || '').trim()
      return label === value
    })

    if (exactMatch) {
      // 정확히 일치하면 토글
      onToggle && onToggle(exactMatch.label || exactMatch.name)
    } else {
      // 부분 일치하는 키워드가 있으면 첫 번째 것을 선택
      const partialMatch = suggestions[0]
      if (partialMatch) {
        onToggle && onToggle(partialMatch.label || partialMatch.name)
      } else {
        // 없으면 새로 추가
        onAddNew && onAddNew(value)
      }
    }
    setInputValue('')
  }

  return (
    <div>
      <div className="emotion-chips-row">
        {safeSelected.map(label => (
          <button key={label} type="button" className="emotion-chip emotion-chip-selected" onClick={() => onToggle && onToggle(label)}>
            <span className="emotion-chip-label">{label}</span>
            <span className="emotion-chip-icon">✓</span>
          </button>
        ))}
      </div>
      <form className="emotion-chip-add-row" onSubmit={handleSubmit}>
        <input type="text" className="analysis-input emotion-chip-input" placeholder="키워드 입력" value={inputValue} onChange={e => setInputValue(e.target.value)} />
        <button 
          type="submit" 
          className="btn ghost small"
          style={{
            border: '1px dashed var(--accent-green)',
            color: 'var(--accent-green-dark)',
            background: 'transparent',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#f0f7ed'
            e.target.style.borderColor = 'var(--accent-green-dark)'
            e.target.style.color = 'var(--accent-green-dark)'
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent'
            e.target.style.borderColor = 'var(--accent-green)'
            e.target.style.color = 'var(--accent-green-dark)'
          }}
        >
          + 추가
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="emotion-chips-row" style={{ marginTop: 6 }}>
          {suggestions.map(item => (
            <button key={item.id} type="button" className="emotion-chip emotion-chip-unselected" onClick={() => onToggle && onToggle(item.label || item.name)}>
              <span className="emotion-chip-label">{item.label || item.name}</span>
              <span className="emotion-chip-icon">+</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}