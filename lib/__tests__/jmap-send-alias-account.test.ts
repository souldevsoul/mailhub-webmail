import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JMAPClient } from '../jmap/client';

// MailHub: a domain inbox's account is named inbox@<domain>, but people send as
// its alias info@<domain>. The sent copy must land in that inbox's Sent, not in
// the sender's personal one.

type MethodCall = [string, Record<string, unknown>, string];

const SUBMISSION = { 'urn:ietf:params:jmap:mail': {}, 'urn:ietf:params:jmap:submission': {} };

function createClient(): JMAPClient {
  const client = new JMAPClient('https://jmap.example.com', 'admin@example.com', 'pass');
  const accounts = {
    personal: { name: 'admin@example.com', isPersonal: true, accountCapabilities: SUBMISSION },
    shop: { name: 'inbox@shop.test', isPersonal: false, accountCapabilities: SUBMISSION },
    other: { name: 'inbox@other.test', isPersonal: false, accountCapabilities: SUBMISSION },
  };
  Object.assign(client, {
    apiUrl: 'https://jmap.example.com/api',
    accountId: 'personal',
    username: 'admin@example.com',
    accounts,
    session: {
      primaryAccounts: { 'urn:ietf:params:jmap:mail': 'personal', 'urn:ietf:params:jmap:submission': 'personal' },
      accounts,
    },
  });
  return client;
}

const IDENTITIES: Record<string, Array<{ id: string; email: string }>> = {
  personal: [{ id: 'p1', email: 'admin@example.com' }],
  shop: [{ id: 's1', email: 'info@shop.test' }, { id: 's2', email: 'inbox@shop.test' }],
  other: [{ id: 'o1', email: 'inbox@other.test' }],
};

/** Records the account of every Email/set and EmailSubmission/set. */
function mockServer() {
  const writes: Array<[string, unknown]> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { methodCalls } = JSON.parse((init as { body: string }).body) as { methodCalls: MethodCall[] };
    const methodResponses = methodCalls.map(([name, args, callId]) => {
      if (name === 'Mailbox/get') {
        return [name, { list: [{ id: 'mb-drafts', name: 'Drafts', role: 'drafts' }, { id: 'mb-sent', name: 'Sent', role: 'sent' }] }, callId];
      }
      if (name === 'Identity/get') return [name, { list: IDENTITIES[args.accountId as string] ?? [] }, callId];
      if (name === 'Email/set') {
        writes.push([name, args.accountId]);
        const created = Object.keys((args.create ?? {}) as object);
        return [name, { created: Object.fromEntries(created.map((id) => [id, { id: 'email-9' }])) }, callId];
      }
      if (name === 'EmailSubmission/set') {
        writes.push([name, args.accountId]);
        return [name, { created: { '1': { id: 'sub-1' } } }, callId];
      }
      return ['error', { type: 'unknownMethod' }, callId];
    });
    const payload = { methodResponses };
    return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(payload)), json: () => Promise.resolve(payload) } as Response;
  });
  return writes;
}

function send(client: JMAPClient, fromEmail: string) {
  return client.sendEmail(['rcpt@example.net'], 'Subject', 'body', undefined, undefined, undefined, fromEmail);
}

describe('JMAPClient.sendEmail account for an alias', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('files mail sent as a domain inbox alias in that inbox', async () => {
    const writes = mockServer();

    await send(createClient(), 'info@shop.test');

    expect(writes).toEqual([['Email/set', 'shop'], ['EmailSubmission/set', 'shop']]);
  });

  it('matches the alias case-insensitively', async () => {
    const writes = mockServer();

    await send(createClient(), 'Info@Shop.test');

    expect(writes.every(([, account]) => account === 'shop')).toBe(true);
  });

  it('keeps using the account named after the address', async () => {
    const writes = mockServer();

    await send(createClient(), 'inbox@other.test');

    expect(writes.every(([, account]) => account === 'other')).toBe(true);
  });

  it("falls back to the user's own account for an unknown address", async () => {
    const writes = mockServer();

    await send(createClient(), 'someone@nowhere.test');

    expect(writes.every(([, account]) => account === 'personal')).toBe(true);
  });
});
