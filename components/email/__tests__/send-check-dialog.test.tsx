import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { SendCheckDialog } from '../send-check-dialog';
import { useSendCheckStore, type SendCheckRequest } from '@/stores/send-check-store';
import { useMailboxTagStore } from '@/stores/mailbox-tag-store';
import { useAccountStore } from '@/stores/account-store';
import { formatToday } from '@/lib/send-check';

type Ask = (request: SendCheckRequest) => Promise<boolean>;

const ask = (request: SendCheckRequest) => {
  let result: Promise<boolean> = Promise.resolve(false);
  act(() => {
    result = useSendCheckStore.getState().ask(request);
  });
  return result;
};

const dateInput = () => screen.getByTestId('send-check-date') as HTMLInputElement;
const fromInput = () => screen.getByTestId('send-check-from-input') as HTMLInputElement;
const confirmButton = () => screen.getByTestId('send-check-confirm') as HTMLButtonElement;

describe('send check dialog (MailHub)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 6, 10, 0));
    // The test setup confirms every check at once; this suite needs the real one.
    useSendCheckStore.setState({ pending: null, ask: (globalThis as { realSendCheckAsk?: Ask }).realSendCheckAsk! });
    useMailboxTagStore.setState({
      tags: { ts: 'project', tx: 'business' },
      companies: { ts: 'Synapse Ltd' },
      addresses: {
        ts: { addresses: ['info@tastesparks.io', 'inbox@tastesparks.io'], catchAll: true },
        tx: { addresses: ['info@traffixora.com', 'inbox@traffixora.com'], catchAll: true },
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the company, tag, From and recipients, and sends only after date and From are typed', async () => {
    render(<SendCheckDialog />);
    const result = ask({ from: 'info@tastesparks.io', to: ['client@example.com'], subject: 'Offer', contextAddress: 'inbox@tastesparks.io' });

    expect(screen.getByText('Synapse Ltd')).toBeInTheDocument();
    expect(screen.getByText('tag_project')).toBeInTheDocument();
    expect(screen.getByTestId('send-check-from')).toHaveTextContent('info@tastesparks.io');
    expect(screen.getByText('client@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(dateInput(), { target: { value: '05.11.2026' } });
    fireEvent.change(fromInput(), { target: { value: 'info@tastesparks.io' } });
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(dateInput(), { target: { value: formatToday() } });
    expect(confirmButton()).toBeEnabled();

    fireEvent.click(confirmButton());
    await expect(result).resolves.toBe(true);
    expect(screen.queryByTestId('send-check-dialog')).toBeNull();
  });

  it('warns in red when the From is another company than the inbox being worked in', () => {
    render(<SendCheckDialog />);
    ask({ from: 'info@traffixora.com', to: ['client@example.com'], contextAddress: 'inbox@tastesparks.io' });

    expect(screen.getByRole('alert')).toHaveTextContent('mismatch');
  });

  it('warns when the From is no company inbox at all', () => {
    render(<SendCheckDialog />);
    ask({ from: 'admin2@pact.email', to: ['client@example.com'] });

    expect(screen.getByRole('alert')).toHaveTextContent('not_company_inbox');
  });

  it('a personal login on the same domain as a company inbox is still personal, and flagged', () => {
    useAccountStore.setState({ accounts: [{ id: 'a1', email: 'sales@traffixora.com' }] as never });
    render(<SendCheckDialog />);
    ask({ from: 'sales@traffixora.com', to: ['client@example.com'], contextAddress: 'inbox@traffixora.com' });

    expect(screen.getByRole('alert')).toHaveTextContent('mismatch');
    useAccountStore.setState({ accounts: [] });
  });

  it('going back resolves false, and the next check starts empty', async () => {
    render(<SendCheckDialog />);
    const first = ask({ from: 'info@tastesparks.io', to: ['a@example.com'] });
    fireEvent.change(dateInput(), { target: { value: formatToday() } });
    fireEvent.click(screen.getByText('back'));
    await expect(first).resolves.toBe(false);

    ask({ from: 'info@tastesparks.io', to: ['a@example.com'] });
    expect(dateInput().value).toBe('');
    expect(fromInput().value).toBe('');
  });

  it('does not take a pasted From address', () => {
    render(<SendCheckDialog />);
    ask({ from: 'info@tastesparks.io', to: ['a@example.com'] });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    fromInput().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
