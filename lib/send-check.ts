/**
 * MailHub: the check every message passes before it is sent, so mail never
 * leaves from the wrong company. It names the shared domain inbox (and the
 * company and Business/Project tag it is filed under) that the From address
 * belongs to, compares it with the inbox the user is working in, and asks the
 * user to type today's date and the From address before Send is allowed.
 */
import type { MailboxAddresses, MailboxTag } from '@/lib/mailbox-tags';

/** What the tag store knows about the shared domain inboxes. */
export interface InboxDirectory {
  tags: Record<string, MailboxTag>;
  companies: Record<string, string>;
  addresses: Record<string, MailboxAddresses>;
}

/** One side of the check: a sender, or the inbox the user is working in. */
export interface InboxInfo {
  /** Shared account id, or null when the address is no domain inbox's. */
  accountId: string | null;
  /** The domain inbox's main address (info@ first), else the address itself. */
  mainAddress: string;
  domain: string;
  company?: string;
  tag?: MailboxTag;
}

export const normalizeAddress = (email: string | null | undefined): string => (email ?? '').trim().toLowerCase();

export const domainOf = (email: string | null | undefined): string => {
  const clean = normalizeAddress(email);
  const at = clean.lastIndexOf('@');
  return at >= 0 ? clean.slice(at + 1) : '';
};

/**
 * The shared account an address belongs to: the inbox that lists it, else the
 * inbox of the same domain (catch-all addresses are not listed). Null when no
 * domain inbox matches, e.g. a personal login address.
 */
export function findInboxAccount(email: string | null | undefined, directory: InboxDirectory): string | null {
  const address = normalizeAddress(email);
  if (!address) return null;
  const entries = Object.entries(directory.addresses);
  const exact = entries.find(([, a]) => a.addresses.some((x) => normalizeAddress(x) === address));
  if (exact) return exact[0];
  const domain = domainOf(address);
  const sameDomain = entries.find(([, a]) => a.addresses.some((x) => domainOf(x) === domain));
  return sameDomain ? sameDomain[0] : null;
}

export function describeAddress(email: string | null | undefined, directory: InboxDirectory): InboxInfo {
  const accountId = findInboxAccount(email, directory);
  const address = normalizeAddress(email);
  if (!accountId) return { accountId: null, mainAddress: address, domain: domainOf(address) };
  const main = directory.addresses[accountId]?.addresses[0] ?? address;
  return {
    accountId,
    mainAddress: normalizeAddress(main),
    domain: domainOf(main),
    company: directory.companies[accountId],
    tag: directory.tags[accountId],
  };
}

/**
 * The main address of a shared inbox, given any of its addresses (for example
 * the group address `inbox@` the sidebar opens). Null when it is no domain inbox.
 */
export function mainAddressOf(email: string | null | undefined, directory: InboxDirectory): string | null {
  const accountId = findInboxAccount(email, directory);
  return accountId ? normalizeAddress(directory.addresses[accountId]?.addresses[0]) || null : null;
}

/**
 * True when sender and context are the same company: the same domain inbox, or
 * two inboxes filed under the same company. Without a known context there is
 * nothing to compare, so it does not count as a mismatch.
 */
export function sameCompany(sender: InboxInfo, context: InboxInfo | null): boolean {
  if (!context || !context.accountId) return true;
  if (!sender.accountId) return false;
  if (sender.accountId === context.accountId) return true;
  if (sender.company && context.company) {
    return sender.company.trim().toLowerCase() === context.company.trim().toLowerCase();
  }
  return false;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as the dialog shows it as the example: DD.MM.YYYY. */
export function formatToday(now: Date = new Date()): string {
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
}

/**
 * Accepts today's local date typed as DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY (day
 * and month with or without a leading zero) or YYYY-MM-DD.
 */
export function matchesToday(input: string, now: Date = new Date()): boolean {
  const text = input.trim();
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) return +iso[1] === y && +iso[2] === m && +iso[3] === d;
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (dmy) return +dmy[1] === d && +dmy[2] === m && +dmy[3] === y;
  return false;
}

export function matchesAddress(input: string, expected: string): boolean {
  const typed = normalizeAddress(input);
  return typed.length > 0 && typed === normalizeAddress(expected);
}
