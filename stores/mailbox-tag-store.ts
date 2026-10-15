import { create } from 'zustand';
import { useAuthStore } from '@/stores/auth-store';
import { isMailboxTagClient, loadMailboxTags, saveMailboxTag, type MailboxTag } from '@/lib/mailbox-tags';

/** MailHub: Business / Project tags of the shared domain inboxes this login reads. */
interface MailboxTagState {
  /** Shared account id -> tag. Untagged accounts are absent. */
  tags: Record<string, MailboxTag>;
  /** Account id -> number of tag changes still being saved. */
  saving: Record<string, number>;
  /** The account set the tags were last loaded for (sorted, joined). */
  loadedFor: string | null;
  /** Loads once per account set; `force` re-reads, picking up changes other members made. */
  load: (accountIds: string[], options?: { force?: boolean }) => Promise<void>;
  setTag: (accountId: string, tag: MailboxTag | null) => Promise<void>;
  reset: () => void;
}

const keyOf = (accountIds: string[]) => [...accountIds].sort().join(',');
const withTag = (tags: Record<string, MailboxTag>, accountId: string, tag: MailboxTag | null | undefined) => {
  const next = { ...tags };
  if (tag) next[accountId] = tag; else delete next[accountId];
  return next;
};

export const useMailboxTagStore = create<MailboxTagState>()((set, get) => ({
  tags: {},
  saving: {},
  loadedFor: null,

  load: async (accountIds, options) => {
    const client = useAuthStore.getState().client;
    const key = keyOf(accountIds);
    if (!isMailboxTagClient(client) || (get().loadedFor === key && !options?.force)) return;
    set({ loadedFor: key });
    try {
      const loaded = await loadMailboxTags(client, accountIds);
      if (get().loadedFor !== key) return;
      // A change saved meanwhile is newer than this read: keep the local value for it.
      const saving = get().saving;
      const tags = { ...loaded };
      for (const accountId of Object.keys(saving)) {
        const local = get().tags[accountId];
        if (local) tags[accountId] = local; else delete tags[accountId];
      }
      set({ tags });
    } catch (error) {
      // No tags is a usable state; the next load retries.
      console.warn('[MailboxTags] load failed:', error);
      if (get().loadedFor === key) set({ loadedFor: null });
    }
  },

  setTag: async (accountId, tag) => {
    const client = useAuthStore.getState().client;
    if (!isMailboxTagClient(client)) throw new Error('Tags are not available on this server');
    const previous = get().tags[accountId];
    set({
      tags: withTag(get().tags, accountId, tag),
      saving: { ...get().saving, [accountId]: (get().saving[accountId] ?? 0) + 1 },
    });
    try {
      await saveMailboxTag(client, accountId, tag);
    } catch (error) {
      // Undo only if no later change has replaced this one on screen.
      if ((get().tags[accountId] ?? null) === tag) set({ tags: withTag(get().tags, accountId, previous) });
      throw error;
    } finally {
      const saving = { ...get().saving };
      if ((saving[accountId] ?? 1) <= 1) delete saving[accountId]; else saving[accountId] -= 1;
      set({ saving });
    }
  },

  reset: () => set({ tags: {}, saving: {}, loadedFor: null }),
}));

