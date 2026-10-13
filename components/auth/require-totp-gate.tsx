"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import * as OTPAuth from "otpauth";
import { useTranslations } from "next-intl";
import { Shield, Loader2, LogOut } from "@/components/icons";
import { useAuthStore } from "@/stores/auth-store";
import { useAccountSecurityStore } from "@/stores/account-security-store";
import { useConfig } from "@/hooks/use-config";
import { totpIssuer } from "@/lib/totp-issuer";
import { IS_LITE } from "@/lib/lite";
import { toast } from "@/stores/toast-store";

/**
 * MailHub: every password account must turn on 2FA before it can use the
 * webmail. Signed in without it, the whole app is covered by this setup screen
 * (QR code, code, password) until Stalwart reports an OTP secret; the only way
 * out is signing out. A failed status check never locks anyone out.
 */
export function RequireTotpGate() {
  const t = useTranslations("settings.security.totp");
  const { isAuthenticated, client, authMode, logout } = useAuthStore();
  const { isStalwart, probe, fetchAuthInfo, otpEnabled, enableTotp, isSaving } = useAccountSecurityStore();
  const { appName } = useConfig();
  const [checked, setChecked] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  // OAuth (external identity provider) and bare access tokens hold no password
  // Stalwart could check; their second factor belongs to that provider.
  const appliesToSession = authMode === "basic" || (IS_LITE && authMode === "token");

  useEffect(() => {
    if (!isAuthenticated || !client || !appliesToSession) return;
    let cancelled = false;
    (async () => {
      const stalwart = isStalwart ?? (await probe());
      if (stalwart) await fetchAuthInfo();
      if (cancelled) return;
      // fetchAuthInfo reports failure through the store, not by throwing.
      setCheckFailed(!!useAccountSecurityStore.getState().error);
      setChecked(true);
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, client, appliesToSession, isStalwart, probe, fetchAuthInfo]);

  const blocked = isAuthenticated && !!client && appliesToSession && checked && !checkFailed && isStalwart === true && !otpEnabled;

  if (!blocked) return null;
  return <TotpSetupScreen t={t} username={client?.getUsername() ?? ""} issuer={totpIssuer(appName)} isSaving={isSaving} enableTotp={enableTotp} onSignOut={logout} />;
}

interface SetupProps {
  t: ReturnType<typeof useTranslations>;
  username: string;
  issuer: string;
  isSaving: boolean;
  enableTotp: (password: string, otpUrl: string, otpCode: string) => Promise<void>;
  onSignOut: () => void;
}

function TotpSetupScreen({ t, username, issuer, isSaving, enableTotp, onSignOut }: SetupProps) {
  const totp = useMemo(
    () => new OTPAuth.TOTP({ issuer, label: username || "account", algorithm: "SHA1", digits: 6, period: 30, secret: new OTPAuth.Secret({ size: 20 }) }),
    [issuer, username],
  );
  const otpUrl = useMemo(() => totp.toString(), [totp]);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(otpUrl, { width: 200, margin: 1 }).then((url) => { if (!cancelled) setQr(url); }).catch(() => setQr(null));
    return () => { cancelled = true; };
  }, [otpUrl]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const token = code.replace(/\s+/g, "");
    if (!token) return setError(t("code_required"));
    if (!password) return setError(t("password_required"));
    if (totp.validate({ token, window: 1 }) === null) return setError(t("code_invalid"));
    try {
      await enableTotp(password, otpUrl, token);
      toast.success(t("enabled"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("enable_error"));
    }
  };

  // Base32 key in groups of four, for typing into an app by hand.
  const manualKey = totp.secret.base32.replace(/(.{4})/g, "$1 ").trim();

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start sm:items-center justify-center overflow-y-auto bg-background/95 backdrop-blur-sm px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="totp-gate-title"
      data-testid="totp-gate"
    >
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="totp-gate-title" className="text-lg font-semibold text-foreground">{t("gate_title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("gate_body")}</p>
            <p className="mt-1 text-xs text-muted-foreground truncate">{username}</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-foreground">{t("gate_step_scan")}</p>
          <div className="flex justify-center">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, generated in the browser
              <img src={qr} width={200} height={200} alt="" className="rounded-md border border-border bg-white p-2" data-testid="totp-gate-qr" />
            ) : (
              <div className="grid h-[200px] w-[200px] place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("gate_step_manual")}</p>
          <code className="block select-all break-all rounded-md bg-muted px-3 py-2 text-center font-mono text-sm tracking-wider" data-testid="totp-gate-key">{manualKey}</code>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-foreground">{t("gate_step_code")}</p>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">{t("verification_code")}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-center font-mono text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="totp-gate-code"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">{t("gate_password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="totp-gate-password"
            />
          </label>
          {error && <p className="text-sm text-destructive" role="alert" data-testid="totp-gate-error">{error}</p>}
        </div>

        <div className="space-y-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            data-testid="totp-gate-submit"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("gate_submit")}
          </button>
          <p className="text-xs text-muted-foreground">{t("gate_apps_note")}</p>
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            {t("gate_sign_out")}
          </button>
        </div>
      </form>
    </div>
  );
}
