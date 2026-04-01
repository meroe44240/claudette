import { randomBytes, createHash } from 'crypto';
import type { FastifyInstance } from 'fastify';
import prisma from '../../lib/db.js';
import { verifyPassword } from '../../lib/password.js';
import { generateMcpAccessToken, generateMcpRefreshToken } from '../../lib/jwt.js';

// In production behind Caddy, use the public URL for OAuth endpoints
const API_URL = process.env.MCP_PUBLIC_URL || process.env.APP_URL?.replace(/\/$/, '') || process.env.API_URL || 'http://localhost:3001';

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export default async function mcpOAuthRouter(fastify: FastifyInstance) {
  // ─── Protected Resource Metadata (RFC 9728) ──────────
  fastify.get('/.well-known/oauth-protected-resource', async (_req, reply) => {
    return reply.send({
      resource: API_URL,
      authorization_servers: [API_URL],
      bearer_methods_supported: ['header'],
      scopes_supported: ['all'],
    });
  });

  // ─── OAuth Discovery ──────────────────────────────────
  fastify.get('/.well-known/oauth-authorization-server', async (_req, reply) => {
    return reply.send({
      issuer: API_URL,
      authorization_endpoint: `${API_URL}/oauth/authorize`,
      token_endpoint: `${API_URL}/oauth/token`,
      registration_endpoint: `${API_URL}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['all'],
    });
  });

  // ─── Dynamic Client Registration (required by MCP spec) ──
  fastify.post('/oauth/register', async (request, reply) => {
    const body = request.body as any;
    const clientId = `humanup_${randomBytes(16).toString('hex')}`;
    return reply.status(201).send({
      client_id: clientId,
      client_name: body?.client_name || 'MCP Client',
      redirect_uris: body?.redirect_uris || [],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  // ─── Authorization Page (GET) ─────────────────────────
  fastify.get('/oauth/authorize', async (request, reply) => {
    const q = request.query as Record<string, string>;
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, response_type } = q;

    if (response_type !== 'code') {
      return reply.status(400).send({ error: 'unsupported_response_type' });
    }

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HumanUp ATS — Connexion MCP</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f9fc; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); padding: 40px; max-width: 400px; width: 100%; }
    h1 { font-size: 22px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; margin-bottom: 24px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #333; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 14px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 16px; transition: border-color 0.2s; }
    input:focus { outline: none; border-color: #6c5ce7; }
    button { width: 100%; padding: 12px; background: #6c5ce7; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #5a4bd1; }
    .error { background: #fee; color: #c00; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; display: none; }
    .logo { text-align: center; margin-bottom: 24px; font-size: 28px; font-weight: 800; color: #6c5ce7; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">HumanUp</div>
    <h1>Connexion MCP</h1>
    <p>Connectez votre compte HumanUp ATS a Claude pour piloter votre activite en langage naturel.</p>
    <div class="error" id="error"></div>
    <form id="form" method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${client_id || ''}">
      <input type="hidden" name="redirect_uri" value="${redirect_uri || ''}">
      <input type="hidden" name="state" value="${state || ''}">
      <input type="hidden" name="code_challenge" value="${code_challenge || ''}">
      <input type="hidden" name="code_challenge_method" value="${code_challenge_method || ''}">
      <input type="hidden" name="response_type" value="code">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required placeholder="votre@email.com">
      <label for="password">Mot de passe</label>
      <input type="password" id="password" name="password" required placeholder="••••••••">
      <button type="submit">Autoriser l'acces</button>
    </form>
  </div>
</body>
</html>`;

    return reply.type('text/html').send(html);
  });

  // ─── Authorization Submit (POST) ──────────────────────
  fastify.post('/oauth/authorize', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const { email, password, client_id, redirect_uri, state, code_challenge, code_challenge_method } = body;

    // Validate credentials
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.redirect(`/oauth/authorize?error=invalid_credentials&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${state}&code_challenge=${code_challenge}&code_challenge_method=${code_challenge_method}&response_type=code`);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.redirect(`/oauth/authorize?error=invalid_credentials&client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${state}&code_challenge=${code_challenge}&code_challenge_method=${code_challenge_method}&response_type=code`);
    }

    // Generate authorization code
    const code = randomBytes(32).toString('hex');
    await prisma.oAuthCode.create({
      data: {
        code,
        userId: user.id,
        clientId: client_id || 'claude',
        redirectUri: redirect_uri,
        codeChallenge: code_challenge || null,
        codeChallengeMethod: code_challenge_method || null,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });

    // Redirect back with code
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);

    return reply.redirect(redirectUrl.toString());
  });

  // ─── Token Exchange (POST) ────────────────────────────
  fastify.post('/oauth/token', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const { grant_type, code, redirect_uri, code_verifier, refresh_token } = body;

    if (grant_type === 'authorization_code') {
      if (!code) return reply.status(400).send({ error: 'invalid_request', error_description: 'Missing code' });

      const oauthCode = await prisma.oAuthCode.findUnique({ where: { code } });
      if (!oauthCode || oauthCode.used || oauthCode.expiresAt < new Date()) {
        return reply.status(400).send({ error: 'invalid_grant', error_description: 'Code invalide ou expire' });
      }

      // Verify redirect_uri matches
      if (redirect_uri && oauthCode.redirectUri !== redirect_uri) {
        return reply.status(400).send({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      }

      // Verify PKCE
      if (oauthCode.codeChallenge && code_verifier) {
        const expectedChallenge = base64url(createHash('sha256').update(code_verifier).digest());
        if (expectedChallenge !== oauthCode.codeChallenge) {
          return reply.status(400).send({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
        }
      }

      // Mark code as used
      await prisma.oAuthCode.update({ where: { id: oauthCode.id }, data: { used: true } });

      // Get user
      const user = await prisma.user.findUnique({ where: { id: oauthCode.userId } });
      if (!user) return reply.status(400).send({ error: 'invalid_grant' });

      const tokenPayload = { sub: user.id, email: user.email, role: user.role };
      const accessToken = await generateMcpAccessToken(tokenPayload);
      const refreshTokenVal = await generateMcpRefreshToken(tokenPayload);

      return reply.send({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: refreshTokenVal,
      });
    }

    if (grant_type === 'refresh_token') {
      if (!refresh_token) return reply.status(400).send({ error: 'invalid_request' });

      try {
        const { jwtVerify } = await import('jose');
        const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret');
        const { payload } = await jwtVerify(refresh_token, refreshSecret);
        const p = payload as any;

        const user = await prisma.user.findUnique({ where: { id: p.sub } });
        if (!user) return reply.status(400).send({ error: 'invalid_grant' });

        const tokenPayload = { sub: user.id, email: user.email, role: user.role };
        const accessToken = await generateMcpAccessToken(tokenPayload);
        const newRefreshToken = await generateMcpRefreshToken(tokenPayload);

        return reply.send({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: newRefreshToken,
        });
      } catch {
        return reply.status(400).send({ error: 'invalid_grant', error_description: 'Refresh token invalide' });
      }
    }

    return reply.status(400).send({ error: 'unsupported_grant_type' });
  });
}
