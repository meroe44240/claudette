// Minimal Mattermost REST client (API v4) for the seed.

export class MMError extends Error {
  constructor(public status: number, public mmId: string | undefined, message: string) {
    super(message);
  }
}

export class MM {
  constructor(private base: string, private token: string) {
    this.base = base.replace(/\/$/, '');
  }

  withToken(token: string): MM {
    return new MM(this.base, token);
  }

  async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}/api/v4${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      throw new MMError(res.status, data?.id, `${method} ${path} -> ${res.status} ${data?.message ?? text}`);
    }
    return data as T;
  }

  get<T = any>(p: string) { return this.req<T>('GET', p); }
  post<T = any>(p: string, b?: unknown) { return this.req<T>('POST', p, b ?? {}); }
  put<T = any>(p: string, b?: unknown) { return this.req<T>('PUT', p, b ?? {}); }
  del<T = any>(p: string) { return this.req<T>('DELETE', p); }

  /** GET that returns null on 404. */
  async find<T = any>(p: string): Promise<T | null> {
    try {
      return await this.get<T>(p);
    } catch (e) {
      if (e instanceof MMError && e.status === 404) return null;
      throw e;
    }
  }

  async uploadProfileImage(userId: string, file: Buffer, filename: string): Promise<void> {
    const form = new FormData();
    const type = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
    form.append('image', new Blob([new Uint8Array(file)], { type }), filename);
    const res = await fetch(`${this.base}/api/v4/users/${userId}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: form,
    });
    if (!res.ok) throw new MMError(res.status, undefined, `upload image ${userId} -> ${res.status} ${await res.text()}`);
  }
}

function safeJson(t: string): any {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
