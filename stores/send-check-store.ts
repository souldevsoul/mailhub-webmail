import { create } from 'zustand';

/** What the send check shows: who sends, to whom, and where the user is working. */
export interface SendCheckRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  /** An address of the inbox the message was started in or replies from, if known. */
  contextAddress?: string | null;
}

interface PendingCheck extends SendCheckRequest {
  resolve: (confirmed: boolean) => void;
}

interface SendCheckState {
  pending: PendingCheck | null;
  /** Shows the check; resolves true when the user confirms, false when they go back. */
  ask: (request: SendCheckRequest) => Promise<boolean>;
  answer: (confirmed: boolean) => void;
}

/** MailHub: the "check before sending" dialog every send path waits on. */
export const useSendCheckStore = create<SendCheckState>()((set, get) => ({
  pending: null,
  ask: (request) =>
    new Promise<boolean>((resolve) => {
      // A second Send while the dialog is open replaces the first request.
      get().pending?.resolve(false);
      set({ pending: { ...request, resolve } });
    }),
  answer: (confirmed) => {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(confirmed);
  },
}));
