import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { EmailComposer } from '../email-composer';
import { useSendCheckStore, type SendCheckRequest } from '@/stores/send-check-store';
import { useMailboxTagStore } from '@/stores/mailbox-tag-store';

// ─── Heavy component mocks (mirrors reply-addressing.test.tsx) ────────────────

const editorKeyDown = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/components/email/rich-text-editor', () => ({
  RichTextEditor: () => React.createElement('div', {
    'data-testid': 'rich-text-editor',
    onKeyDown: (event: React.KeyboardEvent) => {
      if (!event.defaultPrevented) editorKeyDown();
    },
  }),
}));

vi.mock('@/components/plugins/plugin-slot', () => ({ PluginSlot: () => null }));
vi.mock('@/components/ui/avatar', () => ({ Avatar: () => null }));
vi.mock('@/components/identity/sub-address-helper', () => ({ SubAddressHelper: () => null }));
vi.mock('@/components/templates/template-picker', () => ({ TemplatePicker: () => null }));
vi.mock('@/components/templates/template-form', () => ({ TemplateForm: () => null }));
vi.mock('@/components/files/file-preview-modal', () => ({ FilePreviewModal: () => null }));
vi.mock('@/hooks/use-focus-trap', () => ({
  useFocusTrap: () => ({ current: null }),
}));
vi.mock('@/hooks/use-pro-multi-account-identities', () => ({
  useProMultiAccountIdentities: () => ({ enabled: false, groups: [], allIdentities: [] }),
  stripCrossAccountIdentityPrefix: (id: string) => ({ localAccountId: null, rawId: id }),
}));

// ─── Store mocks ──────────────────────────────────────────────────────────────

vi.mock('@/stores/auth-store', () => {
  const state = {
    client: null,
    identities: [],
    primaryIdentity: null,
    isAuthenticated: false,
    isDemoMode: false,
    activeAccountId: null,
    connectionLost: false,
    getClientForAccount: () => undefined,
    getAllConnectedClients: () => new Map(),
    syncIdentities: () => {},
    refreshIdentities: async () => {},
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useAuthStore: hook };
});

vi.mock('@/stores/identity-store', () => {
  const state = {
    identities: [
      { id: 'id-me', email: 'admin2@pact.email', name: 'Me' },
      { id: 'id-ts-inbox', email: 'inbox@tastesparks.io', name: 'inbox@tastesparks.io' },
      { id: 'id-ts-info', email: 'info@tastesparks.io', name: 'info@tastesparks.io' },
      { id: 'id-tx-info', email: 'info@traffixora.com', name: 'info@traffixora.com' },
    ],
    defaultIdentityId: 'id-me',
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useIdentityStore: hook };
});

vi.mock('@/stores/account-store', () => {
  const state = { accounts: [], getAccountById: () => undefined };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useAccountStore: hook };
});

vi.mock('@/stores/email-store', () => {
  const state = {
    draftSaveEnabled: false,
    sendRawEmail: async () => ({ sent: true }),
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useEmailStore: hook };
});

const updateSetting = vi.fn();

vi.mock('@/stores/settings-store', () => {
  const state = {
    timeFormat: '24h',
    plainTextMode: false,
    subAddressDelimiter: '+',
    autoSelectReplyIdentity: true,
    attachmentReminderEnabled: false,
    attachmentReminderKeywords: [],
    emptySubjectWarningEnabled: true,
    sendDelaySeconds: 0,
    signaturePosition: 'above_quote',
    signatureSeparatorEnabled: false,
    requestReadReceiptDefault: false,
    addTrustedSender: () => {},
    trustedSendersAddressBook: null,
    updateSetting: (...args: unknown[]) => updateSetting(...args),
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useSettingsStore: hook };
});

vi.mock('@/stores/contact-store', () => {
  const state = {
    contacts: [],
    getAutocomplete: async () => [],
    addToTrustedSendersBook: async () => {},
  };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useContactStore: hook };
});

vi.mock('@/stores/template-store', () => {
  const state = { templates: [], addTemplate: async () => {} };
  const hook = (sel?: (s: typeof state) => unknown) =>
    typeof sel === 'function' ? sel(state) : state;
  hook.getState = () => state;
  hook.setState = (p: Partial<typeof state>) => Object.assign(state, p);
  return { useTemplateStore: hook };
});

// ─── Misc dependency mocks ────────────────────────────────────────────────────

vi.mock('@/stores/toast-store', () => ({
  toast: { info: () => {}, error: toastError, success: () => {} },
}));

