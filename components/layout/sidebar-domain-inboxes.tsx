"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Ban, Briefcase, Building2, Check, ChevronDown, ChevronRight, Loader2, Plus, Rocket, Search, Tag, Users, X } from "@/components/icons";
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
  /** Its spam folder; the row shows it while it holds mail. */
  junk?: { id: string; total: number; unread: number };
  /** Ids of the account's other folders, so a row knows when one of them is open. */
  folderIds?: string[];
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
const OPEN_INBOXES_KEY = "sidebarOpenDomainInboxes";
const OTHER = "\u0000other";
const SECTION_KEY = "\u0000section:";
/** Type sections in display order; inboxes without a type come last. */
const SECTIONS = [...MAILBOX_TAGS, OTHER] as const;
type Section = (typeof SECTIONS)[number];
/** Row indents (before the folders chevron) and folder indents, one step per nesting level. */
const ROW_INDENT = ["ps-2", "ps-5", "ps-9"] as const;
const FOLDER_INDENT = ["ps-3", "ps-6"] as const;

interface Folder {
  /** Collapse key, unique across sections. */
  key: string;
  name: string;
  /** Company name, or "" for the inboxes filed under no company. */
  company: string;
  items: DomainInbox[];
}

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function toggled(set: Set<string>, key: string, storageKey: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* storage unavailable */ }
  return next;
}

const matches = (query: string, ...texts: (string | undefined)[]) =>
  texts.some((text) => !!text && text.toLowerCase().includes(query));

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
  /** The inbox account's other folders (Sent, Spam...), listed under its row at `depth`. */
  renderFolders?: (inbox: DomainInbox, depth: number) => ReactNode;
}

/**
 * MailHub: the shared domain inboxes as a sidebar section. Once any inbox has a
 * type, types become sections (Business, Projects) with a search in their
 * heading. Each company is a collapsible folder; inboxes with no company sit
 * beside the folders. A row opens to its other folders, shows its spam while
 * there is any, and has a button for its Type and Company choices. Loading is
 * done by the mail app (useMailboxTagsLoader).
 */
