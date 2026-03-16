import { randomBytes } from 'crypto';
import prisma from '../../lib/db.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { generateAccessToken, generateRefreshToken } from '../../lib/jwt.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { sendEmail } from '../../lib/mailer.js';
import type { LoginInput, ChangePasswordInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schema.js';

const resetTokens = new Map<string, { userId: string; expiresAt: Date }>();

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new UnauthorizedError('Email ou mot de passe incorrect');

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Email ou mot de passe incorrect');

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
  try {
    await sendEmail(
      user.email,
      'HumanUp — Réinitialisation de votre mot de passe',
      `<p>Bonjour ${user.prenom || user.nom},</p>
       <p>Cliquez sur le lien suivant pour réinitialiser votre mot de passe :</p>
       <p><a href="${resetUrl}">${resetUrl}</a></p>
       <p>Ce lien est valable 1 heure.</p>
       <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>`,
    );
  } catch {
    // Log but don't fail — we never reveal if the email exists
    console.error('Failed to send reset email');
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
