// ─── Tokenomics constants (display / preview only — settlement runs on server) ─
const INITIAL_MIN_BID = 10;
const POOL_SHARE = 0.70;
const KING_REWARD_SHARE = 0.20;
const DEV_COMMISSION_SHARE = 0.10;
const FAILED_BID_KING_SHARE = 0.05;

// ─── App state (hydrated from Supabase via /api/state) ──────────────────────
let king = null;
let accumulatedPool = 0;
let totalVolume = 0;
let totalKingRewardsPaid = 0;
let developerCommission = 0;
const pioneers = new Map();

// ─── DOM refs ───────────────────────────────────────────────────────────────
const accumulatedPoolEl = document.getElementById('accumulated-pool');
const totalVolumeEl = document.getElementById('total-volume');
const totalKingRewardsEl = document.getElementById('total-king-rewards');
const devCommissionEl = document.getElementById('dev-commission');
const minBidEl = document.getElementById('min-bid');
const bidInput = document.getElementById('bid-amount');
const bidError = document.getElementById('bid-error');
const bidErrorText = document.getElementById('bid-error-text');
const bidPreview = document.getElementById('bid-preview');
const previewPool = document.getElementById('preview-pool');
const previewKing = document.getElementById('preview-king');
const previewDev = document.getElementById('preview-dev');
const submitBtn = document.getElementById('submit-btn');
const kingNameEl = document.getElementById('king-name');
const kingMessageEl = document.getElementById('king-message');
const kingMetaEl = document.getElementById('king-meta');
const kingPaidEl = document.getElementById('king-paid');
const kingThroneEarningsEl = document.getElementById('king-throne-earnings');
const kingThroneAmountEl = document.getElementById('king-throne-amount');
const form = document.getElementById('claim-form');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const leaderboardSection = document.getElementById('leaderboard-section');
const leaderboardBody = document.getElementById('leaderboard-body');

const podiumSlots = [
  document.getElementById('podium-2'),
  document.getElementById('podium-1'),
  document.getElementById('podium-3'),
];
const podiumRanks = [1, 0, 2];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(n) {
  return Number.isInteger(n) ? n : parseFloat(Number(n).toFixed(2));
}

function splitPayment(amount) {
  return {
    pool: formatPrice(amount * POOL_SHARE),
    kingReward: formatPrice(amount * KING_REWARD_SHARE),
    devCommission: formatPrice(amount * DEV_COMMISSION_SHARE),
  };
}

function getMinBid() {
  return king ? formatPrice(king.paid + 1) : INITIAL_MIN_BID;
}

function getInitials(name) {
  return name.slice(0, 2).toUpperCase();
}

function getRankedPioneers() {
  return [...pioneers.values()].sort((a, b) => b.totalPaid - a.totalPaid);
}

// ─── Supabase sync via Vercel API ───────────────────────────────────────────

