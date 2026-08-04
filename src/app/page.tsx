/*
  임시 홀딩 페이지.
  실제 랜딩은 legacy/vite-prototype/src/pages/LandingPage.tsx 를 이식한다.
  지금은 원본 디자인 토큰이 제대로 걸렸는지 확인하는 용도다.
*/
export default function Home() {
  return (
    <main className="page">
      <div className="container grow flex items-center">
        <div className="w-full max-w-xl py-20">
          <p className="mono text-sm text-lime">SEASON 1 · 준비 중</p>

          <h1 className="mt-4 text-4xl font-extrabold leading-tight text-fg-strong sm:text-5xl">
            아이디어를 <span className="text-lime">증명</span>하는
            <br />
            가장 빠른 방법
          </h1>

          <p className="mt-5 text-lg text-fg-dim">
            AI로 만들고, 배포하고, 실제 이용자로 겨루는 온라인 시즌제 리그.
            수료증이 아니라 지표를 가져갑니다.
          </p>

          <div className="card mt-10">
            <p className="text-sm text-fg-faint">
              랜딩 이식 진행 중 — 사전 신청 API는 동작합니다.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
