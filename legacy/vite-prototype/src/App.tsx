import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  DevToolbar,
  RequireAdmin,
  RequireAuth,
  RequireNoEntry,
  RequireParticipant,
} from '@/components';
import { useAppStore } from '@/store/useAppStore';
import AdminJudgingPage from '@/pages/AdminJudgingPage';
import AdminMetricsPage from '@/pages/AdminMetricsPage';
import AdminSeasonsPage from '@/pages/AdminSeasonsPage';
import ApplyPage from '@/pages/ApplyPage';
import DashboardPage from '@/pages/DashboardPage';
import EntryDetailPage from '@/pages/EntryDetailPage';
import LandingPage from '@/pages/LandingPage';
import LeaderboardPage from '@/pages/LeaderboardPage';
import SeasonsPage from '@/pages/SeasonsPage';
import SignInPage from '@/pages/SignInPage';
import SignUpPage from '@/pages/SignUpPage';
import SubmissionPage from '@/pages/SubmissionPage';

/** 라우트 이동 시 스크롤 상단 복귀 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function App() {
  const { ready, bootstrap } = useAppStore();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!ready) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="mono" style={{ color: 'var(--c-text-dim)' }}>
          LOADING…
        </div>
      </div>
    );
  }

  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* 공개 */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/projects/:id" element={<EntryDetailPage />} />
        <Route path="/seasons" element={<SeasonsPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />

        {/* 참가자 */}
        <Route
          path="/apply"
          element={
            <RequireAuth>
              <RequireParticipant>
                <RequireNoEntry>
                  <ApplyPage />
                </RequireNoEntry>
              </RequireParticipant>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <RequireParticipant>
                <DashboardPage />
              </RequireParticipant>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard/submissions/:stage"
          element={
            <RequireAuth>
              <RequireParticipant>
                <SubmissionPage />
              </RequireParticipant>
            </RequireAuth>
          }
        />

        {/* 운영자 */}
        <Route
          path="/admin/judging"
          element={
            <RequireAdmin>
              <AdminJudgingPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/metrics"
          element={
            <RequireAdmin>
              <AdminMetricsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/seasons"
          element={
            <RequireAdmin>
              <AdminSeasonsPage />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DevToolbar />
    </>
  );
}
