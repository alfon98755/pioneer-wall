// ─── Pi Network Payment Integration (Testnet) ───────────────────────────────
// App ID  → Pi Developer Portal (develop.pi) — linked to your domain, NOT in code.
// API Key → Vercel env PI_API_KEY — server only (/api/payments/*).

const LOG_PREFIX = '[PiPayment]';
const PI_SCOPES = ['payments', 'username'];
const TEST_PAYMENT_AMOUNT = 1.0;
const USE_SANDBOX = true; // Testnet MVP — set false for Pi Mainnet production

let piUser = null;
let piReady = false;
let piInitPromise = null;

const payTestBtn = document.getElementById('pi-pay-test-btn');
const claimBtn = document.getElementById('submit-btn');
const payStatusEl = document.getElementById('pi-payment-status');
const payStatusTextEl = document.getElementById('pi-payment-status-text');
const piUserBadgeEl = document.getElementById('pi-user-badge');
const userNameInput = document.getElementById('user-name');

function log(step, data = {}) {
  console.log(LOG_PREFIX, step, { ...data, ts: Date.now() });
}

function isPiBrowser() {
  return typeof window.Pi !== 'undefined';
}

function waitForPiSdk(maxMs = 8000) {
  return new Promise((resolve, reject) => {
    if (typeof window.Pi !== 'undefined') {
      log('sdk_detected_immediate');
      return resolve(window.Pi);
    }

    log('sdk_waiting', { maxMs });
    const start = Date.now();
    const timer = setInterval(() => {
      if (typeof window.Pi !== 'undefined') {
        clearInterval(timer);
        log('sdk_detected_delayed', { waitedMs: Date.now() - start });
        resolve(window.Pi);
      } else if (Date.now() - start > maxMs) {
        clearInterval(timer);
        log('sdk_timeout', { waitedMs: Date.now() - start });
        reject(new Error('Pi SDK script did not load. Open in Pi Browser.'));
      }
    }, 100);
  });
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
  log('ui_status', { type, message });
}

function setPiButtonsEnabled(enabled) {
  log('buttons_state', { enabled });
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
  log('user_authenticated', { username: user.username, uid: user.uid });
}

