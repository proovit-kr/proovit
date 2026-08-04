import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Logo, SegmentTabs } from '@/components';
import { useAppStore } from '@/store/useAppStore';
import styles from './AuthPage.module.css';

export default function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signIn = useAppStore((s) => s.signIn);

  const redirect = params.get('redirect') ?? '/dashboard';
  const [email, setEmail] = useState('dawn@proovit.kr');
  const [password, setPassword] = useState('proovit');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = await signIn(email, password);
    // 운영자로 로그인했는데 참가자 화면으로 가려던 경우 콘솔로 보낸다
    const target =
      user.role === 'ADMIN' && !redirect.startsWith('/admin')
        ? '/admin/judging'
        : redirect;
    navigate(target, { replace: true });
  };

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Logo />
      </nav>
      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.tabs}>
            <SegmentTabs
              items={[
                { key: 'signin', label: '로그인' },
                { key: 'signup', label: '회원가입' },
              ]}
              value="signin"
              onChange={(key) => key === 'signup' && navigate('/signup')}
            />
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className="field">
              <label className="label" htmlFor="email">
                이메일
              </label>
              <input
                id="email"
                className="input"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                className="input"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" block size="lg">
              로그인
            </Button>
            <div className={styles.foot}>
              비밀번호를 잊으셨나요? <a href="#reset">재설정</a>
            </div>
          </form>

          <p className={styles.devHint}>
            목 인증이에요. 아무 값이나 넣어도 참가자로 로그인되고,{' '}
            <strong style={{ color: 'var(--c-text-muted)' }}>ops</strong>로 시작하는
            이메일(ops@proovit.kr)은 운영자로 로그인돼요.
          </p>
        </div>
      </main>
    </div>
  );
}
