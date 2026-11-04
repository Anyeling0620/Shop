import 'server-only';
import { backendRequest } from '@/lib/backend/client';
import type { ShopUser } from '@/modules/catalog/types';

/**
 * 登录。
 *
 * 后端行为（已读源码 + 实测）：
 * - 入参 password 是「前端 MD5 后的 32 位字符串」，后端再加盐 MD5。
 * - 返回值是 UUID，**不是 token**；真正的 JWT 在响应头 zhuawa-shop-token / Set-Cookie。
 * - 这里必须拿响应头，所以不能用 backendRequest 的通用解包，单独实现。
 */
export interface LoginResult {
  token: string | null;
  rawUuid: string;
}

export async function login(mobile: string, passwordMd5: string): Promise<LoginResult> {
  const origin = process.env.USER_SERVICE_ORIGIN ?? 'http://127.0.0.1:18006';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${origin}/user/login/do_login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({ mobile, password: passwordMd5 }).toString(),
      signal: controller.signal,
      cache: 'no-store',
    });

    const text = await res.text();
    let parsed: { code: number; msg: string; data?: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* 非 JSON 响应，按失败处理 */
    }

    if (!parsed || parsed.code !== 0) {
      return { token: null, rawUuid: '' };
    }

    // token 只可能出现在响应头；Set-Cookie 里是后端的 Cookie 形式
    const headerToken = res.headers.get('zhuawa-shop-token');
    const setCookie = res.headers.get('set-cookie') ?? '';
    const cookieMatch = /zhuawa-shop-token=([^;]+)/.exec(setCookie);
    const token = headerToken ?? cookieMatch?.[1] ?? null;

    return { token, rawUuid: parsed.data ?? '' };
  } finally {
    clearTimeout(timer);
  }
}

/** 当前登录用户信息（需 token） */
export async function getCurrentUser(token: string | null): Promise<ShopUser | null> {
  if (!token) return null;
  try {
    return await backendRequest<ShopUser>({ service: 'user', path: '/user/info', token });
  } catch (err) {
    console.error('[user] info failed', (err as Error).message);
    return null;
  }
}