async function callBackend(path, body) {
  log('backend_request', { path, bodyKeys: Object.keys(body || {}) });

  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  log('backend_response', { path, status: response.status, ok: response.ok, data });

  if (!response.ok) {
    const msg = data.error || data.message || JSON.stringify(data.piResponse || data) || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return data;
}

async function approvePaymentOnServer(paymentId) {
  return callBackend('/api/payments/approve', { paymentId });
}

async function completePaymentOnServer(paymentId, txid) {
  return callBackend('/api/payments/complete', { paymentId, txid });
}

function handleIncompletePayment(payment) {
  log('incomplete_payment_found', { paymentId: payment?.identifier });
  setPaymentStatus('warning', 'Incomplete payment found — completing previous transaction…');

  const txid = payment?.transaction?.txid;
  if (payment?.identifier && txid) {
    completePaymentOnServer(payment.identifier, txid)
      .then(() => {
        setPaymentStatus('success', 'Previous payment completed.');
        if (window.GameState?.refresh) window.GameState.refresh();
      })
      .catch((err) => setPaymentStatus('error', err.message));
  }
}

async function authenticatePiUser() {
  if (!isPiBrowser()) {
    throw new Error('Open this app in Pi Browser to pay with Test-Pi.');
  }

  setPaymentStatus('loading', 'Authenticating with Pi Network…');
  log('authenticate_start', { scopes: PI_SCOPES });

  const auth = await window.Pi.authenticate(PI_SCOPES, handleIncompletePayment);
  piUser = auth.user;
  showPiUser(auth.user);
  setPaymentStatus('idle', 'Authenticated. Ready for payments.');
  return auth;
}

async function initializePiSDK() {
  if (piInitPromise) return piInitPromise;

  piInitPromise = (async () => {
    log('init_start', {
      href: window.location.href,
      userAgent: navigator.userAgent,
      useSandbox: USE_SANDBOX,
    });

    try {
      await waitForPiSdk();
    } catch (error) {
      setPaymentStatus('warning', error.message);
      setPiButtonsEnabled(false);
      throw error;
    }

    if (!isPiBrowser()) {
      setPaymentStatus('warning', 'Pi SDK not detected — open inside Pi Browser.');
      setPiButtonsEnabled(false);
      return;
    }

    try {
      log('pi_init_call', { version: '2.0', sandbox: USE_SANDBOX });
      await window.Pi.init({ version: '2.0', sandbox: USE_SANDBOX });
      piReady = true;
      log('pi_init_success');
      setPaymentStatus('loading', 'Pi SDK ready. Authenticating…');
      await authenticatePiUser();
      setPiButtonsEnabled(true);
      setPaymentStatus('idle', 'Pi SDK ready. Payments enabled.');
    } catch (error) {
      log('pi_init_error', { message: error.message, stack: error.stack });
      setPaymentStatus('error', `Pi init failed: ${error.message}`);
      setPiButtonsEnabled(false);
      throw error;
    }
  })();

  return piInitPromise;
}

function createPiPayment({ amount, memo, metadata }) {
  log('create_payment_called', { amount, memo, metadata });

  if (!piReady || !isPiBrowser()) {
    const err = new Error('Pi SDK is not ready. Wait for init or use Pi Browser.');
    log('create_payment_blocked', { piReady, isPiBrowser: isPiBrowser() });
    return Promise.reject(err);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const once = (fn) => (...args) => {
      if (!settled) {
        settled = true;
        fn(...args);
      }
    };

    const paymentData = { amount, memo, metadata };

    const callbacks = {
      onReadyForServerApproval: async (paymentId) => {
        log('onReadyForServerApproval', { paymentId });
        setPaymentStatus('loading', `Approving ${paymentId.slice(0, 8)}… on Vercel`);
        try {
          await approvePaymentOnServer(paymentId);
          setPaymentStatus('loading', `Approved ${amount} π — confirm in Pi Wallet`);
        } catch (error) {
          log('approve_failed', { paymentId, error: error.message });
          setPaymentStatus('error', `Approve failed: ${error.message}`);
          once(reject)(error);
        }
      },

      onReadyForServerCompletion: async (paymentId, txid) => {
        log('onReadyForServerCompletion', { paymentId, txid: txid?.slice(0, 12) });
        setPaymentStatus('loading', 'Completing payment on server…');
        try {
          const result = await completePaymentOnServer(paymentId, txid);
          setPaymentStatus('success', `Payment OK — ${amount} Test-Pi. Tx ${txid.slice(0, 12)}…`);
          once(resolve)({ paymentId, txid, amount, result });
        } catch (error) {
          log('complete_failed', { paymentId, error: error.message });
          setPaymentStatus('error', `Complete failed: ${error.message}`);
          once(reject)(error);
        }
      },

      onCancel: (paymentId) => {
        log('onCancel', { paymentId });
        setPaymentStatus('warning', 'Payment cancelled.');
        once(reject)(new Error('Payment cancelled by user'));
      },

      onError: (error, payment) => {
        log('onError', { message: error?.message, paymentId: payment?.identifier });
        setPaymentStatus('error', `Pi error: ${error.message}`);
        once(reject)(error);
      },
    };

    setPaymentStatus('loading', `Opening Pi payment UI for ${amount} π…`);
    log('pi_createPayment_invoke', paymentData);

    try {
      window.Pi.createPayment(paymentData, callbacks);
      log('pi_createPayment_dispatched');
    } catch (error) {
      log('pi_createPayment_throw', { message: error.message });
      reject(error);
    }
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
  init: initializePiSDK,
};

function bindPayTestButton() {
  if (!payTestBtn) {
    log('pay_test_btn_missing');
    return;
  }

  payTestBtn.addEventListener('click', async () => {
    log('pay_test_click');

    try {
      if (!piReady) await initializePiSDK();
      if (!piUser) await authenticatePiUser();
      await createTestPayment();
    } catch (err) {
      if (err.message !== 'Payment cancelled by user') {
        setPaymentStatus('error', err.message);
      }
    }
  });
}

bindPayTestButton();
initializePiSDK().catch(() => {});
