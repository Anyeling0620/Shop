import 'server-only';
import { cookies, headers } from 'next/headers';
import { normalizeToken, TOKEN_HEADER } from '@/lib/backend/client';

/**
 * 读取当前请求携带的 token。
 * 优先级：显式 header > cookie。只允许在服务端调用。
 */
export async function getRequestToken(): Promise<string | null> {
  const h = await headers();
  const fromHeader = normalizeToken(h.get(TOKEN_HEADER));
  if (fromHeader) return fromHeader;

  const c = await cookies();
  return normalizeToken(c.get(TOKEN_HEADER)?.value);
}

export const TOKEN_COOKIE = TOKEN_HEADER;
