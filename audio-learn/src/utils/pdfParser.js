/**
 * parsePDF
 * Extracts text from a PDF file and splits it into sentences
 * while preserving paragraph structure.
 */
export async function parsePDF(file) {
  // Dynamically import pdfjs to avoid SSR issues
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set worker - use CDN for simplicity
  pdfjsLib.GlobalWorkerOptions.workerSrc = 
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allPages = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Rebuild text with newlines based on vertical position changes
    let pageText = '';
    let lastY = null;
    
    for (const item of textContent.items) {
      if ('str' in item) {
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          pageText += '\n';
        }
        pageText += item.str;
        lastY = y;
      }
    }
    
    allPages.push(pageText);
  }

  const fullText = allPages.join('\n\n');
  return splitIntoSentences(fullText);
}

/**
 * splitIntoSentences
 * Splits text into sentence objects with index and text fields.
 * Handles Japanese sentence endings (。！？) and Western periods.
 */
function splitIntoSentences(text) {
  // Normalize whitespace but preserve paragraph breaks
  const normalized = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Split on Japanese/Western sentence endings
  const raw = normalized.split(/(?<=[。！？\.\!\?])\s*/);
  
  const sentences = [];
  let charOffset = 0;
  
  for (const s of raw) {
    const trimmed = s.trim();
    if (trimmed.length < 5) {
      charOffset += s.length;
      continue; // skip very short fragments
    }
    sentences.push({
      index: sentences.length,
      text: trimmed,
      charStart: charOffset,
      charEnd: charOffset + trimmed.length,
      status: 'unread', // 'unread' | 'reading' | 'explaining' | 'read'
    });
    charOffset += s.length;
  }
  
  return sentences;
}
