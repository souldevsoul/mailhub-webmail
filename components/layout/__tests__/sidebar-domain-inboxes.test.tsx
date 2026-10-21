import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// MailHub: the shared domain inboxes are listed in the sidebar. Each can be
// tagged Business or Project and filed under a company. Types become sections
// (Business, Projects, then untagged) and companies collapsible folders in each.

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
// Inbox ids listed directly, outside any company folder.
const loose = (root: HTMLElement = document.body) => within(root).queryAllByTestId('mailbox-option')
  .filter((o) => !o.closest('[data-testid="company-folder"]')).map((o) => o.dataset.mailboxId);
// Section label -> company folder -> inbox ids (with "_" for the inboxes beside the folders),
// or section label -> inbox ids while it has no companies.
const layout = () => Object.fromEntries(screen.getAllByTestId('type-section').map((section) => {
  const inFolders = within(section).queryAllByTestId('company-folder');
  const rest = loose(section);
  return [section.getAttribute('aria-label'), inFolders.length
    ? {
      ...Object.fromEntries(inFolders.map((f) => [f.getAttribute('aria-label'), within(f).queryAllByTestId('mailbox-option').map((o) => o.dataset.mailboxId)])),
      ...(rest.length ? { _: rest } : {}),
    }
    : rest];
}));

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

  it('puts inboxes in one folder per company, with no Other folder', () => {
    renderList({ companies: { m: 'Synapse', q: 'Synapse', p: 'Acme' } });
    expect(folders()).toEqual({ Acme: ['ratify-inbox'], Synapse: ['cobalt-inbox', 'sayit-inbox'] });
    expect(loose()).toEqual([]);
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
    expect(folders()).toEqual({ Synapse: [] });
    expect(loose()).toEqual(['ratify-inbox']);
  });

  it('files an inbox under an existing company', async () => {
    renderList({ companies: { m: 'Synapse' }, tags: { q: 'project' } });
    fireEvent.click(within(rowOf('sayit-inbox')).getByTestId('mailbox-tag-button'));
    const chooser = screen.getByTestId('mailbox-tag-chooser');
    fireEvent.click(within(chooser).getAllByTestId('mailbox-company').find((c) => c.dataset.company === 'Synapse')!);
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'q', { tag: 'project', company: 'Synapse' });
    expect(layout()).toEqual({
      mailbox_section_project: { Synapse: ['sayit-inbox'] },
      mailbox_section_untagged: { Synapse: ['cobalt-inbox'], _: ['ratify-inbox'] },
    });
  });

  it('creates a new company from the editor', async () => {
    renderList();
    fireEvent.click(within(rowOf('cobalt-inbox')).getByTestId('mailbox-tag-button'));
    fireEvent.click(screen.getByTestId('mailbox-company-new'));
    fireEvent.change(screen.getByTestId('mailbox-company-input'), { target: { value: '  Synapse ' } });
    fireEvent.click(screen.getByTestId('mailbox-company-save'));
    expect(saveMock).toHaveBeenCalledWith(expect.anything(), 'm', { company: 'Synapse' });
    expect(folders()).toEqual({ Synapse: ['cobalt-inbox'] });
    expect(loose()).toEqual(['ratify-inbox', 'sayit-inbox']);
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

  it('splits typed inboxes into Business (plain domains) and Projects (company folders) sections', () => {
    renderList({ tags: { m: 'business', p: 'project', q: 'business' }, companies: { m: 'Synapse', p: 'Synapse' } });
    expect(layout()).toEqual({
      mailbox_section_business: ['cobalt-inbox', 'sayit-inbox'],
      mailbox_section_project: { Synapse: ['ratify-inbox'] },
    });
    expect(screen.getAllByTestId('type-section').map((s) => s.dataset.section)).toEqual(['business', 'project']);
  });

  it('lists a section flat while none of its inboxes has a company, and puts untyped inboxes last', () => {
    renderList({ tags: { q: 'project' } });
    expect(layout()).toEqual({ mailbox_section_project: ['sayit-inbox'], mailbox_section_untagged: ['cobalt-inbox', 'ratify-inbox'] });
  });

  it('folds a section away with its unread total, separately from a same-named company in another section', () => {
    const { unmount } = renderList({ tags: { m: 'business', q: 'project' }, companies: { m: 'Synapse', q: 'Synapse' } });
    const business = screen.getAllByTestId('type-section').find((s) => s.dataset.section === 'business')!;
    fireEvent.click(within(business).getByTestId('type-section-toggle'));
    expect(within(business).queryAllByTestId('mailbox-option')).toHaveLength(0);
    expect(within(business).getByTestId('type-section-toggle')).toHaveTextContent('3');
    const projects = screen.getAllByTestId('type-section').find((s) => s.dataset.section === 'project')!;
    fireEvent.click(within(projects).getByTestId('company-folder-toggle'));
    unmount();
    renderList({ tags: { m: 'business', q: 'project' }, companies: { m: 'Synapse', q: 'Synapse' } });
    expect(layout()).toEqual({
      mailbox_section_business: [],
      mailbox_section_project: { Synapse: [] },
      mailbox_section_untagged: ['ratify-inbox'],
    });
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

  describe('folders, spam and search', () => {
    const rich: DomainInbox[] = [
      { ...inboxes[0], junk: { id: 'cobalt-junk', total: 2, unread: 1 }, folderIds: ['cobalt-sent', 'cobalt-junk'] },
      { ...inboxes[1], junk: { id: 'ratify-junk', total: 0, unread: 0 }, folderIds: ['ratify-junk'] },
      inboxes[2],
    ];
    const renderRich = (selected = 'ratify-inbox', onSelect = vi.fn()) => {
      useMailboxTagStore.setState({ tags: { m: 'business', p: 'project', q: 'project' }, companies: { p: 'Acme' } });
      const renderFolders = vi.fn((inbox: DomainInbox, depth: number) => <span data-testid="folders-of" data-depth={depth}>{inbox.label}</span>);
      render(<SidebarDomainInboxes inboxes={rich} selectedMailbox={selected} onSelect={onSelect} isCollapsed={false} renderFolders={renderFolders} />);
      return { onSelect, renderFolders };
    };
    const section = (name: string) => screen.getAllByTestId('type-section').find((s) => s.dataset.section === name)!;

    it('opens an inbox to its other folders, and remembers that', () => {
      renderRich();
      expect(screen.queryByTestId('folders-of')).toBeNull();
      expect(within(rowOf('sayit-inbox')).queryByTestId('mailbox-folders-toggle')).toBeNull();
      fireEvent.click(within(rowOf('cobalt-inbox')).getByTestId('mailbox-folders-toggle'));
      expect(within(rowOf('cobalt-inbox')).getByTestId('folders-of')).toHaveTextContent('cobalt.boutique');
      expect(JSON.parse(localStorage.getItem('sidebarOpenDomainInboxes')!)).toEqual(['cobalt-inbox']);
    });

    it('keeps the folders open while one of them is the open folder', () => {
      renderRich('cobalt-sent');
      expect(within(rowOf('cobalt-inbox')).getByTestId('mailbox-folders-toggle')).toHaveAttribute('aria-expanded', 'true');
      expect(within(rowOf('cobalt-inbox')).getByTestId('folders-of')).toBeInTheDocument();
    });

    it('shows spam on the row while there is any, and opens it on click', () => {
      const { onSelect } = renderRich();
      const chip = within(rowOf('cobalt-inbox')).getByTestId('mailbox-junk');
      expect(chip).toHaveTextContent('2');
      expect(chip).toHaveAttribute('data-unread', '1');
      expect(within(rowOf('ratify-inbox')).queryByTestId('mailbox-junk')).toBeNull();
      fireEvent.click(chip);
      expect(onSelect).toHaveBeenCalledWith('cobalt-junk');
    });

    it('lists an inbox with no company beside the company folders, not under Other', () => {
      renderRich();
      expect(layout()).toEqual({
        mailbox_section_business: ['cobalt-inbox'],
        mailbox_section_project: { Acme: ['ratify-inbox'], _: ['sayit-inbox'] },
      });
    });

    it('searches one section from its heading, by domain or company, and closes with Escape', () => {
      renderRich();
      fireEvent.click(within(section('project')).getByTestId('type-section-search-open'));
      const input = within(section('project')).getByTestId('type-section-search');
      expect(input).toHaveFocus();
      fireEvent.change(input, { target: { value: 'SAY' } });
      expect(layout().mailbox_section_project).toEqual(['sayit-inbox']);
      expect(layout().mailbox_section_business).toEqual(['cobalt-inbox']);
      fireEvent.change(input, { target: { value: 'acme' } });
      expect(layout().mailbox_section_project).toEqual({ Acme: ['ratify-inbox'] });
      fireEvent.change(input, { target: { value: 'zzz' } });
      expect(within(section('project')).getByTestId('type-section-empty')).toBeInTheDocument();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(within(section('project')).queryByTestId('type-section-search')).toBeNull();
      expect(layout().mailbox_section_project).toEqual({ Acme: ['ratify-inbox'], _: ['sayit-inbox'] });
    });

    it('shows matches inside folded sections and folders while searching', () => {
      renderRich();
      fireEvent.click(within(section('project')).getByTestId('company-folder-toggle'));
      fireEvent.click(within(section('project')).getByTestId('type-section-toggle'));
      fireEvent.click(within(section('project')).getByTestId('type-section-search-open'));
      fireEvent.change(within(section('project')).getByTestId('type-section-search'), { target: { value: 'ratify' } });
      expect(layout().mailbox_section_project).toEqual({ Acme: ['ratify-inbox'] });
    });
  });

  describe('addresses', () => {
    const seed = () => useMailboxTagStore.setState({
      tags: { m: 'business', p: 'business' }, companies: {},
      addresses: {
        m: { addresses: ['info@cobalt.boutique', 'sales@cobalt.boutique', 'inbox@cobalt.boutique'], catchAll: true },
        p: { addresses: ['inbox@ratify.studio'], catchAll: false },
      },
    });

    it('shows the main address, how many more there are, and whether the inbox catches all', () => {
      seed();
      render(<SidebarDomainInboxes inboxes={inboxes} selectedMailbox="" onSelect={vi.fn()} isCollapsed={false} />);
      expect(within(rowOf('cobalt-inbox')).getByTestId('mailbox-address')).toHaveTextContent('info@cobalt.boutique');
      expect(within(rowOf('cobalt-inbox')).getByTestId('mailbox-more-addresses')).toHaveTextContent('+2');
      expect(within(rowOf('cobalt-inbox')).getByTestId('mailbox-catch-all')).toBeInTheDocument();
      expect(within(rowOf('cobalt-inbox')).getByTestId('mailbox-option').getAttribute('title')).toContain('sales@cobalt.boutique');
      expect(within(rowOf('ratify-inbox')).getByTestId('mailbox-address')).toHaveTextContent('inbox@ratify.studio');
      expect(within(rowOf('ratify-inbox')).queryByTestId('mailbox-catch-all')).toBeNull();
      expect(within(rowOf('ratify-inbox')).queryByTestId('mailbox-more-addresses')).toBeNull();
      // No addresses file yet: the domain, as before.
      expect(within(rowOf('sayit-inbox')).getByTestId('mailbox-address')).toHaveTextContent('say-it.online');
    });

    it('finds an inbox by any of its addresses', () => {
      seed();
      render(<SidebarDomainInboxes inboxes={inboxes} selectedMailbox="" onSelect={vi.fn()} isCollapsed={false} />);
      const business = screen.getAllByTestId('type-section').find((s) => s.dataset.section === 'business')!;
      fireEvent.click(within(business).getByTestId('type-section-search-open'));
      fireEvent.change(within(business).getByTestId('type-section-search'), { target: { value: 'sales@' } });
      expect(within(business).getAllByTestId('mailbox-option').map((o) => o.dataset.mailboxId)).toEqual(['cobalt-inbox']);
    });
  });
});
