"use client";

import { requestSignInCode, verifySignInCode } from "@media-canvas/api-client";
import { useState } from "react";
import { HOME } from "../../lib/routes";
import { codeIsSpent, failedToSendCode, failedToVerifyCode } from "../../lib/failures";
import { Problem } from "../../components/problem";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

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
    <main className="w-[min(26rem,100%)]">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            {sentTo === null ? (
              "Type your email address and we will send you a code. There is no password."
            ) : (
              <>
                We sent a code to <strong className="font-medium">{sentTo}</strong>.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sentTo === null ? (
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void sendCode(address.trim());
              }}
            >
              <Label htmlFor="email">Email address</Label>
              <Input
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
              <Button type="submit" className="mt-2 w-full" disabled={busy}>
                {busy ? "Sending…" : "Send me a code"}
              </Button>
            </form>
          ) : (
            <form className="grid gap-2" onSubmit={submitCode}>
              <Label htmlFor="code">Sign-in code</Label>
              <Input
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
              <Button
                type="submit"
                className="mt-2 w-full"
                disabled={busy || code.length < CODE_LENGTH}
              >
                {busy ? "Checking…" : "Sign in"}
              </Button>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0"
                  disabled={busy}
                  onClick={() => void sendCode(sentTo)}
                >
                  {spent ? "Send a new code" : "Send another code"}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setSentTo(null);
                    setProblem(null);
                    setSpent(false);
                  }}
                >
                  Use a different address
                </Button>
              </div>
              {process.env.NODE_ENV !== "production" && (
                <p className="text-xs text-muted-foreground">
                  No mail service is configured in development — the code is printed in the api log.
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
