/*
  임시 홀딩 페이지.
  실제 랜딩은 Notion 「필요 페이지 정리」의 시안과 Figma 보드를 근거로 구현한다.
  지금은 디자인 토큰과 폰트가 살아 있는지 확인하는 용도다.
*/
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <p className="font-mono text-sm text-accent">SEASON 1 · 준비 중</p>

        <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
          아이디어를 <span className="text-accent">증명</span>하는
          <br />
          가장 빠른 방법
        </h1>

        <p className="mt-5 text-lg text-fg-muted">
          AI로 만들고, 배포하고, 실제 이용자로 겨루는 온라인 시즌제 리그.
          수료증이 아니라 지표를 가져갑니다.
        </p>

        <div className="mt-10 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-fg-subtle">사전 신청 폼은 준비 중입니다.</p>
        </div>
      </div>
    </main>
  );
}
