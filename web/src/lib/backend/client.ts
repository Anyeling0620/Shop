import 'server-only';

/**
 * 后端结果封装：{ code, msg, data }，code === 0 表示成功。
 */
export interface BackendResult<T> {
  code: number;
  msg: string;
  data: T;
}

/** 后端业务错误（code !== 0），带出原始错误码方便前端区分「需登录」。 */
export class BackendError extends Error {
  readonly code: number;
  readonly path: string;

  constructor(path: string, code: number, msg: string) {
    super(msg);
    this.name = 'BackendError';
    this.code = code;
    this.path = path;
  }
}

export const SESSION_ERROR_CODE = 500102;

export type ServiceName = 'goods' | 'order' | 'search' | 'user' | 'seckill';

const origins: Record<ServiceName, string> = {
  goods: process.env.GOODS_SERVICE_ORIGIN ?? 'http://127.0.0.1:18001',
  order: process.env.ORDER_SERVICE_ORIGIN ?? 'http://127.0.0.1:18002',
  search: process.env.SEARCH_SERVICE_ORIGIN ?? 'http://127.0.0.1:18003',
  user: process.env.USER_SERVICE_ORIGIN ?? 'http://127.0.0.1:18006',
  seckill: process.env.SECKILL_SERVICE_ORIGIN ?? 'http://127.0.0.1:18007',
};

export const TOKEN_HEADER = 'zhuawa-shop-token';

interface RequestOptions {
  service: ServiceName;
  path: string;
  method?: 'GET' | 'POST';
  /** JSON body（POST 用） */
  json?: unknown;
  /** 表单 body（登录接口用） */
  form?: Record<string, string>;
  /** 透传用户 token；缺省表示匿名请求 */
  token?: string | null;
  /** 超时毫秒，默认 8s（search 较慢时放宽） */
  timeoutMs?: number;
  /** Next 缓存策略，默认不缓存，由页面自行决定 revalidate */
  cache?: RequestCache;
  revalidate?: number;
}

/** 把后端 Cookie/Header 里的 token 规范化：允许已经是 `Bearer xxx` 之外的原样 JWT。 */
export function normalizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().replace(/^Bearer\s+/i, '');
  // 后端 JWT 三段式，简单校验避免把垃圾值带进请求头
  return t.split('.').length === 3 ? t : null;
}

/**
 * 服务端唯一出口：只有这里能直连微服务。
 * 浏览器拿不到这些地址，也拿不到 token。
 */
export async function backendRequest<T>(opts: RequestOptions): Promise<T> {
  const { service, path, method = 'GET', json, form, token, timeoutMs = 8000, cache, revalidate } = opts;
  const url = `${origins[service]}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers[TOKEN_HEADER] = token;

  let body: string | undefined;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    body = new URLSearchParams(form).toString();
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      cache: cache ?? 'no-store',
      ...(revalidate !== undefined ? { next: { revalidate } } : {}),
    });
  } catch (err) {
    throw new BackendError(path, -1, `无法连接 ${service} 服务：${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new BackendError(path, res.status, `${service} 服务返回 HTTP ${res.status}`);
  }

  const text = await res.text();
  if (!text) {
    throw new BackendError(path, -2, `${service} 服务返回空响应`);
  }

  let parsed: BackendResult<T>;
  try {
    parsed = JSON.parse(text) as BackendResult<T>;
  } catch {
    throw new BackendError(path, -3, `${service} 服务返回的不是合法 JSON`);
  }

  if (parsed.code !== 0) {
    throw new BackendError(path, parsed.code, parsed.msg || '未知业务错误');
  }

  return parsed.data;
}

export function isSessionError(err: unknown): boolean {
  return err instanceof BackendError && err.code === SESSION_ERROR_CODE;
}

/** 页面容错：后端挂了也不要白屏，返回兜底值让页面渲染空态。 */
export async function safeRequest<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[backend]', (err as Error).message);
    return fallback;
  }
}
