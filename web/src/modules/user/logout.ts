'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TOKEN_COOKIE } from '@/lib/auth/session';

/** 退出登录：清掉本地 httpOnly cookie 并回到首页。 */
export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  redirect('/');
}