export function SidebarDomainInboxes({ inboxes, selectedMailbox, onSelect, isCollapsed, renderFolders }: SidebarDomainInboxesProps) {
  const t = useTranslations("sidebar");
  const tags = useMailboxTagStore((s) => s.tags);
  const companiesOf = useMailboxTagStore((s) => s.companies);
  const saving = useMailboxTagStore((s) => s.saving);
  const setTag = useMailboxTagStore((s) => s.setTag);
  const setCompany = useMailboxTagStore((s) => s.setCompany);
  const [editing, setEditing] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readSet(COLLAPSED_KEY));
  const [openInboxes, setOpenInboxes] = useState<Set<string>>(() => readSet(OPEN_INBOXES_KEY));
  // Search per type section, open while the key is present.
  const [searches, setSearches] = useState<Record<string, string>>({});

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

  const companiesIn = (items: DomainInbox[]) => [...new Set(items.map(companyOf).filter((c): c is string => !!c))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const companies = companiesIn(inboxes);
  // One folder per company; inboxes with no company are listed beside them.
  const foldersOf = (items: DomainInbox[], scope: string): Folder[] =>
    companiesIn(items).map((name) => ({ key: scope + name, name, company: name, items: items.filter((i) => companyOf(i) === name) }));
  // Type sections (Business, Projects, untagged) appear once any inbox has a type.
  const sectionOf = (inbox: DomainInbox): Section => tagOf(inbox) ?? OTHER;
  const sections = inboxes.some(tagOf)
    ? SECTIONS
        .map((section) => ({ section, items: inboxes.filter((i) => sectionOf(i) === section) }))
        .filter(({ items }) => items.length > 0)
    : [];

  const toggleFolder = (key: string) => setCollapsed((prev) => toggled(prev, key, COLLAPSED_KEY));
  const toggleInbox = (id: string) => setOpenInboxes((prev) => toggled(prev, id, OPEN_INBOXES_KEY));
  const isWithin = (inbox: DomainInbox) =>
    inbox.id === selectedMailbox || (!!selectedMailbox && !!inbox.folderIds?.includes(selectedMailbox));

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

  const row = (inbox: DomainInbox, level: 0 | 1 | 2) => {
    const isSelected = inbox.id === selectedMailbox;
    const tag = tagOf(inbox);
    const isEditing = editing === inbox.id;
    const isSaving = !!saving[inbox.accountId];
    const TagIcon = tag ? MAILBOX_TAG_STYLE[tag].icon : Tag;
    const hasFolders = !!renderFolders && !!inbox.folderIds?.length;
    // A folder of this inbox being open keeps the list open, so the selection stays in view.
    const showFolders = hasFolders && (openInboxes.has(inbox.id) || (isWithin(inbox) && !isSelected));
    const junk = inbox.junk && inbox.junk.total > 0 ? inbox.junk : undefined;
    return (
      <div key={inbox.id} data-testid="mailbox-row" data-mailbox-id={inbox.id} data-mailbox-tag={tag ?? ""} data-company={companyOf(inbox) ?? ""}>
        <div
          style={{ paddingBlock: "var(--density-sidebar-py)" }}
          className={cn(
            "group/row flex items-center max-lg:min-h-[44px] text-sm transition-colors duration-150 border-s-2",
            ROW_INDENT[level],
            isSelected ? "bg-accent text-accent-foreground font-semibold border-primary" : "hover:bg-muted/50 text-foreground border-transparent",
          )}
        >
          {hasFolders ? (
            <button
              type="button"
              aria-expanded={showFolders}
              aria-label={t("mailbox_folders_toggle", { mailbox: inbox.label })}
              title={t("mailbox_folders_toggle", { mailbox: inbox.label })}
              data-testid="mailbox-folders-toggle"
              onClick={() => toggleInbox(inbox.id)}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showFolders ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : <span className="w-5 shrink-0" aria-hidden="true" />}
          <button
            type="button"
            aria-current={isSelected ? "page" : undefined}
            data-testid="mailbox-option"
            data-mailbox-id={inbox.id}
            onClick={() => onSelect(inbox.id)}
            title={inbox.sublabel}
            className="flex min-w-0 flex-1 items-center gap-2 ps-0.5 pe-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
          {junk && (
            <button
              type="button"
              aria-current={junk.id === selectedMailbox ? "page" : undefined}
              aria-label={t("mailbox_junk_open", { count: junk.total, mailbox: inbox.label })}
              title={t("mailbox_junk_open", { count: junk.total, mailbox: inbox.label })}
              data-testid="mailbox-junk"
              data-unread={junk.unread}
              onClick={() => onSelect(junk.id)}
              className={cn(
                "me-1 inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-medium tabular-nums ring-1 ring-inset transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                junk.unread > 0
                  ? "bg-red-500/10 text-red-700 ring-red-500/30 hover:bg-red-500/20 dark:text-red-300"
                  : "bg-background text-muted-foreground ring-border hover:text-foreground",
                junk.id === selectedMailbox && "ring-2 ring-red-500/60",
              )}
            >
              <Ban className="h-3 w-3" />
              {junk.total > 99 ? "99+" : junk.total}
            </button>
          )}
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
        {showFolders && (
          <div role="group" aria-label={t("mailbox_folders_toggle", { mailbox: inbox.label })} data-testid="mailbox-folders">
            {renderFolders!(inbox, level + 1)}
          </div>
        )}
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

  const header = (
    key: string,
    open: boolean,
    items: DomainInbox[],
    indent: string,
    label: ReactNode,
    testId: string,
  ) => {
    const unread = items.reduce((sum, inbox) => sum + (inbox.unread ?? 0), 0);
    const hasSelected = items.some(isWithin);
    return (
      <button
        type="button"
        aria-expanded={open}
        onClick={() => toggleFolder(key)}
        data-testid={testId}
        style={{ paddingBlock: "var(--density-sidebar-py)" }}
        className={cn(
          "flex w-full items-center gap-1.5 pe-3 max-lg:min-h-[44px] text-sm text-start transition-colors hover:bg-muted/50 border-s-2",
          indent,
          !open && hasSelected ? "border-primary" : "border-transparent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {label}
        {!open && unread > 0
          ? <span className="shrink-0 text-xs font-semibold tabular-nums">{unread > 999 ? "999+" : unread}</span>
          : <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{items.length}</span>}
      </button>
    );
  };

  const companyFolder = (folder: Folder, level: 0 | 1, forceOpen: boolean) => {
    const open = forceOpen || !collapsed.has(folder.key);
    return (
      <div key={folder.key} role="group" aria-label={folder.name} data-testid="company-folder" data-company={folder.company}>
        {header(folder.key, open, folder.items, FOLDER_INDENT[level], (
          <>
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
          </>
        ), "company-folder-toggle")}
        {open && folder.items.map((inbox) => row(inbox, level === 0 ? 1 : 2))}
      </div>
    );
  };

  // Company folders, then the inboxes filed under no company at the same level.
  const body = (items: DomainInbox[], scope: string, level: 0 | 1, forceOpen = false) => [
    ...foldersOf(items, scope).map((folder) => companyFolder(folder, level, forceOpen)),
    ...items.filter((inbox) => !companyOf(inbox)).map((inbox) => row(inbox, level)),
  ];

  if (!sections.length) {
    return (
      <div ref={listRef} data-testid="domain-inboxes">
        {body(inboxes, "", 0)}
      </div>
    );
  }

  const closeSearch = (section: Section) => setSearches(({ [section]: _closed, ...rest }) => rest);

  // The section heading, or its search field while the search is open.
  const sectionHeading = (section: Section, key: string, open: boolean, items: DomainInbox[], name: string) => {
    const query = searches[section];
    if (query !== undefined) {
      return (
        <div style={{ paddingBlock: "var(--density-sidebar-py)" }} className={cn("flex items-center gap-1.5 pe-2 max-lg:min-h-[44px] border-s-2 border-transparent", FOLDER_INDENT[0])}>
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setSearches((prev) => ({ ...prev, [section]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); closeSearch(section); }
            }}
            placeholder={t("mailbox_search_placeholder", { section: name })}
            aria-label={t("mailbox_search_placeholder", { section: name })}
            data-testid="type-section-search"
            className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            aria-label={t("mailbox_search_close")}
            title={t("mailbox_search_close")}
            data-testid="type-section-search-close"
            onClick={() => closeSearch(section)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }
    const Icon = section === OTHER ? Tag : MAILBOX_TAG_STYLE[section].icon;
    return (
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          {header(key, open, items, FOLDER_INDENT[0], (
            <>
              <Icon className={cn("h-4 w-4 shrink-0", section === OTHER ? "text-muted-foreground" : MAILBOX_TAG_STYLE[section].text)} />
              <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
            </>
          ), "type-section-toggle")}
        </div>
        <button
          type="button"
          aria-label={t("mailbox_search_open", { section: name })}
          title={t("mailbox_search_open", { section: name })}
          data-testid="type-section-search-open"
          onClick={() => setSearches((prev) => ({ ...prev, [section]: "" }))}
          className="me-2 grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div ref={listRef} data-testid="domain-inboxes">
      {sections.map(({ section, items }) => {
        const key = SECTION_KEY + section;
        const query = searches[section]?.trim().toLowerCase();
        const shown = query ? items.filter((i) => matches(query, i.label, i.sublabel, companyOf(i))) : items;
        const open = !!query || !collapsed.has(key);
        const name = section === OTHER ? t("mailbox_section_untagged") : t(`mailbox_section_${section}`);
        return (
          <div key={section} role="group" aria-label={name} data-testid="type-section" data-section={section === OTHER ? "" : section}>
            {sectionHeading(section, key, open, items, name)}
            {open && body(shown, `${section}/`, 1, !!query)}
            {open && query && !shown.length && (
              <p data-testid="type-section-empty" className="py-1.5 ps-9 pe-3 text-xs text-muted-foreground">{t("mailbox_search_empty")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
