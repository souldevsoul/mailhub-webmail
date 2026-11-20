import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// MailHub: a password account without 2FA is held on a setup screen until it
// turns 2FA on. A failed status check must never lock anyone out.

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }));

const { RequireTotpGate } = await import('../require-totp-gate');
const { useAuthStore } = await import('@/stores/auth-store');
const { useAccountSecurityStore } = await import('@/stores/account-security-store');

const client = { getUsername: () => 'new@pact.email' };

function setSecurity(overrides: Record<string, unknown>) {
  useAccountSecurityStore.setState({
    isStalwart: true,
    probe: vi.fn().mockResolvedValue(true),
    fetchAuthInfo: vi.fn().mockResolvedValue(undefined),
    enableTotp: vi.fn().mockResolvedValue(undefined),
    otpEnabled: false,
    isSaving: false,
    error: null,
    ...overrides,
  } as never);
}

describe('RequireTotpGate', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true, client, authMode: 'basic', logout: vi.fn() } as never);
    setSecurity({});
  });

  it('holds an account without 2FA on the setup screen with a QR code and key', async () => {
    render(<RequireTotpGate />);
    expect(await screen.findByTestId('totp-gate')).toBeInTheDocument();
    expect(await screen.findByTestId('totp-gate-qr')).toBeInTheDocument();
    expect(screen.getByTestId('totp-gate-key').textContent).toMatch(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/);
  });

  it('lets an account with 2FA through', async () => {
    setSecurity({ otpEnabled: true });
    render(<RequireTotpGate />);
    await waitFor(() => expect(useAccountSecurityStore.getState().fetchAuthInfo).toHaveBeenCalled());
    expect(screen.queryByTestId('totp-gate')).toBeNull();
  });

  it('never blocks when the status check fails', async () => {
    setSecurity({
      fetchAuthInfo: vi.fn().mockImplementation(async () => { useAccountSecurityStore.setState({ error: 'network down' } as never); }),
    });
    render(<RequireTotpGate />);
    await waitFor(() => expect(useAccountSecurityStore.getState().fetchAuthInfo).toHaveBeenCalled());
    expect(screen.queryByTestId('totp-gate')).toBeNull();
  });

  it('exempts OAuth sessions outside Lite', async () => {
    useAuthStore.setState({ authMode: 'oauth' } as never);
    render(<RequireTotpGate />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('totp-gate')).toBeNull();
  });

  it('does not apply to a signed-out visitor', () => {
    useAuthStore.setState({ isAuthenticated: false, client: null } as never);
    render(<RequireTotpGate />);
    expect(screen.queryByTestId('totp-gate')).toBeNull();
  });

  it('keeps the screen up and explains a wrong code without calling the server', async () => {
    render(<RequireTotpGate />);
    await screen.findByTestId('totp-gate');
    fireEvent.change(screen.getByTestId('totp-gate-code'), { target: { value: '000000' } });
    fireEvent.change(screen.getByTestId('totp-gate-password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByTestId('totp-gate-submit'));
    expect(await screen.findByTestId('totp-gate-error')).toBeInTheDocument();
    expect(useAccountSecurityStore.getState().enableTotp).not.toHaveBeenCalled();
    expect(screen.getByTestId('totp-gate')).toBeInTheDocument();
  });

  it('stays up when the server refuses the password', async () => {
    const enableTotp = vi.fn().mockImplementation(async () => {
      useAccountSecurityStore.setState({ error: 'Invalid password' } as never);
      throw new Error('Invalid password');
    });
    setSecurity({ enableTotp });
    render(<RequireTotpGate />);
    await screen.findByTestId('totp-gate');
    const key = screen.getByTestId('totp-gate-key').textContent!.replace(/\s/g, '');
    const OTPAuth = await import('otpauth');
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(key) }).generate();
    fireEvent.change(screen.getByTestId('totp-gate-code'), { target: { value: code } });
    fireEvent.change(screen.getByTestId('totp-gate-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('totp-gate-submit'));
    expect(await screen.findByText('Invalid password')).toBeInTheDocument();
    expect(enableTotp).toHaveBeenCalled();
    expect(screen.getByTestId('totp-gate')).toBeInTheDocument();
  });

  it('keeps the same secret when the app name arrives after the QR was shown', async () => {
    const { setupSecret } = await import('../require-totp-gate');
    const before = setupSecret('late@pact.email').base32;
    expect(setupSecret('late@pact.email').base32).toBe(before);
    expect(setupSecret('other@pact.email').base32).not.toBe(before);
  });

  it('shows the same key after the screen remounts', async () => {
    const first = render(<RequireTotpGate />);
    const key1 = (await screen.findByTestId('totp-gate-key')).textContent;
    first.unmount();
    render(<RequireTotpGate />);
    const key2 = (await screen.findByTestId('totp-gate-key')).textContent;
    expect(key2).toBe(key1);
  });

  it('checks the code by the server clock when this computer clock is off', async () => {
    const realNow = Date.now();
    const fetchMock = vi.fn().mockResolvedValue({ headers: new Headers({ date: new Date(realNow).toUTCString() }) });
    vi.stubGlobal('fetch', fetchMock);
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow - 5 * 60 * 1000); // computer 5 min slow
    try {
      render(<RequireTotpGate />);
      const key = (await screen.findByTestId('totp-gate-key')).textContent!.replace(/\s/g, '');
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const OTPAuth = await import('otpauth');
      const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(key) }).generate({ timestamp: realNow });
      fireEvent.change(screen.getByTestId('totp-gate-code'), { target: { value: code } });
      fireEvent.change(screen.getByTestId('totp-gate-password'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByTestId('totp-gate-submit'));
      await waitFor(() => expect(useAccountSecurityStore.getState().enableTotp).toHaveBeenCalled());
    } finally {
      nowSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
