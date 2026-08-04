import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, NavBar } from '@/components';
import { useCountdown } from '@/hooks/useCountdown';
import { APPLY_CONSENTS } from '@/mocks';
import { useAppStore } from '@/store/useAppStore';
import styles from './ApplyPage.module.css';

export default function ApplyPage() {
  const { season, createEntry } = useAppStore();
  const cd = useCountdown(season.applyCloseAt);

  const [teamName, setTeamName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [tagline, setTagline] = useState('');
  const [problem, setProblem] = useState('');
  const [targetCustomer, setTargetCustomer] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitedTo, setInvitedTo] = useState('');
  const [checks, setChecks] = useState([false, false, false]);
  const [done, setDone] = useState(false);

  const allChecked = checks.every(Boolean);
  const recruiting = season.status === 'RECRUITING';

  const toggle = (i: number) =>
    setChecks((prev) => prev.map((c, idx) => (idx === i ? !c : c)));

  const invite = () => {
    const value = inviteEmail.trim();
    if (!value) return;
    setInvitedTo(value);
    setInviteEmail('');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allChecked) return;
    await createEntry({
      teamName,
      serviceName,
      tagline,
      problem,
      targetCustomer,
      memberEmails: invitedTo ? [invitedTo] : [],
    });
    setDone(true);
  };

  return (
    <div className="page">
      <NavBar />
      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.head}>
            <div>
              <h1 className={styles.title}>{season.title} 참가 신청</h1>
              <p className={styles.sub}>
                {season.teamSizeLabel} 팀 · 코딩 경험이 없어도 괜찮아요
              </p>
            </div>
            <div className={styles.deadline}>
              <span className="dot" style={{ width: 6, height: 6 }} />
              모집 마감 D-{cd.days} {cd.clock}
            </div>
          </div>

          {!recruiting && (
            <div className={styles.closedNotice}>
              지금은 모집 기간이 아니에요.
              {season.status === 'UPCOMING'
                ? ' 모집이 시작되면 메일로 알려드릴게요.'
                : ' 다음 시즌 모집을 기다려 주세요.'}{' '}
              (개발 툴바에서 시즌 상태를 &lsquo;모집 중&rsquo;으로 바꾸면 신청할 수 있어요)
            </div>
          )}

          <form className={styles.form} onSubmit={onSubmit}>
            <div className="field">
              <label className="label" htmlFor="teamName">
                팀명
              </label>
              <input
                id="teamName"
                className="input"
                required
                placeholder="예: 새벽로켓"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="invite">
                팀원 초대 <span style={{ fontWeight: 500, color: 'var(--c-text-faint)' }}>(선택)</span>
              </label>
              <div className={styles.inviteRow}>
                <input
                  id="invite"
                  className={`input ${styles.grow}`}
                  type="email"
                  placeholder="팀원 이메일 주소"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Button type="button" variant="soft" onClick={invite}>
                  초대
                </Button>
              </div>
              {invitedTo && (
                <div className={styles.invited}>✓ {invitedTo} 초대장을 보냈어요</div>
              )}
              <div className="helpText">본인 제외 최대 1명이에요.</div>
            </div>

            <div className="field">
              <label className="label" htmlFor="serviceName">
                아이디어 제목
              </label>
              <input
                id="serviceName"
                className="input"
                required
                placeholder="예: 동네 빵집 오픈런 알리미"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="tagline">
                한 줄 소개
              </label>
              <input
                id="tagline"
                className="input"
                required
                placeholder="서비스를 한 문장으로 설명해 주세요"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="problem">
                해결하려는 문제
              </label>
              <textarea
                id="problem"
                className="textarea"
                required
                rows={4}
                placeholder="누가, 언제, 어떤 불편을 겪나요? 구체적일수록 좋아요"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="target">
                타깃 고객
              </label>
              <input
                id="target"
                className="input"
                required
                placeholder="예: 갓 구운 빵을 사고 싶은 직장인"
                value={targetCustomer}
                onChange={(e) => setTargetCustomer(e.target.value)}
              />
            </div>

            <div className={styles.consents}>
              {APPLY_CONSENTS.map((label, i) => (
                <button
                  type="button"
                  key={label}
                  className={styles.consent}
                  onClick={() => toggle(i)}
                  aria-pressed={checks[i]}
                >
                  <span
                    className={[styles.checkbox, checks[i] ? styles.checkboxOn : ''].join(
                      ' ',
                    )}
                  >
                    {checks[i] ? '✓' : ''}
                  </span>
                  <span
                    className={[
                      styles.consentLabel,
                      checks[i] ? styles.consentLabelOn : '',
                    ].join(' ')}
                  >
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {done ? (
              <>
                <div className={styles.doneBox}>
                  <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
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
                  <span className={styles.doneText}>신청이 완료됐어요</span>
                </div>
                <div className={styles.doneLink}>
                  <Link to="/dashboard">대시보드로 이동 →</Link>
                </div>
              </>
            ) : (
              <Button type="submit" block size="lg" disabled={!allChecked || !recruiting}>
                신청 완료
              </Button>
            )}

            <p className="hint">신청 즉시 대시보드가 열리고, 첫 미션이 시작돼요.</p>
          </form>
        </div>
      </main>
    </div>
  );
}
