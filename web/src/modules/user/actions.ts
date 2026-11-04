'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { login } from '@/modules/user/api';
import { TOKEN_COOKIE } from '@/lib/auth/session';

export interface LoginActionState {
  error?: string;
  /** 登录成功后由服务端跳转 */
  ok?: boolean;
}

/**
 * 登录 Server Action。
 *
 * 后端登录流程（读源码确认）：
 * 1. 前端先对密码做一次 MD5 → 32 位字符串；
 * 2. 后端 MD5(formPass + salt) 与库里比对；
 * 3. 成功后 JWT 只回在响应头 / Set-Cookie，body 里的 UUID 不是 token。
 *
 * 所以这里必须缓存响应头里的 token，并写入我们自己的 httpOnly cookie。
 */
export async function loginAction(_prev: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const mobile = String(formData.get('mobile') ?? '').trim();
  const passwordMd5 = String(formData.get('password') ?? '').trim();
  const from = String(formData.get('from') ?? '/');

  if (!/^1[3-9]\d{9}$/.test(mobile)) {
    return { error: '请输入正确的 11 位手机号' };
  }
  if (passwordMd5.length !== 32) {
    return { error: '密码处理异常，请重试' };
  }

  let result;
  try {
    result = await login(mobile, passwordMd5);
  } catch (err) {
    return { error: (err as Error).message || '登录请求失败' };
  }

  if (!result.token) {
    return { error: '手机号或密码错误' };
  }

  const store = await cookies();
  store.set(TOKEN_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
    // 后端是 http，线上部署到 https 时应打开 secure
    secure: false,
  });

  redirect(from.startsWith('/') ? from : '/');
}
