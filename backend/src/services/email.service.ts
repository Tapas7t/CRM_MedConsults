import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

class EmailService {
  private transporter: Transporter | null = null;
  public lastMail?: { to: string; subject: string; text: string; link?: string };

  constructor() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
  }

  /**
   * Sends an email, falling back to server console output in development and test environments
   * when SMTP configuration is not provided.
   */
  async sendMail({
    to,
    subject,
    text,
    link,
  }: {
    to: string;
    subject: string;
    text: string;
    link?: string;
  }): Promise<void> {
    this.lastMail = { to, subject, text, link };
    if (!this.transporter) {
      if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
        console.log(`\n================== [EMAIL DEV CONSOLE] ==================`);
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        if (link) {
          console.log(`Link: ${link}`);
        }
        console.log(`Body:\n${text}`);
        console.log(`=========================================================\n`);
        return;
      }
      throw new Error('SMTP configuration missing in production environment.');
    }

    await this.transporter.sendMail({
      from: env.EMAIL_FROM || 'MedConsults Clinic <noreply@medconsults.com>',
      to,
      subject,
      text,
    });
  }

  /**
   * Sends an email verification link to a newly registered user.
   */
  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const link = `${env.CLIENT_URL}/verify-email?token=${token}`;
    const subject = 'Verify your email - MedConsults Clinic';
    const text = `Dear ${name},

Thank you for registering with MedConsults Clinic.

Please verify your email address by navigating to the following link:
${link}

This verification link is valid for 15 minutes and can only be used once.

If you did not register for an account, please disregard this email.

Warm regards,
MedConsults Clinic Team
Bandra West, Mumbai`;

    await this.sendMail({ to, subject, text, link });
  }

  /**
   * Sends a password reset link to a user.
   */
  async sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
    const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
    const subject = 'Password Reset Request - MedConsults Clinic';
    const text = `Dear ${name},

We received a request to reset the password for your MedConsults Clinic account.

You can set a new password by visiting the following link:
${link}

This password reset link is valid for 15 minutes and can only be used once.

If you did not request a password reset, please secure your account immediately or disregard this email.

Warm regards,
MedConsults Clinic Team
Bandra West, Mumbai`;

    await this.sendMail({ to, subject, text, link });
  }
}

export const emailService = new EmailService();