vi.mock('@/lib/plugin-hooks', () => ({
  emailHooks: {
    onComposerOpen: { call: async () => [] },
    onRecipientChange: { call: async () => [] },
    getRecipientSuggestions: { call: async () => [] },
    onRecipientChipsChange: { transform: async (chips: unknown) => chips },
    onDraftChange: { emit: () => {} },
    onBeforeDraftAutoSave: { transform: async (draft: unknown) => draft },
    onBeforeEmailSend: { intercept: async () => true },
    onComposeSend: { takeOver: async () => 'default' },
    onTransformOutgoingEmail: { transform: async (email: unknown) => email },
  },
  contactHooks: {
    search: { call: async () => [] },
    onProvideRecipientSuggestions: { transform: async (initial: unknown) => initial },
  },
}));

vi.mock('@/lib/email-sanitization', () => ({
  sanitizeSignatureHtml: (v: string) => v,
  sanitizeEmailHtml: (v: string) => v,
  parseHtmlSafely: (html: string) => new DOMParser().parseFromString(html, 'text/html'),
}));

vi.mock('@/lib/email-threading', () => ({
  computeReplyThreadingHeaders: () => ({ inReplyTo: [], references: [] }),
}));
vi.mock('@/lib/signature-utils', () => ({
  appendPlainTextSignature: (body: string) => body,
  getPlainTextSignature: () => '',
}));
vi.mock('@/lib/sub-addressing', () => ({ generateSubAddress: () => '' }));
vi.mock('@/lib/debug', () => ({ debug: { log: () => {}, warn: () => {}, error: () => {} } }));
vi.mock('@/components/email/quoted-html', () => ({
  buildQuotedHtmlBlock: () => '',
  serializeEditorContent: () => '',
}));
vi.mock('@/lib/template-utils', () => ({ substitutePlaceholders: (s: string) => s }));

// ─── Tests ────────────────────────────────────────────────────────────────────

const DRAFT = {
  to: 'client@example.com',
  cc: '',
  bcc: '',
  subject: 'Offer',
  body: '<p>Hello there</p>',
  showCc: false,
  showBcc: false,
  selectedIdentityId: null,
  subAddressTag: '',
  mode: 'compose' as const,
  draftId: null,
};

const sendButton = () => screen.getAllByTestId('composer-send')[0] as HTMLButtonElement;

describe('composer: send from the inbox being worked in, after the check (MailHub)', () => {
  let asked: SendCheckRequest[];
  let answer: boolean;

  beforeEach(() => {
    asked = [];
    answer = true;
    useSendCheckStore.setState({ ask: async (request) => { asked.push(request); return answer; } });
    useMailboxTagStore.setState({
      tags: { ts: 'project', tx: 'business' },
      companies: { ts: 'Synapse Ltd' },
      addresses: {
        ts: { addresses: ['info@tastesparks.io', 'b2b@tastesparks.io', 'inbox@tastesparks.io'], catchAll: true },
        tx: { addresses: ['info@traffixora.com', 'inbox@traffixora.com'], catchAll: true },
      },
    });
  });

  it('a new message started in a domain inbox goes out as its main address, after the check', async () => {
    const onSend = vi.fn();
    render(<EmailComposer initialData={DRAFT} composeFromAccountEmail="inbox@tastesparks.io" onSend={onSend} />);

    fireEvent.click(sendButton());

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({
      from: 'info@tastesparks.io',
      to: ['client@example.com'],
      subject: 'Offer',
      contextAddress: 'inbox@tastesparks.io',
    });
    expect(onSend.mock.calls[0][0].fromEmail).toBe('info@tastesparks.io');
  });

  it('does not send when the user goes back from the check', async () => {
    answer = false;
    const onSend = vi.fn();
    render(<EmailComposer initialData={DRAFT} composeFromAccountEmail="inbox@tastesparks.io" onSend={onSend} />);

    fireEvent.click(sendButton());
    await waitFor(() => expect(asked).toHaveLength(1));
    await act(async () => {});

    expect(onSend).not.toHaveBeenCalled();
  });

  it('a chosen From of another company still reaches the check with the inbox it was started in', async () => {
    const onSend = vi.fn();
    render(
      <EmailComposer
        initialData={{ ...DRAFT, selectedIdentityId: 'id-tx-info' }}
        composeFromAccountEmail="inbox@tastesparks.io"
        onSend={onSend}
      />,
    );

    fireEvent.click(sendButton());

    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0]).toMatchObject({ from: 'info@traffixora.com', contextAddress: 'inbox@tastesparks.io' });
  });
});
