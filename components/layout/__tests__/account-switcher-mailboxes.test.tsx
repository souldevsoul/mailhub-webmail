import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mailbox } from '@/lib/jmap/types';

// MailHub: the sidebar's account switcher also lists every inbox the login can
// read - all of them merged, its own, and each shared domain inbox - and its
// trigger names the shared inbox on screen.

const { AccountSwitcher } = await import('../account-switcher');
type SwitcherMailbox = import('../account-switcher').SwitcherMailbox;
const { useAccountStore } = await import('@/stores/account-store');
const { useAuthStore } = await import('@/stores/auth-store');
const { useEmailStore } = await import('@/stores/email-store');
const { useSettingsStore } = await import('@/stores/settings-store');
const { useMailboxTagStore } = await import('@/stores/mailbox-tag-store');

const options: SwitcherMailbox[] = [
  { id: 'unified-inbox', label: 'All inboxes', unread: 4, kind: 'all' },
  { id: 'own-inbox', label: 'My inbox', kind: 'own' },
  { id: 'cobalt-inbox', label: 'cobalt.boutique', sublabel: 'inbox@cobalt.boutique', unread: 3, kind: 'shared' },
  { id: 'ratify-inbox', label: 'ratify.studio', sublabel: 'inbox@ratify.studio', unread: 1, kind: 'shared' },
];

describe('AccountSwitcher mailbox list', () => {
  beforeEach(() => {
    useAccountStore.setState({
      accounts: [{
        id: 'a', label: 'admin1@pact.email', email: 'admin1@pact.email', username: 'admin1@pact.email',
        displayName: 'Admin', serverUrl: 'https://mail.pact.email', avatarColor: '#336699',
        cookieSlot: 0, isConnected: true, isDefault: true,
      }],
    } as never);
    useAuthStore.setState({ activeAccountId: 'a' } as never);
    useEmailStore.setState({ mailboxes: [] as unknown as Mailbox[], accountMailboxes: {} } as never);
    useSettingsStore.setState({ interfaceLayout: 'default' } as never);
  });

  it('lists all inboxes, the own inbox and each shared domain inbox with unread counts', () => {
    render(<AccountSwitcher variant="expanded" mailboxOptions={options} selectedMailbox="own-inbox" onSelectMailbox={vi.fn()} />);
    fireEvent.click(screen.getByTestId('account-switcher'));

    const rows = screen.getAllByTestId('mailbox-option');
    expect(rows.map((r) => r.getAttribute('data-mailbox-id'))).toEqual(['unified-inbox', 'own-inbox', 'cobalt-inbox', 'ratify-inbox']);
    expect(rows[2]).toHaveTextContent('inbox@cobalt.boutique');
    expect(rows[2]).toHaveTextContent('3');
    expect(rows[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('selects a shared inbox and closes the popover', () => {
    const onSelect = vi.fn();
    render(<AccountSwitcher variant="expanded" mailboxOptions={options} selectedMailbox="own-inbox" onSelectMailbox={onSelect} />);
    fireEvent.click(screen.getByTestId('account-switcher'));
    fireEvent.click(screen.getAllByTestId('mailbox-option')[3]);

    expect(onSelect).toHaveBeenCalledWith('ratify-inbox');
    expect(screen.queryByTestId('mailbox-switcher')).toBeNull();
  });

  it('names the shared inbox on screen in the trigger', () => {
    render(<AccountSwitcher variant="expanded" mailboxOptions={options} selectedMailbox="cobalt-inbox" onSelectMailbox={vi.fn()} />);
    const label = screen.getByTestId('account-switcher-label');
    expect(label).toHaveTextContent('cobalt.boutique');
    expect(label).toHaveTextContent('inbox@cobalt.boutique');
  });

  it('shows All inboxes with the login address underneath', () => {
    render(<AccountSwitcher variant="expanded" mailboxOptions={options} selectedMailbox="unified-inbox" onSelectMailbox={vi.fn()} />);
    const label = screen.getByTestId('account-switcher-label');
    expect(label).toHaveTextContent('All inboxes');
    expect(label).toHaveTextContent('admin1@pact.email');
    expect(label).not.toHaveTextContent('Shared inbox');
  });

  it('keeps the account identity in the trigger for the own inbox', () => {
    render(<AccountSwitcher variant="expanded" mailboxOptions={options} selectedMailbox="own-inbox" onSelectMailbox={vi.fn()} />);
    expect(screen.getByTestId('account-switcher-label')).toHaveTextContent('admin1@pact.email');
  });

  it('draws no mailbox list without options', () => {
    render(<AccountSwitcher variant="expanded" />);
    fireEvent.click(screen.getByTestId('account-switcher'));
    expect(screen.queryByTestId('mailbox-switcher')).toBeNull();
  });

  it('shows the tag of the shared inbox on screen', () => {
    useMailboxTagStore.setState({ tags: { m: 'project' } });
    const tagged = options.map((o) => (o.id === 'cobalt-inbox' ? { ...o, accountId: 'm' } : o));
    render(<AccountSwitcher variant="expanded" mailboxOptions={tagged} selectedMailbox="cobalt-inbox" onSelectMailbox={vi.fn()} />);
    expect(screen.getByTestId('account-switcher-tag')).toHaveAttribute('data-tag', 'project');
  });
});
