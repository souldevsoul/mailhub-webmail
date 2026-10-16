import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// MailHub: the shared domain inboxes are listed in the sidebar. Each can be
// tagged Business or Project and filed under a company; companies become
// collapsible folders.

vi.mock('@/lib/mailbox-tags', async (orig) => ({
  ...(await orig<typeof import('@/lib/mailbox-tags')>()),
  loadMailboxMeta: vi.fn(),
  saveMailboxMeta: vi.fn(),
}));

const tagsLib = await import('@/lib/mailbox-tags');
const { SidebarDomainInboxes } = await import('../sidebar-domain-inboxes');
type DomainInbox = import('../sidebar-domain-inboxes').DomainInbox;
const { useMailboxTagStore } = await import('@/stores/mailbox-tag-store');
const { useAuthStore } = await import('@/stores/auth-store');

const inboxes: DomainInbox[] = [
  { id: 'cobalt-inbox', label: 'cobalt.boutique', sublabel: 'inbox@cobalt.boutique', unread: 3, accountId: 'm' },
  { id: 'ratify-inbox', label: 'ratify.studio', sublabel: 'inbox@ratify.studio', accountId: 'p' },
  { id: 'sayit-inbox', label: 'say-it.online', sublabel: 'inbox@say-it.online', unread: 2, accountId: 'q' },
];

const loadMock = vi.mocked(tagsLib.loadMailboxMeta);
const saveMock = vi.mocked(tagsLib.saveMailboxMeta);

type Seed = { onSelect?: (id: string) => void; isCollapsed?: boolean; tags?: Record<string, 'business' | 'project'>; companies?: Record<string, string> };
function renderList(props: Seed = {}) {
  useMailboxTagStore.setState({ tags: props.tags ?? {}, companies: props.companies ?? {} });
  return render(
    <SidebarDomainInboxes inboxes={inboxes} selectedMailbox="ratify-inbox" onSelect={props.onSelect ?? vi.fn()} isCollapsed={!!props.isCollapsed} />,
  );
}
const rowOf = (id: string) => screen.getAllByTestId('mailbox-row').find((r) => r.dataset.mailboxId === id)!;
const folders = () => Object.fromEntries(screen.getAllByTestId('company-folder').map((f) => [
  f.getAttribute('aria-label'),
  within(f).queryAllByTestId('mailbox-option').map((o) => o.getAttribute('data-mailbox-id')),
]));

