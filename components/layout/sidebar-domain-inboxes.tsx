"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Check, Loader2, Rocket, Tag, Users } from "@/components/icons";
import { cn } from "@/lib/utils";
import { MAILBOX_TAGS, type MailboxTag } from "@/lib/mailbox-tags";
import { useMailboxTagStore } from "@/stores/mailbox-tag-store";
import { toast } from "@/stores/toast-store";

/** A shared domain inbox listed in the sidebar. */
export interface DomainInbox {
  /** The inbox mailbox id, selected on click. */
  id: string;
  /** The domain, e.g. cobalt.boutique. */
  label: string;
  /** The full address, e.g. inbox@cobalt.boutique. */
  sublabel?: string;
  unread?: number;
  /** The JMAP account that owns it, which carries its Business/Project tag. */
  accountId: string;
}

/** How each tag looks wherever it is shown: icon, and a colour that reads in both themes. */
export const MAILBOX_TAG_STYLE: Record<MailboxTag, { icon: typeof Briefcase; chip: string; dot: string; text: string }> = {
  business: {
    icon: Briefcase,
    chip: "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
  },
  project: {
    icon: Rocket,
    chip: "bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300",
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
  },
};

interface SidebarDomainInboxesProps {
  inboxes: DomainInbox[];
  selectedMailbox?: string;
  onSelect: (mailboxId: string) => void;
  /** Icon-only sidebar: one icon per inbox, no tag controls. */
  isCollapsed: boolean;
}

/**
 * MailHub: the shared domain inboxes as a sidebar section, one row each. Once
 * any is tagged they are grouped under Business, Projects and Other. Every row
 * has a tag button that opens a small Business / Project / No tag choice under it.
 * The tags themselves are loaded by the mail app (useMailboxTagsLoader).
 */
