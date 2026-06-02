import { useRef, useState, useCallback } from 'react';

/**
 * useSpeechController
 * 
 * Core logic for:
 *   read → detect term → pause → AI explain → resume
 * 
 * States: idle | reading | paused | explaining
 */
export function useSpeechController({
  onStateChange,
  onTermExplained,
  onSentenceChange,
  onProgress,
}) {
  const stateRef = useRef('idle');
  const sentencesRef = useRef([]);
  const currentIndexRef = useRef(0);
  const explainedTermsRef = useRef(new Set());
  const utteranceRef = useRef(null);
  const abortControllerRef = useRef(null);
  const modeRef = useRef('definition');  // 'definition' | 'analogy'
  const apiKeyRef = useRef('');

  const [state, _setState] = useState('idle');

  const setState = useCallback((s) => {
    stateRef.current = s;
    _setState(s);
    onStateChange?.(s);
  }, [onStateChange]);

  // ── helpers ──────────────────────────────────────────────────────────────

  const speak = useCallback((text, options = {}) => {
    return new Promise((resolve, reject) => {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = options.lang ?? 'ja-JP';
      utter.rate = options.rate ?? 1.0;
      utter.pitch = options.pitch ?? 1.0;
      utter.volume = options.volume ?? 1.0;

      // Pick a voice: prefer a JP female for content, default for explanations
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const jpVoice = voices.find(v => v.lang.startsWith('ja'));
        if (jpVoice) utter.voice = jpVoice;
      }

      utter.onend = () => resolve('done');
      utter.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') resolve('canceled');
        else reject(e);
      };
      utteranceRef.current = utter;
      window.speechSynthesis.speak(utter);
    });
  }, []);

  const callGemini = useCallback(async (sentence, mode) => {
    const key = apiKeyRef.current;
    if (!key) return null;

    const modeInstruction = mode === 'analogy'
      ? '直感的な例え話を使って、身近なものに例えて'
      : '簡潔な定義を中心に、学術的に正確に';

    const alreadyExplained = Array.from(explainedTermsRef.current);

    const systemPrompt = `あなたは専門教材の解説補助AIです。与えられたテキストから専門用語を特定し、指定されたモード（簡潔な定義重視 または 直感的な例え話重視）に応じて、必ず【2文以内】で平易に解説してください。既出リストにある単語は完全に無視してください。ハルシネーション抑制のため、教科書の文脈にない創作は厳禁とします。

現在のモード: ${modeInstruction}
既出単語リスト（これらは絶対に解説しないこと）: ${alreadyExplained.length > 0 ? alreadyExplained.join('、') : 'なし'}

レスポンスは以下のJSON形式で返してください：
{
  "has_term": true/false,
  "term": "専門用語名 or null",
  "explanation": "解説文 or null"
}
専門用語がない場合や既出の場合は has_term: false にしてください。`;

    const userPrompt = `以下の文章に解説すべき専門用語はありますか？\n\n「${sentence}」`;

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
            generationConfig: { temperature: 0.2, maxOutputTokens: 256 }
          })
        }
      );
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      if (e.name === 'AbortError') return null;
      console.error('Gemini error:', e);
      return null;
    }
  }, []);

  // ── main loop ─────────────────────────────────────────────────────────────

  const runLoop = useCallback(async (sentences, startIndex = 0) => {
    sentencesRef.current = sentences;
    currentIndexRef.current = startIndex;

    for (let i = startIndex; i < sentences.length; i++) {
      if (stateRef.current === 'idle') break;

      currentIndexRef.current = i;
      const sentence = sentences[i].text;
      onSentenceChange?.(i, 'reading');
      onProgress?.(i, sentences.length);

      // 1. Check with AI if this sentence has a new term
      setState('reading');
      const result = await callGemini(sentence, modeRef.current);

      if (result?.has_term && result.term && !explainedTermsRef.current.has(result.term)) {
        // 2. Speak the sentence first, then pause and explain
        await speak(sentence, { rate: 0.95 });
        if (stateRef.current === 'idle') break;

        // 3. Pause & explain
        setState('explaining');
        onSentenceChange?.(i, 'explaining');

        const introText = `「${result.term}」について解説します。`;
        await speak(introText, { rate: 1.0, pitch: 1.1 });
        if (stateRef.current === 'idle') break;

        await speak(result.explanation, { rate: 0.9, pitch: 1.05 });
        if (stateRef.current === 'idle') break;

        explainedTermsRef.current.add(result.term);
        onTermExplained?.(result.term, result.explanation);

        // 4. Resume reading
        setState('reading');
        onSentenceChange?.(i, 'read');
      } else {
        // No new term — just read the sentence
        await speak(sentence, { rate: 0.95 });
        if (stateRef.current === 'idle') break;
        onSentenceChange?.(i, 'read');
      }
    }

    if (stateRef.current !== 'idle') {
      setState('idle');
      onProgress?.(sentences.length, sentences.length);
    }
  }, [callGemini, speak, setState, onSentenceChange, onTermExplained, onProgress]);

  // ── public API ────────────────────────────────────────────────────────────

  const start = useCallback((sentences, apiKey, mode) => {
    apiKeyRef.current = apiKey;
    modeRef.current = mode;
    explainedTermsRef.current = new Set();
    setState('reading');
    runLoop(sentences, 0);
  }, [runLoop, setState]);

  const stop = useCallback(() => {
    setState('idle');
    window.speechSynthesis.cancel();
    abortControllerRef.current?.abort();
  }, [setState]);

  const cutoffExplanation = useCallback(() => {
    if (stateRef.current === 'explaining') {
      window.speechSynthesis.cancel();
      // The loop will detect canceled and move to next sentence
    }
  }, []);

  const setMode = useCallback((mode) => {
    modeRef.current = mode;
  }, []);

  const getExplainedTerms = useCallback(() => {
    return Array.from(explainedTermsRef.current);
  }, []);

  return {
    state,
    start,
    stop,
    cutoffExplanation,
    setMode,
    getExplainedTerms,
  };
}
