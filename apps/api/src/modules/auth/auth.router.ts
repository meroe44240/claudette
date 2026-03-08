import { FastifyInstance } from 'fastify';
import { loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schema.js';
import * as authService from './auth.service.js';
import { authenticate } from '../../middleware/auth.js';
import prisma from '../../lib/db.js';

export default async function authRouter(fastify: FastifyInstance) {
  fastify.post('/login', {
    schema: {
      description: 'Login avec email et mot de passe',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const result = await authService.login(input);

      reply.setCookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth/refresh',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return {
        accessToken: result.accessToken,
        user: result.user,
      };
    },
  });

  fastify.post('/refresh', {
    schema: {
      description: 'Refresh JWT via httpOnly cookie',
      tags: ['Auth'],
    },
    handler: async (request, reply) => {
      const refreshToken = request.cookies.refreshToken;
      if (!refreshToken) {
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Refresh token manquant' });
      }

      const result = await authService.refreshTokens(refreshToken);

      reply.setCookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth/refresh',
        maxAge: 7 * 24 * 60 * 60,
      });

      return { accessToken: result.accessToken };
    },
  });

  fastify.post('/logout', {
    schema: {
      description: 'Logout — invalide le refresh token cookie',
      tags: ['Auth'],
    },
    handler: async (request, reply) => {
      reply.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });
      return { message: 'Déconnecté' };
    },
  });

  // GET /me — current user profile
  fastify.get('/me', {
    schema: { description: 'Profil utilisateur courant', tags: ['Auth'] },
    preHandler: [authenticate],
    handler: async (request) => {
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        select: {
          id: true,
          email: true,
          nom: true,
          prenom: true,
          role: true,
          avatarUrl: true,
          calendlyUrl: true,
        },
      });
      return user;
    },
  });

  // PUT /me — update user profile
  fastify.put('/me', {
    schema: { description: 'Mettre à jour le profil utilisateur', tags: ['Auth'] },
    preHandler: [authenticate],
    handler: async (request) => {
      const body = request.body as { calendlyUrl?: string; nom?: string; prenom?: string; avatarUrl?: string };
      const data: Record<string, any> = {};
      if (body.calendlyUrl !== undefined) data.calendlyUrl = body.calendlyUrl || null;
      if (body.nom) data.nom = body.nom;
      if (body.prenom !== undefined) data.prenom = body.prenom;
      if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
      const user = await prisma.user.update({
        where: { id: request.userId },
        data,
        select: { id: true, email: true, nom: true, prenom: true, role: true, avatarUrl: true, calendlyUrl: true },
      });
      return user;
    },
  });

  fastify.put('/change-password', {
    schema: {
      description: 'Changer son mot de passe (authentifié)',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = changePasswordSchema.parse(request.body);
      await authService.changePassword(request.userId, input);
      return { message: 'Mot de passe modifié' };
    },
  });

  fastify.post('/forgot-password', {
    schema: {
      description: 'Envoyer un email de réinitialisation de mot de passe',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
    },
    handler: async (request, reply) => {
      const input = forgotPasswordSchema.parse(request.body);
      await authService.forgotPassword(input);
      return { message: 'Si cet email existe, un lien de réinitialisation a été envoyé' };
    },
  });

  fastify.post('/reset-password', {
    schema: {
      description: 'Réinitialiser le mot de passe avec un token',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string' },
          newPassword: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const input = resetPasswordSchema.parse(request.body);
      await authService.resetPassword(input);
      return { message: 'Mot de passe réinitialisé' };
    },
  });
}
