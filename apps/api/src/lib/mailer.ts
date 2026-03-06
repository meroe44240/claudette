import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'resend',
    pass: process.env.SMTP_PASSWORD || '',
  },
});

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@humanup.io',
    to,
    subject,
    html,
  });
}
