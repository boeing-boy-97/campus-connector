// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  email.ts — Send transactional emails via SMTP / SendGrid               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';
import { z } from 'zod';
import { ApiResponse } from '../../../../shared/types';

// Email templates
const TEMPLATES = {
  otp: (otp: string, collegeName: string) => ({
    subject: `Your Campus Connect OTP: ${otp}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; background: #f8f9fa;">
        <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <h1 style="color: #1a1a2e; font-size: 24px; margin-bottom: 8px; text-align: center;">Campus Connect</h1>
          <p style="color: #6c757d; text-align: center; margin-bottom: 32px; font-size: 14px;">${collegeName}</p>
          <p style="color: #333; font-size: 16px; margin-bottom: 24px;">Your verification code is:</p>
          <div style="background: linear-gradient(135deg, #6c63ff, #e91e63); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="color: white; font-size: 40px; font-weight: 700; letter-spacing: 12px;">${otp}</span>
          </div>
          <p style="color: #6c757d; font-size: 14px; line-height: 1.6;">This code expires in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #aaa; font-size: 12px; text-align: center;">If you did not request this, please ignore this email.</p>
        </div>
      </div>
    `,
  }),
  welcome: (name: string, collegeName: string) => ({
    subject: `Welcome to Campus Connect, ${name}! 🎓`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; background: #f8f9fa;">
        <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <h1 style="color: #1a1a2e; font-size: 24px; margin-bottom: 8px;">Welcome, ${name}! 🎉</h1>
          <p style="color: #6c63ff; font-size: 16px; margin-bottom: 24px;">${collegeName} Community</p>
          <p style="color: #333; font-size: 16px; line-height: 1.7;">You're almost there! Complete your profile verification by uploading a photo in your college uniform or holding your ID card.</p>
          <p style="color: #333; font-size: 16px; line-height: 1.7; margin-top: 16px;">Once verified, you'll be able to connect with verified students from ${collegeName}.</p>
          <div style="text-align: center; margin-top: 32px;">
            <a href="https://campusconnect.app" style="background: linear-gradient(135deg, #6c63ff, #e91e63); color: white; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 16px;">Open App</a>
          </div>
        </div>
      </div>
    `,
  }),
};

const emailSchema = z.object({
  to: z.string().email().max(254),
  template: z.enum(['otp', 'welcome']),
  params: z.record(z.string()),
});

// Lazy transporter initialization
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const config = functions.config();
    transporter = nodemailer.createTransporter({
      host: config.smtp?.host || 'smtp.gmail.com',
      port: parseInt(config.smtp?.port || '587'),
      secure: false,
      auth: {
        user: config.smtp?.user,
        pass: config.smtp?.pass,
      },
    });
  }
  return transporter;
}

export const sendEmail = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    // Only admin or internal Cloud Functions can send email directly
    if (!context.auth || context.auth.token?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    try {
      const parsed = emailSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { to, template, params } = parsed.data;

      let emailContent: { subject: string; html: string };
      if (template === 'otp') {
        emailContent = TEMPLATES.otp(params.otp, params.college_name);
      } else {
        emailContent = TEMPLATES.welcome(params.name, params.college_name);
      }

      if (!process.env.FUNCTIONS_EMULATOR) {
        await getTransporter().sendMail({
          from: `"Campus Connect" <noreply@campusconnect.app>`,
          to,
          subject: emailContent.subject,
          html: emailContent.html,
        });
      } else {
        functions.logger.info(`[DEV EMAIL] To: ${to}, Subject: ${emailContent.subject}`);
      }

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('sendEmail error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send email');
    }
  });

// ─── Internal OTP Email Function (no auth required) ─────────────────────────
// This function is called internally by sendOtp function
const sendOtpEmailSchema = z.object({
  email: z.string().email().max(254),
  otp: z.string().length(6),
  college_name: z.string(),
});

export const sendOtpEmail = functions
  .region('asia-south1')
  .https.onCall(async (data, context): Promise<ApiResponse> => {
    try {
      const parsed = sendOtpEmailSchema.safeParse(data);
      if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.errors[0].message);
      }

      const { email, otp, college_name } = parsed.data;
      const emailContent = TEMPLATES.otp(otp, college_name);

      if (!process.env.FUNCTIONS_EMULATOR) {
        await getTransporter().sendMail({
          from: `"Campus Connect" <noreply@campusconnect.app>`,
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
        functions.logger.info(`OTP email sent successfully to ${email}`);
      } else {
        functions.logger.info(`[DEV EMAIL] OTP for ${email}: ${otp} | Subject: ${emailContent.subject}`);
      }

      return { success: true };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error('sendOtpEmail error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to send OTP email');
    }
  });