async function loadGameState() {
  console.log('[GameState] loading from /api/state');
  const response = await fetch('/api/state');
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Failed to load state (${response.status})`);
  }

  const { throne, pioneers: pioneerList } = data;

  accumulatedPool = formatPrice(throne.pool_total);
  totalVolume = formatPrice(throne.total_volume);
  totalKingRewardsPaid = formatPrice(throne.king_rewards_paid);
  developerCommission = formatPrice(throne.platform_fee);

  pioneers.clear();
  pioneerList.forEach((p) => {
    pioneers.set(p.name.toLowerCase(), {
      name: p.name,
      message: p.message || '',
      totalPaid: formatPrice(p.total_paid),
      throneEarnings: formatPrice(p.throne_earnings),
      claims: p.claims || 0,
    });
  });

  if (throne.current_king) {
    king = {
      name: throne.current_king,
      message: throne.king_message || '',
      paid: formatPrice(throne.current_bid),
      sessionThroneEarnings: 0,
    };
  } else {
    king = null;
  }

  console.log('[GameState] loaded', { king: king?.name, pool: accumulatedPool, pioneers: pioneers.size });
  renderAll();
  return data;
}

window.GameState = { refresh: loadGameState };

// ─── UI updates ─────────────────────────────────────────────────────────────

function renderGlobalStats() {
  accumulatedPoolEl.textContent = formatPrice(accumulatedPool);
  totalVolumeEl.textContent = formatPrice(totalVolume);
  totalKingRewardsEl.textContent = formatPrice(totalKingRewardsPaid);
  devCommissionEl.textContent = formatPrice(developerCommission);
}

function updateMinBidDisplay() {
  const min = getMinBid();
  minBidEl.textContent = formatPrice(min);
  bidInput.min = min;
  bidInput.placeholder = formatPrice(min);
}

function updateBidPreview() {
  const bid = parseFloat(bidInput.value);
  if (!bid || isNaN(bid) || bid <= 0) {
    bidPreview.classList.add('hidden');
    return;
  }
  const split = splitPayment(bid);
  previewPool.textContent = split.pool;
  previewKing.textContent = king ? split.kingReward : '0';
  previewDev.textContent = split.devCommission;
  bidPreview.classList.remove('hidden');
}

function updateKingDisplay() {
  if (!king) {
    kingNameEl.textContent = '—';
    kingMessageEl.textContent = 'Be the first to conquer the wall.';
    kingMetaEl.classList.add('hidden');
    kingThroneEarningsEl.classList.add('hidden');
    return;
  }

  kingNameEl.textContent = king.name;
  kingMessageEl.textContent = `"${king.message}"`;
  kingPaidEl.textContent = formatPrice(king.paid);
  kingMetaEl.classList.remove('hidden');
  kingThroneAmountEl.textContent = formatPrice(king.sessionThroneEarnings || 0);
  kingThroneEarningsEl.classList.remove('hidden');
}

function showBidError(min, isFailedBid = false) {
  if (isFailedBid && king) {
    bidErrorText.textContent = `Bid too low — minimum is ${formatPrice(min)} Test-Pi.`;
  } else {
    bidErrorText.textContent = `Minimum bid is ${formatPrice(min)} Test-Pi`;
  }
  bidError.classList.remove('hidden');
  bidInput.classList.add('border-red-500/60', 'ring-2', 'ring-red-500/20');
}

function hideBidError() {
  bidError.classList.add('hidden');
  bidInput.classList.remove('border-red-500/60', 'ring-2', 'ring-red-500/20');
}

function updatePodiumSlot(slotEl, pioneer) {
  const avatar = slotEl.querySelector('div.rounded-full');
  const nameEl = slotEl.querySelector('.podium-name');
  const amountEl = slotEl.querySelector('.podium-amount');

  if (!pioneer) {
    avatar.textContent = '?';
    nameEl.textContent = '—';
    amountEl.textContent = '0 π';
    return;
  }

  avatar.textContent = getInitials(pioneer.name);
  nameEl.textContent = pioneer.name;
  amountEl.textContent = `${formatPrice(pioneer.totalPaid)} π`;
  avatar.title = pioneer.message;
}

function renderPodium() {
  const top3 = getRankedPioneers().slice(0, 3);
  podiumRanks.forEach((rankIndex, displayIndex) => {
    updatePodiumSlot(podiumSlots[displayIndex], top3[rankIndex] || null);
  });
}

function renderFullLeaderboard() {
  const ranked = getRankedPioneers();
  if (ranked.length === 0) {
    leaderboardSection.classList.add('hidden');
    return;
  }

  leaderboardSection.classList.remove('hidden');
  leaderboardBody.innerHTML = ranked.map((p, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const isKing = king && king.name.toLowerCase() === p.name.toLowerCase();

    return `
      <tr class="border-b border-purple-500/10 ${rank <= 3 ? 'bg-pi-purple/5' : ''} hover:bg-pi-purple/10 transition-colors">
        <td class="py-3.5 pr-4 font-bold">${medal}</td>
        <td class="py-3.5 pr-4">
          <span class="font-semibold text-white">${p.name}${isKing ? ' 👑' : ''}</span>
          ${p.claims > 1 ? `<span class="text-purple-500 text-xs">(${p.claims})</span>` : ''}
        </td>
        <td class="py-3.5 pr-4 text-purple-300/70 hidden sm:table-cell truncate">"${p.message}"</td>
        <td class="py-3.5 pr-4 text-right font-bold text-pi-gold">${formatPrice(p.totalPaid)} π</td>
        <td class="py-3.5 text-right font-bold text-green-400 hidden sm:table-cell">${formatPrice(p.throneEarnings)} π</td>
      </tr>
    `;
  }).join('');
}

function addActivityEntry(html) {
  historySection.classList.remove('hidden');
  const li = document.createElement('li');
  li.className = 'glass rounded-xl px-4 py-3 text-sm';
  li.innerHTML = html;
  historyList.prepend(li);
}

function renderAll() {
  renderGlobalStats();
  updateMinBidDisplay();
  updateKingDisplay();
  renderPodium();
  renderFullLeaderboard();
}

// ─── Event listeners ────────────────────────────────────────────────────────

bidInput.addEventListener('input', () => {
  hideBidError();
  updateBidPreview();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBidError();

  const name = document.getElementById('user-name').value.trim();
  const message = document.getElementById('user-message').value.trim();
  const bid = parseFloat(bidInput.value);
  const minBid = getMinBid();

  if (!name || !message) return;

  if (!bid || isNaN(bid) || bid <= 0) {
    showBidError(minBid);
    return;
  }

  if (bid < minBid) {
    showBidError(minBid, true);
    return;
  }

  const paid = formatPrice(bid);

  try {
    if (!window.PiPayments?.isReady()) {
      await window.PiPayments.init();
    }
  } catch (err) {
    window.PiPayments?.setStatus?.('error', err.message);
    return;
  }

  if (!window.PiPayments.isReady()) {
    window.PiPayments.setStatus('error', 'Pi SDK not ready. Open in Pi Browser.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Awaiting payment…';

  try {
    const result = await window.PiPayments.createPayment({
      amount: paid,
      memo: `Pioneer Wall throne — ${name}`,
      metadata: { type: 'throne_claim', name, message, paid },
    });

    await loadGameState();

    const settlement = result?.result?.settlement?.settlement;
    if (settlement) {
      addActivityEntry(`
        <div class="space-y-1">
          <span class="font-semibold text-white">👑 ${settlement.pioneerName}</span>
          <span class="text-pi-gold font-bold ml-2">${settlement.bid} π</span>
          <div class="text-xs text-purple-400">Pool +${settlement.poolAdded} π · Ex-King +${settlement.exKingReward} π</div>
        </div>
      `);
    }

    document.getElementById('user-name').value = '';
    document.getElementById('user-message').value = '';
    bidInput.value = '';
    bidPreview.classList.add('hidden');
    document.getElementById('king-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    if (error.message !== 'Payment cancelled by user') {
      window.PiPayments.setStatus('error', error.message);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Claim Throne';
  }
});

loadGameState().catch((err) => {
  console.error('[GameState] initial load failed:', err.message);
});
