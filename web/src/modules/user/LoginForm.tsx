'use client';

import { useActionState } from 'react';
import { useState } from 'react';
import { formPass } from '@/lib/format/md5';
import { loginAction, type LoginActionState } from '@/modules/user/actions';

interface Props {
  from: string;
}

const initial: LoginActionState = {};

export function LoginForm({ from }: Props) {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [passwordMd5, setPasswordMd5] = useState('');

  return (
    <form action={formAction}>
      {state?.error && <div className="alert alert--error">{state.error}</div>}

      <input type="hidden" name="from" value={from} />
      {/* 后端要的是「加固定盐后再 MD5」的 32 位串，明文密码不离开浏览器 */}
      <input type="hidden" name="password" value={passwordMd5} />

      <div className="field">
        <label htmlFor="mobile">手机号</label>
        <input id="mobile" name="mobile" inputMode="numeric" autoComplete="username" placeholder="请输入手机号" required />
      </div>

      <div className="field">
        <label htmlFor="password-plain">密码</label>
        <input
          id="password-plain"
          type="password"
          autoComplete="current-password"
          placeholder="请输入密码"
          required
          onChange={(e) => setPasswordMd5(formPass(e.target.value))}
        />
      </div>

      <button className="btn btn--block" type="submit" disabled={pending}>
        {pending ? '登录中…' : '登录'}
      </button>
    </form>
  );
}
