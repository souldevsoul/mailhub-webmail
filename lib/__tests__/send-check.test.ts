import { describe, expect, it } from 'vitest';
import {
  describeAddress,
  findInboxAccount,
  formatToday,
  mainAddressOf,
  matchesAddress,
  matchesToday,
  sameCompany,
  type InboxDirectory,
} from '@/lib/send-check';

const directory: InboxDirectory = {
  tags: { ts: 'project', vg: 'project', tx: 'business' },
  companies: { ts: 'Synapse Ltd', vg: 'Synapse Ltd' },
  addresses: {
    ts: { addresses: ['info@tastesparks.io', 'b2b@tastesparks.io', 'inbox@tastesparks.io'], catchAll: true },
    vg: { addresses: ['info@vidigo.online', 'inbox@vidigo.online'], catchAll: true },
    tx: { addresses: ['info@traffixora.com', 'inbox@traffixora.com'], catchAll: true },
  },
};

describe('findInboxAccount', () => {
  it('finds the inbox that lists the address, ignoring case', () => {
    expect(findInboxAccount(' B2B@TasteSparks.io ', directory)).toBe('ts');
  });
  it('falls back to the inbox of the same domain for catch-all addresses', () => {
    expect(findInboxAccount('sales@traffixora.com', directory)).toBe('tx');
  });
  it('returns null for a personal login address', () => {
    expect(findInboxAccount('admin2@pact.email', directory)).toBeNull();
    expect(findInboxAccount('', directory)).toBeNull();
  });
});

describe('describeAddress / mainAddressOf', () => {
  it('gives the inbox main address, company and tag', () => {
    expect(describeAddress('inbox@tastesparks.io', directory)).toEqual({
      accountId: 'ts', mainAddress: 'info@tastesparks.io', domain: 'tastesparks.io', company: 'Synapse Ltd', tag: 'project',
    });
    expect(mainAddressOf('inbox@vidigo.online', directory)).toBe('info@vidigo.online');
  });
  it('describes a non-inbox address as itself', () => {
    expect(describeAddress('admin2@pact.email', directory)).toEqual({ accountId: null, mainAddress: 'admin2@pact.email', domain: 'pact.email' });
    expect(mainAddressOf('admin2@pact.email', directory)).toBeNull();
  });
});

describe('sameCompany', () => {
  const ts = describeAddress('info@tastesparks.io', directory);
  const vg = describeAddress('info@vidigo.online', directory);
  const tx = describeAddress('info@traffixora.com', directory);
  const personal = describeAddress('admin2@pact.email', directory);
  it('matches the same inbox and inboxes of the same company', () => {
    expect(sameCompany(ts, ts)).toBe(true);
    expect(sameCompany(ts, vg)).toBe(true);
  });
  it('flags another company and a personal sender in a company inbox', () => {
    expect(sameCompany(tx, ts)).toBe(false);
    expect(sameCompany(personal, ts)).toBe(false);
  });
  it('has nothing to compare without a known context', () => {
    expect(sameCompany(tx, null)).toBe(true);
    expect(sameCompany(tx, personal)).toBe(true);
  });
});

describe('matchesToday', () => {
  const now = new Date(2026, 10, 6, 14, 30);
  it('accepts the usual ways to type today', () => {
    for (const t of ['06.11.2026', '6.11.2026', '06/11/2026', '6-11-2026', '2026-11-06', ' 2026-11-6 ']) {
      expect(matchesToday(t, now), t).toBe(true);
    }
  });
  it('rejects other dates and month-first or partial input', () => {
    for (const t of ['05.11.2026', '11/06/2026', '06.11', '06.11.26', 'today', '']) {
      expect(matchesToday(t, now), t).toBe(false);
    }
  });
  it('shows today as DD.MM.YYYY', () => {
    expect(formatToday(now)).toBe('06.11.2026');
  });
});

describe('matchesAddress', () => {
  it('compares addresses without case or surrounding spaces', () => {
    expect(matchesAddress(' Info@TasteSparks.io', 'info@tastesparks.io')).toBe(true);
    expect(matchesAddress('info@tastesparks.com', 'info@tastesparks.io')).toBe(false);
    expect(matchesAddress('', '')).toBe(false);
  });
});
