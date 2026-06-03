import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useSpeechEngine } from './hooks/useSpeechEngine'
import { extractTextFromPDF } from './utils/pdfParser'
import { Waveform } from './components/Waveform'

export default function App() {
  // --- State ---
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('vl_apikey') || '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [mode, setMode] = useState('definition')
  const [speechState, setSpeechState] = useState('idle')
  const [sentences, setSentences] = useState([])
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(-1)
  const [explanationInfo, setExplanationInfo] = useState(null)
  const [explainedWords, setExplainedWords] = useState([])
  const [pdfName, setPdfName] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfProgress, setPdfProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [log, setLog] = useState([])
  const [apiError, setApiError] = useState('')
  const [speechSupported] = useState(() => 'speechSynthesis' in window)

  const fileInputRef = useRef(null)
  const textPanelRef = useRef(null)
  const sentencesRef = useRef([])  // engine.start に渡す最新 sentences

  // sentences を ref と同期
  useEffect(() => { sentencesRef.current = sentences }, [sentences])

  // APIキーをセッションに保存（ページリロードで消える）
  useEffect(() => {
    if (apiKey) sessionStorage.setItem('vl_apikey', apiKey)
    else sessionStorage.removeItem('vl_apikey')
  }, [apiKey])

  const addLog = useCallback((msg) => {
    const time = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    setLog(prev => [{ msg, time }, ...prev].slice(0, 40))
  }, [])

  // --- Speech Engine ---
  const engine = useSpeechEngine({
    onStateChange: setSpeechState,
    onSentenceStart: useCallback((idx) => {
      setCurrentSentenceIdx(idx)
      if (idx >= 0) setExplanationInfo(null)
      // テキストパネルの自動スクロール
      if (idx >= 0 && textPanelRef.current) {
        const el = textPanelRef.current.querySelector(`[data-idx="${idx}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, []),
    onExplaining: useCallback(({ term, explanation, sentenceIndex }) => {
      setExplanationInfo({ term, explanation, sentenceIndex })
      addLog(`🔍 解説: 「${term}」`)
    }, [addLog]),
    onWordExplained: useCallback((term) => {
      setExplainedWords(prev => [...prev, term])
    }, []),
    onError: useCallback((msg) => {
      setApiError(msg)
      addLog(`⚠️ ${msg}`)
      setTimeout(() => setApiError(''), 5000)
    }, [addLog]),
  })

  // --- PDF Loading ---
  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') {
      addLog('❌ PDFファイルのみ対応しています')
      return
    }
    if (pdfLoading) return  // 二重ロード防止

    // 読み上げ中なら停止
    engine.stop()

    setPdfLoading(true)
    setPdfName(file.name)
    setSentences([])
    setExplainedWords([])
    setCurrentSentenceIdx(-1)
    setExplanationInfo(null)
    setLog([])
    setApiError('')

    try {
      const { sentences: parsed, pageCount } = await extractTextFromPDF(
        file,
        (cur, total) => setPdfProgress(Math.round((cur / total) * 100))
      )
      if (parsed.length === 0) {
        addLog('⚠️ テキストを抽出できませんでした。スキャンPDFは非対応です。')
      } else {
        setSentences(parsed)
        addLog(`✅ ${file.name}（${pageCount}ページ、${parsed.length}文）`)
      }
    } catch (err) {
      addLog(`❌ PDF読み込みエラー: ${err.message}`)
    } finally {
      setPdfLoading(false)
      setPdfProgress(0)
    }
  }, [pdfLoading, engine, addLog])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    if (!pdfLoading) setDragOver(true)
  }, [pdfLoading])

  // --- Controls ---
  const handleStart = useCallback(() => {
    if (sentences.length === 0 || !speechSupported) return
    setApiError('')
    addLog('▶ 読み上げ開始')
    engine.start({ sentences, apiKey, mode })
  }, [sentences, apiKey, mode, engine, addLog, speechSupported])

  const handleStop = useCallback(() => {
    engine.stop()
    setExplanationInfo(null)
    addLog('⏹ 停止')
  }, [engine, addLog])

  const handleSkipExplanation = useCallback(() => {
    engine.skipExplanation()
    addLog('⏭ 解説スキップ')
  }, [engine, addLog])

  const handleReset = useCallback(() => {
    engine.stop()
    setSentences([])
    setPdfName('')
    setExplainedWords([])
    setCurrentSentenceIdx(-1)
    setExplanationInfo(null)
    setLog([])
    setApiError('')
  }, [engine])

  const isRunning = speechState === 'reading' || speechState === 'explaining'
  const isExplaining = speechState === 'explaining'

  const statusConfig = {
    idle:      { label: '待機中',     color: '#60A5FA', dot: '#3B82F6' },
    reading:   { label: '読み上げ中', color: '#34D399', dot: '#10B981' },
    explaining:{ label: 'AI解説中',  color: '#FBBF24', dot: '#F59E0B' },
    paused:    { label: '一時停止',  color: '#9CA3AF', dot: '#6B7280' },
  }
  const status = statusConfig[speechState] || statusConfig.idle

  const progress = sentences.length > 0 && currentSentenceIdx >= 0
    ? ((currentSentenceIdx + 1) / sentences.length) * 100
    : 0

  return (
    <div className="min-h-screen grid-bg relative overflow-hidden" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Orbs */}
      <div className="orb" style={{ width: 560, height: 560, background: 'rgba(37,99,235,0.11)', top: -120, right: -120 }} />
      <div className="orb" style={{ width: 420, height: 420, background: 'rgba(96,165,250,0.07)', bottom: -80, left: -160 }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1D4ED8, #60A5FA)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", color: '#F0F6FF', fontSize: 20, fontWeight: 600, margin: 0 }}>
                VoiceLens
              </h1>
              <p style={{ color: '#60A5FA', fontSize: 11, letterSpacing: '0.08em', margin: 0 }}>AI音声学習システム</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-card">
            <div className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: status.dot, boxShadow: `0 0 6px ${status.dot}` }} />
            <span className="text-xs font-medium" style={{ color: status.color }}>{status.label}</span>
            <Waveform active={isRunning} color={status.dot} bars={4} />
          </div>
        </header>

        {/* No speech support warning */}
        {!speechSupported && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
            ⚠️ このブラウザは Web Speech API に対応していません。Chrome / Edge をお使いください。
          </div>
        )}

        {/* API Error toast */}
        {apiError && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm fade-in-up flex items-center justify-between"
            style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#FBBF24' }}>
            <span>{apiError}</span>
            <button onClick={() => setApiError('')} className="ml-3 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ===== LEFT PANEL ===== */}
          <div className="lg:col-span-1 flex flex-col gap-4">

            {/* API Key */}
            <div className="glass-card rounded-2xl p-4">
              <label className="block text-xs font-medium mb-2" style={{ color: '#93C5FD', letterSpacing: '0.06em' }}>
                GEMINI API KEY
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-xl pr-10 outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${apiKey ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    color: '#F0F6FF',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    transition: 'border-color 0.2s',
                  }}
                />
                <button
                  onClick={() => setShowApiKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
                  style={{ color: '#93C5FD' }}
                  aria-label={showApiKey ? 'APIキーを隠す' : 'APIキーを表示'}
                >
                  {showApiKey
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              <p className="text-xs mt-1.5" style={{ color: '#60A5FA', opacity: apiKey ? 0 : 0.6, transition: 'opacity 0.2s' }}>
                未入力でもTTS読み上げのみ動作します
              </p>
            </div>

            {/* Mode Toggle */}
            <div className="glass-card rounded-2xl p-4">
              <label className="block text-xs font-medium mb-3" style={{ color: '#93C5FD', letterSpacing: '0.06em' }}>
                解説モード
              </label>
              <div className="relative flex rounded-xl overflow-hidden p-1" style={{ background: 'rgba(0,0,0,0.3)' }}>
                <div
                  className="absolute top-1 bottom-1 rounded-lg"
                  style={{
                    width: 'calc(50% - 4px)',
                    left: mode === 'definition' ? 4 : 'calc(50%)',
                    background: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
                    transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
                {[
                  { value: 'definition', label: '定義重視', icon: '📖' },
                  { value: 'analogy',    label: '例え話',   icon: '💡' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setMode(opt.value)}
                    className="relative flex-1 py-2 text-xs font-medium rounded-lg"
                    style={{
                      color: mode === opt.value ? '#fff' : '#93C5FD',
                      zIndex: 1,
                      transition: 'color 0.2s',
                    }}
                  >
                    <span className="mr-1">{opt.icon}</span>{opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="glass-card rounded-2xl p-4">
              <label className="block text-xs font-medium mb-3" style={{ color: '#93C5FD', letterSpacing: '0.06em' }}>
                コントロール
              </label>
              <div className="flex flex-col gap-2.5">
                {!isRunning ? (
                  <button
                    onClick={handleStart}
                    disabled={sentences.length === 0 || !speechSupported}
                    className="glow-btn w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    style={{ background: 'linear-gradient(135deg, #1D4ED8, #2563EB)', color: '#fff' }}
                    aria-label="読み上げ開始"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    読み上げ開始
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                    style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}
                    aria-label="停止"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                    停止
                  </button>
                )}

                <button
                  onClick={handleSkipExplanation}
                  disabled={!isExplaining}
                  className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#FBBF24' }}
                  aria-label="解説をスキップ"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
                  </svg>
                  解説スキップ
                </button>
              </div>
            </div>

            {/* Explanation Info */}
            {explanationInfo && (
              <div className="rounded-2xl p-4 fade-in-up" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#FBBF24', boxShadow: '0 0 6px #FBBF24' }} />
                  <span className="text-xs font-medium" style={{ color: '#FBBF24' }}>AI解説中</span>
                </div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#FDE68A' }}>「{explanationInfo.term}」</p>
                <p className="text-xs leading-relaxed" style={{ color: '#FDE68A', opacity: 0.85 }}>{explanationInfo.explanation}</p>
              </div>
            )}

            {/* Explained Words */}
            {explainedWords.length > 0 && (
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-medium" style={{ color: '#93C5FD', letterSpacing: '0.06em' }}>解説済み単語</label>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(37,99,235,0.2)', color: '#60A5FA' }}>
                    {explainedWords.length}語
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {explainedWords.map((word, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-lg"
                      style={{ background: 'rgba(37,99,235,0.15)', color: '#93C5FD', border: '1px solid rgba(37,99,235,0.2)' }}>
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ===== RIGHT PANEL ===== */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {sentences.length === 0 ? (
              /* Upload area */
              <div
                className="rounded-2xl flex flex-col items-center justify-center cursor-pointer"
                style={{
                  minHeight: 340,
                  border: `2px dashed ${dragOver ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  background: dragOver ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.025)',
                  transition: 'all 0.2s ease',
                  pointerEvents: pdfLoading ? 'none' : 'auto',
                }}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !pdfLoading && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="PDFファイルをアップロード"
                onKeyDown={e => e.key === 'Enter' && !pdfLoading && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }}
                  aria-hidden
                />

                {pdfLoading ? (
                  <div className="flex flex-col items-center gap-4 px-8">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.18)' }}>
                      <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                    </div>
                    <p className="text-sm" style={{ color: '#93C5FD' }}>テキスト抽出中... {pdfProgress}%</p>
                    <div className="w-48 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${pdfProgress}%`, background: 'linear-gradient(90deg, #1D4ED8, #60A5FA)' }} />
                    </div>
                    <p className="text-xs" style={{ color: '#4B5563' }}>{pdfName}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center px-8">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.22)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-base font-medium mb-1" style={{ color: '#DBEAFE' }}>
                        PDFをドロップ、またはクリックして選択
                      </p>
                      <p className="text-xs" style={{ color: '#60A5FA', opacity: 0.65 }}>
                        教科書・論文・参考書に対応 ／ テキスト埋め込みPDFのみ
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* File bar */}
                <div className="glass-card rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" className="flex-shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="text-sm font-medium truncate" style={{ color: '#DBEAFE' }}>{pdfName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: 'rgba(37,99,235,0.2)', color: '#60A5FA' }}>
                      {sentences.length}文
                    </span>
                  </div>
                  <button
                    onClick={handleReset}
                    className="text-xs ml-3 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: '#93C5FD' }}
                    aria-label="ファイルを変更"
                  >
                    変更
                  </button>
                </div>

                {/* Text panel */}
                <div
                  ref={textPanelRef}
                  className="glass-card rounded-2xl p-5 overflow-y-auto"
                  style={{ maxHeight: '58vh', minHeight: 300 }}
                  aria-live="polite"
                  aria-label="読み上げテキスト"
                >
                  <div style={{ lineHeight: 1.9 }}>
                    {sentences.map((sentence, idx) => {
                      const isCurrent = idx === currentSentenceIdx
                      const isExplainingThis = explanationInfo?.sentenceIndex === idx && isExplaining
                      return (
                        <span
                          key={idx}
                          data-idx={idx}
                          className={`inline mr-1 ${isExplainingThis ? 'highlight-explaining' : isCurrent ? 'highlight-reading' : ''}`}
                          style={{
                            color: isCurrent ? '#DBEAFE' : '#6B7280',
                            fontSize: 14,
                            transition: 'color 0.3s ease',
                            borderRadius: 3,
                            padding: '1px 2px',
                          }}
                        >
                          {sentence}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {/* Progress */}
                {currentSentenceIdx >= 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-1.5" style={{ color: '#60A5FA', opacity: 0.65 }}>
                      <span>{currentSentenceIdx + 1} / {sentences.length} 文</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress}%`,
                          background: isExplaining
                            ? 'linear-gradient(90deg, #D97706, #FBBF24)'
                            : 'linear-gradient(90deg, #1D4ED8, #60A5FA)',
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Log */}
            {log.length > 0 && (
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium" style={{ color: '#93C5FD', letterSpacing: '0.06em' }}>ログ</label>
                  <button onClick={() => setLog([])} className="text-xs opacity-40 hover:opacity-80 transition-opacity" style={{ color: '#93C5FD' }}>
                    クリア
                  </button>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {log.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span style={{ color: '#374151', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                        {entry.time}
                      </span>
                      <span style={{ color: i === 0 ? '#DBEAFE' : '#4B5563' }}>{entry.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
