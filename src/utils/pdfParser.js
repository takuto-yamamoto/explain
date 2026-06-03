/**
 * PDF テキスト抽出ユーティリティ
 * pdfjs-dist を使用して構造を保ったまま文章単位に分割する
 *
 * 修正:
 * - pdfjs Worker URL のバージョン自動取得
 * - 行グループ化の y座標ソート追加（PDF内アイテム順序が不定な場合の対策）
 * - splitIntoSentences: 小数点・略語・英文略称による誤分割を防止
 * - 短すぎる文のフィルタ閾値を調整
 */

let pdfjsLib = null

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib
  const mod = await import('pdfjs-dist')
  pdfjsLib = mod

  // pdfjs-dist のバージョンを動的に取得してWorkerURLを一致させる
  const version = mod.version || '4.0.379'
  // CDN フォールバック: .mjs が失敗する環境のため .js も試みる
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`

  return pdfjsLib
}

/**
 * PDF ファイルからテキストを抽出し、文章配列として返す
 * @param {File} file
 * @param {function} onProgress - (current, total) => void
 * @returns {Promise<{sentences: string[], rawText: string, pageCount: number}>}
 */
export async function extractTextFromPDF(file, onProgress) {
  const lib = await getPdfJs()
  const arrayBuffer = await file.arrayBuffer()

  const pdf = await lib.getDocument({
    data: arrayBuffer,
    // 日本語フォントを正しく扱うための設定
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/cmaps/',
    cMapPacked: true,
  }).promise

  const pageCount = pdf.numPages
  let fullText = ''

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    onProgress?.(pageNum, pageCount)
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    // アイテムを y座標（上→下）でソートしてから行グループ化
    const items = textContent.items
      .filter(item => 'str' in item && item.str.trim())
      .sort((a, b) => {
        // PDF座標系は左下原点なので降順が上→下
        const dy = b.transform[5] - a.transform[5]
        if (Math.abs(dy) > 3) return dy
        // 同一行内はx座標昇順（左→右）
        return a.transform[4] - b.transform[4]
      })

    const lines = []
    let currentLine = []
    let lastY = null

    for (const item of items) {
      const y = Math.round(item.transform[5])
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        if (currentLine.length > 0) {
          lines.push(currentLine.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim())
          currentLine = []
        }
      }
      currentLine.push(item)
      lastY = y
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim())
    }

    fullText += lines.filter(Boolean).join('\n') + '\n\n'
  }

  const sentences = splitIntoSentences(fullText)
  return { sentences, rawText: fullText, pageCount }
}

/**
 * テキストを意味のある文章単位に分割する
 * 日本語・英語混在に対応、誤分割を最小化
 */
function splitIntoSentences(text) {
  const paragraphs = text.split(/\n{2,}/)
  const sentences = []

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    // 日本語文末（。！？）で分割
    let processed = trimmed.replace(/([。！？])\s*/g, '$1\n')

    // 英文末の分割:
    // ピリオドの後にスペース + 大文字 or 日本語文字が来る場合のみ分割
    // ただし以下は除外:
    //   - 小数点: "3.14"
    //   - 略語ピリオド: "e.g.", "i.e.", "etc.", "Mr.", "Dr.", "vs."
    //   - 省略記号: "..."
    processed = processed.replace(
      /(?<![0-9])(?<!e\.g)(?<!i\.e)(?<!etc)(?<!Mr)(?<!Dr)(?<!vs)(?<!\.\.)\.\s+(?=[A-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/g,
      '.\n'
    )
    processed = processed.replace(/([!?])\s+(?=[A-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/g, '$1\n')

    const parts = processed
      .split('\n')
      .map(s => s.trim())
      .filter(s => {
        if (s.length < 8) return false   // 8文字未満は除外（ページ番号・記号等）
        if (/^[\d\s.]+$/.test(s)) return false  // 数字のみ行を除外
        return true
      })

    sentences.push(...parts)
  }

  return sentences
}
