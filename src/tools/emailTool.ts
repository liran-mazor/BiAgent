import nodemailer from 'nodemailer';
import { z } from 'zod';
import { Tool, ToolResult } from './types';
import * as path from 'path';

// Team configuration
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

// Tool definition
export const EmailToolParams = z.object({
  recipient: z.string().describe('Email address or role (e.g., "team_leader", "vp", or "john@company.com")'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body content'),
  attachments: z.array(z.string()).optional().describe('Optional array of file paths to attach'),
});

export type EmailToolInput = z.infer<typeof EmailToolParams>;

export const emailTool: Tool = {
  name: 'email',
  description: 'Send an email with optional attachments. Use when user requests to send, email, or share results. Recipient can be a role (team_leader, vp) or direct email address.',
  parameters: EmailToolParams,
  execute: async (params: any): Promise<ToolResult> => {
    try {
      if (typeof params.attachments === 'string') {
        try {
          params.attachments = JSON.parse(params.attachments);
        } catch (e) {
          return { success: false, error: 'Invalid attachments format. Must be an array of file paths.' };
        }
      }

      const validated = EmailToolParams.parse(params);
      const recipientEmail = resolveRecipient(validated.recipient);

      if (!recipientEmail) {
        return {
          success: false,
          error: `Recipient "${validated.recipient}" not found. Available roles: ${Object.keys(teamMembers).join(', ')}`,
        };
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
        success: true,
        data: {
          messageId: info.messageId,
          recipient: recipientEmail,
          subject: validated.subject,
          attachmentCount: attachments.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  },
};