import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field, Input, Switch, SwitchRow, Textarea } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Card, Chip, Empty } from "@/components/Surface";

/*
  공용 컴포넌트 진열장. **개발용이고 production 빌드에는 나가지 않는다**
  (아래 notFound 가드).

  왜 필요한가: 시안과 구현본을 computed style로 대조하려면 두 문서에서 같은
  요소를 찾아 재야 하는데, 버튼·뱃지 같은 조각은 화면마다 흩어져 있고 어떤
  변형은 아직 아무 화면에도 안 쓰인다(`.btn-danger`, `.bd-teal` 등).
  한자리에 모아 두면 `scripts/design-diff/components.mjs`가 시안의
  같은 조각과 1:1로 대조할 수 있다.

  data-probe 속성이 대조의 손잡이다. 시안 쪽 셀렉터와 짝을 이룬다.
*/
export default function Page() {
  /* 라우트 자체를 숨긴다. 진열장은 팀 바깥에 보여줄 것이 아니다 */
  if (process.env.NODE_ENV === "production") notFound();

  /*
    ⚠️ 감싸는 요소를 grid·flex로 만들지 않는다. 직계 자식이 블록화돼
    inline-flex가 flex로, inline-block이 block으로 바뀐다 —
    그러면 시안과 대조할 때 display가 전부 어긋난 것처럼 보인다.
  */
  return (
    <main style={{ padding: 40, maxWidth: 900 }}>
      {/* ⚠️ 플렉스로 감싸지 않는다. 감싸면 inline-flex가 flex로 블록화돼
          display 값이 시안과 달라진다 */}
      <section>
        <Button data-probe="btn-primary">사전 신청하기</Button>
        <Button variant="outline" data-probe="btn-outline">
          작동 방식 보기
        </Button>
        <Button variant="ghost" data-probe="btn-ghost">
          임시저장
        </Button>
        <Button variant="danger" data-probe="btn-danger">
          내보내기
        </Button>
        <Button disabled data-probe="btn-disabled">
          통과 후 잠김
        </Button>
        <Button variant="kakao" data-probe="btn-kakao">
          카카오로 계속하기
        </Button>
        <Button variant="google" data-probe="btn-google">
          Google로 계속하기
        </Button>
      </section>

      <section>
        <Badge tone="lime" data-probe="bd-lime">
          pass
        </Badge>
        <Badge tone="red" data-probe="bd-red">
          FAIL
        </Badge>
        <Badge tone="gray" data-probe="bd-gray">
          submitted
        </Badge>
        <Badge tone="warn" data-probe="bd-warn">
          draft
        </Badge>
        <Badge tone="blue" data-probe="bd-blue">
          안내
        </Badge>
        <Badge tone="violet" data-probe="bd-violet">
          소명 대기
        </Badge>
        <Badge tone="teal" data-probe="bd-teal">
          연동 확인됨
        </Badge>
      </section>

      <Card data-probe="card">
        <Chip data-probe="chip">읽기 전용</Chip>
        <span className="score" data-probe="score">
          1,248
        </span>
      </Card>

      <div data-probe="fld">
        <Field
          label="아이디어명"
          note="최대 120자"
          count="31 / 200"
          hint="「누구를 위한 무엇」 한 문장이면 충분해요."
          htmlFor="probe-inp"
        >
          <Input
            id="probe-inp"
            data-probe="inp"
            defaultValue="리틀포션, 1인 카페 레시피 구독"
          />
        </Field>
      </div>

      <Field label="가장 위험한 가정">
        <Textarea data-probe="textarea" defaultValue="사장님들이 레시피에 월 구독료를 낼 의사가 있다" />
      </Field>

      <SwitchRow
        title="서비스에 가입 기능이 붙어 있어요"
        desc="이메일, 소셜 무엇이든 좋아요"
        rowProps={{ "data-probe": "sw" } as Record<string, string>}
      />
      <span data-probe="sw-on">
        <Switch defaultChecked />
      </span>

      <Icon name="lock" data-probe="ic-bare" />
      <p>
        <Icon name="lock" /> 심사 대기
      </p>

      <Empty headline="아직 방문이 없습니다">
        연동은 확인됐어요. 첫 방문자가 오면 여기부터 채워져요.
      </Empty>
    </main>
  );
}
