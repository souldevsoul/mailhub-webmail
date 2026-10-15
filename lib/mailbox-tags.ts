/**
 * MailHub: a shared domain inbox can be tagged "business" or "project".
 *
 * The tag lives in the shared account itself, as a small JSON file at the root
 * of its file storage (JMAP FileNode), so every member of the inbox sees the
 * same tag on every device and any member can change it. The file is hidden
 * from the Files view.
 */

export type MailboxTag = 'business' | 'project';
export const MAILBOX_TAGS: readonly MailboxTag[] = ['business', 'project'];
export const MAILBOX_TAG_FILE = '.mailhub-mailbox.json';

type MethodCall = [string, Record<string, unknown>, string];

/** The slice of the JMAP client the tags need. */
export interface MailboxTagClient {
  filesRequest(methodCalls: MethodCall[]): Promise<{ methodResponses?: [string, Record<string, unknown>, string][] }>;
  uploadBlob(file: File, accountId?: string): Promise<{ blobId: string }>;
  fetchBlob(blobId: string, name?: string, type?: string, accountId?: string): Promise<Blob>;
}

export function isMailboxTagClient(client: unknown): client is MailboxTagClient {
  return !!client && typeof (client as MailboxTagClient).filesRequest === 'function';
}

export function parseMailboxTag(text: string): MailboxTag | null {
  try {
    const tag = (JSON.parse(text) as { tag?: unknown })?.tag;
    return MAILBOX_TAGS.includes(tag as MailboxTag) ? (tag as MailboxTag) : null;
  } catch {
    return null;
  }
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

/** Tags of the given shared accounts; accounts without a tag are left out. */
export async function loadMailboxTags(client: MailboxTagClient, accountIds: string[]): Promise<Record<string, MailboxTag>> {
  const nodes = await findTagNodes(client, accountIds);
  const entries = await Promise.all(
    Object.entries(nodes).map(async ([accountId, [node]]) => {
      try {
        const blob = await client.fetchBlob(node.blobId, MAILBOX_TAG_FILE, 'application/json', accountId);
        return [accountId, parseMailboxTag(await blob.text())] as const;
      } catch {
        return [accountId, null] as const;
      }
    }),
  );
  const tags: Record<string, MailboxTag> = {};
  for (const [accountId, tag] of entries) if (tag) tags[accountId] = tag;
  return tags;
}

function setResult(response: Awaited<ReturnType<MailboxTagClient['filesRequest']>>): void {
  const result = response.methodResponses?.[0];
  if (!result || result[0] === 'error') throw new Error(String(result?.[1]?.description ?? result?.[1]?.type ?? 'FileNode/set failed'));
  const args = result[1] as { notCreated?: Record<string, { description?: string }>; notUpdated?: Record<string, { description?: string }>; notDestroyed?: Record<string, { description?: string }> };
  const failure = Object.values({ ...args.notCreated, ...args.notUpdated, ...args.notDestroyed })[0];
  if (failure) throw new Error(failure.description || 'FileNode/set failed');
}

/** Sets (or with null, removes) the tag of one shared account. */
export async function saveMailboxTag(client: MailboxTagClient, accountId: string, tag: MailboxTag | null): Promise<void> {
  const [keep, ...extra] = (await findTagNodes(client, [accountId]))[accountId] ?? [];
  if (!tag) {
    if (!keep) return;
    setResult(await client.filesRequest([['FileNode/set', { accountId, destroy: [keep.id, ...extra.map((n) => n.id)] }, 's0']]));
    return;
  }
  const file = new File([JSON.stringify({ tag })], MAILBOX_TAG_FILE, { type: 'application/json' });
  const { blobId } = await client.uploadBlob(file, accountId);
  const set: Record<string, unknown> = keep
    ? { accountId, update: { [keep.id]: { blobId } } }
    : { accountId, create: { tag: { name: MAILBOX_TAG_FILE, parentId: null, blobId, type: 'application/json' } } };
  if (extra.length) set.destroy = extra.map((n) => n.id);
  setResult(await client.filesRequest([['FileNode/set', set, 's0']]));
}
