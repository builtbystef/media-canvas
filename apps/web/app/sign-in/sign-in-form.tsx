"use client";

import { requestSignInCode, verifySignInCode } from "@media-canvas/api-client";
import { useState } from "react";
import { HOME } from "../../lib/routes";
import { codeIsSpent, failedToSendCode, failedToVerifyCode } from "../../lib/failures";

const CODE_LENGTH = 6;

/**
 * Signing in, in two steps: an address, then the code that was mailed to it.
 *
 * The calls are made from the browser, and not from a server action, because
 * the session cookie is the api's answer to verifying a code — going through
 * the rewrite is what puts it in the browser that will carry it afterwards.
 */
export function SignInForm() {
  const [address, setAddress] = useState("");
  // The address a code was actually sent to, which is also the signal that
  // the form has moved on: an address still being typed is not one yet.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [spent, setSpent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendCode(to: string) {
    setBusy(true);
    setProblem(null);
    const { error, response } = await requestSignInCode({ body: { email: to } });
    setBusy(false);
    if (error !== undefined) {
      setProblem(failedToSendCode(response?.status));
      return;
    }
    setSentTo(to);
    setSpent(false);
    setCode("");
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (sentTo === null) return;
    setBusy(true);
    setProblem(null);
    const { error, response } = await verifySignInCode({
      body: { email: sentTo, code },
    });
    if (error !== undefined) {
      setBusy(false);
      setSpent(codeIsSpent(response?.status));
      setProblem(failedToVerifyCode(response?.status));
      return;
    }
    // A whole-document navigation, not a client-side one: the session cookie
    // has just changed, and every page decides what to show from it on the
    // server. Replacing the entry also keeps the sign-in page out of the
    // history the product is reached from.
    window.location.replace(HOME);
  }

  return (
    <main className="panel">
      <h1>Sign in</h1>
      {sentTo === null ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode(address.trim());
          }}
        >
          <p className="lead">
            Type your email address and we will send you a code. There is no password.
          </p>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <Problem message={problem} />
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <p className="lead">
            We sent a code to <strong>{sentTo}</strong>.
          </p>
          <label htmlFor="code">Sign-in code</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`\\d{${CODE_LENGTH}}`}
            maxLength={CODE_LENGTH}
            autoFocus
            required
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
            }
          />
          <Problem message={problem} />
          <button type="submit" disabled={busy || code.length < CODE_LENGTH}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <p className="choices">
            <button
              type="button"
              className="plain"
              disabled={busy}
              onClick={() => void sendCode(sentTo)}
            >
              {spent ? "Send a new code" : "Send another code"}
            </button>
            <button
              type="button"
              className="plain"
              disabled={busy}
              onClick={() => {
                setSentTo(null);
                setProblem(null);
                setSpent(false);
              }}
            >
              Use a different address
            </button>
          </p>
          {process.env.NODE_ENV !== "production" && (
            <p className="aside">
              No mail service is configured in development — the code is printed in the api log.
            </p>
          )}
        </form>
      )}
    </main>
  );
}

function Problem({ message }: { message: string | null }) {
  return (
    <p className="problem" role="alert">
      {message}
    </p>
  );
}
