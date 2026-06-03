/**
 * parsePDF - robust PDF text extractor
 * Fixes:
 * - Uses fixed CDN worker URL (no dynamic version lookup)
 * - Better sentence splitting for Japanese/mixed text
 * - Handles empty pages gracefully
 */

// Pin to a known-good pdfjs version matching the npm package
const PDFJS_VERSION = '4.0.379';

export async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist');

  // Use exact version match to avoid CDN 404s
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageTexts = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    let pageText = '';
    let lastY = null;
    let lastX = null;

    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue;

      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);

      // New line if Y position changed significantly
      if (lastY !== null && Math.abs(y - lastY) > 8) {
        pageText += '\n';
      } else if (lastX !== null && x - lastX > 20 && lastY === y) {
        // Same line but gap — add space
        pageText += ' ';
      }

      pageText += item.str;
      lastY = y;
      lastX = x + (item.width || 0);
    }

    if (pageText.trim()) {
      pageTexts.push(pageText.trim());
    }
  }

  const fullText = pageTexts.join('\n\n');
  return splitIntoSentences(fullText);
}

function splitIntoSentences(text) {
  // Clean up excessive whitespace
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Split after Japanese/Western sentence endings
  // Using a regex that keeps the delimiter attached to the preceding text
  const parts = normalized.split(/(?<=[。！？])|(?<=\. )|(?<=! )|(?<=\? )/);

  const sentences = [];

  for (const part of parts) {
    const trimmed = part.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // Skip very short or whitespace-only fragments
    if (trimmed.length < 8) continue;

    // Skip lines that are just numbers, headers, page numbers etc.
    if (/^[\d\s\-–—．・•◆◇▶▷●○■□]+$/.test(trimmed)) continue;

    sentences.push({
      index: sentences.length,
      text: trimmed,
      status: 'unread',
    });
  }

  return sentences;
}
