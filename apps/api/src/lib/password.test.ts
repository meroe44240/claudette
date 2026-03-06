import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password.js';

describe('password utilities', () => {
  it('should hash and verify a password', async () => {
    const password = 'SecurePass1';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hash = await hashPassword('SecurePass1');
    expect(await verifyPassword('WrongPass1', hash)).toBe(false);
  });

  it('should validate password strength - valid', () => {
    const result = validatePasswordStrength('SecurePass1');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject password too short', () => {
    const result = validatePasswordStrength('Short1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Le mot de passe doit contenir au moins 8 caractères');
  });

  it('should reject password without uppercase', () => {
    const result = validatePasswordStrength('lowercase1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Le mot de passe doit contenir au moins une majuscule');
  });

  it('should reject password without digit', () => {
    const result = validatePasswordStrength('NoDigitHere');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Le mot de passe doit contenir au moins un chiffre');
  });
});
