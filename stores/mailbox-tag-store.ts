import { create } from 'zustand';
import { useAuthStore } from '@/stores/auth-store';
import { isMailboxTagClient, loadMailboxAddresses, loadMailboxMeta, normalizeCompany, saveMailboxMeta, type MailboxAddresses, type MailboxMeta, type MailboxTag } from '@/lib/mailbox-tags';

/** MailHub: Business / Project tags and companies of the shared domain inboxes this login reads. */
interface MailboxTagState {
  /** Shared account id -> tag. Untagged accounts are absent. */
  tags: Record<string, MailboxTag>;
  /** Shared account id -> company. Accounts filed under none are absent. */
  companies: Record<string, string>;
  /** Shared account id -> its real addresses (server-written, read-only). */
  addresses: Record<string, MailboxAddresses>;
  /** Account id -> number of changes still being saved. */
  saving: Record<string, number>;
  /** The account set this was last loaded for (sorted, joined). */
  loadedFor: string | null;
  /** Loads once per account set; `force` re-reads, picking up changes other members made. */
  load: (accountIds: string[], options?: { force?: boolean }) => Promise<void>;
  setTag: (accountId: string, tag: MailboxTag | null) => Promise<void>;
  setCompany: (accountId: string, company: string | null) => Promise<void>;
  reset: () => void;
}

const keyOf = (accountIds: string[]) => [...accountIds].sort().join(',');
const withValue = <T,>(map: Record<string, T>, accountId: string, value: T | null | undefined) => {
  const next = { ...map };
  if (value) next[accountId] = value; else delete next[accountId];
  return next;
};

export const useMailboxTagStore = create<MailboxTagState>()((set, get) => {
  /** Applies one change on screen at once, saves the account's whole entry, and undoes it if the save fails. */
  const change = async (accountId: string, patch: MailboxMeta) => {
    const client = useAuthStore.getState().client;
    if (!isMailboxTagClient(client)) throw new Error('Tags are not available on this server');
    const before = { tag: get().tags[accountId], company: get().companies[accountId] };
    const after = { ...before, ...patch };
    set({
      tags: withValue(get().tags, accountId, after.tag),
      companies: withValue(get().companies, accountId, after.company),
      saving: { ...get().saving, [accountId]: (get().saving[accountId] ?? 0) + 1 },
    });
    try {
      await saveMailboxMeta(client, accountId, after);
    } catch (error) {
      // Undo only the parts no later change has replaced on screen.
      if ('tag' in patch && get().tags[accountId] === after.tag) set({ tags: withValue(get().tags, accountId, before.tag) });
      if ('company' in patch && get().companies[accountId] === after.company) {
        set({ companies: withValue(get().companies, accountId, before.company) });
      }
      throw error;
    } finally {
      const saving = { ...get().saving };
      if ((saving[accountId] ?? 1) <= 1) delete saving[accountId]; else saving[accountId] -= 1;
      set({ saving });
    }
  };

  return {
    tags: {},
    companies: {},
    addresses: {},
    saving: {},
    loadedFor: null,

    load: async (accountIds, options) => {
      const client = useAuthStore.getState().client;
      const key = keyOf(accountIds);
      if (!isMailboxTagClient(client) || (get().loadedFor === key && !options?.force)) return;
      set({ loadedFor: key });
      try {
        // The addresses are optional: a failed read of them must not lose the tags.
        const [loaded, addresses] = await Promise.all([
          loadMailboxMeta(client, accountIds),
          loadMailboxAddresses(client, accountIds).catch(() => get().addresses),
        ]);
        if (get().loadedFor !== key) return;
        const tags: Record<string, MailboxTag> = {};
        const companies: Record<string, string> = {};
        for (const [accountId, meta] of Object.entries(loaded)) {
          if (meta.tag) tags[accountId] = meta.tag;
          if (meta.company) companies[accountId] = meta.company;
        }
        // A change saved meanwhile is newer than this read: keep the local values for it.
        for (const accountId of Object.keys(get().saving)) {
          const { tags: localTags, companies: localCompanies } = get();
          if (localTags[accountId]) tags[accountId] = localTags[accountId]; else delete tags[accountId];
          if (localCompanies[accountId]) companies[accountId] = localCompanies[accountId]; else delete companies[accountId];
        }
        set({ tags, companies, addresses });
      } catch (error) {
        // Nothing loaded is a usable state; the next load retries.
        console.warn('[MailboxTags] load failed:', error);
        if (get().loadedFor === key) set({ loadedFor: null });
      }
    },

    setTag: (accountId, tag) => change(accountId, { tag: tag ?? undefined }),
    setCompany: (accountId, company) => change(accountId, { company: normalizeCompany(company) }),

    reset: () => set({ tags: {}, companies: {}, addresses: {}, saving: {}, loadedFor: null }),
  };
});
