import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Sparkles, AlertCircle, RefreshCw, ArrowLeft, CheckCircle2 } from 'lucide-react';

// Helper to mask email like a***@domain.com
function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}***@${domain}`;
}

export const OtpVerificationPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyOtp, resendOtp } = useAuth();
  const { showToast } = useToast();

  // Expect email passed via location state
  const stateEmail = (location.state as any)?.email as string | undefined;
  const isLoginFlow = Boolean((location.state as any)?.isLoginFlow);

  const [email, setEmail] = useState<string>(stateEmail || '');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(30);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Guard: if email missing from state, allow user to input or return to login
  useEffect(() => {
    if (!stateEmail) {
      const storedPendingEmail = sessionStorage.getItem('splitmate_pending_email');
      if (storedPendingEmail) {
        setEmail(storedPendingEmail);
      }
    } else {
      sessionStorage.setItem('splitmate_pending_email', stateEmail);
    }
  }, [stateEmail]);

  // Focus the first input on initial mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  // Countdown timer for resend button
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    // Only accept numeric digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError(null);

    // Auto-advance to next input if digit entered
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // Move to previous and clear it
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedText.length > 0) {
      const digits = pastedText.split('');
      const newOtp = [...otp];
      for (let i = 0; i < 6; i++) {
        newOtp[i] = digits[i] || '';
      }
      setOtp(newOtp);
      setError(null);
      // Focus on the next empty or the last filled
      const focusIndex = Math.min(digits.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetEmail = email.trim();
    if (!targetEmail) {
      setError('Please provide the email address you registered with.');
      return;
    }

    const token = otp.join('').trim();
    if (token.length !== 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    try {
      setSubmitting(true);
      await verifyOtp(targetEmail, token);
      sessionStorage.removeItem('splitmate_pending_email');
      showToast('Email verified successfully! Welcome to SplitMate.', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      console.error('OTP verification failed:', err);
      const code = err.message;
      let msg = 'Verification failed. Please try again.';
      if (code === 'INVALID_OTP' || err.message?.toLowerCase().includes('invalid')) {
        msg = 'Incorrect verification code. Please check and try again.';
      } else if (code === 'EXPIRED_OTP' || err.message?.toLowerCase().includes('expired')) {
        msg = 'This code has expired. Please request a new one below.';
      } else if (code === 'RATE_LIMIT' || err.message?.toLowerCase().includes('rate')) {
        msg = 'Too many attempts. Please wait a minute before trying again.';
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    const targetEmail = email.trim();
    if (!targetEmail) {
      setError('Please provide your email address to resend the code.');
      return;
    }

    try {
      setResending(true);
      setError(null);
      await resendOtp(targetEmail);
      showToast('A fresh verification code has been dispatched to your email.', 'success');
      setResendCooldown(60);
    } catch (err: any) {
      console.error('Resend OTP error:', err);
      const code = err.message;
      let msg = 'Failed to resend code. Please try again later.';
      if (code === 'RATE_LIMIT' || err.message?.toLowerCase().includes('rate')) {
        msg = 'For security purposes, please wait 60 seconds before requesting another code.';
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-fintech-bg flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 mb-6 group">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-royal to-royal-light flex items-center justify-center shadow-lg shadow-royal/30 group-hover:scale-105 transition-transform">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-navy">
            Split<span className="text-royal">Mate</span>
          </span>
        </Link>
        <h2 className="text-2xl font-bold tracking-tight text-navy">
          Verify your email address
        </h2>
        <p className="mt-2 text-xs text-text-secondary">
          {isLoginFlow ? (
            email ? (
              <>Your account is pending verification. Please enter the 6-digit code sent to <span className="font-semibold text-navy">{maskEmail(email)}</span>.</>
            ) : (
              'Your account is pending verification. Please enter the 6-digit code sent to your email.'
            )
          ) : email ? (
            <>We've dispatched a 6-digit confirmation code to <span className="font-semibold text-navy">{maskEmail(email)}</span>.</>
          ) : (
            'Enter the 6-digit confirmation code sent to your email.'
          )}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card-fintech shadow-fintech-lg">
          {error && (
            <div className="mb-6 flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm leading-relaxed">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!stateEmail && !email && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-navy uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input-fintech w-full"
                required
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-navy uppercase tracking-wider mb-3 text-center">
                6-Digit Security Code
              </label>
              <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    disabled={submitting}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-2xl font-bold font-mono text-navy bg-slate-50 border-2 border-slate-200 rounded-xl focus:bg-white focus:border-royal focus:ring-4 focus:ring-royal/10 focus:outline-none transition-all disabled:opacity-50"
                    autoComplete="one-time-code"
                    required
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || otp.join('').length !== 6}
              className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-royal/20"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm & Continue</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending || submitting}
              className="text-xs font-semibold text-royal hover:text-royal-dark disabled:text-text-muted flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              {resending
                ? 'Sending fresh code...'
                : resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : 'Didn’t receive the code? Resend'}
            </button>

            <Link
              to="/login"
              className="text-xs text-text-secondary hover:text-navy inline-flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
