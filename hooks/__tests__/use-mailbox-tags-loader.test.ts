import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// MailHub: tags load as soon as the shared accounts' mailboxes are known, on
// every layout, and a new session drops the previous one's tags.

const { useMailboxTagsLoader } = await import('../use-mailbox-tags-loader');
const { useMailboxTagStore } = await import('@/stores/mailbox-tag-store');
const { useAuthStore } = await import('@/stores/auth-store');
const { useEmailStore } = await import('@/stores/email-store');

const mailbox = (id: string, accountId?: string) => ({ id, name: id, role: 'inbox', isShared: !!accountId, accountId });

describe('useMailboxTagsLoader', () => {
  beforeEach(() => {
    useMailboxTagStore.getState().reset();
    useAuthStore.setState({ client: {} } as never);
  });

  it('loads the tags of every shared account once its mailboxes are known', () => {
    const load = vi.fn();
    useMailboxTagStore.setState({ load });
    useEmailStore.setState({ mailboxes: [] } as never);
    renderHook(() => useMailboxTagsLoader());
    expect(load).not.toHaveBeenCalled();
    act(() => { useEmailStore.setState({ mailboxes: [mailbox('own'), mailbox('q:in', 'q'), mailbox('m:in', 'm'), mailbox('m:x', 'm')] } as never); });
    expect(load).toHaveBeenCalledWith(['m', 'q']);
  });

  it('forgets the tags when the session changes', () => {
    useMailboxTagStore.setState({ tags: { m: 'project' }, load: vi.fn() });
    renderHook(() => useMailboxTagsLoader());
    act(() => { useAuthStore.setState({ client: null } as never); });
    expect(useMailboxTagStore.getState().tags).toEqual({});
  });
});
