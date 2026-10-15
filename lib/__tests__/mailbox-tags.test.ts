import { describe, it, expect, vi } from 'vitest';
import { loadMailboxTags, saveMailboxTag, parseMailboxTag, isMailboxTagFile, MAILBOX_TAG_FILE, type MailboxTagClient } from '../mailbox-tags';

// MailHub: Business/Project tags of shared domain inboxes live in a small JSON
// file at the root of each shared account's file storage.

type Call = [string, Record<string, unknown>, string];

/** A fake server holding one tag file per account (account id -> tag JSON). */
function fakeServer(files: Record<string, string>) {
  const nodes = new Map(Object.entries(files).map(([acc, text], i) => [acc, { id: `n${i}`, blobId: `b-${acc}`, text }]));
  const sets: Call[] = [];
  const client: MailboxTagClient = {
    filesRequest: vi.fn(async (calls: Call[]) => ({
      methodResponses: calls.map(([name, args, id]): [string, Record<string, unknown>, string] => {
        const acc = args.accountId as string;
        const node = nodes.get(acc);
        if (name === 'FileNode/query') return [name, { ids: node ? [node.id] : [] }, id];
        if (name === 'FileNode/get') {
          return [name, { list: node ? [{ id: node.id, name: MAILBOX_TAG_FILE, parentId: null, blobId: node.blobId }] : [] }, id];
        }
        sets.push([name, args, id]);
        return [name, { updated: {}, created: {}, destroyed: [] }, id];
      }),
    })),
    uploadBlob: vi.fn(async (file: File) => ({ blobId: `up-${await file.text()}` })),
    fetchBlob: vi.fn(async (blobId: string) => new Blob([[...nodes.values()].find((n) => n.blobId === blobId)!.text])),
  };
  return { client, sets };
}

describe('mailbox tags', () => {
  it('parses only known tags', () => {
    expect(parseMailboxTag('{"tag":"business"}')).toBe('business');
    expect(parseMailboxTag('{"tag":"project"}')).toBe('project');
    expect(parseMailboxTag('{"tag":"other"}')).toBeNull();
    expect(parseMailboxTag('not json')).toBeNull();
  });

  it('treats only the root-level file as the tag file', () => {
    expect(isMailboxTagFile({ name: MAILBOX_TAG_FILE, parentId: null })).toBe(true);
    expect(isMailboxTagFile({ name: MAILBOX_TAG_FILE, parentId: 'folder' })).toBe(false);
    expect(isMailboxTagFile({ name: 'report.pdf', parentId: null })).toBe(false);
  });

  it('reads the tags of several accounts in one request and leaves untagged ones out', async () => {
    const { client } = fakeServer({ m: '{"tag":"project"}', n: '{"tag":"business"}', o: '{"tag":"bogus"}' });
    const tags = await loadMailboxTags(client, ['m', 'n', 'o', 'p']);
    expect(tags).toEqual({ m: 'project', n: 'business' });
    expect(client.filesRequest).toHaveBeenCalledTimes(1);
  });

  it('creates the file for a first tag', async () => {
    const { client, sets } = fakeServer({});
    await saveMailboxTag(client, 'm', 'business');
    expect(sets).toHaveLength(1);
    const create = (sets[0][1].create as Record<string, Record<string, unknown>>).tag;
    expect(create).toMatchObject({ name: MAILBOX_TAG_FILE, parentId: null, blobId: 'up-{"tag":"business"}' });
  });

  it('replaces the content of an existing tag file', async () => {
    const { client, sets } = fakeServer({ m: '{"tag":"business"}' });
    await saveMailboxTag(client, 'm', 'project');
    expect(sets[0][1].update).toEqual({ n0: { blobId: 'up-{"tag":"project"}' } });
  });

  it('removes the file when the tag is cleared, and does nothing when there is none', async () => {
    const tagged = fakeServer({ m: '{"tag":"business"}' });
    await saveMailboxTag(tagged.client, 'm', null);
    expect(tagged.sets[0][1].destroy).toEqual(['n0']);

    const untagged = fakeServer({});
    await saveMailboxTag(untagged.client, 'm', null);
    expect(untagged.sets).toHaveLength(0);
  });

  it('cleans up a duplicate tag file left by two members tagging at once', async () => {
    const { client, sets } = fakeServer({ m: '{"tag":"business"}' });
    (client.filesRequest as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
      methodResponses: [['FileNode/get', { list: [
        { id: 'n0', name: MAILBOX_TAG_FILE, parentId: null, blobId: 'b-m' },
        { id: 'n9', name: MAILBOX_TAG_FILE, parentId: null, blobId: 'b-m2' },
      ] }, 'g0']],
    }));
    await saveMailboxTag(client, 'm', 'project');
    expect(sets[0][1]).toMatchObject({ update: { n0: { blobId: 'up-{"tag":"project"}' } }, destroy: ['n9'] });
  });

  it('reports a refused save', async () => {
    const { client } = fakeServer({});
    (client.filesRequest as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({ methodResponses: [['FileNode/get', { list: [] }, 'g0']] }))
      .mockImplementationOnce(async () => ({ methodResponses: [['FileNode/set', { notCreated: { tag: { description: 'forbidden' } } }, 's0']] }));
    await expect(saveMailboxTag(client, 'm', 'project')).rejects.toThrow('forbidden');
  });
});
