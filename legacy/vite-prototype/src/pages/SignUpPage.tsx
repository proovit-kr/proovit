import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api';
import { Button, LinkButton, Logo, SegmentTabs } from '@/components';
import { useAppStore } from '@/store/useAppStore';
import styles from './AuthPage.module.css';

export default function SignUpPage() {
  const navigate = useNavigate();
  const signUp = useAppStore((s) => s.signUp);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [done, setDone] = useState(false);

  const sendCode = async () => {
    await api.sendVerificationCode(email);
    setCodeSent(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signUp(email, password, code);
    setDone(true);
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
              value="signup"
              onChange={(key) => key === 'signin' && navigate('/signin')}
            />
          </div>

          {done ? (
            <div className={styles.done}>
              <div className={styles.doneMark}>
                <svg width="26" height="26" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M4 10.5 L8.5 15 L16 6"
                    fill="none"
                    stroke="var(--c-lime)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 24,
                      strokeDashoffset: 24,
                      animation: 'drawLine 0.45s ease-out forwards',
                    }}
                  />
                </svg>
              </div>
              <h2 className={styles.doneTitle}>가입이 완료됐어요</h2>
              <p className={styles.doneDesc}>이제 시즌 1에 참가할 수 있어요.</p>
              <div className={styles.doneCta}>
                <LinkButton to="/apply" block size="lg">
                  시즌 1 참가 신청 →
                </LinkButton>
              </div>
            </div>
          ) : (
            <form className={styles.form} onSubmit={onSubmit}>
              <div className="field">
                <label className="label" htmlFor="su-email">
                  이메일
                </label>
                <input
                  id="su-email"
                  className="input"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="su-password">
                  비밀번호
                </label>
                <input
                  id="su-password"
                  className="input"
                  type="password"
                  required
                  placeholder="8자 이상"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="su-code">
                  이메일 인증 코드
                </label>
                <div className={styles.row}>
                  <input
                    id="su-code"
                    className={`input ${styles.codeInput}`}
                    type="text"
                    required
                    maxLength={6}
                    placeholder="6자리 코드"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <Button type="button" variant="soft" onClick={sendCode}>
                    {codeSent ? '재전송' : '코드 받기'}
                  </Button>
                </div>
                {codeSent && (
                  <div className={styles.sent}>
                    ✓ 인증 코드를 보냈어요. 메일함을 확인해 주세요.
                  </div>
                )}
              </div>
              <Button type="submit" block size="lg">
                가입하기
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
