import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../index.js';
import prisma from '../../lib/db.js';
import { hashPassword } from '../../lib/password.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await prisma.user.upsert({
    where: { email: 'test@humanup.io' },
    update: {},
    create: {
      email: 'test@humanup.io',
      passwordHash: await hashPassword('TestPass1'),
      nom: 'Test',
      prenom: 'User',
      role: 'ADMIN',
      mustChangePassword: false,
    },
  });

  await prisma.user.upsert({
    where: { email: 'newuser@humanup.io' },
    update: {},
    create: {
      email: 'newuser@humanup.io',
      passwordHash: await hashPassword('TempPass1'),
      nom: 'New',
      prenom: 'User',
      role: 'RECRUTEUR',
      mustChangePassword: true,
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: ['test@humanup.io', 'newuser@humanup.io'] } } });
  await app.close();
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/login', () => {
  it('should login with valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@humanup.io', password: 'TestPass1' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.user.email).toBe('test@humanup.io');
    expect(body.user.role).toBe('ADMIN');
  });

  it('should reject invalid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@humanup.io', password: 'WrongPass1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should reject non-existent user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@humanup.io', password: 'TestPass1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return mustChangePassword for new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'newuser@humanup.io', password: 'TempPass1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.mustChangePassword).toBe(true);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('should reject without refresh token cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
    });
    expect(res.statusCode).toBe(401);
  });

  it('should refresh with valid cookie', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@humanup.io', password: 'TestPass1' },
    });
    const cookies = loginRes.cookies;
    const refreshCookie = cookies.find((c: any) => c.name === 'refreshToken');
    expect(refreshCookie).toBeDefined();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refreshToken: refreshCookie!.value },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeDefined();
  });
});

describe('PUT /api/v1/auth/change-password', () => {
  it('should reject without auth', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/change-password',
      payload: { currentPassword: 'TestPass1', newPassword: 'NewPass123' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should change password with valid auth', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@humanup.io', password: 'TestPass1' },
    });
    const token = loginRes.json().accessToken;

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'TestPass1', newPassword: 'NewPass123' },
    });
    expect(res.statusCode).toBe(200);

    // Reset password back for other tests
    const loginRes2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@humanup.io', password: 'NewPass123' },
    });
    const token2 = loginRes2.json().accessToken;
    await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${token2}` },
      payload: { currentPassword: 'NewPass123', newPassword: 'TestPass1' },
    });
  });

  it('should reject wrong current password', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@humanup.io', password: 'TestPass1' },
    });
    const token = loginRes.json().accessToken;

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'WrongPass1', newPassword: 'NewPass123' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  it('should accept valid email without revealing existence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'test@humanup.io' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('should accept non-existent email silently', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'nobody@humanup.io' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('should clear refresh token cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });
    expect(res.statusCode).toBe(200);
    const cookies = res.cookies;
    const refreshCookie = cookies.find((c: any) => c.name === 'refreshToken');
    expect(refreshCookie).toBeDefined();
  });
});
