import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useEmailStore } from '@/stores/email-store';
import { useMailboxTagStore } from '@/stores/mailbox-tag-store';

/**
 * MailHub: loads the Business/Project tags of the shared accounts this login
 * reads, as soon as their mailboxes are known, so tag colours show in the
 * message list on every layout (the phone has no sidebar until it is opened).
 * A new session (or sign-out) clears the previous session's tags.
 */
export function useMailboxTagsLoader(): void {
  const client = useAuthStore((s) => s.client);
  const sharedAccountIds = useEmailStore((s) => {
    const ids = new Set<string>();
    for (const m of s.mailboxes) if (m.isShared && m.accountId) ids.add(m.accountId);
    return [...ids].sort().join(',');
  });
  const load = useMailboxTagStore((s) => s.load);
  const reset = useMailboxTagStore((s) => s.reset);

  useEffect(() => () => reset(), [client, reset]);
  useEffect(() => {
    if (client && sharedAccountIds) void load(sharedAccountIds.split(','));
  }, [client, sharedAccountIds, load]);
}
