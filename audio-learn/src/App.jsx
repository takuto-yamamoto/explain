import React, { useState, useCallback, useRef } from 'react';
import {
  Play, Square, Scissors, Upload, Key, BookOpen,
  ChevronRight, AlertCircle, Layers, Mic, Eye, EyeOff
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
  const [mode, setMode] = useState('definition');
  const [sentences, setSentences] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [explainedTerms, setExplainedTerms] = useState([]);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [appState, setAppState] = useState('idle');

  // Keep stable sentence ref for the controller
  const sentencesRef = useRef([]);

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

  const processFile = useCallback(async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('PDFファイルのみ対応しています');
      return;
    }

    // Stop any ongoing reading
    stop();

    setIsLoading(true);
    setError('');
    setFileName(file.name);
    setSentences([]);
    sentencesRef.current = [];
    setCurrentIndex(-1);
    setExplainedTerms([]);
    setProgress(0);

    try {
      const parsed = await parsePDF(file);
      if (parsed.length === 0) {
        setError('テキストを抽出できませんでした。このPDFは画像ベースの可能性があります。');
        return;
      }
      setSentences(parsed);
      sentencesRef.current = parsed;
    } catch (err) {
      console.error('PDF parse error:', err);
      setError(`PDFの解析に失敗しました: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [stop]);

  const handleFileInput = useCallback((e) => {
    processFile(e.target.files?.[0]);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  }, [processFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    processFile(e.dataTransfer.files?.[0]);
  }, [processFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    if (!apiKey.trim()) {
      setError('Gemini APIキーを入力してください');
      return;
    }
    if (sentencesRef.current.length === 0) {
      setError('PDFをアップロードしてください');
      return;
    }
    setError('');

    // Reset sentence statuses visually
    setSentences(prev => prev.map(s => ({ ...s, status: 'unread' })));
    setCurrentIndex(-1);
    setExplainedTerms([]);
    setProgress(0);

    // Pass a fresh copy to avoid mutation issues
    start([...sentencesRef.current], apiKey.trim(), mode);
  }, [apiKey, mode, start]);

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

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-8 py-4"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'rgba(2,8,24,0.9)',
          backdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="flex items-center gap-3">
          <div style={{
            width: 34, height: 34, borderRadius: '9px',
            background: 'linear-gradient(135deg, #0ea5e9, #38b6ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(56,182,255,0.4)',
          }}>
            <Mic size={17} color="#020818" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: '18px', letterSpacing: '-0.02em', color: 'var(--text-primary)',
            }}>
              AudioLearn
            </div>
            <div style={{
              fontSize: '9px', color: 'var(--text-secondary)',
              letterSpacing: '0.12em', fontFamily: "'JetBrains Mono', monospace", marginTop: '-1px',
            }}>
              AI VOICE LEARNING SYSTEM
            </div>
          </div>
        </div>

        <WaveformVisualizer active={isActive} mode={appState} />

        <div className="flex items-center gap-2" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
          v1.1
        </div>
      </header>

      {/* ── BODY ───────────────────────────────────────────────────── */}
      <div className="flex flex-1" style={{ height: 'calc(100vh - 65px)', overflow: 'hidden' }}>

        {/* LEFT SIDEBAR */}
        <aside
          className="flex flex-col gap-4 p-5 overflow-y-auto"
          style={{
            width: 280, flexShrink: 0,
            borderRight: '1px solid var(--border)',
            background: 'rgba(2,8,24,0.6)',
          }}
        >
          {/* API Key card */}
          <div className="glass-card rounded-xl p-4" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="flex items-center gap-2">
              <Key size={13} style={{ color: 'var(--azure)' }} />
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
                GEMINI API KEY
              </span>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setError(''); }}
                placeholder="AIzaSy..."
                style={{
                  width: '100%', borderRadius: 8, paddingLeft: 10, paddingRight: 36,
                  paddingTop: 8, paddingBottom: 8,
                  background: 'rgba(56,182,255,0.06)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '11px',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--azure)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <button
                onClick={() => setShowKey(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                }}
              >
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Google AI StudioでAPIキーを取得してください。キーはブラウザ内のみで使用されます。
            </p>
          </div>

          {/* Mode toggle */}
          <div className="glass-card rounded-xl p-4" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="flex items-center gap-2">
              <Layers size={13} style={{ color: 'var(--azure)' }} />
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
                解説モード
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { id: 'definition', label: '定義重視', sub: '学術的・簡潔' },
                { id: 'analogy', label: '例え話重視', sub: '直感的・親しみやすい' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleModeChange(opt.id)}
                  style={{
                    textAlign: 'left', borderRadius: 8, padding: '8px 12px',
                    background: mode === opt.id ? 'rgba(56,182,255,0.15)' : 'rgba(56,182,255,0.03)',
                    border: `1px solid ${mode === opt.id ? 'var(--border-bright)' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '12px', color: mode === opt.id ? 'var(--azure)' : 'var(--text-primary)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: 2 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Explained terms */}
          <div className="glass-card rounded-xl p-4" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={13} style={{ color: 'var(--azure)' }} />
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: '11px', letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
                  解説済み用語
                </span>
              </div>
              {explainedTerms.length > 0 && (
                <span className="term-badge">{explainedTerms.length}</span>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <TermsList terms={explainedTerms} />
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Toolbar */}
          <div
            style={{
              padding: '10px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'rgba(4,13,36,0.7)',
              flexShrink: 0,
            }}
          >
            <StatusBar appState={appState} progress={progress} total={sentences.length} />
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Upload zone */}
            {sentences.length === 0 && !isLoading && (
              <label
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 16, minHeight: 240,
                  borderRadius: 16, cursor: 'pointer',
                  background: 'rgba(7,21,53,0.5)',
                  border: '2px dashed rgba(56,182,255,0.25)',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(56,182,255,0.55)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(56,182,255,0.25)'}
              >
                <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileInput} />
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: 'rgba(56,182,255,0.1)', border: '1px solid var(--border-bright)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Upload size={24} style={{ color: 'var(--azure)' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                    PDFをドロップ、またはクリックして選択
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: 6 }}>
                    教科書・参考書のPDFをアップロードしてください
                  </div>
                </div>
              </label>
            )}

            {/* Loading spinner */}
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '64px 0' }}>
                <div className="rotate-slow" style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '2px solid var(--border)', borderTop: '2px solid var(--azure)',
                }} />
                <span className="shimmer-text" style={{ fontFamily: "'Syne', sans-serif", fontSize: '13px', letterSpacing: '0.1em' }}>
                  PDFを解析中...
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 12,
                padding: '12px 16px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              }}>
                <AlertCircle size={14} style={{ color: '#fca5a5', flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: '13px', color: '#fca5a5', lineHeight: 1.5 }}>{error}</span>
              </div>
            )}

            {/* File info */}
            {fileName && sentences.length > 0 && (
              <div className="fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ChevronRight size={12} style={{ color: 'var(--azure)' }} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {fileName}
                </span>
                <span className="term-badge">{sentences.length} sentences</span>
              </div>
            )}

            {/* Text display */}
            {sentences.length > 0 && (
              <div className="glass-card rounded-2xl" style={{ padding: 24, flex: 1, minHeight: 300 }}>
                <TextDisplay
                  sentences={sentences}
                  currentIndex={currentIndex}
                  appState={appState}
                />
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(2,8,24,0.85)',
            backdropFilter: 'blur(20px)',
            display: 'flex', alignItems: 'center', gap: 12,
            flexShrink: 0,
          }}>
            {!isActive ? (
              <button
                onClick={handleStart}
                disabled={sentences.length === 0 || isLoading}
                className="btn-primary"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 24px', borderRadius: 12, border: 'none',
                  opacity: (sentences.length === 0 || isLoading) ? 0.4 : 1,
                  cursor: (sentences.length === 0 || isLoading) ? 'not-allowed' : 'pointer',
                }}
              >
                <Play size={15} strokeWidth={2.5} />
                <span style={{ fontSize: '14px' }}>読み上げ開始</span>
              </button>
            ) : (
              <button
                onClick={handleStop}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 24px', borderRadius: 12,
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                  color: '#fca5a5', fontFamily: "'Syne', sans-serif",
                  fontWeight: 700, fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                <Square size={14} fill="#fca5a5" style={{ flexShrink: 0 }} />
                <span>停止</span>
              </button>
            )}

            {/* Explanation cutoff — visible only while explaining */}
            {appState === 'explaining' && (
              <button
                onClick={cutoffExplanation}
                className="btn-ghost fade-in-up"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 12, cursor: 'pointer',
                }}
              >
                <Scissors size={13} />
                <span style={{ fontSize: '13px' }}>解説をスキップ</span>
              </button>
            )}

            {/* Re-upload when idle with content */}
            {sentences.length > 0 && !isActive && (
              <label
                className="btn-ghost"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 12, cursor: 'pointer',
                }}
              >
                <Upload size={13} />
                <span style={{ fontSize: '13px' }}>別のPDFを開く</span>
                <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileInput} />
              </label>
            )}

            <div style={{ flex: 1 }} />

            <div className="term-badge" style={{ padding: '6px 12px', fontSize: '11px' }}>
              {mode === 'definition' ? '定義重視モード' : '例え話モード'}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
