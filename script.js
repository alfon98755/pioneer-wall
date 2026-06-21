// ─── Tokenomics constants ───────────────────────────────────────────────────
const INITIAL_MIN_BID = 10;
const POOL_SHARE = 0.70;
const KING_REWARD_SHARE = 0.20;
const DEV_COMMISSION_SHARE = 0.10;
const FAILED_BID_KING_SHARE = 0.05; // 5% of failed/low bids go to current King

// ─── App state ──────────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
// BACKEND API STUBS — Replace with real fetch/axios calls when server is ready
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pool/update
 * Sends the pool share to the on-chain / server-side accumulated pool.
 */
async function updatePool(amount) {
  // TODO: await fetch('/api/pool/update', { method: 'POST', body: JSON.stringify({ amount }) })
  await simulateNetworkDelay();
  accumulatedPool = formatPrice(accumulatedPool + amount);
  return { success: true, newPoolTotal: accumulatedPool };
}

/**
 * POST /api/payments/pay-to-user
 * Transfers Test-Pi reward to a pioneer (dethroned King or failed-bid yield).
 */
async function payToUser(username, amount, reason) {
  // TODO: await fetch('/api/payments/pay-to-user', { method: 'POST', body: JSON.stringify({ username, amount, reason }) })
  await simulateNetworkDelay();
  return { success: true, username, amount, reason };
}

/**
 * POST /api/payments/platform-fee
 * Records and routes the 10% platform fee.
 */
async function recordDevCommission(amount) {
  // TODO: await fetch('/api/payments/dev-commission', { method: 'POST', body: JSON.stringify({ amount }) })
  await simulateNetworkDelay();
  developerCommission = formatPrice(developerCommission + amount);
  return { success: true, totalCommission: developerCommission };
}

function simulateNetworkDelay(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(n) {
  return Number.isInteger(n) ? n : parseFloat(n.toFixed(2));
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

function getPioneerKey(name) {
  return name.toLowerCase();
}

function getOrCreatePioneer(name, message) {
  const key = getPioneerKey(name);
  if (!pioneers.has(key)) {
    pioneers.set(key, { name, message, totalPaid: 0, claims: 0, throneEarnings: 0 });
  }
  return pioneers.get(key);
}

function getRankedPioneers() {
  return [...pioneers.values()].sort((a, b) => b.totalPaid - a.totalPaid);
}

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
    bidErrorText.textContent = `Bid too low — minimum is ${formatPrice(min)} Test-Pi. The King earns yield from failed bids.`;
  } else {
    bidErrorText.textContent = `Minimum bid is ${formatPrice(min)} Test-Pi`;
  }
  bidError.classList.remove('hidden');
  bidInput.classList.add('border-red-500/60', 'ring-2', 'ring-red-500/20');
  bidInput.classList.remove('border-purple-500/30');
}

function hideBidError() {
  bidError.classList.add('hidden');
  bidInput.classList.remove('border-red-500/60', 'ring-2', 'ring-red-500/20');
  bidInput.classList.add('border-purple-500/30');
}

