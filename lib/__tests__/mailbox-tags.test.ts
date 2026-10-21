import { describe, it, expect, vi } from 'vitest';
import { loadMailboxMeta, saveMailboxMeta, parseMailboxMeta, parseMailboxAddresses, normalizeCompany, isMailboxTagFile, MAILBOX_TAG_FILE, MAILBOX_ADDRESS_FILE, type MailboxTagClient } from '../mailbox-tags';

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
  it('parses only known tags and a usable company', () => {
    expect(parseMailboxMeta('{"tag":"business"}')).toEqual({ tag: 'business' });
    expect(parseMailboxMeta('{"tag":"project","company":" Synapse "}')).toEqual({ tag: 'project', company: 'Synapse' });
    expect(parseMailboxMeta('{"company":"Synapse"}')).toEqual({ company: 'Synapse' });
    expect(parseMailboxMeta('{"tag":"other","company":42}')).toBeNull();
    expect(parseMailboxMeta('not json')).toBeNull();
  });

  it('tidies company names', () => {
    expect(normalizeCompany('  Acme   Group ')).toBe('Acme Group');
    expect(normalizeCompany('   ')).toBeUndefined();
    expect(normalizeCompany('x'.repeat(60))).toHaveLength(40);
  });

  it('treats only the root-level file as the tag file', () => {
    expect(isMailboxTagFile({ name: MAILBOX_TAG_FILE, parentId: null })).toBe(true);
    expect(isMailboxTagFile({ name: MAILBOX_TAG_FILE, parentId: 'folder' })).toBe(false);
    expect(isMailboxTagFile({ name: 'report.pdf', parentId: null })).toBe(false);
  });

  it('reads several accounts in one request and leaves empty ones out', async () => {
    const { client } = fakeServer({ m: '{"tag":"project","company":"Synapse"}', n: '{"tag":"business"}', o: '{"tag":"bogus"}' });
    const meta = await loadMailboxMeta(client, ['m', 'n', 'o', 'p']);
    expect(meta).toEqual({ m: { tag: 'project', company: 'Synapse' }, n: { tag: 'business' } });
    expect(client.filesRequest).toHaveBeenCalledTimes(1);
  });

  it('splits the lookup so no request exceeds the server call limit', async () => {
    const files = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`a${i}`, '{"tag":"project"}']));
    const { client } = fakeServer(files);
    client.getMaxCallsInRequest = () => 16;
    const meta = await loadMailboxMeta(client, Object.keys(files));
    expect(Object.keys(meta)).toHaveLength(9);
    const sizes = (client.filesRequest as ReturnType<typeof vi.fn>).mock.calls.map(([calls]) => calls.length);
    expect(sizes).toEqual([16, 2]);
  });

  it('creates the file for a first tag', async () => {
    const { client, sets } = fakeServer({});
    await saveMailboxMeta(client, 'm', { tag: 'business' });
    expect(sets).toHaveLength(1);
    const create = (sets[0][1].create as Record<string, Record<string, unknown>>).tag;
    expect(create).toMatchObject({ name: MAILBOX_TAG_FILE, parentId: null, blobId: 'up-{"tag":"business"}' });
  });

  it('replaces the content of an existing tag file', async () => {
    const { client, sets } = fakeServer({ m: '{"tag":"business"}' });
    await saveMailboxMeta(client, 'm', { tag: 'project' });
    expect(sets[0][1].update).toEqual({ n0: { blobId: 'up-{"tag":"project"}' } });
  });

  it('stores tag and company together', async () => {
    const { client, sets } = fakeServer({ m: '{"tag":"business"}' });
    await saveMailboxMeta(client, 'm', { tag: 'business', company: ' Synapse ' });
    expect(sets[0][1].update).toEqual({ n0: { blobId: 'up-{"tag":"business","company":"Synapse"}' } });
  });

  it('removes the file when the tag is cleared, and does nothing when there is none', async () => {
    const tagged = fakeServer({ m: '{"tag":"business"}' });
    await saveMailboxMeta(tagged.client, 'm', {});
    expect(tagged.sets[0][1].destroy).toEqual(['n0']);

    const untagged = fakeServer({});
    await saveMailboxMeta(untagged.client, 'm', { company: '  ' });
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
    await saveMailboxMeta(client, 'm', { tag: 'project' });
    expect(sets[0][1]).toMatchObject({ update: { n0: { blobId: 'up-{"tag":"project"}' } }, destroy: ['n9'] });
  });

  it('reports a refused save', async () => {
    const { client } = fakeServer({});
    (client.filesRequest as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({ methodResponses: [['FileNode/get', { list: [] }, 'g0']] }))
      .mockImplementationOnce(async () => ({ methodResponses: [['FileNode/set', { notCreated: { tag: { description: 'forbidden' } } }, 's0']] }));
    await expect(saveMailboxMeta(client, 'm', { tag: 'project' })).rejects.toThrow('forbidden');
  });

  it('reads the server-written addresses file, keeping only real addresses', () => {
    expect(parseMailboxAddresses('{"addresses":["Info@Shop.com","sales@shop.com","info@shop.com"],"catchAll":true}'))
      .toEqual({ addresses: ['info@shop.com', 'sales@shop.com'], catchAll: true });
    expect(parseMailboxAddresses('{"addresses":["not an address",42],"catchAll":true}')).toBeNull();
    expect(parseMailboxAddresses('{"addresses":["inbox@shop.com"]}')).toEqual({ addresses: ['inbox@shop.com'], catchAll: false });
    expect(parseMailboxAddresses('nope')).toBeNull();
  });

  it('hides both MailHub files at the root, and only there', () => {
    expect(isMailboxTagFile({ name: MAILBOX_ADDRESS_FILE, parentId: null })).toBe(true);
    expect(isMailboxTagFile({ name: MAILBOX_TAG_FILE, parentId: null })).toBe(true);
    expect(isMailboxTagFile({ name: MAILBOX_ADDRESS_FILE, parentId: 'folder' })).toBe(false);
  });
});
