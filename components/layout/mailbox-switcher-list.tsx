"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Check, Inbox, Loader2, Mails, Rocket, Tag, Users } from "@/components/icons";
import { cn } from "@/lib/utils";
import { MAILBOX_TAGS, type MailboxTag } from "@/lib/mailbox-tags";
import { useMailboxTagStore } from "@/stores/mailbox-tag-store";
import { toast } from "@/stores/toast-store";

/** A mailbox the switcher can jump to: the login's own inbox, a shared domain inbox, or all of them. */
export interface SwitcherMailbox {
  id: string;
  label: string;
  sublabel?: string;
  unread?: number;
  kind: "all" | "own" | "shared";
  /** Shared inboxes: the JMAP account that owns it, which carries its Business/Project tag. */
  accountId?: string;
}

/** How each tag looks wherever it is shown: icon, and a colour that reads in both themes. */
export const MAILBOX_TAG_STYLE: Record<MailboxTag, { icon: typeof Briefcase; chip: string; dot: string }> = {
  business: {
    icon: Briefcase,
    chip: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  project: {
    icon: Rocket,
    chip: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
    dot: "bg-violet-500",
  },
};

function UnreadBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="shrink-0 text-xs font-medium tabular-nums text-primary">
      {count > 999 ? "999+" : count}
    </span>
  );
}

interface MailboxSwitcherListProps {
  options: SwitcherMailbox[];
  selectedMailbox?: string;
  onSelect: (mailboxId: string) => void;
}

/**
 * MailHub: the inboxes in the account popover. The merged and own inboxes come
 * first; the shared domain inboxes follow, grouped under Business, Projects and
 * (when some are tagged) Other. Every shared row has a tag button that opens a
 * small Business / Project / No tag choice in place.
 * Mounted only while the account popover is open.
 */
