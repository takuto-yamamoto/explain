import { useRef, useCallback } from 'react'

/**
 * useSpeechEngine — コア音声制御ロジック
 *
 * 状態機械: idle → reading → explaining → reading → ... → idle
 *
 * バグ修正:
 * 1. Chrome の SpeechSynthesis 15秒無音バグ対策（keepAlive ticker）
 * 2. fetchExplanation 中の abort 対応（AbortController）
 * 3. 二重 runLoop 防止（isRunning フラグ）
 * 4. speakText の resolved/rejected 二重呼び出し防止
 * 5. skipExplanation / stop の競合防止
 */
export function useSpeechEngine({
  onStateChange,
  onSentenceStart,
  onExplaining,
  onWordExplained,
  onError,
}) {
  const stateRef = useRef('idle')
  const explainedWordsRef = useRef(new Set())
  const abortRef = useRef(false)
  const utteranceRef = useRef(null)
  const isLoopRunningRef = useRef(false)
  const keepAliveRef = useRef(null)
  const fetchAbortControllerRef = useRef(null)

  const setState = useCallback((s) => {
    stateRef.current = s
    onStateChange?.(s)
  }, [onStateChange])

  // --- Chrome SpeechSynthesis keepAlive ---
  // Chrome は約15秒でSpeechSynthesisを黙らせる既知バグがある
  // pause/resume を定期的に呼ぶことで回避する
  const startKeepAlive = useCallback(() => {
    stopKeepAlive()
    keepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      }
    }, 10000)
  }, [])

  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current)
      keepAliveRef.current = null
    }
  }, [])

  // --- 音声キャンセル ---
  const cancelSpeech = useCallback(() => {
    window.speechSynthesis.cancel()
    utteranceRef.current = null
  }, [])

  // --- 一文を読み上げる Promise ラッパー ---
  const speakText = useCallback((text, rate = 1.0, lang = 'ja-JP') => {
    return new Promise((resolve, reject) => {
      if (abortRef.current) {
        reject(new Error('aborted'))
        return
      }
      cancelSpeech()

      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = lang
      utter.rate = rate
      utter.pitch = 1.0
      utter.volume = 1.0

      utteranceRef.current = utter
      let settled = false

      const settle = (fn, val) => {
        if (settled) return
        settled = true
        utteranceRef.current = null
        fn(val)
      }

      utter.onend = () => settle(resolve, undefined)
      utter.onerror = (e) => {
        // interrupted / canceled はスキップとして正常扱い
        if (e.error === 'interrupted' || e.error === 'canceled') {
          settle(resolve, undefined)
        } else {
          settle(reject, e)
        }
      }

      // speak() を呼ぶ前に既存キューをクリア（二重キュー防止）
      if (window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
      window.speechSynthesis.speak(utter)
    })
  }, [cancelSpeech])

  // --- Gemini API 解説取得（AbortController 対応）---
  const fetchExplanation = useCallback(async ({
    sentence,
    apiKey,
    mode,
    signal,
    geminiModel = 'gemini-2.0-flash-lite',
  }) => {
    const modeInstruction = mode === 'definition'
      ? '簡潔な定義重視（1〜2文で正確に定義してください）'
      : '直感的な例え話重視（身近な例えを使って2文以内で説明してください）'

    const alreadyExplained = [...explainedWordsRef.current].join('、')

    const systemPrompt = `あなたは専門教材の解説補助AIです。与えられたテキストから専門用語を特定し、指定されたモード（${modeInstruction}）に応じて、必ず【2文以内】で平易に解説してください。既出リストにある単語は完全に無視してください。ハルシネーション抑制のため、教科書の文脈にない創作は厳禁とします。定義外のものは「詳細なし」と返答してください。`

    const userPrompt = `以下の文章を読み上げ中です。この文章に含まれる専門用語を1つだけ選び、その用語と解説をJSON形式で返してください。

文章:「${sentence}」

既出単語（解説不要）: ${alreadyExplained || 'なし'}

レスポンス形式（JSONのみ、前後のテキスト・マークダウン不要）:
{"term": "専門用語名", "explanation": "解説文", "needsExplanation": true}
専門用語がない場合や既出の場合:
{"term": "", "explanation": "", "needsExplanation": false}`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal, // AbortController signal
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 300,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Gemini API ${response.status}: ${errText.slice(0, 100)}`)
    }

    const data = await response.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'

    // JSONパース（マークダウンコードブロック混入対策）
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    try {
      return JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        try { return JSON.parse(match[0]) } catch { /* fall through */ }
      }
      return { needsExplanation: false }
    }
  }, [])

  // --- メインループ ---
  const runLoop = useCallback(async ({ sentences, apiKey, mode, startIndex = 0 }) => {
    // 二重起動防止
    if (isLoopRunningRef.current) return
    isLoopRunningRef.current = true
    abortRef.current = false
    startKeepAlive()

    try {
      for (let i = startIndex; i < sentences.length; i++) {
        if (abortRef.current) break

        const sentence = sentences[i]
        if (!sentence.trim()) continue

        setState('reading')
        onSentenceStart?.(i)

        // Gemini API 問い合わせ（fetch 中も abort を監視）
        let explanationData = null
        if (apiKey && !abortRef.current) {
          const controller = new AbortController()
          fetchAbortControllerRef.current = controller

          // abort されたら fetch もキャンセル
          const abortCheck = setInterval(() => {
            if (abortRef.current) controller.abort()
          }, 100)

          try {
            explanationData = await fetchExplanation({
              sentence,
              apiKey,
              mode,
              signal: controller.signal,
            })
          } catch (err) {
            if (err.name !== 'AbortError') {
              onError?.(`Gemini API エラー: ${err.message}`)
            }
            // abort or error: explanationData は null のまま
          } finally {
            clearInterval(abortCheck)
            fetchAbortControllerRef.current = null
          }
        }

        if (abortRef.current) break

        // 本文読み上げ
        try {
          await speakText(sentence)
        } catch (err) {
          if (err.message === 'aborted') break
          // その他エラーは続行
        }

        if (abortRef.current) break

        // 解説挿入
        if (explanationData?.needsExplanation && explanationData.term && explanationData.explanation) {
          const { term, explanation } = explanationData

          // 既出リスト登録
          explainedWordsRef.current.add(term)
          onWordExplained?.(term)

          setState('explaining')
          onExplaining?.({ term, explanation, sentenceIndex: i })

          const explainText = `「${term}」とは、${explanation}`
          try {
            await speakText(explainText, 0.92)
          } catch {
            // スキップされても続行
          }

          if (abortRef.current) break
          setState('reading')
        }
      }
    } finally {
      isLoopRunningRef.current = false
      stopKeepAlive()
      if (!abortRef.current) {
        setState('idle')
        onSentenceStart?.(-1)
      }
    }
  }, [setState, fetchExplanation, speakText, onSentenceStart, onExplaining, onWordExplained, onError, startKeepAlive, stopKeepAlive])

  // --- 公開 API ---
  const start = useCallback((args) => {
    // 既存ループが動いていれば先に停止
    if (isLoopRunningRef.current) {
      abortRef.current = true
      cancelSpeech()
      fetchAbortControllerRef.current?.abort()
      // 少し待ってから再起動
      setTimeout(() => {
        isLoopRunningRef.current = false
        explainedWordsRef.current = new Set()
        runLoop(args)
      }, 80)
    } else {
      explainedWordsRef.current = new Set()
      runLoop(args)
    }
  }, [runLoop, cancelSpeech])

  const stop = useCallback(() => {
    abortRef.current = true
    fetchAbortControllerRef.current?.abort()
    cancelSpeech()
    stopKeepAlive()
    // isLoopRunningRef は runLoop の finally でリセットされる
    setState('idle')
    onSentenceStart?.(-1)
  }, [cancelSpeech, setState, onSentenceStart, stopKeepAlive])

  const skipExplanation = useCallback(() => {
    // explaining 中のみ解説音声をキャンセル（本文読み上げには影響しない）
    if (stateRef.current === 'explaining') {
      cancelSpeech()
    }
  }, [cancelSpeech])

  return {
    start,
    stop,
    skipExplanation,
    explainedWords: explainedWordsRef,
    currentState: stateRef,
  }
}
