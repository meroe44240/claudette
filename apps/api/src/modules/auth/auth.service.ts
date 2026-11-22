import { randomBytes } from 'crypto';
import prisma from '../../lib/db.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { generateAccessToken, generateRefreshToken } from '../../lib/jwt.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { sendEmail, renderBrandedEmail } from '../../lib/mailer.js';
import type { LoginInput, ChangePasswordInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schema.js';

const resetTokens = new Map<string, { userId: string; expiresAt: Date }>();

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new UnauthorizedError('Email ou mot de passe incorrect');

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Email ou mot de passe incorrect');

  if (user.status !== 'ACTIVE') throw new UnauthorizedError('Compte désactivé. Contactez votre administrateur.');
  // Un agent IA travaille uniquement par MCP, avec sa clé.
  if (user.estAgent) throw new UnauthorizedError('Les comptes agents ne se connectent pas à l\'interface.');

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = await generateAccessToken(tokenPayload);
  const refreshToken = await generateRefreshToken(tokenPayload);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      onboardingCompleted: user.onboardingCompleted,
    },
  };
}

export async function refreshTokens(refreshToken: string) {
  const { verifyRefreshToken } = await import('../../lib/jwt.js');
  try {
    const payload = await verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedError('Utilisateur introuvable');
    if (user.status !== 'ACTIVE' || user.estAgent) throw new UnauthorizedError('Compte désactivé');

    const tokenPayload = { sub: user.id, email: user.email, role: user.role };
    const newAccessToken = await generateAccessToken(tokenPayload);
    const newRefreshToken = await generateRefreshToken(tokenPayload);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch {
    throw new UnauthorizedError('Refresh token invalide ou expiré');
  }
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Utilisateur', userId);

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw new ValidationError('Mot de passe actuel incorrect');

  const newHash = await hashPassword(input.newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, mustChangePassword: false },
  });
}

export async function forgotPassword(input: ForgotPasswordInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) return; // Ne pas révéler si l'email existe

  const token = randomBytes(32).toString('hex');
  resetTokens.set(token, {
    userId: user.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
  });

  const resetUrl = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  const firstName = user.prenom || user.nom;
  // Fallback (SMTP potentiellement indisponible/bloquant) : on logge le lien de
  // secours AVANT l'envoi, pour qu'un admin puisse le récupérer même si l'envoi bloque.
  console.warn(`[password-reset] lien de secours pour ${user.email} — token=${token}`);
  try {
    await sendEmail(
      user.email,
      'Reset your HumanUp password',
      renderBrandedEmail({
        title: 'Reset your password',
        bodyHtml: `
          <p>Hi ${firstName},</p>
          <p>We received a request to reset the password for your HumanUp account.</p>
          <p>Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.</p>
        `,
        cta: { label: 'Reset my password', href: resetUrl },
        signature: `If you didn't ask for this, you can ignore this email. Your password stays the same.`,
        lang: 'en',
      }),
    );
  } catch {
    // Log but don't fail — we never reveal if the email exists.
    // Fallback (SMTP indisponible) : on écrit le lien de secours dans les logs
    // serveur pour qu'un admin puisse le transmettre manuellement.
    console.error('Failed to send reset email');
    console.warn(`[password-reset] lien de secours pour ${user.email} — token=${token} url=${resetUrl}`);
  }
}

export async function resetPassword(input: ResetPasswordInput) {
  const tokenData = resetTokens.get(input.token);
  if (!tokenData) throw new ValidationError('Token de réinitialisation invalide');
  if (tokenData.expiresAt < new Date()) {
    resetTokens.delete(input.token);
    throw new ValidationError('Token de réinitialisation expiré');
  }

  const newHash = await hashPassword(input.newPassword);
  await prisma.user.update({
    where: { id: tokenData.userId },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  resetTokens.delete(input.token);
}
