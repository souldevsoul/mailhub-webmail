import { describe, it, expect } from 'vitest';
import { senderDisplayName } from '../jmap/client';

// MailHub: recipients see the sending address as the name, never the login of
// the person who sent it.

describe('senderDisplayName', () => {
  it('replaces a login address with the From address', () => {
    expect(senderDisplayName('admin2@hub.test', 'info@shop.test')).toBe('info@shop.test');
  });

  it('uses the From address when there is no name', () => {
    expect(senderDisplayName(undefined, 'info@shop.test')).toBe('info@shop.test');
    expect(senderDisplayName('  ', 'info@shop.test')).toBe('info@shop.test');
  });

  it('keeps the From address when it is already the name, in any case', () => {
    expect(senderDisplayName('Info@Shop.test', 'info@shop.test')).toBe('Info@Shop.test');
  });

  it('keeps a real name', () => {
    expect(senderDisplayName('Shop Support', 'info@shop.test')).toBe('Shop Support');
  });
});
