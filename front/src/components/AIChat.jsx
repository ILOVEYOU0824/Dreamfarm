// src/components/AIChat.jsx
import React, { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../lib/api.js'
import './AIChat.css'

export default function AIChat({ students = [], startDate = '', endDate = '', selectedStudentId = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '안녕하세요! 학생들의 활동과 감정에 대해 궁금한 점이 있으시면 언제든지 물어보세요. 예를 들어 "재성 학생의 1일부터 10일까지 기간동안의 감정은 어때?" 같은 질문을 할 수 있습니다.'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const selectedStudent = students.find(s => s.id === selectedStudentId)
  const studentName = selectedStudent?.name || ''

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // 학생 정보와 기간 정보를 컨텍스트로 전달
      const context = {
        students: students.map(s => ({ 
          id: s.id, 
          name: s.name,
          alias: s.nickname || s.alias || '',
          group_name: s.group_name || ''
        })),
        selectedStudentId,
        selectedStudentName: studentName,
        startDate,
        endDate,
        currentDate: new Date().toISOString().split('T')[0]
      }

      const response = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: context,
          conversationHistory: messages.slice(-5) // 최근 5개 메시지만 전달
        })
      })

      const aiResponse = response.message || response.content || response.text || '죄송합니다. 답변을 생성하는데 실패했습니다.'
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }])
    } catch (error) {
      console.error('AI 채팅 오류:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' 
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* AI 채팅 버튼 */}
      <button
        className={`ai-chat-button ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="AI 채팅 열기"
      >
        <span className="ai-chat-button-icon">🤖</span>
      </button>

      {/* AI 채팅 패널 */}
      {isOpen && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <div className="ai-chat-header-title">
              <span className="ai-chat-header-icon">🤖</span>
              <span>AI 상담</span>
            </div>
            <button
              className="ai-chat-close-button"
              onClick={() => setIsOpen(false)}
              aria-label="채팅 닫기"
            >
              ✕
            </button>
          </div>

          <div className="ai-chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`ai-chat-message ${msg.role}`}>
                <div className="ai-chat-message-content">
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-chat-message assistant">
                <div className="ai-chat-message-content">
                  <span className="ai-chat-typing">AI가 답변을 생성하고 있습니다...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-chat-input-container">
            <input
              ref={inputRef}
              type="text"
              className="ai-chat-input"
              placeholder="질문을 입력하세요... (예: 재성 학생의 1일부터 10일까지 기간동안의 감정은 어때?)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <button
              className="ai-chat-send-button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              전송
            </button>
          </div>
        </div>
      )}
    </>
  )
}

