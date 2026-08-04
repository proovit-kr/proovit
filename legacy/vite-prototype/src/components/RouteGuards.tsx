import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';

/** 비로그인 → /signin?redirect=원래주소 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}

/** 일반 유저가 /admin/* 접근 → / */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?redirect=${redirect}`} replace />;
  }
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** 이미 참가팀이 있으면 /apply → /dashboard */
export function RequireNoEntry({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.user);
  if (user?.entryId) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** 운영자는 참가자 화면 대신 콘솔로 (대시보드/신청 화면 보호) */
export function RequireParticipant({ children }: { children: ReactNode }) {
  const user = useAppStore((s) => s.user);
  if (user?.role === 'ADMIN') return <Navigate to="/admin/judging" replace />;
  return <>{children}</>;
}