export function SidebarDomainInboxes({ inboxes, selectedMailbox, onSelect, isCollapsed }: SidebarDomainInboxesProps) {
  const t = useTranslations("sidebar");
  const tags = useMailboxTagStore((s) => s.tags);
  const saving = useMailboxTagStore((s) => s.saving);
  const setTag = useMailboxTagStore((s) => s.setTag);
  const [editing, setEditing] = useState<string | null>(null);

  const chooserId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  // Row whose tag button gets focus back once its choice closes. The row may
  // have moved to another group by then, so it is found again after render.
  const refocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!refocus.current || editing) return;
    const button = listRef.current?.querySelector<HTMLElement>(
      `[data-testid="mailbox-row"][data-mailbox-id="${CSS.escape(refocus.current)}"] [data-testid="mailbox-tag-button"]`,
    );
    refocus.current = null;
    button?.focus();
  });

  const tagOf = (inbox: DomainInbox) => tags[inbox.accountId];

  if (isCollapsed) {
    return (
      <div data-testid="domain-inboxes" data-collapsed="true">
        {inboxes.map((inbox) => {
          const tag = tagOf(inbox);
          const isSelected = inbox.id === selectedMailbox;
          return (
            <button
              key={inbox.id}
              type="button"
              onClick={() => onSelect(inbox.id)}
              title={inbox.label}
              aria-label={inbox.label}
              aria-current={isSelected ? "page" : undefined}
              data-testid="mailbox-option"
              data-mailbox-id={inbox.id}
              className={cn(
                "relative flex w-full items-center justify-center py-2 max-lg:min-h-[44px] transition-colors",
                isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
              )}
            >
              <Users className={cn("h-4 w-4", tag ? MAILBOX_TAG_STYLE[tag].text : isSelected ? "text-primary" : "text-muted-foreground")} />
              {!!inbox.unread && <span className="absolute end-2 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    );
  }

  const anyTagged = inboxes.some((inbox) => tagOf(inbox));
  const groups: { key: string; heading?: string; items: DomainInbox[] }[] = anyTagged
    ? [
        { key: "business", heading: t("mailbox_group_business"), items: inboxes.filter((i) => tagOf(i) === "business") },
        { key: "project", heading: t("mailbox_group_project"), items: inboxes.filter((i) => tagOf(i) === "project") },
        { key: "other", heading: t("mailbox_group_other"), items: inboxes.filter((i) => !tagOf(i)) },
      ]
    : [{ key: "shared", items: inboxes }];

  const closeChooser = (inbox: DomainInbox) => {
    refocus.current = inbox.id;
    setEditing(null);
  };

  const chooseTag = async (inbox: DomainInbox, tag: MailboxTag | null) => {
    closeChooser(inbox);
    if ((tagOf(inbox) ?? null) === tag) return;
    try {
      await setTag(inbox.accountId, tag);
    } catch (error) {
      toast.error(t("mailbox_tag_error"), error instanceof Error ? error.message : undefined);
    }
  };

  const chip = (inbox: DomainInbox, value: MailboxTag | null, current: MailboxTag | undefined) => {
    const active = (current ?? null) === value;
    const style = value ? MAILBOX_TAG_STYLE[value] : null;
    const ChipIcon = style?.icon;
    return (
      <button
        key={value ?? "none"}
        type="button"
        aria-pressed={active}
        data-testid={`mailbox-tag-${value ?? "none"}`}
        onClick={() => chooseTag(inbox, value)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          style
            ? cn("font-medium", active ? style.chip : "bg-background text-foreground ring-border hover:bg-muted")
            : active ? "bg-background font-medium text-foreground ring-foreground/30" : "bg-background text-muted-foreground ring-border hover:bg-muted",
        )}
      >
        {ChipIcon && <ChipIcon className="h-3.5 w-3.5" />}
        {value ? t(`mailbox_tag_${value}`) : t("mailbox_tag_none")}
        {active && <Check className="h-3 w-3" />}
      </button>
    );
  };

  const row = (inbox: DomainInbox) => {
    const isSelected = inbox.id === selectedMailbox;
    const tag = tagOf(inbox);
    const isEditing = editing === inbox.id;
    const isSaving = !!saving[inbox.accountId];
    const TagIcon = tag ? MAILBOX_TAG_STYLE[tag].icon : Tag;
    return (
      <div key={inbox.id} data-testid="mailbox-row" data-mailbox-id={inbox.id} data-mailbox-tag={tag ?? ""}>
        <div
          style={{ paddingBlock: "var(--density-sidebar-py)" }}
          className={cn(
            "group/row flex items-center max-lg:min-h-[44px] text-sm transition-colors duration-150 border-s-2",
            isSelected ? "bg-accent text-accent-foreground font-semibold border-primary" : "hover:bg-muted/50 text-foreground border-transparent",
          )}
        >
          <button
            type="button"
            aria-current={isSelected ? "page" : undefined}
            data-testid="mailbox-option"
            data-mailbox-id={inbox.id}
            onClick={() => onSelect(inbox.id)}
            title={inbox.sublabel}
            className="flex min-w-0 flex-1 items-center gap-2 ps-7 pe-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Users className={cn("h-4 w-4 flex-shrink-0", tag ? MAILBOX_TAG_STYLE[tag].text : isSelected ? "text-primary" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1 truncate">
              {inbox.label}
              {/* The domain already names the inbox; its address stays for screen readers and the hover title. */}
              {inbox.sublabel && <span className="sr-only">, {inbox.sublabel}</span>}
            </span>
            {!!inbox.unread && (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                {inbox.unread > 999 ? "999+" : inbox.unread}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-expanded={isEditing}
            aria-controls={isEditing ? chooserId : undefined}
            aria-label={t("mailbox_tag_edit", { mailbox: inbox.label })}
            title={t("mailbox_tag_edit", { mailbox: inbox.label })}
            data-testid="mailbox-tag-button"
            onClick={() => setEditing(isEditing ? null : inbox.id)}
            className={cn(
              "me-1 grid h-6 w-6 shrink-0 place-items-center rounded-md transition-[opacity,background-color,color]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tag
                ? cn("ring-1 ring-inset", MAILBOX_TAG_STYLE[tag].chip)
                : "text-muted-foreground hover:bg-background hover:text-foreground [@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
              (isSelected || isEditing) && "opacity-100",
              isEditing && "bg-background text-foreground",
            )}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TagIcon className="h-3.5 w-3.5" />}
          </button>
        </div>
        {isEditing && (
          <div
            id={chooserId}
            role="group"
            aria-label={t("mailbox_tag_edit", { mailbox: inbox.label })}
            data-testid="mailbox-tag-chooser"
            className="flex flex-wrap gap-1.5 bg-muted/60 py-2 ps-7 pe-3"
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); closeChooser(inbox); }
            }}
          >
            {MAILBOX_TAGS.map((value) => chip(inbox, value, tag))}
            {chip(inbox, null, tag)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={listRef} data-testid="domain-inboxes">
      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <div key={group.key} role="group" aria-label={group.heading ?? t("mailbox_group_domains")} data-testid={`mailbox-group-${group.key}`}>
            {group.heading && (
              <p className="flex items-center gap-1.5 ps-7 pe-3 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {(group.key === "business" || group.key === "project") && (
                  <span className={cn("h-1.5 w-1.5 rounded-full", MAILBOX_TAG_STYLE[group.key].dot)} aria-hidden="true" />
                )}
                {group.heading}
                <span className="font-normal normal-case tracking-normal tabular-nums">{group.items.length}</span>
              </p>
            )}
            {group.items.map(row)}
          </div>
        ),
      )}
    </div>
  );
}
