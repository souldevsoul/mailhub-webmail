import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// MailHub: shared domain inboxes can be tagged Business or Project from the
// switcher; tagged inboxes are grouped under those headings.

vi.mock('@/lib/mailbox-tags', async (orig) => ({
  ...(await orig<typeof import('@/lib/mailbox-tags')>()),
  loadMailboxTags: vi.fn(),
  saveMailboxTag: vi.fn(),
}));

const tagsLib = await import('@/lib/mailbox-tags');
const { MailboxSwitcherList } = await import('../mailbox-switcher-list');
type SwitcherMailbox = import('../mailbox-switcher-list').SwitcherMailbox;
const { useMailboxTagStore } = await import('@/stores/mailbox-tag-store');
const { useAuthStore } = await import('@/stores/auth-store');

const options: SwitcherMailbox[] = [
  { id: 'unified-inbox', label: 'All inboxes', kind: 'all' },
  { id: 'own-inbox', label: 'My inbox', kind: 'own' },
  { id: 'cobalt-inbox', label: 'cobalt.boutique', sublabel: 'inbox@cobalt.boutique', kind: 'shared', accountId: 'm' },
  { id: 'ratify-inbox', label: 'ratify.studio', sublabel: 'inbox@ratify.studio', kind: 'shared', accountId: 'p' },
  { id: 'sayit-inbox', label: 'say-it.online', sublabel: 'inbox@say-it.online', kind: 'shared', accountId: 'q' },
];

const loadMock = vi.mocked(tagsLib.loadMailboxTags);
const saveMock = vi.mocked(tagsLib.saveMailboxTag);

function renderList() {
  return render(<MailboxSwitcherList options={options} selectedMailbox="own-inbox" onSelect={vi.fn()} />);
}
const groupIds = (key: string) =>
  within(screen.getByTestId(`mailbox-group-${key}`)).getAllByTestId('mailbox-option').map((r) => r.getAttribute('data-mailbox-id'));

describe('MailboxSwitcherList tags', () => {
  beforeEach(() => {
    loadMock.mockReset().mockResolvedValue({});
    saveMock.mockReset().mockResolvedValue(undefined);
    useMailboxTagStore.getState().reset();
    useAuthStore.setState({ client: { filesRequest: vi.fn() } } as never);
  });

  it('lists untagged domain inboxes under one heading', async () => {
    renderList();
    await waitFor(() => expect(loadMock).toHaveBeenCalledWith(expect.anything(), ['m', 'p', 'q']));
    expect(groupIds('shared')).toEqual(['cobalt-inbox', 'ratify-inbox', 'sayit-inbox']);
    expect(screen.queryByTestId('mailbox-group-business')).toBeNull();
  });

  it('groups tagged inboxes under Business, Projects and Other', async () => {
    loadMock.mockResolvedValue({ m: 'project', p: 'business' });
    renderList();
    await screen.findByTestId('mailbox-group-business');
    expect(groupIds('business')).toEqual(['ratify-inbox']);
    expect(groupIds('project')).toEqual(['cobalt-inbox']);
    expect(groupIds('other')).toEqual(['sayit-inbox']);
  });

  it('tags an inbox from its tag button and moves it into the group', async () => {
    renderList();
    await waitFor(() => expect(loadMock).toHaveBeenCalled());
    const row = screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === 'sayit-inbox')!;
    fireEvent.click(within(row).getByTestId('mailbox-tag-button'));
    fireEvent.click(within(row).getByTestId('mailbox-tag-business'));

    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'q', 'business');
    expect(groupIds('business')).toEqual(['sayit-inbox']);
    expect(screen.queryByTestId('mailbox-tag-chooser')).toBeNull();
  });

  it('clears a tag with No tag', async () => {
    loadMock.mockResolvedValue({ m: 'project' });
    renderList();
    await screen.findByTestId('mailbox-group-project');
    const row = screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === 'cobalt-inbox')!;
    fireEvent.click(within(row).getByTestId('mailbox-tag-button'));
    fireEvent.click(within(row).getByTestId('mailbox-tag-none'));
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'm', null);
    await waitFor(() => expect(screen.queryByTestId('mailbox-group-project')).toBeNull());
  });

  it('puts the old tag back when the server refuses the change', async () => {
    loadMock.mockResolvedValue({ m: 'project' });
    saveMock.mockRejectedValue(new Error('forbidden'));
    renderList();
    await screen.findByTestId('mailbox-group-project');
    const row = screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === 'cobalt-inbox')!;
    fireEvent.click(within(row).getByTestId('mailbox-tag-button'));
    fireEvent.click(within(row).getByTestId('mailbox-tag-business'));
    await waitFor(() => expect(useMailboxTagStore.getState().saving).toEqual({}));
    expect(useMailboxTagStore.getState().tags).toEqual({ m: 'project' });
    expect(groupIds('project')).toEqual(['cobalt-inbox']);
  });

  it('closes the tag choice with Escape without closing the menu', async () => {
    renderList();
    await waitFor(() => expect(loadMock).toHaveBeenCalled());
    fireEvent.click(screen.getAllByTestId('mailbox-tag-button')[0]);
    const chooser = screen.getByTestId('mailbox-tag-chooser');
    fireEvent.keyDown(within(chooser).getByTestId('mailbox-tag-project'), { key: 'Escape' });
    expect(screen.queryByTestId('mailbox-tag-chooser')).toBeNull();
    expect(screen.getByTestId('mailbox-switcher')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getAllByTestId('mailbox-tag-button')[0]);
  });

  it('gives focus back to the tag button after tagging, in the row\'s new group', async () => {
    renderList();
    await waitFor(() => expect(loadMock).toHaveBeenCalled());
    const row = screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === 'ratify-inbox')!;
    fireEvent.click(within(row).getByTestId('mailbox-tag-button'));
    fireEvent.click(within(row).getByTestId('mailbox-tag-project'));
    const moved = within(screen.getByTestId('mailbox-group-project')).getByTestId('mailbox-tag-button');
    expect(document.activeElement).toBe(moved);
  });

  it('re-reads the tags once each time it opens', async () => {
    renderList();
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1));
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
