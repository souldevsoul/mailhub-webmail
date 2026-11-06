"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ShieldCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/utils";
import { describeAddress, formatToday, matchesAddress, matchesToday, sameCompany, type InboxInfo } from "@/lib/send-check";
import { MAILBOX_TAG_STYLE } from "@/components/layout/sidebar-domain-inboxes";
import { useMailboxTagStore } from "@/stores/mailbox-tag-store";
import { useSendCheckStore } from "@/stores/send-check-store";
import { useAccountStore } from "@/stores/account-store";

function InboxLine({ info, label }: { info: InboxInfo; label: string }) {
  const t = useTranslations("send_check");
  const style = info.tag ? MAILBOX_TAG_STYLE[info.tag] : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-foreground">{info.company ?? info.domain}</span>
      {style && info.tag && (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1", style.chip)}>
          {info.tag === "business" ? t("tag_business") : t("tag_project")}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * MailHub: shown before every send. Names the company the From address belongs
 * to, warns when it is not the company of the inbox the user is working in, and
 * keeps Send disabled until today's date and the From address are typed.
 */
export function SendCheckDialog() {
  const t = useTranslations("send_check");
  const pending = useSendCheckStore((s) => s.pending);
  const answer = useSendCheckStore((s) => s.answer);
  const tags = useMailboxTagStore((s) => s.tags);
  const companies = useMailboxTagStore((s) => s.companies);
  const addresses = useMailboxTagStore((s) => s.addresses);
  const [date, setDate] = useState("");
  const [typedFrom, setTypedFrom] = useState("");

  // Every new check starts empty: nothing typed for an earlier message carries over.
  useEffect(() => {
    setDate("");
    setTypedFrom("");
  }, [pending]);

  const accounts = useAccountStore((s) => s.accounts);
  const directory = useMemo(
    () => ({ tags, companies, addresses, personal: accounts.map((a) => a.email) }),
    [tags, companies, addresses, accounts],
  );
  const sender = useMemo(() => describeAddress(pending?.from, directory), [pending, directory]);
  const context = useMemo(
    () => (pending?.contextAddress ? describeAddress(pending.contextAddress, directory) : null),
    [pending, directory],
  );

  const trapRef = useFocusTrap({ isActive: !!pending, onEscape: () => answer(false), restoreFocus: true });
  if (!pending) return null;

  const mismatch = !sameCompany(sender, context);
  const notCompanyInbox = !sender.accountId;
  const dateOk = matchesToday(date);
  const fromOk = matchesAddress(typedFrom, pending.from);
  const ready = dateOk && fromOk;
  const recipients: [string, string[] | undefined][] = [
    [t("to"), pending.to],
    [t("cc"), pending.cc],
    [t("bcc"), pending.bcc],
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px] animate-in fade-in duration-150"
      onClick={() => answer(false)}
    >
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="send-check-title"
        data-testid="send-check-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border border-border bg-background shadow-xl animate-in zoom-in-95 duration-200"
      >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) answer(true);
        }}
      >
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            <h2 id="send-check-title" className="text-lg font-semibold text-foreground">{t("title")}</h2>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("sending_as")}</div>
            <InboxLine info={sender} label={t("sending_as")} />
            <div className="font-mono text-base text-foreground break-all" data-testid="send-check-from">{pending.from}</div>
          </div>

          {mismatch && context && (
            <div role="alert" className="flex gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {t("mismatch", { working: context.company ?? context.domain, sending: sender.company ?? sender.domain })}
              </span>
            </div>
          )}
          {notCompanyInbox && !mismatch && (
            <div role="alert" className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{t("not_company_inbox")}</span>
            </div>
          )}

          <dl className="space-y-1 text-sm">
            {recipients.filter(([, list]) => list && list.length > 0).map(([label, list]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="break-all text-foreground">{list!.join(", ")}</dd>
              </div>
            ))}
            {pending.subject !== undefined && (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground">{t("subject")}</dt>
                <dd className="break-all text-foreground">{pending.subject || t("no_subject")}</dd>
              </div>
            )}
          </dl>

          <label className="block text-sm">
            <span className="text-foreground">{t("type_date", { example: formatToday() })}</span>
            <input
              autoFocus
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              inputMode="numeric"
              autoComplete="off"
              placeholder={formatToday()}
              aria-invalid={date.length > 0 && !dateOk}
              data-testid="send-check-date"
              className={cn(
                "mt-1 w-full rounded-md border bg-background px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring",
                date && !dateOk ? "border-red-500" : dateOk ? "border-green-600" : "border-input",
              )}
            />
          </label>
          <label className="block text-sm">
            <span className="text-foreground">{t("type_from")}</span>
            <input
              value={typedFrom}
              onChange={(e) => setTypedFrom(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              type="email"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={typedFrom.length > 0 && !fromOk}
              data-testid="send-check-from-input"
              className={cn(
                "mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-foreground outline-none focus:ring-2 focus:ring-ring",
                typedFrom && !fromOk ? "border-red-500" : fromOk ? "border-green-600" : "border-input",
              )}
            />
            <span className="mt-1 block text-xs text-muted-foreground">{t("no_paste")}</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => answer(false)}>{t("back")}</Button>
          <Button type="submit" disabled={!ready} data-testid="send-check-confirm">{t("send")}</Button>
        </div>
      </form>
      </div>
    </div>
  );
}