describe('SidebarDomainInboxes', () => {
  beforeEach(() => {
    localStorage.clear();
    loadMock.mockReset().mockResolvedValue({});
    saveMock.mockReset().mockResolvedValue(undefined);
    useMailboxTagStore.getState().reset();
    useAuthStore.setState({ client: { filesRequest: vi.fn() } } as never);
  });

  it('lists the inboxes flat while no company is set, with unread counts and the open one marked', () => {
    renderList();
    expect(screen.queryAllByTestId('company-folder')).toHaveLength(0);
    const options = screen.getAllByTestId('mailbox-option');
    expect(options.map((o) => o.dataset.mailboxId)).toEqual(['cobalt-inbox', 'ratify-inbox', 'sayit-inbox']);
    expect(options[0]).toHaveTextContent('3');
    expect(options[1]).toHaveAttribute('aria-current', 'page');
  });

  it('opens an inbox on click', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });
    fireEvent.click(screen.getAllByTestId('mailbox-option')[2]);
    expect(onSelect).toHaveBeenCalledWith('sayit-inbox');
  });

  it('shows icons only, without folders or controls, when the sidebar is collapsed', () => {
    renderList({ isCollapsed: true, companies: { m: 'Synapse' } });
    expect(screen.getAllByTestId('mailbox-option')).toHaveLength(3);
    expect(screen.getAllByTestId('mailbox-option')[0]).toHaveAttribute('title', 'cobalt.boutique');
    expect(screen.queryByTestId('mailbox-tag-button')).toBeNull();
    expect(screen.queryByTestId('company-folder')).toBeNull();
  });

  it('puts inboxes in one folder per company, the rest under Other', () => {
    renderList({ companies: { m: 'Synapse', q: 'Synapse', p: 'Acme' } });
    expect(folders()).toEqual({ Acme: ['ratify-inbox'], Synapse: ['cobalt-inbox', 'sayit-inbox'] });
  });

  it('folds a company away, shows its unread total, and remembers it', () => {
    const { unmount } = renderList({ companies: { m: 'Synapse', q: 'Synapse' } });
    const synapse = screen.getAllByTestId('company-folder').find((f) => f.dataset.company === 'Synapse')!;
    fireEvent.click(within(synapse).getByTestId('company-folder-toggle'));
    expect(within(synapse).queryAllByTestId('mailbox-option')).toHaveLength(0);
    expect(within(synapse).getByTestId('company-folder-toggle')).toHaveTextContent('5');
    expect(within(synapse).getByTestId('company-folder-toggle')).toHaveAttribute('aria-expanded', 'false');
    unmount();
    renderList({ companies: { m: 'Synapse', q: 'Synapse' } });
    expect(folders()).toEqual({ Synapse: [], mailbox_group_other: ['ratify-inbox'] });
  });

  it('files an inbox under an existing company', async () => {
    renderList({ companies: { m: 'Synapse' }, tags: { q: 'project' } });
    fireEvent.click(within(rowOf('sayit-inbox')).getByTestId('mailbox-tag-button'));
    const chooser = screen.getByTestId('mailbox-tag-chooser');
    fireEvent.click(within(chooser).getAllByTestId('mailbox-company').find((c) => c.dataset.company === 'Synapse')!);
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'q', { tag: 'project', company: 'Synapse' });
    expect(folders().Synapse).toEqual(['cobalt-inbox', 'sayit-inbox']);
  });

  it('creates a new company from the editor', async () => {
    renderList();
    fireEvent.click(within(rowOf('cobalt-inbox')).getByTestId('mailbox-tag-button'));
    fireEvent.click(screen.getByTestId('mailbox-company-new'));
    fireEvent.change(screen.getByTestId('mailbox-company-input'), { target: { value: '  Synapse ' } });
    fireEvent.click(screen.getByTestId('mailbox-company-save'));
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'm', { company: 'Synapse' });
    expect(folders()).toEqual({ Synapse: ['cobalt-inbox'], mailbox_group_other: ['ratify-inbox', 'sayit-inbox'] });
  });

  it('takes an inbox out of its company with None, keeping its tag', async () => {
    renderList({ companies: { m: 'Synapse' }, tags: { m: 'business' } });
    fireEvent.click(within(rowOf('cobalt-inbox')).getByTestId('mailbox-tag-button'));
    fireEvent.click(screen.getByTestId('mailbox-company-none'));
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'm', { tag: 'business', company: undefined });
    expect(screen.queryAllByTestId('company-folder')).toHaveLength(0);
  });

  it('tags an inbox and keeps its company', async () => {
    renderList({ companies: { q: 'Synapse' } });
    fireEvent.click(within(rowOf('sayit-inbox')).getByTestId('mailbox-tag-button'));
    fireEvent.click(screen.getByTestId('mailbox-tag-business'));
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'q', { tag: 'business', company: 'Synapse' });
    expect(rowOf('sayit-inbox').dataset.mailboxTag).toBe('business');
    expect(screen.queryByTestId('mailbox-tag-chooser')).toBeNull();
  });

  it('puts the old values back when the server refuses the change', async () => {
    saveMock.mockRejectedValue(new Error('forbidden'));
    renderList({ tags: { m: 'project' }, companies: { m: 'Synapse' } });
    fireEvent.click(within(rowOf('cobalt-inbox')).getByTestId('mailbox-tag-button'));
    fireEvent.click(screen.getByTestId('mailbox-company-none'));
    await waitFor(() => expect(useMailboxTagStore.getState().saving).toEqual({}));
    expect(useMailboxTagStore.getState().companies).toEqual({ m: 'Synapse' });
    expect(useMailboxTagStore.getState().tags).toEqual({ m: 'project' });
    expect(folders().Synapse).toEqual(['cobalt-inbox']);
  });

  it('closes the editor with Escape and gives focus back to its button', () => {
    renderList();
    fireEvent.click(screen.getAllByTestId('mailbox-tag-button')[0]);
    fireEvent.keyDown(screen.getByTestId('mailbox-tag-project'), { key: 'Escape' });
    expect(screen.queryByTestId('mailbox-tag-chooser')).toBeNull();
    expect(document.activeElement).toBe(screen.getAllByTestId('mailbox-tag-button')[0]);
  });

  it('gives focus back to the button after filing, in the row\'s new folder', () => {
    renderList({ companies: { m: 'Synapse' } });
    fireEvent.click(within(rowOf('ratify-inbox')).getByTestId('mailbox-tag-button'));
    fireEvent.click(screen.getAllByTestId('mailbox-company').find((c) => c.dataset.company === 'Synapse')!);
    const synapse = screen.getAllByTestId('company-folder').find((f) => f.dataset.company === 'Synapse')!;
    const moved = within(synapse).getAllByTestId('mailbox-tag-button')[1];
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

  it('loads tags and companies', async () => {
    loadMock.mockResolvedValue({ m: { tag: 'project', company: 'Synapse' }, p: { company: 'Acme' } });
    await useMailboxTagStore.getState().load(['m', 'p']);
    expect(useMailboxTagStore.getState().tags).toEqual({ m: 'project' });
    expect(useMailboxTagStore.getState().companies).toEqual({ m: 'Synapse', p: 'Acme' });
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
    let finishLoad!: (meta: Record<string, { tag?: 'business' | 'project'; company?: string }>) => void;
    loadMock.mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve; }));
    let finishSave!: () => void;
    saveMock.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const store = useMailboxTagStore.getState();
    const loading = store.load(['m', 'p']);
    const saving = store.setCompany('m', 'Synapse');
    finishLoad({ p: { tag: 'business' } });
    await loading;
    expect(useMailboxTagStore.getState().companies).toEqual({ m: 'Synapse' });
    expect(useMailboxTagStore.getState().tags).toEqual({ p: 'business' });
    finishSave();
    await saving;
  });
});
