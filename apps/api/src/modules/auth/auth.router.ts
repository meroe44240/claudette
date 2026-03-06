import { FastifyInstance } from 'fastify';
import { loginSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.schema.js';
import * as authService from './auth.service.js';
import { authenticate } from '../../middleware/auth.js';

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
