// ─── Pi Network Payment Integration ───────────────────────────────────────────
//
// App ID  → Pi Developer Portal only (develop.pi). Linked to your domain.
// API Key → Vercel env var PI_API_KEY (server-side in /api/payments/*). NEVER in this file.

const PI_SCOPES = ['payments', 'username'];
const TEST_PAYMENT_AMOUNT = 1.0;

let piUser = null;
let piReady = false;

const payTestBtn = document.getElementById('pi-pay-test-btn');
const claimBtn = document.getElementById('submit-btn');
const payStatusEl = document.getElementById('pi-payment-status');
const payStatusTextEl = document.getElementById('pi-payment-status-text');
const piUserBadgeEl = document.getElementById('pi-user-badge');
const userNameInput = document.getElementById('user-name');

function isPiBrowser() {
  return typeof window.Pi !== 'undefined';
}

function isPiSandboxHost() {
  return window.location.hostname.includes('sandbox.minepi.com');
}

function setPaymentStatus(type, message) {
  if (!payStatusEl || !payStatusTextEl) return;

  const styles = {
    idle: 'border-purple-500/30 bg-pi-dark/50 text-purple-300',
    loading: 'border-pi-purple/50 bg-pi-purple/10 text-purple-200',
    success: 'border-green-500/40 bg-green-500/10 text-green-400',
    error: 'border-red-500/40 bg-red-500/10 text-red-400',
    warning: 'border-pi-gold/40 bg-pi-gold/10 text-pi-gold',
  };

  payStatusEl.className = `rounded-xl px-4 py-3 text-sm border transition-all ${styles[type] || styles.idle}`;
  payStatusTextEl.textContent = message;
  payStatusEl.classList.remove('hidden');
}

function setPiButtonsEnabled(enabled) {
  if (payTestBtn) payTestBtn.disabled = !enabled;
  if (claimBtn) claimBtn.disabled = !enabled;
}

function showPiUser(user) {
  if (!user?.username) return;
  if (piUserBadgeEl) {
    piUserBadgeEl.textContent = `@${user.username}`;
    piUserBadgeEl.classList.remove('hidden');
  }
  if (userNameInput && !userNameInput.value.trim()) {
    userNameInput.value = user.username;
  }
}

async function callBackend(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Backend error ${response.status}`);
  }

  return response.json();
}

async function approvePaymentOnServer(paymentId) {
  return callBackend('/api/payments/approve', { paymentId });
}

async function completePaymentOnServer(paymentId, txid) {
  return callBackend('/api/payments/complete', { paymentId, txid });
}

function handleIncompletePayment(payment) {
  setPaymentStatus('warning', 'Incomplete payment found — completing previous transaction…');

  if (!payment?.identifier) return;

  const txid = payment.transaction?.txid;
  if (txid) {
    completePaymentOnServer(payment.identifier, txid)
      .then(() => setPaymentStatus('success', 'Previous payment completed successfully.'))
      .catch((err) => setPaymentStatus('error', err.message));
  }
}

async function authenticatePiUser() {
  if (!isPiBrowser()) {
    throw new Error('Open this app in Pi Browser to pay with Test-Pi.');
  }

  setPaymentStatus('loading', 'Authenticating with Pi Network…');

  const auth = await window.Pi.authenticate(PI_SCOPES, handleIncompletePayment);
  piUser = auth.user;
  showPiUser(auth.user);
  setPaymentStatus('idle', 'Authenticated. Ready for payments.');
  return auth;
}

async function initializePiSDK() {
  if (!isPiBrowser()) {
    setPaymentStatus('warning', 'Pi SDK not detected — open this app inside Pi Browser.');
    setPiButtonsEnabled(false);
    return;
  }

  try {
    await window.Pi.init({
      version: '2.0',
      sandbox: isPiSandboxHost(),
    });
    piReady = true;
    setPaymentStatus('loading', 'Pi SDK ready. Authenticating…');
    await authenticatePiUser();
    setPiButtonsEnabled(true);
  } catch (error) {
    setPaymentStatus('error', `Pi init failed: ${error.message}`);
    setPiButtonsEnabled(false);
  }
}

/**
 * Generic Pi payment flow — same approve/complete pipeline for all payments.
 * @returns {Promise<{ paymentId: string, txid: string, amount: number }>}
 */
function createPiPayment({ amount, memo, metadata }) {
  if (!piReady || !isPiBrowser()) {
    return Promise.reject(new Error('Pi SDK is not ready. Use Pi Browser.'));
  }

  return new Promise((resolve, reject) => {
    const paymentData = { amount, memo, metadata };

    const callbacks = {
      onReadyForServerApproval: async (paymentId) => {
        setPaymentStatus('loading', `Payment ready (${paymentId.slice(0, 8)}…). Approving on server…`);
        try {
          await approvePaymentOnServer(paymentId);
          setPaymentStatus('loading', `Approved ${amount} Test-Pi. Confirm in Pi Wallet…`);
        } catch (error) {
          setPaymentStatus('error', `Approval failed: ${error.message}`);
          reject(error);
        }
      },

      onReadyForServerCompletion: async (paymentId, txid) => {
        setPaymentStatus('loading', 'Transaction submitted. Completing on server…');
        try {
          await completePaymentOnServer(paymentId, txid);
          setPaymentStatus(
            'success',
            `Payment successful! ${amount} Test-Pi confirmed. Tx: ${txid.slice(0, 12)}…`
          );
          resolve({ paymentId, txid, amount });
        } catch (error) {
          setPaymentStatus('error', `Completion failed: ${error.message}`);
          reject(error);
        }
      },

      onCancel: (paymentId) => {
        const id = paymentId ? ` (${paymentId.slice(0, 8)}…)` : '';
        setPaymentStatus('warning', `Payment cancelled${id}.`);
        reject(new Error('Payment cancelled by user'));
      },

      onError: (error, payment) => {
        const detail = payment?.identifier ? ` [${payment.identifier.slice(0, 8)}…]` : '';
        setPaymentStatus('error', `Payment error: ${error.message}${detail}`);
        reject(error);
      },
    };

    setPaymentStatus('loading', `Opening Pi payment for ${amount} Test-Pi…`);
    window.Pi.createPayment(paymentData, callbacks);
  });
}

function createTestPayment() {
  return createPiPayment({
    amount: TEST_PAYMENT_AMOUNT,
    memo: 'Pi Pioneer Wall — test payment',
    metadata: { type: 'test', app: 'pioneer-wall' },
  });
}

window.PiPayments = {
  isReady: () => piReady && isPiBrowser(),
  ensureAuthenticated: authenticatePiUser,
  createPayment: createPiPayment,
  setStatus: setPaymentStatus,
};

if (payTestBtn) {
  payTestBtn.addEventListener('click', () => {
    const run = () =>
      createTestPayment().catch((err) => {
        if (err.message !== 'Payment cancelled by user') {
          setPaymentStatus('error', err.message);
        }
      });

    if (!piUser) {
      authenticatePiUser().then(run).catch((err) => setPaymentStatus('error', err.message));
      return;
    }
    run();
  });
}

document.addEventListener('DOMContentLoaded', initializePiSDK);
