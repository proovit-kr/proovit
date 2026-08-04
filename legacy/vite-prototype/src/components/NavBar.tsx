import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { initialOf } from '@/utils/format';
import { Button, LinkButton } from './Button';
import styles from './NavBar.module.css';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={[styles.logo, className ?? ''].join(' ')}>
      PROO<span className={styles.logoCheck}>✓</span>IT
    </Link>
  );
}

const MENU = [
  { to: '/', label: '리그 소개' },
  { to: '/leaderboard', label: '리더보드' },
  { to: '/seasons', label: '시즌 아카이브' },
];

/** 공개·참가자 화면 공용 상단 내비 */
export function NavBar() {
  const { user, season, signOut } = useAppStore();
  const location = useLocation();

  const cta =
    season.status === 'UPCOMING'
      ? { to: '/', label: `${season.title} 사전 신청` }
      : season.status === 'RECRUITING'
        ? { to: '/apply', label: `${season.title} 참가` }
        : { to: '/leaderboard', label: '리더보드 보기' };

  return (
    <nav className={styles.nav}>
      <Logo />
      <div className={styles.menu}>
        {MENU.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              isActive ? `${styles.menuLink} ${styles.menuActive}` : styles.menuLink
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      <div className={styles.right}>
        {user ? (
          <>
            <Link
              to={user.role === 'ADMIN' ? '/admin/judging' : '/dashboard'}
              className={styles.userChip}
            >
              <span className={styles.avatar}>{initialOf(user.displayName.replace('팀 ', ''))}</span>
              <span className={styles.userName}>{user.displayName}</span>
            </Link>
            <Button variant="quiet" size="sm" onClick={signOut}>
              로그아웃
            </Button>
          </>
        ) : (
          <>
            <Link
              to={`/signin?redirect=${encodeURIComponent(location.pathname + location.search)}`}
              className={styles.signIn}
            >
              로그인
            </Link>
            <LinkButton to={cta.to} size="sm">
              {cta.label}
            </LinkButton>
          </>
        )}
      </div>
    </nav>
  );
}

const OPS_MENU = [
  { to: '/admin/judging', label: '심사' },
  { to: '/admin/metrics', label: '지표 검증' },
  { to: '/admin/seasons', label: '시즌 관리' },
];

/** 운영자(OPS) 콘솔 내비 */
export function OpsNavBar() {
  return (
    <nav className={styles.opsNav}>
      <div className={styles.opsLogo}>
        PROO<span className={styles.logoCheck}>✓</span>IT <span className={styles.opsTag}>OPS</span>
      </div>
      <div className={styles.opsMenu}>
        {OPS_MENU.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? `${styles.opsLink} ${styles.opsActive}` : styles.opsLink
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      <Link to="/" className={styles.opsExit}>
        ← 서비스 화면으로
      </Link>
    </nav>
  );
}
