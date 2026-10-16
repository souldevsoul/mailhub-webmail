"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Building2, Check, ChevronDown, ChevronRight, Loader2, Plus, Rocket, Tag, Users } from "@/components/icons";
import { cn } from "@/lib/utils";
import { MAILBOX_TAGS, MAX_COMPANY_LENGTH, type MailboxTag } from "@/lib/mailbox-tags";
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
  /** The JMAP account that owns it, which carries its tag and company. */
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

const COLLAPSED_KEY = "sidebarCollapsedCompanies";
const OTHER = "\u0000other";

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

const chipClass = (active: boolean, activeStyle?: string) => cn(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  active ? (activeStyle ?? "bg-background font-medium text-foreground ring-foreground/30") : "bg-background text-foreground ring-border hover:bg-muted",
);

interface InboxEditorProps {
  id: string;
  inbox: DomainInbox;
  tag?: MailboxTag;
  company?: string;
  companies: string[];
  onTag: (tag: MailboxTag | null) => void;
  onCompany: (company: string | null) => void;
  onClose: () => void;
}

/** The Type (Business / Project) and Company choices under a row. Each choice saves and closes it. */
function InboxEditor({ id, inbox, tag, company, companies, onTag, onCompany, onClose }: InboxEditorProps) {
  const t = useTranslations("sidebar");
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div
      id={id}
      role="group"
      aria-label={t("mailbox_tag_edit", { mailbox: inbox.label })}
      data-testid="mailbox-tag-chooser"
      className="space-y-2 bg-muted/60 py-2 ps-7 pe-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("mailbox_type_label")}>
        <span className="w-full text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("mailbox_type_label")}</span>
        {MAILBOX_TAGS.map((value) => {
          const style = MAILBOX_TAG_STYLE[value];
          const Icon = style.icon;
          return (
            <button key={value} type="button" aria-pressed={tag === value} data-testid={`mailbox-tag-${value}`}
              onClick={() => onTag(value)} className={cn(chipClass(tag === value, style.chip), "font-medium")}>
              <Icon className="h-3.5 w-3.5" />
              {t(`mailbox_tag_${value}`)}
              {tag === value && <Check className="h-3 w-3" />}
            </button>
          );
        })}
        <button type="button" aria-pressed={!tag} data-testid="mailbox-tag-none" onClick={() => onTag(null)} className={chipClass(!tag)}>
          {t("mailbox_tag_none")}
          {!tag && <Check className="h-3 w-3" />}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("mailbox_company_label")}>
        <span className="w-full text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("mailbox_company_label")}</span>
        {companies.map((name) => (
          <button key={name} type="button" aria-pressed={company === name} data-testid="mailbox-company" data-company={name}
            onClick={() => onCompany(name)} className={chipClass(company === name)}>
            <Building2 className="h-3.5 w-3.5" />
            {name}
            {company === name && <Check className="h-3 w-3" />}
          </button>
        ))}
        <button type="button" aria-pressed={!company} data-testid="mailbox-company-none" onClick={() => onCompany(null)} className={chipClass(!company)}>
          {t("mailbox_company_none")}
          {!company && <Check className="h-3 w-3" />}
        </button>
        {naming ? (
          <form
            className="flex w-full items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) onCompany(draft);
            }}
          >
            <input
              autoFocus
              value={draft}
              maxLength={MAX_COMPANY_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.stopPropagation(); setNaming(false); }
              }}
              placeholder={t("mailbox_company_placeholder")}
              aria-label={t("mailbox_company_placeholder")}
              data-testid="mailbox-company-input"
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="submit" disabled={!draft.trim()} data-testid="mailbox-company-save"
              className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
              {t("mailbox_company_save")}
            </button>
          </form>
        ) : (
          <button type="button" data-testid="mailbox-company-new" onClick={() => setNaming(true)} className={chipClass(false)}>
            <Plus className="h-3.5 w-3.5" />
            {t("mailbox_company_new")}
          </button>
        )}
      </div>
    </div>
  );
}

interface SidebarDomainInboxesProps {
  inboxes: DomainInbox[];
  selectedMailbox?: string;
  onSelect: (mailboxId: string) => void;
  /** Icon-only sidebar: one icon per inbox, no folders or controls. */
  isCollapsed: boolean;
}

/**
 * MailHub: the shared domain inboxes as a sidebar section. Once any inbox is
 * filed under a company, each company becomes a collapsible folder and the rest
 * go under Other. Every row has a button that opens its Type (Business /
 * Project) and Company choices. Loading is done by the mail app
 * (useMailboxTagsLoader).
 */
