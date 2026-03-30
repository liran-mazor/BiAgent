import path from 'path';
import { createRequire } from 'module';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const require  = createRequire(import.meta.url);
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

// PDFs larger than this are parsed page-by-page with pdfjs-dist to avoid
// peak memory spikes that pdf-parse causes on large files.
const LARGE_PDF_BYTES  = 10 * 1024 * 1024; // 10 MB
const MIN_TEXT_THRESHOLD = 100;             // chars — below this we assume scanned

async function parseLargePdf(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const doc  = await pdfjsLib.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => 'str' in item ? item.str : '')
      .join(' ');
    pages.push(pageText);
  }

  const text = pages.join('\n');

  if (text.trim().length >= MIN_TEXT_THRESHOLD) {
    return text;
  }

  console.log('[parser] pdfjs-dist returned little text — falling back to Tesseract OCR');
  const { data: ocr } = await Tesseract.recognize(buffer, 'eng');
  return ocr.text;
}

async function parseSmallPdf(buffer: Buffer): Promise<string> {
  const { text } = await pdfParse(buffer);

  if (text.trim().length >= MIN_TEXT_THRESHOLD) {
    return text;
  }

  console.log('[parser] pdf-parse returned little text — falling back to Tesseract OCR');
  const { data } = await Tesseract.recognize(buffer, 'eng');
  return data.text;
}

function parseTxt(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

export async function parseDocument(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case '.pdf':
      return buffer.length >= LARGE_PDF_BYTES
        ? parseLargePdf(buffer)
        : parseSmallPdf(buffer);
    case '.txt':
    case '.md':
      return parseTxt(buffer);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}
