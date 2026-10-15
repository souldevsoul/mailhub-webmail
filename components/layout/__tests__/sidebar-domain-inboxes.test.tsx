import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// MailHub: the shared domain inboxes are listed in the sidebar and can be
// tagged Business or Project there; tagged inboxes are grouped under those headings.

vi.mock('@/lib/mailbox-tags', async (orig) => ({
  ...(await orig<typeof import('@/lib/mailbox-tags')>()),
  loadMailboxTags: vi.fn(),
  saveMailboxTag: vi.fn(),
}));

const tagsLib = await import('@/lib/mailbox-tags');
const { SidebarDomainInboxes } = await import('../sidebar-domain-inboxes');
type DomainInbox = import('../sidebar-domain-inboxes').DomainInbox;
const { useMailboxTagStore } = await import('@/stores/mailbox-tag-store');
const { useAuthStore } = await import('@/stores/auth-store');

const inboxes: DomainInbox[] = [
  { id: 'cobalt-inbox', label: 'cobalt.boutique', sublabel: 'inbox@cobalt.boutique', unread: 3, accountId: 'm' },
  { id: 'ratify-inbox', label: 'ratify.studio', sublabel: 'inbox@ratify.studio', accountId: 'p' },
  { id: 'sayit-inbox', label: 'say-it.online', sublabel: 'inbox@say-it.online', accountId: 'q' },
];

const loadMock = vi.mocked(tagsLib.loadMailboxTags);
const saveMock = vi.mocked(tagsLib.saveMailboxTag);

function renderList(props: { onSelect?: (id: string) => void; isCollapsed?: boolean; tags?: Record<string, 'business' | 'project'> } = {}) {
  if (props.tags) useMailboxTagStore.setState({ tags: props.tags });
  return render(
    <SidebarDomainInboxes inboxes={inboxes} selectedMailbox="ratify-inbox" onSelect={props.onSelect ?? vi.fn()} isCollapsed={!!props.isCollapsed} />,
  );
}
const groupIds = (key: string) =>
  within(screen.getByTestId(`mailbox-group-${key}`)).getAllByTestId('mailbox-option').map((r) => r.getAttribute('data-mailbox-id'));

