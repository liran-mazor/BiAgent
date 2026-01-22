import nodemailer from 'nodemailer';
import { z } from 'zod';
import { Tool, ToolResult } from './types';
import { resolveRecipient, teamMembers } from '../config/team';
import * as path from 'path';

export const EmailToolParams = z.object({
  recipient: z.string().describe('Email address or role (e.g., "team_leader", "cto", or "john@company.com")'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body content'),
  attachments: z.array(z.string()).optional().describe('Optional array of file paths to attach (e.g., chart files)'),
});

export type EmailToolInput = z.infer<typeof EmailToolParams>;

export const emailTool: Tool = {
  name: 'email_tool',
  description: 'Send an email with optional attachments. Use when user requests to send, email, or share results. Recipient can be a role (team_leader, cto, vp, ceo) or direct email address.',
  parameters: EmailToolParams,
  execute: async (params: any): Promise<ToolResult> => {
    try {
      // Handle case where attachments might be a JSON string
      if (typeof params.attachments === 'string') {
        try {
          params.attachments = JSON.parse(params.attachments);
        } catch (e) {
          return {
            success: false,
            error: 'Invalid attachments format. Must be an array of file paths.',
          };
        }
      }
  
      // Validate input
      const validated = EmailToolParams.parse(params);
      
      // Resolve recipient (role → email or validate email)
      const recipientEmail = resolveRecipient(validated.recipient);
      
      if (!recipientEmail) {
        return {
          success: false,
          error: `Recipient "${validated.recipient}" not found in team members and is not a valid email address. Available roles: ${Object.keys(teamMembers).join(', ')}`,
        };
      }
  
      // Create transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
  
      // Prepare attachments
      const attachments = validated.attachments?.map((filePath) => ({
        filename: path.basename(filePath),
        path: filePath,
      })) || [];
  
      // Send email
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