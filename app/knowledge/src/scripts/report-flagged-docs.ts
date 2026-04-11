#!/usr/bin/env node
/**
 * Daily/weekly security report of flagged documents.
 * Run via cron: 0 9 * * 1 (9am every Monday)
 *
 * Usage:
 *   tsx scripts/report-flagged-docs.ts
 *   SECURITY_EMAIL=security@company.com tsx scripts/report-flagged-docs.ts
 */

import 'dotenv/config';
import { getPool } from '../lib/ingester.js';

const SECURITY_EMAIL = process.env.SECURITY_EMAIL || 'security@company.com';

async function reportFlaggedDocs() {
  const pool = getPool();

  try {
    // Fetch flagged documents that haven't been reported yet
    const result = await pool.query(
      `SELECT
         id,
         source,
         filename,
         flag_reason,
         doc_type,
         year,
         flagged_at
       FROM flagged_documents
       WHERE reported_at IS NULL
       ORDER BY flagged_at DESC`
    );

    const flaggedDocs = result.rows;

    if (flaggedDocs.length === 0) {
      console.log('[security-report] No new flagged documents to report');
      return;
    }

    // Format report
    const reportLines = [
      `Security Report: ${flaggedDocs.length} flagged document(s) found`,
      `Report generated: ${new Date().toISOString()}`,
      '',
      '─'.repeat(80),
    ];

    for (const doc of flaggedDocs) {
      reportLines.push('');
      reportLines.push(`Document: ${doc.filename}`);
      reportLines.push(`Source: ${doc.source}`);
      reportLines.push(`Type: ${doc.doc_type}`);
      reportLines.push(`Year: ${doc.year || 'N/A'}`);
      reportLines.push(`Flagged: ${new Date(doc.flagged_at).toISOString()}`);
      reportLines.push(`Reason: ${doc.flag_reason}`);
      reportLines.push('');
    }

    reportLines.push('─'.repeat(80));
    reportLines.push('');
    reportLines.push('Action required: Review flagged documents in pgvector.');
    reportLines.push('If confirmed as suspicious, consider deleting the document.');
    reportLines.push(`Query: SELECT * FROM flagged_documents WHERE reported_at IS NULL`);

    const subject = `[SECURITY] Flagged Documents Report - ${flaggedDocs.length} document(s)`;
    const body = reportLines.join('\n');

    // Send email (using email tool from common)
    console.log(`[security-report] Sending report to ${SECURITY_EMAIL}...`);
    await sendSecurityEmail(subject, body);

    // Mark as reported
    const reportedIds = flaggedDocs.map(d => d.id);
    await pool.query(
      `UPDATE flagged_documents
       SET reported_at = NOW()
       WHERE id = ANY($1)`,
      [reportedIds]
    );

    console.log(`[security-report] ✓ Report sent and marked as reported`);
  } catch (error) {
    console.error('[security-report] Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function sendSecurityEmail(subject: string, body: string) {
  // Use nodemailer directly since we're in app/knowledge (no cross-app dependencies)
  const nodemailer = await import('nodemailer');

  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'security-alerts@company.com',
    to: SECURITY_EMAIL,
    subject,
    text: body,
  });
}

reportFlaggedDocs().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