export function SidebarDomainInboxes({ inboxes, selectedMailbox, onSelect, isCollapsed }: SidebarDomainInboxesProps) {
  const t = useTranslations("sidebar");
  const tags = useMailboxTagStore((s) => s.tags);
  const companiesOf = useMailboxTagStore((s) => s.companies);
  const saving = useMailboxTagStore((s) => s.saving);
  const setTag = useMailboxTagStore((s) => s.setTag);
  const setCompany = useMailboxTagStore((s) => s.setCompany);
  const [editing, setEditing] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  const chooserId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  // Row whose edit button gets focus back once its choices close. The row may
  // have moved to another folder by then, so it is found again after render.
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
  const companyOf = (inbox: DomainInbox) => companiesOf[inbox.accountId];

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

  const companies = [...new Set(inboxes.map(companyOf).filter((c): c is string => !!c))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const folders: { key: string; name: string; items: DomainInbox[] }[] = companies.length
    ? [
        ...companies.map((name) => ({ key: name, name, items: inboxes.filter((i) => companyOf(i) === name) })),
        { key: OTHER, name: t("mailbox_group_other"), items: inboxes.filter((i) => !companyOf(i)) },
      ].filter((folder) => folder.items.length > 0)
    : [];

  const toggleFolder = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const closeEditor = (inbox: DomainInbox) => {
    refocus.current = inbox.id;
    setEditing(null);
  };

  const save = async (inbox: DomainInbox, apply: () => Promise<void>) => {
    closeEditor(inbox);
    try {
      await apply();
    } catch (error) {
      toast.error(t("mailbox_tag_error"), error instanceof Error ? error.message : undefined);
    }
  };

  const row = (inbox: DomainInbox, indented: boolean) => {
    const isSelected = inbox.id === selectedMailbox;
    const tag = tagOf(inbox);
    const isEditing = editing === inbox.id;
    const isSaving = !!saving[inbox.accountId];
    const TagIcon = tag ? MAILBOX_TAG_STYLE[tag].icon : Tag;
    return (
      <div key={inbox.id} data-testid="mailbox-row" data-mailbox-id={inbox.id} data-mailbox-tag={tag ?? ""} data-company={companyOf(inbox) ?? ""}>
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
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 pe-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              indented ? "ps-10" : "ps-7",
            )}
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
          <InboxEditor
            id={chooserId}
            inbox={inbox}
            tag={tag}
            company={companyOf(inbox)}
            companies={companies}
            onClose={() => closeEditor(inbox)}
            onTag={(value) => {
              if ((tag ?? null) === value) return closeEditor(inbox);
              void save(inbox, () => setTag(inbox.accountId, value));
            }}
            onCompany={(value) => {
              if ((companyOf(inbox) ?? null) === value) return closeEditor(inbox);
              void save(inbox, () => setCompany(inbox.accountId, value));
            }}
          />
        )}
      </div>
    );
  };

  if (!folders.length) {
    return (
      <div ref={listRef} data-testid="domain-inboxes">
        {inboxes.map((inbox) => row(inbox, false))}
      </div>
    );
  }

  return (
    <div ref={listRef} data-testid="domain-inboxes">
      {folders.map((folder) => {
        const open = !collapsed.has(folder.key);
        const unread = folder.items.reduce((sum, inbox) => sum + (inbox.unread ?? 0), 0);
        const hasSelected = folder.items.some((inbox) => inbox.id === selectedMailbox);
        return (
          <div key={folder.key} role="group" aria-label={folder.name} data-testid="company-folder" data-company={folder.key === OTHER ? "" : folder.name}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggleFolder(folder.key)}
              data-testid="company-folder-toggle"
              style={{ paddingBlock: "var(--density-sidebar-py)" }}
              className={cn(
                "flex w-full items-center gap-1.5 ps-3 pe-3 max-lg:min-h-[44px] text-sm text-start transition-colors hover:bg-muted/50 border-s-2",
                !open && hasSelected ? "border-primary" : "border-transparent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              )}
            >
              {open
                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
              {!open && unread > 0
                ? <span className="shrink-0 text-xs font-semibold tabular-nums">{unread > 999 ? "999+" : unread}</span>
                : <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{folder.items.length}</span>}
            </button>
            {open && folder.items.map((inbox) => row(inbox, true))}
          </div>
        );
      })}
    </div>
  );
}
