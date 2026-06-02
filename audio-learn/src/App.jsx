import React, { useState, useCallback, useRef } from 'react';
import {
  Play, Square, Scissors, Upload, Key, BookOpen,
  ChevronRight, AlertCircle, Layers, Mic
} from 'lucide-react';

import { useSpeechController } from './hooks/useSpeechController';
import { parsePDF } from './utils/pdfParser';
import WaveformVisualizer from './components/WaveformVisualizer';
import TextDisplay from './components/TextDisplay';
import TermsList from './components/TermsList';
import StatusBar from './components/StatusBar';

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [mode, setMode] = useState('definition'); // 'definition' | 'analogy'
  const [sentences, setSentences] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [explainedTerms, setExplainedTerms] = useState([]);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [appState, setAppState] = useState('idle');

  const sentencesRef = useRef(sentences);
  sentencesRef.current = sentences;

  const handleStateChange = useCallback((s) => {
    setAppState(s);
  }, []);

  const handleTermExplained = useCallback((term, explanation) => {
    setExplainedTerms(prev => [...prev, { term, explanation }]);
  }, []);

  const handleSentenceChange = useCallback((idx, status) => {
    setCurrentIndex(idx);
    setSentences(prev => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], status };
      return next;
    });
  }, []);

  const handleProgress = useCallback((current, total) => {
    setProgress(current);
  }, []);

  const { state, start, stop, cutoffExplanation, setMode: setControllerMode } = useSpeechController({
    onStateChange: handleStateChange,
    onTermExplained: handleTermExplained,
    onSentenceChange: handleSentenceChange,
    onProgress: handleProgress,
  });

  // ── PDF Upload ─────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('PDFファイルのみ対応しています');
      return;
    }

    setIsLoading(true);
    setError('');
    setFileName(file.name);
    setSentences([]);
    setCurrentIndex(-1);
    setExplainedTerms([]);
    setProgress(0);

    try {
      const parsed = await parsePDF(file);
      setSentences(parsed);
    } catch (err) {
      console.error(err);
      setError('PDFの解析に失敗しました。別のファイルをお試しください。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Drag & Drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload({ target: { files: [file] } });
  }, [handleFileUpload]);

  // ── Controls ───────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (!apiKey.trim()) {
      setError('Gemini APIキーを入力してください');
      return;
    }
    if (sentences.length === 0) {
      setError('PDFをアップロードしてください');
      return;
    }
    setError('');
    // Reset statuses
    setSentences(prev => prev.map(s => ({ ...s, status: 'unread' })));
    setCurrentIndex(-1);
    setExplainedTerms([]);
    setProgress(0);
    start(sentences, apiKey, mode);
  }, [apiKey, sentences, mode, start]);

  const handleStop = useCallback(() => {
    stop();
    setCurrentIndex(-1);
  }, [stop]);

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    setControllerMode(newMode);
  }, [setControllerMode]);

  const isActive = appState !== 'idle';

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── TOP HEADER ─────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-8 py-4"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'rgba(2,8,24,0.8)',
          backdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0ea5e9, #38b6ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Mic size={16} color="#020818" strokeWidth={2.5} />
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                fontSize: '18px',
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}
            >
              AudioLearn
            </div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-secondary)',
                letterSpacing: '0.1em',
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: '-2px',
              }}
            >
              AI VOICE LEARNING SYSTEM
            </div>
          </div>
        </div>

        {/* Waveform in header */}
        <WaveformVisualizer active={isActive} mode={appState} />

        <div className="flex items-center gap-2" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
          v1.0
        </div>
      </header>

      {/* ── MAIN LAYOUT ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 65px)' }}>

        {/* LEFT SIDEBAR ─────────────────────────────────────────────── */}
        <aside
          className="flex flex-col gap-4 p-5 overflow-y-auto"
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            background: 'rgba(2,8,24,0.5)',
          }}
        >
          {/* API Key */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Key size={13} style={{ color: 'var(--azure)' }} />
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '12px', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                GEMINI API KEY
              </span>
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full rounded-lg px-3 py-2 text-xs outline-none transition-all"
                style={{
                  background: 'rgba(56,182,255,0.05)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11px',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--azure)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <button
              onClick={() => setShowKey(v => !v)}
              style={{ fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
            >
              {showKey ? '隠す' : '表示する'}
            </button>
          </div>

          {/* Mode Toggle */}
          <div className="glass-card rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Layers size={13} style={{ color: 'var(--azure)' }} />
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '12px', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                解説モード
              </span>
            </div>

            <div className="space-y-2">
              {[
                { id: 'definition', label: '定義重視', sub: '学術的・簡潔' },
                { id: 'analogy', label: '例え話重視', sub: '直感的・親しみやすい' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleModeChange(opt.id)}
                  className="w-full text-left rounded-lg px-3 py-2.5 transition-all"
                  style={{
                    background: mode === opt.id ? 'rgba(56,182,255,0.15)' : 'rgba(56,182,255,0.03)',
                    border: `1px solid ${mode === opt.id ? 'var(--border-bright)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '12px', color: mode === opt.id ? 'var(--azure)' : 'var(--text-primary)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Terms List */}
          <div className="glass-card rounded-xl p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen size={13} style={{ color: 'var(--azure)' }} />
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '12px', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                  解説済み用語
                </span>
              </div>
              {explainedTerms.length > 0 && (
                <span className="term-badge">{explainedTerms.length}</span>
              )}
            </div>
            <TermsList terms={explainedTerms} />
          </div>
        </aside>

        {/* CENTER — TEXT DISPLAY ────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Toolbar */}
          <div
            className="px-6 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)', background: 'rgba(4,13,36,0.6)' }}
          >
            <StatusBar appState={appState} progress={progress} total={sentences.length} />
          </div>

          {/* Content area */}
          <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">

            {/* PDF Upload zone */}
            {sentences.length === 0 && !isLoading && (
              <label
                className="glass-card rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all"
                style={{
                  minHeight: 220,
                  border: '2px dashed var(--border)',
                  ':hover': { borderColor: 'var(--border-bright)' },
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
              >
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '14px',
                    background: 'rgba(56,182,255,0.1)',
                    border: '1px solid var(--border-bright)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Upload size={24} style={{ color: 'var(--azure)' }} />
                </div>
                <div className="text-center">
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                    PDFをドロップ、またはクリック
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    教科書・参考書のPDFをアップロードしてください
                  </div>
                </div>
              </label>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    border: '2px solid var(--border)',
                    borderTop: '2px solid var(--azure)',
                    borderRadius: '50%',
                  }}
                  className="rotate-slow"
                />
                <span className="shimmer-text" style={{ fontFamily: "'Syne', sans-serif", fontSize: '13px', letterSpacing: '0.1em' }}>
                  PDFを解析中...
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-3"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <AlertCircle size={14} style={{ color: '#fca5a5', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#fca5a5' }}>{error}</span>
              </div>
            )}

            {/* File info bar */}
            {fileName && sentences.length > 0 && (
              <div className="flex items-center gap-2 fade-in-up">
                <ChevronRight size={12} style={{ color: 'var(--azure)' }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {fileName}
                </span>
                <span className="term-badge">{sentences.length} sentences</span>
              </div>
            )}

            {/* Text display */}
            {sentences.length > 0 && (
              <div
                className="glass-card rounded-2xl p-6 flex-1"
                style={{ minHeight: 300 }}
              >
                <TextDisplay
                  sentences={sentences}
                  currentIndex={currentIndex}
                  appState={appState}
                />
              </div>
            )}
          </div>

          {/* ── BOTTOM CONTROLS ──────────────────────────────────────── */}
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{
              borderTop: '1px solid var(--border)',
              background: 'rgba(2,8,24,0.8)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {!isActive ? (
              <button
                onClick={handleStart}
                disabled={sentences.length === 0 || isLoading}
                className="btn-primary flex items-center gap-2 px-6 py-3 rounded-xl"
                style={{ opacity: (sentences.length === 0 || isLoading) ? 0.4 : 1, cursor: (sentences.length === 0 || isLoading) ? 'not-allowed' : 'pointer' }}
              >
                <Play size={16} strokeWidth={2.5} />
                <span style={{ fontSize: '14px' }}>読み上げ開始</span>
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-6 py-3 rounded-xl"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#fca5a5',
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Square size={15} fill="#fca5a5" />
                <span>停止</span>
              </button>
            )}

            {/* Cutoff button — only during explaining */}
            {appState === 'explaining' && (
              <button
                onClick={cutoffExplanation}
                className="btn-ghost flex items-center gap-2 px-4 py-3 rounded-xl fade-in-up"
                style={{ cursor: 'pointer' }}
              >
                <Scissors size={14} />
                <span style={{ fontSize: '13px' }}>解説をスキップ</span>
              </button>
            )}

            {/* Re-upload */}
            {sentences.length > 0 && !isActive && (
              <label
                className="btn-ghost flex items-center gap-2 px-4 py-3 rounded-xl"
                style={{ cursor: 'pointer' }}
              >
                <Upload size={14} />
                <span style={{ fontSize: '13px' }}>別のPDFを開く</span>
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
              </label>
            )}

            <div className="flex-1" />

            {/* Mode indicator */}
            <div
              className="term-badge"
              style={{ padding: '6px 12px', fontSize: '11px' }}
            >
              {mode === 'definition' ? '定義重視モード' : '例え話モード'}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
