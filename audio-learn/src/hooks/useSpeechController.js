import { useRef, useState, useCallback } from 'react';

/**
 * useSpeechController
 * Fully rewritten to fix:
 * - voice async loading bug
 * - cutoff not stopping loop
 * - stale closure / ref issues
 * - runLoop dependency loop
 */
export function useSpeechController({
  onStateChange,
  onTermExplained,
  onSentenceChange,
  onProgress,
}) {
  // All mutable state lives in refs to avoid stale closure issues
  const stateRef = useRef('idle');
  const explainedTermsRef = useRef(new Set());
  const abortControllerRef = useRef(null);
  const modeRef = useRef('definition');
  const apiKeyRef = useRef('');
  const cutoffRef = useRef(false);  // flag for skipping explanation mid-speech

  const [state, _setState] = useState('idle');

  // Callbacks in refs so runLoop never goes stale
  const onStateChangeRef = useRef(onStateChange);
  const onTermExplainedRef = useRef(onTermExplained);
  const onSentenceChangeRef = useRef(onSentenceChange);
  const onProgressRef = useRef(onProgress);
  onStateChangeRef.current = onStateChange;
  onTermExplainedRef.current = onTermExplained;
  onSentenceChangeRef.current = onSentenceChange;
  onProgressRef.current = onProgress;

  const setState = useCallback((s) => {
    stateRef.current = s;
    _setState(s);
    onStateChangeRef.current?.(s);
  }, []);

  // ── Voice loader ─────────────────────────────────────────────────────────
  const getJapaneseVoice = useCallback(() => {
    return new Promise((resolve) => {
      const tryGet = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const jp = voices.find(v => v.lang === 'ja-JP') 
            || voices.find(v => v.lang.startsWith('ja'))
            || null;
          resolve(jp);
        } else {
          window.speechSynthesis.onvoiceschanged = () => {
            const voices2 = window.speechSynthesis.getVoices();
            const jp = voices2.find(v => v.lang === 'ja-JP')
              || voices2.find(v => v.lang.startsWith('ja'))
              || null;
            resolve(jp);
          };
        }
      };
      tryGet();
      // Fallback timeout: if voices never load, resolve with null
      setTimeout(() => resolve(null), 2000);
    });
  }, []);

  // ── speak() ───────────────────────────────────────────────────────────────
  // Returns: 'done' | 'canceled' | 'stopped'
  const speak = useCallback(async (text, options = {}) => {
    const voice = await getJapaneseVoice();

    return new Promise((resolve) => {
      window.speechSynthesis.cancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ja-JP';
      utter.rate = options.rate ?? 1.0;
      utter.pitch = options.pitch ?? 1.0;
      utter.volume = 1.0;
      if (voice) utter.voice = voice;

      utter.onend = () => resolve('done');
      utter.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') {
          resolve('canceled');
        } else {
          console.warn('Speech error:', e.error);
          resolve('canceled');
        }
      };

      window.speechSynthesis.speak(utter);
    });
  }, [getJapaneseVoice]);

  // ── Gemini API call ───────────────────────────────────────────────────────
  const callGemini = useCallback(async (sentence) => {
    const key = apiKeyRef.current;
    if (!key) return null;

    const mode = modeRef.current;
    const modeInstruction = mode === 'analogy'
      ? '直感的な例え話を使って、身近なものに例えて'
      : '簡潔な定義を中心に、学術的に正確に';

    const alreadyExplained = Array.from(explainedTermsRef.current);

    const systemPrompt = `あなたは専門教材の解説補助AIです。与えられたテキストから専門用語を特定し、指定されたモードに応じて必ず【2文以内】で平易に解説してください。既出リストにある単語は完全に無視してください。ハルシネーション抑制のため教科書の文脈にない創作は厳禁です。

現在のモード: ${modeInstruction}
既出単語リスト（解説禁止）: ${alreadyExplained.length > 0 ? alreadyExplained.join('、') : 'なし'}

必ず以下のJSON形式のみで返答してください（マークダウン不要）:
{"has_term":true,"term":"用語名","explanation":"解説文"}
または
{"has_term":false,"term":null,"explanation":null}`;

    const userPrompt = `次の文章に初出の専門用語はありますか？\n「${sentence}」`;

    try {
      abortControllerRef.current = new AbortController();
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
          })
        }
      );

      if (!res.ok) {
        console.error('Gemini API error:', res.status, await res.text());
        return null;
      }

      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      // Strip any markdown fences just in case
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      if (e.name === 'AbortError') return null;
      console.error('Gemini parse error:', e, 'raw response issue');
      return null;
    }
  }, []);

  // ── Main loop ─────────────────────────────────────────────────────────────
  const runLoop = useCallback(async (sentences) => {
    for (let i = 0; i < sentences.length; i++) {
      // Check if stopped
      if (stateRef.current === 'idle') break;

      const sentence = sentences[i].text;
      onSentenceChangeRef.current?.(i, 'reading');
      onProgressRef.current?.(i, sentences.length);

      // Query AI (non-blocking, before speaking)
      const result = await callGemini(sentence);

      // Re-check stop after async call
      if (stateRef.current === 'idle') break;

      // Speak the sentence
      const readResult = await speak(sentence, { rate: 0.95 });
      if (stateRef.current === 'idle') break;

      // If AI found a new term — explain it
      if (
        result?.has_term === true &&
        result.term &&
        result.explanation &&
        !explainedTermsRef.current.has(result.term)
      ) {
        setState('explaining');
        onSentenceChangeRef.current?.(i, 'explaining');
        cutoffRef.current = false;

        // Intro
        if (!cutoffRef.current && stateRef.current !== 'idle') {
          await speak(`「${result.term}」について解説します。`, { rate: 1.0, pitch: 1.1 });
        }

        // Explanation body
        if (!cutoffRef.current && stateRef.current !== 'idle') {
          await speak(result.explanation, { rate: 0.88, pitch: 1.05 });
        }

        // Record term regardless of cutoff
        explainedTermsRef.current.add(result.term);
        onTermExplainedRef.current?.(result.term, result.explanation);

        if (stateRef.current === 'idle') break;
        setState('reading');
      }

      onSentenceChangeRef.current?.(i, 'read');
    }

    // Loop ended naturally
    if (stateRef.current !== 'idle') {
      onProgressRef.current?.(sentences.length, sentences.length);
      setState('idle');
    }
  }, [callGemini, speak, setState]);

  // ── Public API ────────────────────────────────────────────────────────────

  const start = useCallback((sentences, apiKey, mode) => {
    apiKeyRef.current = apiKey;
    modeRef.current = mode;
    explainedTermsRef.current = new Set();
    cutoffRef.current = false;
    stateRef.current = 'reading';
    _setState('reading');
    onStateChangeRef.current?.('reading');
    runLoop(sentences);
  }, [runLoop]);

  const stop = useCallback(() => {
    stateRef.current = 'idle';
    _setState('idle');
    onStateChangeRef.current?.('idle');
    window.speechSynthesis.cancel();
    abortControllerRef.current?.abort();
    cutoffRef.current = true;
  }, []);

  const cutoffExplanation = useCallback(() => {
    if (stateRef.current === 'explaining') {
      cutoffRef.current = true;
      window.speechSynthesis.cancel();
      // State will return to 'reading' after the explain block in runLoop
    }
  }, []);

  const setMode = useCallback((mode) => {
    modeRef.current = mode;
  }, []);

  return { state, start, stop, cutoffExplanation, setMode };
}