function updatePodiumSlot(slotEl, pioneer) {
  const avatar = slotEl.querySelector('div.rounded-full');
  const nameEl = slotEl.querySelector('.podium-name');
  const amountEl = slotEl.querySelector('.podium-amount');

  if (!pioneer) {
    avatar.textContent = '?';
    nameEl.textContent = '—';
    amountEl.textContent = '0 π';
    avatar.title = '';
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
        <td class="py-3.5 pr-4 font-bold ${rank === 1 ? 'text-pi-gold' : rank === 2 ? 'text-gray-300' : rank === 3 ? 'text-orange-400' : 'text-purple-400'}">${medal}</td>
        <td class="py-3.5 pr-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-pi-purple to-pi-purple-dark flex items-center justify-center text-xs font-bold shrink-0">${getInitials(p.name)}</div>
            <span class="font-semibold text-white">${p.name}${isKing ? ' <span class="text-pi-gold text-xs">👑</span>' : ''}</span>
            ${p.claims > 1 ? `<span class="text-purple-500 text-xs">(${p.claims} bids)</span>` : ''}
          </div>
        </td>
        <td class="py-3.5 pr-4 text-purple-300/70 hidden sm:table-cell max-w-[200px] truncate">"${p.message}"</td>
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

// ─── Core tokenomics flow ───────────────────────────────────────────────────

/**
 * Handles a failed / below-minimum bid.
 * Current King earns a small yield from the attempt.
 */
async function processFailedBid(attemptedBid) {
  if (!king || attemptedBid <= 0) return;

  const kingTip = formatPrice(attemptedBid * FAILED_BID_KING_SHARE);
  if (kingTip <= 0) return;

  // TODO: Backend will validate and transfer the failed-bid yield
  await payToUser(king.name, kingTip, 'failed_bid_yield');

  king.sessionThroneEarnings = formatPrice((king.sessionThroneEarnings || 0) + kingTip);

  const pioneer = getOrCreatePioneer(king.name, king.message);
  pioneer.throneEarnings = formatPrice(pioneer.throneEarnings + kingTip);
  totalKingRewardsPaid = formatPrice(totalKingRewardsPaid + kingTip);

  addActivityEntry(`
    <div class="flex justify-between items-start gap-3">
      <div>
        <span class="text-red-400 font-semibold">Failed bid</span>
        <span class="text-purple-400 ml-2">${formatPrice(attemptedBid)} π too low</span>
      </div>
      <span class="text-green-400 font-medium shrink-0">+${kingTip} π → 👑 ${king.name}</span>
    </div>
  `);

  renderAll();
}

/**
 * Processes a successful throne claim with full 70/20/10 tokenomics split.
 */
async function processSuccessfulBid(name, message, paid) {
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing…';

  const previousKing = king ? { ...king } : null;
  const split = splitPayment(paid);

  totalVolume = formatPrice(totalVolume + paid);

  // 70% → Accumulated Pool
  await updatePool(split.pool);

  // 20% → Previous King dethronement reward
  if (previousKing) {
    await payToUser(previousKing.name, split.kingReward, 'dethronement_reward');
    const prevPioneer = getOrCreatePioneer(previousKing.name, previousKing.message);
    prevPioneer.throneEarnings = formatPrice(prevPioneer.throneEarnings + split.kingReward);
    totalKingRewardsPaid = formatPrice(totalKingRewardsPaid + split.kingReward);
  }

  // 10% → Platform fee
  await recordDevCommission(split.devCommission);

  // Update pioneer contribution totals (full bid amount)
  const pioneer = getOrCreatePioneer(name, message);
  pioneer.totalPaid = formatPrice(pioneer.totalPaid + paid);
  pioneer.message = message;
  pioneer.claims += 1;

  // New King takes the throne
  king = { name, message, paid, sessionThroneEarnings: 0 };

  addActivityEntry(`
    <div class="space-y-1">
      <div class="flex justify-between items-center">
        <span class="font-semibold text-white">👑 ${name}</span>
        <span class="text-pi-gold font-bold">${paid} π</span>
      </div>
      <p class="text-purple-400/70 truncate">"${message}"</p>
      <div class="flex flex-wrap gap-3 text-xs mt-1">
        <span class="text-pi-purple">Pool +${split.pool} π</span>
        ${previousKing ? `<span class="text-green-400">Ex-King +${split.kingReward} π</span>` : ''}
        <span class="text-pi-gold">Platform +${split.devCommission} π</span>
      </div>
    </div>
  `);

  renderAll();

  submitBtn.disabled = false;
  submitBtn.textContent = 'Claim Throne';
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
    await processFailedBid(bid);
    return;
  }

  const paid = formatPrice(bid);

  await processSuccessfulBid(name, message, paid);

  document.getElementById('user-name').value = '';
  document.getElementById('user-message').value = '';
  bidInput.value = '';
  bidPreview.classList.add('hidden');

  document.getElementById('king-section').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

renderAll();
