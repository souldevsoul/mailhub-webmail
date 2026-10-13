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
});