describe('SidebarDomainInboxes', () => {
  beforeEach(() => {
    loadMock.mockReset().mockResolvedValue({});
    saveMock.mockReset().mockResolvedValue(undefined);
    useMailboxTagStore.getState().reset();
    useAuthStore.setState({ client: { filesRequest: vi.fn() } } as never);
  });

  it('lists untagged domain inboxes as one list, with unread counts and the open one marked', () => {
    renderList();
    expect(groupIds('shared')).toEqual(['cobalt-inbox', 'ratify-inbox', 'sayit-inbox']);
    expect(screen.queryByTestId('mailbox-group-business')).toBeNull();
    const cobalt = screen.getAllByTestId('mailbox-option')[0];
    expect(cobalt).toHaveTextContent('cobalt.boutique');
    expect(cobalt).toHaveTextContent('3');
    expect(screen.getAllByTestId('mailbox-option')[1]).toHaveAttribute('aria-current', 'page');
  });

  it('opens an inbox on click', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });
    fireEvent.click(screen.getAllByTestId('mailbox-option')[2]);
    expect(onSelect).toHaveBeenCalledWith('sayit-inbox');
  });

  it('shows icons only, without tag controls, when the sidebar is collapsed', () => {
    renderList({ isCollapsed: true, tags: { m: 'project' } });
    expect(screen.getAllByTestId('mailbox-option')).toHaveLength(3);
    expect(screen.getAllByTestId('mailbox-option')[0]).toHaveAttribute('title', 'cobalt.boutique');
    expect(screen.queryByTestId('mailbox-tag-button')).toBeNull();
  });

  it('groups tagged inboxes under Business, Projects and Other', async () => {
    renderList({ tags: { m: 'project', p: 'business' } });
    expect(groupIds('business')).toEqual(['ratify-inbox']);
    expect(groupIds('project')).toEqual(['cobalt-inbox']);
    expect(groupIds('other')).toEqual(['sayit-inbox']);
  });

  it('tags an inbox from its tag button and moves it into the group', async () => {
    renderList();
    const row = screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === 'sayit-inbox')!;
    fireEvent.click(within(row).getByTestId('mailbox-tag-button'));
    fireEvent.click(within(row).getByTestId('mailbox-tag-business'));

    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'q', 'business');
    expect(groupIds('business')).toEqual(['sayit-inbox']);
    expect(screen.queryByTestId('mailbox-tag-chooser')).toBeNull();
  });

  it('clears a tag with No tag', async () => {
    renderList({ tags: { m: 'project' } });
    const row = screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === 'cobalt-inbox')!;
    fireEvent.click(within(row).getByTestId('mailbox-tag-button'));
    fireEvent.click(within(row).getByTestId('mailbox-tag-none'));
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'm', null);
    await waitFor(() => expect(screen.queryByTestId('mailbox-group-project')).toBeNull());
  });

  it('puts the old tag back when the server refuses the change', async () => {
    saveMock.mockRejectedValue(new Error('forbidden'));
    renderList({ tags: { m: 'project' } });
    const row = screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === 'cobalt-inbox')!;
    fireEvent.click(within(row).getByTestId('mailbox-tag-button'));
    fireEvent.click(within(row).getByTestId('mailbox-tag-business'));
    await waitFor(() => expect(useMailboxTagStore.getState().saving).toEqual({}));
    expect(useMailboxTagStore.getState().tags).toEqual({ m: 'project' });
    expect(groupIds('project')).toEqual(['cobalt-inbox']);
  });

  it('closes the tag choice with Escape', async () => {
    renderList();
    fireEvent.click(screen.getAllByTestId('mailbox-tag-button')[0]);
    const chooser = screen.getByTestId('mailbox-tag-chooser');
    fireEvent.keyDown(within(chooser).getByTestId('mailbox-tag-project'), { key: 'Escape' });
    expect(screen.queryByTestId('mailbox-tag-chooser')).toBeNull();
    expect(screen.getByTestId('domain-inboxes')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getAllByTestId('mailbox-tag-button')[0]);
  });

  it('gives focus back to the tag button after tagging, in the row\'s new group', async () => {
    renderList();
    const row = screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === 'ratify-inbox')!;
    fireEvent.click(within(row).getByTestId('mailbox-tag-button'));
    fireEvent.click(within(row).getByTestId('mailbox-tag-project'));
    const moved = within(screen.getByTestId('mailbox-group-project')).getByTestId('mailbox-tag-button');
    expect(document.activeElement).toBe(moved);
  });

});

describe('mailbox tag store', () => {
  beforeEach(() => {
    loadMock.mockReset().mockResolvedValue({});
    saveMock.mockReset();
    useMailboxTagStore.getState().reset();
    useAuthStore.setState({ client: { filesRequest: vi.fn() } } as never);
  });

  it('keeps a later change when an earlier one fails', async () => {
    let failFirst!: (e: Error) => void;
    saveMock.mockImplementationOnce(() => new Promise((_, reject) => { failFirst = reject; }))
      .mockResolvedValueOnce(undefined);
    const store = useMailboxTagStore.getState();
    const first = store.setTag('m', 'business').catch(() => {});
    await store.setTag('m', 'project');
    failFirst(new Error('late failure'));
    await first;
    expect(useMailboxTagStore.getState().tags).toEqual({ m: 'project' });
    expect(useMailboxTagStore.getState().saving).toEqual({});
  });

  it('does not let a read that started before a change undo it', async () => {
    let finishLoad!: (tags: Record<string, 'business' | 'project'>) => void;
    loadMock.mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve; }));
    let finishSave!: () => void;
    saveMock.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const store = useMailboxTagStore.getState();
    const loading = store.load(['m', 'p']);
    const saving = store.setTag('m', 'project');
    finishLoad({ p: 'business' });
    await loading;
    expect(useMailboxTagStore.getState().tags).toEqual({ m: 'project', p: 'business' });
    finishSave();
    await saving;
  });
});
