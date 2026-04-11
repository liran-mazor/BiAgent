import path from 'path';
import { createRequire } from 'module';
import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const require  = createRequire(import.meta.url);
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

// PDFs larger than this are parsed page-by-page with pdfjs-dist to avoid
// peak memory spikes that pdf-parse causes on large files.
const LARGE_PDF_BYTES  = 10 * 1024 * 1024; // 10 MB
const MIN_TEXT_THRESHOLD = 100;             // chars — below this we assume scanned

let worker: Worker | null = null;

export async function initParser() {
  if (!worker) {
    worker = await createWorker('eng');
  }
}

export async function terminateParser() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

async function performOCR(buffer: Buffer): Promise<string> {
  await initParser();
  const { data } = await worker!.recognize(buffer);
  return data.text;
}

async function parseLargePdf(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ 
    data,
    useSystemFonts: true,
    disableFontFace: true 
  });
  const doc = await loadingTask.promise;

  try {
    const pagesText: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageString = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ');
      pagesText.push(pageString);
    }

    const fullText = pagesText.join('\n');
    
    return fullText.trim().length >= MIN_TEXT_THRESHOLD ? fullText : await performOCR(buffer);
  } finally {
    await doc.destroy();
  }
}

async function parseSmallPdf(buffer: Buffer): Promise<string> {
  const { text } = await pdfParse(buffer);

  return text.trim().length >= MIN_TEXT_THRESHOLD ? text : performOCR(buffer);
}

export async function parseDocument(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case '.pdf':
      return buffer.length >= LARGE_PDF_BYTES
        ? parseLargePdf(buffer)
        : parseSmallPdf(buffer);
    case '.md':
      return buffer.toString('utf-8');
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
