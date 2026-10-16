/**
 * MailHub: a shared domain inbox can be tagged "business" or "project", and
 * filed under a company (e.g. "Synapse") that groups it in the sidebar.
 *
 * Both live in the shared account itself, as a small JSON file at the root of
 * its file storage (JMAP FileNode), so every member of the inbox sees the same
 * on every device and any member can change them. The file is hidden from the
 * Files view.
 */

export type MailboxTag = 'business' | 'project';
export const MAILBOX_TAGS: readonly MailboxTag[] = ['business', 'project'];
export const MAILBOX_TAG_FILE = '.mailhub-mailbox.json';
export const MAX_COMPANY_LENGTH = 40;

/** What is stored for one shared inbox. Both parts are optional. */
export interface MailboxMeta {
  tag?: MailboxTag;
  company?: string;
}

type MethodCall = [string, Record<string, unknown>, string];

/** The slice of the JMAP client the tags need. */
export interface MailboxTagClient {
  filesRequest(methodCalls: MethodCall[]): Promise<{ methodResponses?: [string, Record<string, unknown>, string][] }>;
  uploadBlob(file: File, accountId?: string): Promise<{ blobId: string }>;
  fetchBlob(blobId: string, name?: string, type?: string, accountId?: string): Promise<Blob>;
  /** The server's maxCallsInRequest; a lookup costs two calls per account. */
  getMaxCallsInRequest?(): number;
}

/** Stalwart's default maxCallsInRequest, for clients that cannot say. */
const DEFAULT_MAX_CALLS = 16;

export function isMailboxTagClient(client: unknown): client is MailboxTagClient {
  return !!client && typeof (client as MailboxTagClient).filesRequest === 'function';
}

/** A company name as stored: trimmed, inner whitespace collapsed, capped; empty means none. */
export function normalizeCompany(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined;
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_COMPANY_LENGTH).trim();
  return clean || undefined;
}

/** The known parts of a stored file; unknown or malformed parts are dropped. */
export function parseMailboxMeta(text: string): MailboxMeta | null {
  let raw: { tag?: unknown; company?: unknown };
  try {
    raw = JSON.parse(text) ?? {};
  } catch {
    return null;
  }
  const meta: MailboxMeta = {};
  if (MAILBOX_TAGS.includes(raw.tag as MailboxTag)) meta.tag = raw.tag as MailboxTag;
  const company = normalizeCompany(raw.company);
  if (company) meta.company = company;
  return meta.tag || meta.company ? meta : null;
}

export function isMailboxTagFile(node: { name?: string | null; parentId?: string | null }): boolean {
  return node.name === MAILBOX_TAG_FILE && (node.parentId ?? null) === null;
}

interface TagNode { id: string; blobId: string }

/**
 * The tag files of each account (normally one; two members tagging an untagged
 * inbox at the same moment can leave two). One request for all accounts.
 */
async function findTagNodes(client: MailboxTagClient, accountIds: string[]): Promise<Record<string, TagNode[]>> {
  if (accountIds.length === 0) return {};
  // Two calls per account; split so no request exceeds the server's call limit.
  const perRequest = Math.max(1, Math.floor((client.getMaxCallsInRequest?.() ?? DEFAULT_MAX_CALLS) / 2));
  if (accountIds.length > perRequest) {
    const parts: Promise<Record<string, TagNode[]>>[] = [];
    for (let i = 0; i < accountIds.length; i += perRequest) parts.push(findTagNodes(client, accountIds.slice(i, i + perRequest)));
    return Object.assign({}, ...(await Promise.all(parts)));
  }
  const calls: MethodCall[] = accountIds.flatMap((accountId, i): MethodCall[] => [
    ['FileNode/query', { accountId, filter: { name: MAILBOX_TAG_FILE } }, `q${i}`],
    ['FileNode/get', {
      accountId,
      '#ids': { resultOf: `q${i}`, name: 'FileNode/query', path: '/ids' },
      properties: ['id', 'name', 'parentId', 'blobId'],
    }, `g${i}`],
  ]);
  const response = await client.filesRequest(calls);
  const found: Record<string, TagNode[]> = {};
  for (const [name, args, callId] of response.methodResponses ?? []) {
    if (name !== 'FileNode/get' || !callId.startsWith('g')) continue;
    const accountId = accountIds[Number(callId.slice(1))];
    const list = (args.list ?? []) as { id: string; name: string; parentId: string | null; blobId: string }[];
    const nodes = list.filter(isMailboxTagFile).map((n) => ({ id: n.id, blobId: n.blobId }));
    if (accountId && nodes.length) found[accountId] = nodes;
  }
  return found;
}

/** Tag and company of the given shared accounts; accounts with neither are left out. */
export async function loadMailboxMeta(client: MailboxTagClient, accountIds: string[]): Promise<Record<string, MailboxMeta>> {
  const nodes = await findTagNodes(client, accountIds);
  const entries = await Promise.all(
    Object.entries(nodes).map(async ([accountId, [node]]) => {
      try {
        const blob = await client.fetchBlob(node.blobId, MAILBOX_TAG_FILE, 'application/json', accountId);
        return [accountId, parseMailboxMeta(await blob.text())] as const;
      } catch {
        return [accountId, null] as const;
      }
    }),
  );
  const found: Record<string, MailboxMeta> = {};
  for (const [accountId, meta] of entries) if (meta) found[accountId] = meta;
  return found;
}

function setResult(response: Awaited<ReturnType<MailboxTagClient['filesRequest']>>): void {
  const result = response.methodResponses?.[0];
  if (!result || result[0] === 'error') throw new Error(String(result?.[1]?.description ?? result?.[1]?.type ?? 'FileNode/set failed'));
  const args = result[1] as { notCreated?: Record<string, { description?: string }>; notUpdated?: Record<string, { description?: string }>; notDestroyed?: Record<string, { description?: string }> };
  const failure = Object.values({ ...args.notCreated, ...args.notUpdated, ...args.notDestroyed })[0];
  if (failure) throw new Error(failure.description || 'FileNode/set failed');
}

/** Stores the tag and company of one shared account; with neither, removes the file. */
export async function saveMailboxMeta(client: MailboxTagClient, accountId: string, meta: MailboxMeta): Promise<void> {
  const [keep, ...extra] = (await findTagNodes(client, [accountId]))[accountId] ?? [];
  const company = normalizeCompany(meta.company);
  const body: MailboxMeta = { ...(meta.tag ? { tag: meta.tag } : {}), ...(company ? { company } : {}) };
  if (!body.tag && !body.company) {
    if (!keep) return;
    setResult(await client.filesRequest([['FileNode/set', { accountId, destroy: [keep.id, ...extra.map((n) => n.id)] }, 's0']]));
    return;
  }
  const file = new File([JSON.stringify(body)], MAILBOX_TAG_FILE, { type: 'application/json' });
  const { blobId } = await client.uploadBlob(file, accountId);
  const set: Record<string, unknown> = keep
    ? { accountId, update: { [keep.id]: { blobId } } }
    : { accountId, create: { tag: { name: MAILBOX_TAG_FILE, parentId: null, blobId, type: 'application/json' } } };
  if (extra.length) set.destroy = extra.map((n) => n.id);
  setResult(await client.filesRequest([['FileNode/set', set, 's0']]));
}
