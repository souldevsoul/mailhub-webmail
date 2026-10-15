import { create } from 'zustand';
import { useAuthStore } from '@/stores/auth-store';
import { isMailboxTagClient, loadMailboxTags, saveMailboxTag, type MailboxTag } from '@/lib/mailbox-tags';

/** MailHub: Business / Project tags of the shared domain inboxes this login reads. */
interface MailboxTagState {
  /** Shared account id -> tag. Untagged accounts are absent. */
  tags: Record<string, MailboxTag>;
  /** Account ids whose tag change is still being saved. */
  saving: Record<string, boolean>;
  /** The account set the tags were last loaded for (sorted, joined). */
  loadedFor: string | null;
  /** Loads once per account set; `force` re-reads, picking up changes other members made. */
  load: (accountIds: string[], options?: { force?: boolean }) => Promise<void>;
  setTag: (accountId: string, tag: MailboxTag | null) => Promise<void>;
  reset: () => void;
}

const keyOf = (accountIds: string[]) => [...accountIds].sort().join(',');

export const useMailboxTagStore = create<MailboxTagState>()((set, get) => ({
  tags: {},
  saving: {},
  loadedFor: null,

  load: async (accountIds, options) => {
    const client = useAuthStore.getState().client;
    const key = keyOf(accountIds);
    if (!isMailboxTagClient(client) || (get().loadedFor === key && !options?.force)) return;
    // A change still being saved would be overwritten by the older server copy.
    if (Object.keys(get().saving).length > 0) return;
    set({ loadedFor: key });
    try {
      const tags = await loadMailboxTags(client, accountIds);
      // Skipped when a change was made meanwhile: the read may predate it.
      if (get().loadedFor === key && Object.keys(get().saving).length === 0) set({ tags });
    } catch (error) {
      // No tags is a usable state; the next account change retries.
      console.warn('[MailboxTags] load failed:', error);
      if (get().loadedFor === key) set({ loadedFor: null });
    }
  },

  setTag: async (accountId, tag) => {
    const client = useAuthStore.getState().client;
    if (!isMailboxTagClient(client)) throw new Error('Tags are not available on this server');
    const previous = get().tags;
    const next = { ...previous };
    if (tag) next[accountId] = tag; else delete next[accountId];
    set({ tags: next, saving: { ...get().saving, [accountId]: true } });
    try {
      await saveMailboxTag(client, accountId, tag);
    } catch (error) {
      const rolledBack = { ...get().tags };
      if (previous[accountId]) rolledBack[accountId] = previous[accountId]; else delete rolledBack[accountId];
      set({ tags: rolledBack });
      throw error;
    } finally {
      const saving = { ...get().saving };
      delete saving[accountId];
      set({ saving });
    }
  },

  reset: () => set({ tags: {}, saving: {}, loadedFor: null }),
}));
