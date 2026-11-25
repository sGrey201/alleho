import type { Request, Response } from "express";

const VALIDATE_URL = "https://smartcaptcha.yandexcloud.net/validate";
const INVITE_GRANT_MS = 10 * 60 * 1000;

export type CaptchaFailure = "captcha_required" | "captcha_failed" | "captcha_unavailable";

type InviteCaptchaGrant = { email: string; expiresAt: number };

function clientIp(req: Request): string | undefined {
  const raw = req.ip || req.socket.remoteAddress || "";
  const ip = raw.replace(/^::ffff:/, "").trim();
  return ip || undefined;
}

export async function verifyYandexSmartCaptcha(
  token: string,
  ip?: string
): Promise<true | CaptchaFailure> {
  const secret = process.env.YANDEX_SMARTCAPTCHA_SECRET?.trim();
  if (!secret) {
    console.error("[captcha] YANDEX_SMARTCAPTCHA_SECRET is not set");
    return "captcha_unavailable";
  }
  const trimmed = token.trim();
  if (!trimmed) return "captcha_required";
  try {
    const params = new URLSearchParams({ secret, token: trimmed });
    if (ip) params.set("ip", ip);
    const response = await fetch(`${VALIDATE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = (await response.json()) as { status?: string };
    return data.status === "ok" ? true : "captcha_failed";
  } catch (error) {
    console.error(
      "[captcha] validation request failed",
      error instanceof Error ? error.message : ""
    );
    return "captcha_unavailable";
  }
}

function captchaStatus(code: CaptchaFailure): number {
  return code === "captcha_unavailable" ? 503 : 400;
}

/** Checks the token from `captchaToken`. Returns false after writing the error response. */
export async function rejectUnlessCaptcha(req: Request, res: Response): Promise<boolean> {
  const token = String((req.body as { captchaToken?: unknown } | undefined)?.captchaToken || "");
  const result = await verifyYandexSmartCaptcha(token, clientIp(req));
  if (result === true) return true;
  res.status(captchaStatus(result)).json({ message: result });
  return false;
}

export function grantInviteCaptcha(req: Request, email: string): void {
  (req.session as { inviteCaptchaGrant?: InviteCaptchaGrant }).inviteCaptchaGrant = {
    email,
    expiresAt: Date.now() + INVITE_GRANT_MS,
  };
}

export function consumeInviteCaptchaGrant(req: Request, email: string): boolean {
  const session = req.session as { inviteCaptchaGrant?: InviteCaptchaGrant };
  const grant = session.inviteCaptchaGrant;
  delete session.inviteCaptchaGrant;
  if (!grant || grant.expiresAt < Date.now()) return false;
  return grant.email === email;
}

export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}