export function MailboxSwitcherList({ options, selectedMailbox, onSelect }: MailboxSwitcherListProps) {
  const t = useTranslations("sidebar");
  const tags = useMailboxTagStore((s) => s.tags);
  const saving = useMailboxTagStore((s) => s.saving);
  const loadTags = useMailboxTagStore((s) => s.load);
  const setTag = useMailboxTagStore((s) => s.setTag);
  const [editing, setEditing] = useState<string | null>(null);

  const chooserId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  // Row whose tag button gets focus back once its choice closes. The row may
  // have moved to another group by then, so it is found again after render.
  const refocus = useRef<string | null>(null);

  // Mounted when the popover opens: re-read, picking up tags other members set.
  useEffect(() => {
    const ids = options.filter((o) => o.kind === "shared" && o.accountId).map((o) => o.accountId!);
    if (ids.length) void loadTags(ids, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open
  }, []);

  useLayoutEffect(() => {
    if (!refocus.current || editing) return;
    const button = listRef.current?.querySelector<HTMLElement>(
      `[data-testid="mailbox-row"][data-mailbox-id="${CSS.escape(refocus.current)}"] [data-testid="mailbox-tag-button"]`,
    );
    refocus.current = null;
    button?.focus();
  });

  const closeChooser = (option: SwitcherMailbox) => {
    refocus.current = option.id;
    setEditing(null);
  };

  const top = options.filter((o) => o.kind !== "shared");
  const shared = options.filter((o) => o.kind === "shared");
  const tagOf = (o: SwitcherMailbox) => (o.accountId ? tags[o.accountId] : undefined);
  const anyTagged = shared.some((o) => tagOf(o));
  const groups: { key: string; heading: string; items: SwitcherMailbox[] }[] = anyTagged
    ? [
        { key: "business", heading: t("mailbox_group_business"), items: shared.filter((o) => tagOf(o) === "business") },
        { key: "project", heading: t("mailbox_group_project"), items: shared.filter((o) => tagOf(o) === "project") },
        { key: "other", heading: t("mailbox_group_other"), items: shared.filter((o) => !tagOf(o)) },
      ]
    : [{ key: "shared", heading: t("mailbox_group_domains"), items: shared }];

  const chooseTag = async (option: SwitcherMailbox, tag: MailboxTag | null) => {
    closeChooser(option);
    if (!option.accountId || (tagOf(option) ?? null) === tag) return;
    try {
      await setTag(option.accountId, tag);
    } catch (error) {
      toast.error(t("mailbox_tag_error"), error instanceof Error ? error.message : undefined);
    }
  };

  const row = (option: SwitcherMailbox) => {
    const isSelected = option.id === selectedMailbox;
    const Icon = option.kind === "all" ? Mails : option.kind === "shared" ? Users : Inbox;
    const tag = tagOf(option);
    const isEditing = editing === option.id;
    const isSaving = !!(option.accountId && saving[option.accountId]);
    const TagIcon = tag ? MAILBOX_TAG_STYLE[tag].icon : Tag;
    return (
      <div key={option.id} data-testid="mailbox-row" data-mailbox-id={option.id} data-mailbox-tag={tag ?? ""}>
        <div className={cn("group/row flex items-center transition-colors", isSelected ? "bg-accent/50" : "hover:bg-muted")}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={isSelected}
            data-testid="mailbox-option"
            data-mailbox-id={option.id}
            data-mailbox-kind={option.kind}
            onClick={() => onSelect(option.id)}
            title={option.sublabel}
            className="flex min-w-0 flex-1 items-center gap-3 py-2 ps-3 pe-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Icon className={cn("h-4 w-4 flex-shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm", isSelected && "font-medium")}>{option.label}</span>
              {/* The domain already names a shared inbox; its address stays for screen readers and the hover title, keeping rows to one line so many domains fit. */}
              {option.sublabel && <span className="sr-only">{option.sublabel}</span>}
            </span>
            <UnreadBadge count={option.unread} />
          </button>
          {option.kind === "shared" && option.accountId && (
            <button
              type="button"
              role="menuitem"
              aria-expanded={isEditing}
              aria-controls={isEditing ? chooserId : undefined}
              aria-label={t("mailbox_tag_edit", { mailbox: option.label })}
              title={t("mailbox_tag_edit", { mailbox: option.label })}
              data-testid="mailbox-tag-button"
              onClick={() => setEditing(isEditing ? null : option.id)}
              className={cn(
                "me-2 grid h-7 w-7 shrink-0 place-items-center rounded-md transition-[opacity,background-color,color]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tag
                  ? cn("ring-1 ring-inset", MAILBOX_TAG_STYLE[tag].chip)
                  : "text-muted-foreground hover:bg-background hover:text-foreground [@media(hover:hover)]:opacity-40 group-hover/row:opacity-100 focus-visible:opacity-100",
                isEditing && "opacity-100 bg-background text-foreground",
              )}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TagIcon className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        {isEditing && (
          <div
            id={chooserId}
            role="group"
            aria-label={t("mailbox_tag_edit", { mailbox: option.label })}
            data-testid="mailbox-tag-chooser"
            className="flex flex-wrap gap-1.5 bg-muted/60 px-3 py-2"
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); closeChooser(option); }
            }}
          >
            {MAILBOX_TAGS.map((value) => {
              const style = MAILBOX_TAG_STYLE[value];
              const ChipIcon = style.icon;
              const active = tag === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  data-testid={`mailbox-tag-${value}`}
                  onClick={() => chooseTag(option, value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? style.chip : "bg-background text-foreground ring-border hover:bg-muted",
                  )}
                >
                  <ChipIcon className="h-3.5 w-3.5" />
                  {t(`mailbox_tag_${value}`)}
                  {active && <Check className="h-3 w-3" />}
                </button>
              );
            })}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!tag}
              data-testid="mailbox-tag-none"
              onClick={() => chooseTag(option, null)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !tag ? "bg-background font-medium text-foreground ring-foreground/30" : "bg-background text-muted-foreground ring-border hover:bg-muted",
              )}
            >
              {t("mailbox_tag_none")}
              {!tag && <Check className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="border-t border-border py-1" data-testid="mailbox-switcher">
      <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("switch_mailbox_heading")}
      </p>
      <div ref={listRef} className="max-h-[min(34rem,calc(100dvh-13rem))] overflow-y-auto overscroll-contain">
        {top.map(row)}
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <div key={group.key} role="group" aria-label={group.heading} data-testid={`mailbox-group-${group.key}`}>
              <p className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {(group.key === "business" || group.key === "project") && (
                  <span className={cn("h-1.5 w-1.5 rounded-full", MAILBOX_TAG_STYLE[group.key].dot)} aria-hidden="true" />
                )}
                {group.heading}
                <span className="font-normal normal-case tracking-normal tabular-nums">{group.items.length}</span>
              </p>
              {group.items.map(row)}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
