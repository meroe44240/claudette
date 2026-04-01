import { SignJWT, jwtVerify } from 'jose';

const accessSecret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET || 'dev-access-secret');
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret');

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh' | 'mcp_access' | 'mcp_refresh';
}

export async function generateAccessToken(payload: Omit<JwtPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(accessSecret);
}

export async function generateRefreshToken(payload: Omit<JwtPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(refreshSecret);
}

export async function generateMcpAccessToken(payload: Omit<JwtPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'mcp_access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(accessSecret);
}

export async function generateMcpRefreshToken(payload: Omit<JwtPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'mcp_refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  const p = payload as unknown as JwtPayload;
  if (p.type !== 'access' && p.type !== 'mcp_access') {
    throw new Error('Invalid token type');
  }
  return p;
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, refreshSecret);
  return payload as unknown as JwtPayload;
}
