"use client";

import { useState, useTransition } from "react";

import { logout } from "@/app/actions/auth";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Clauses } from "@/components/Clauses";
import { Field, Input, SwitchRow } from "@/components/Field";
import { Modal } from "@/components/Modal";
import {
  SETTINGS_ACCOUNT,
  SETTINGS_CHANNELS,
  SETTINGS_EMAIL_CHANGE as EC,
  SETTINGS_QUIT,
} from "@/content/settings";

import hub from "../dashboard/hub.module.css";

import { confirmEmailCode, sendEmailCode, setChannel, withdraw } from "./actions";

/* 시안 `.bd-warn`에 인라인으로 덮은 카카오 노랑 */
const KAKAO = {
  background: "rgba(254,229,0,.12)",
  color: "#FEE500",
  borderColor: "rgba(254,229,0,.4)",
} as const;

export function SettingsPanel({
  email,
  providers,
  notifyEmail,
  notifyAlimtalk,
}: {
  email: string;
  providers: ("kakao" | "google")[];
  notifyEmail: boolean;
  notifyAlimtalk: boolean;
}) {
  const [quit, setQuit] = useState(false);
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Field label={SETTINGS_CHANNELS.label}>
        <SwitchRow
          rowProps={{ style: { marginBottom: "10px" } }}
          title={SETTINGS_CHANNELS.email.title}
          desc={SETTINGS_CHANNELS.email.desc}
          defaultChecked={notifyEmail}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            start(() => setChannel("email", on));
          }}
        />
        <SwitchRow
          title={SETTINGS_CHANNELS.alimtalk.title}
          desc={SETTINGS_CHANNELS.alimtalk.desc}
          defaultChecked={notifyAlimtalk}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            start(() => setChannel("alimtalk", on));
          }}
        />
      </Field>

      <Field label={SETTINGS_ACCOUNT.label}>
        <div
          className={hub.keybox}
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}
        >
          {email}{" "}
          {providers.map((p) =>
            p === "kakao" ? (
              <Badge key={p} tone="warn" style={KAKAO}>
                {SETTINGS_ACCOUNT.linked.kakao}
              </Badge>
            ) : (
              <Badge key={p} tone="gray">
                {SETTINGS_ACCOUNT.linked.google}
              </Badge>
            ),
          )}
          {changing ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setChanging(true)}
            >
              {SETTINGS_ACCOUNT.change}
            </Button>
          )}
        </div>
        {changing ? (
          <EmailChange
            onClose={() => setChanging(false)}
            onDone={() => {
              setChanging(false);
              setNotice(EC.done);
            }}
          />
        ) : notice ? (
          <p className={hub.sub} role="status" style={{ marginTop: "8px" }}>
            {notice}
          </p>
        ) : null}
      </Field>

      <div style={{ display: "flex", gap: "12px", marginTop: "26px" }}>
        {/* 폼은 상자를 안 만든다 — 버튼이 시안처럼 이 줄의 flex 항목이다 */}
        <form action={logout} style={{ display: "contents" }}>
          <Button type="submit" variant="ghost">
            {SETTINGS_ACCOUNT.logout}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          style={{ marginLeft: "auto", color: "var(--danger)" }}
          onClick={() => setQuit(true)}
        >
          {SETTINGS_ACCOUNT.quit}
        </Button>
      </div>

      <Modal
        open={quit}
        onClose={() => setQuit(false)}
        title={SETTINGS_QUIT.title}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setQuit(false)}>
              {SETTINGS_QUIT.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => start(() => withdraw())}
            >
              {SETTINGS_QUIT.confirm}
            </Button>
          </>
        }
      >
        <p>
          <Clauses text={SETTINGS_QUIT.body} />
        </p>
      </Modal>
    </>
  );
}

/**
 * 이메일 변경 — 새 주소 → 인증 코드 두 걸음. 시안에 없는 화면이라 설정의 입력
 * 부품(Field·Input·Button)만으로 짰다(내가 정함).
 */
function EmailChange({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const r = await sendEmailCode(email);
      setError(r.error ?? null);
      if (r.ok && r.sentTo) {
        setSentTo(r.sentTo);
        setCode("");
      }
    });
  const confirm = () =>
    start(async () => {
      const r = await confirmEmailCode(code);
      setError(r.error ?? null);
      if (r.ok) onDone();
    });

  const empty = sentTo ? code.trim() === "" : email.trim() === "";

  return (
    <form
      style={{ marginTop: "12px" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (sentTo) confirm();
        else send();
      }}
    >
      {sentTo ? (
        <Field
          label={EC.codeLabel}
          htmlFor="email-code"
          hint={error ? <Err text={error} /> : EC.sent.replace("{email}", sentTo)}
        >
          <Input
            id="email-code"
            mono
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            autoFocus
          />
        </Field>
      ) : (
        <Field label={EC.newLabel} htmlFor="email-new" hint={error ? <Err text={error} /> : undefined}>
          <Input
            id="email-new"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            autoFocus
          />
        </Field>
      )}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <Button type="submit" size="sm" disabled={pending || empty}>
          {sentTo ? EC.confirm : EC.send}
        </Button>
        {sentTo ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={send}>
            {EC.resend}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {EC.cancel}
        </Button>
      </div>
    </form>
  );
}

const Err = ({ text }: { text: string }) => (
  <span role="alert" style={{ color: "var(--danger)" }}>
    {text}
  </span>
);
