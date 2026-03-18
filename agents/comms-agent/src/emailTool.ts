import nodemailer from 'nodemailer';
import { z } from 'zod';
import * as path from 'path';

interface TeamMember {
  name: string;
  email: string;
  role: string;
}

const teamMembers: Record<string, TeamMember> = {
  team_leader: {
    name: 'Liran Mazor',
    email: 'lirand95@gmail.com',
    role: 'team_leader',
  },
  vp: {
    name: 'Tal Adel',
    email: 'talf18@gmail.com',
    role: 'vp',
  },
};

function resolveRecipient(recipient: string): string | null {
  const member = teamMembers[recipient.toLowerCase().replace(/\s+/g, '_')];
  if (member) return member.email;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(recipient)) return recipient;

  return null;
}

const EmailToolParams = z.object({
  recipient: z.string(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(z.string()).optional(),
});

export async function executeEmail(input: unknown): Promise<{ messageId: string; recipient: string; subject: string; attachmentCount: number }> {
  const raw = input as any;
  if (typeof raw.attachments === 'string') {
    raw.attachments = JSON.parse(raw.attachments);
  }

  const validated = EmailToolParams.parse(raw);
  const recipientEmail = resolveRecipient(validated.recipient);

  if (!recipientEmail) {
    throw new Error(`Recipient "${validated.recipient}" not found. Available roles: ${Object.keys(teamMembers).join(', ')}`);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT!),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const attachments = validated.attachments?.map((filePath) => ({
    filename: path.basename(filePath),
    path: filePath,
  })) || [];

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject: validated.subject,
    text: validated.body,
    attachments,
  });

  return {
    messageId: info.messageId,
    recipient: recipientEmail,
    subject: validated.subject,
    attachmentCount: attachments.length,
  };
}
