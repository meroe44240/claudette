import { describe, it, expect } from 'vitest';
import { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt.js';

describe('JWT utilities', () => {
  const payload = { sub: 'user-123', email: 'test@humanup.io', role: 'ADMIN' };

  it('should generate and verify access token', async () => {
    const token = await generateAccessToken(payload);
    expect(typeof token).toBe('string');
    const decoded = await verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.type).toBe('access');
  });

  it('should generate and verify refresh token', async () => {
    const token = await generateRefreshToken(payload);
    expect(typeof token).toBe('string');
    const decoded = await verifyRefreshToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.type).toBe('refresh');
  });

  it('should reject access token with refresh secret', async () => {
    const token = await generateAccessToken(payload);
    await expect(verifyRefreshToken(token)).rejects.toThrow();
  });

  it('should reject refresh token with access secret', async () => {
    const token = await generateRefreshToken(payload);
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it('should reject invalid token', async () => {
    await expect(verifyAccessToken('invalid-token')).rejects.toThrow();
  });
});
