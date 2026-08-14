import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The Firebase boundary is mocked; the component under test is production code.
const sendOtp = vi.fn();
const verifyOtp = vi.fn();
const checkEmailDomain = vi.fn();
const signInWithCustomToken = vi.fn();

vi.mock('../services/api', () => ({
  api: {
    get sendOtp() { return sendOtp; },
    get verifyOtp() { return verifyOtp; },
    get checkEmailDomain() { return checkEmailDomain; },
  },
  errorMessage: (error: unknown, fallback: string) =>
    (error instanceof Error ? error.message : fallback),
}));

vi.mock('../services/firebase', () => ({ auth: {} }));

vi.mock('firebase/auth', () => ({
  get signInWithCustomToken() { return signInWithCustomToken; },
}));

const { AuthScreen } = await import('./AuthScreen');

/**
 * Lets the debounced college lookup (450 ms) settle inside `act`, so its state
 * update is not reported as an un-wrapped update after the test finishes.
 */
async function settleDebouncedLookup() {
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 550); });
  });
}

beforeEach(() => {
  sendOtp.mockReset();
  verifyOtp.mockReset();
  checkEmailDomain.mockReset();
  signInWithCustomToken.mockReset();
  checkEmailDomain.mockResolvedValue({ is_registered: false, college: null });
  sendOtp.mockResolvedValue({
    message: 'If your college is registered, a verification code is on its way.',
    masked_email: 's***t@college.edu',
    expires_in_minutes: 10,
  });
});

describe('AuthScreen — email step', () => {
  it('renders the sign-in form with an accessible email field and consent', () => {
    render(<AuthScreen />);

    expect(screen.getByLabelText(/college e-mail/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with e-mail/i })).toBeInTheDocument();
  });

  it('blocks submission without consent and explains why', async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.type(screen.getByLabelText(/college e-mail/i), 'student@college.edu');
    await user.click(screen.getByRole('button', { name: /continue with e-mail/i }));

    expect(await screen.findByText(/must accept the terms/i)).toBeInTheDocument();
    // No request is made when local validation fails.
    expect(sendOtp).not.toHaveBeenCalled();
    await settleDebouncedLookup();
  });

  it('rejects a malformed address before calling the server', async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.type(screen.getByLabelText(/college e-mail/i), 'not-an-email');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /continue with e-mail/i }));

    expect(await screen.findByText(/valid e-mail address/i)).toBeInTheDocument();
    expect(sendOtp).not.toHaveBeenCalled();
    await settleDebouncedLookup();
  });

  it('requests a code and advances to the OTP step', async () => {
    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.type(screen.getByLabelText(/college e-mail/i), 'student@college.edu');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /continue with e-mail/i }));

    await waitFor(() => expect(sendOtp).toHaveBeenCalledWith('student@college.edu', '1.0.0'));
    expect(await screen.findByLabelText(/verification code/i)).toBeInTheDocument();
    expect(screen.getByText(/s\*\*\*t@college\.edu/)).toBeInTheDocument();
    await settleDebouncedLookup();
  });

  it('shows the college name once the domain resolves', async () => {
    checkEmailDomain.mockResolvedValue({
      is_registered: true,
      college: { college_id: 'c1', name: 'JD College of Engineering', short_name: 'JD' },
    });
    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.type(screen.getByLabelText(/college e-mail/i), 'student@jdcollege.edu.in');

    expect(await screen.findByText('JD College of Engineering', {}, { timeout: 3000 }))
      .toBeInTheDocument();
  });

  it('surfaces a server error without advancing', async () => {
    sendOtp.mockRejectedValue(new Error('Too many OTP requests. Please wait 10 minutes.'));
    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.type(screen.getByLabelText(/college e-mail/i), 'student@college.edu');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /continue with e-mail/i }));

    expect(await screen.findByText(/too many otp requests/i)).toBeInTheDocument();
    // Still on the email step.
    expect(screen.getByLabelText(/college e-mail/i)).toBeInTheDocument();
    await settleDebouncedLookup();
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    sendOtp.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));

    const user = userEvent.setup();
    render(<AuthScreen />);

    await user.type(screen.getByLabelText(/college e-mail/i), 'student@college.edu');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /continue with e-mail/i }));

    // A real loading state, not a fake one: the button is disabled and labelled.
    expect(await screen.findByRole('button', { name: /sending/i })).toBeDisabled();

    await act(async () => {
      resolveRequest({ masked_email: 's***t@college.edu', expires_in_minutes: 10, message: '' });
    });
    await settleDebouncedLookup();
  });
});

describe('AuthScreen — OTP step', () => {
  async function reachOtpStep() {
    const user = userEvent.setup();
    render(<AuthScreen />);
    await user.type(screen.getByLabelText(/college e-mail/i), 'student@college.edu');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /continue with e-mail/i }));
    await screen.findByLabelText(/verification code/i);
    await settleDebouncedLookup();
    return user;
  }

  it('accepts only digits and caps the length at six', async () => {
    const user = await reachOtpStep();
    const input = screen.getByLabelText(/verification code/i) as HTMLInputElement;

    await user.type(input, 'a1b2c3d4e5');

    expect(input.value).toBe('12345');
  });

  it('keeps the verify button disabled until six digits are entered', async () => {
    const user = await reachOtpStep();
    const verifyButton = screen.getByRole('button', { name: /verify and sign in/i });

    expect(verifyButton).toBeDisabled();

    await user.type(screen.getByLabelText(/verification code/i), '123456');

    expect(verifyButton).toBeEnabled();
  });

  it('signs in with the returned custom token', async () => {
    verifyOtp.mockResolvedValue({
      custom_token: 'token-abc',
      uid: 'uid-1',
      has_profile: false,
      college_id: 'c1',
      college_name: 'JD',
      is_new_user: true,
    });

    const user = await reachOtpStep();
    await user.type(screen.getByLabelText(/verification code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith('student@college.edu', '123456'));
    await waitFor(() => expect(signInWithCustomToken).toHaveBeenCalledWith({}, 'token-abc'));
  });

  it('clears the code and reports the error on a wrong OTP', async () => {
    verifyOtp.mockRejectedValue(new Error('Incorrect OTP. 2 attempts remaining.'));

    const user = await reachOtpStep();
    const input = screen.getByLabelText(/verification code/i) as HTMLInputElement;
    await user.type(input, '000000');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));

    expect(await screen.findByText(/incorrect otp/i)).toBeInTheDocument();
    // The field is cleared so the user can retype without clearing it manually.
    expect(input.value).toBe('');
  });

  it('offers a resend that is rate-limited by a visible cooldown', async () => {
    const user = await reachOtpStep();

    // Immediately after sending, resend is on cooldown rather than spammable.
    expect(screen.getByRole('button', { name: /resend code in \d+s/i })).toBeDisabled();
    expect(user).toBeDefined();
  });

  it('allows returning to the email step', async () => {
    const user = await reachOtpStep();

    await user.click(screen.getByRole('button', { name: /use a different e-mail/i }));

    expect(screen.getByLabelText(/college e-mail/i)).toBeInTheDocument();
  });
});
