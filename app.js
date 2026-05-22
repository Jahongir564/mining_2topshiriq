const state = {
  apiBaseUrl: localStorage.getItem("powApiBaseUrl") || "http://localhost:3000",
  connectedAddress: localStorage.getItem("powConnectedAddress") || "",
  chain: null,
  wallets: [],
  miners: [],
  logs: [],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function shortAddress(address) {
  if (!address) return "0x...";
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function addLog(message) {
  const time = new Date().toLocaleTimeString();
  state.logs.unshift(`[${time}] ${message}`);
  state.logs = state.logs.slice(0, 20);
  renderLogs();
}

function showToast(message, type = "info") {
  const stack = $("#toast-stack");
  if (!stack) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3500);
}

function apiUrl(path) {
  return `${state.apiBaseUrl.replace(/\/$/, "")}${path}`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "API request failed.");
  }

  return data;
}

function setApiStatus(isOnline) {
  const dot = $("#api-status-dot");
  if (dot) {
    dot.classList.toggle("online", isOnline);
    dot.classList.toggle("offline", !isOnline);
  }

  setText("#api-status-text", isOnline ? "Online" : "Offline");
}

function applyConnectedWallet() {
  const isConnected = Boolean(state.connectedAddress);
  setText("#wallet-connect-status", isConnected ? "Connected" : "Disconnected");
  setText("#wallet-connected-address", isConnected ? shortAddress(state.connectedAddress) : "0x...");

  const button = $("#connect-wallet-button");
  if (button) button.textContent = isConnected ? "Switch" : "Connect";

  const senderInput = $('#transaction-form input[name="sender"]');
  if (senderInput && isConnected) {
    senderInput.value = state.connectedAddress;
  }

  const lookupInput = $("#wallet-lookup-input");
  if (lookupInput && isConnected && !lookupInput.value) {
    lookupInput.value = state.connectedAddress;
  }

  renderSwapWalletOptions();
}

async function connectWallet() {
  if (!window.ethereum) {
    showToast("MetaMask was not found. Install the browser extension first.", "error");
    addLog("MetaMask extension was not found.");
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const address = accounts[0] || "";

    if (!address) {
      throw new Error("No MetaMask account was selected.");
    }

    state.connectedAddress = address;
    localStorage.setItem("powConnectedAddress", address);
    applyConnectedWallet();
    await apiRequest(`/wallet/${encodeURIComponent(address)}`);
    await refreshAll();

    addLog(`MetaMask connected: ${shortAddress(address)}`);
    showToast("MetaMask connected.", "success");
  } catch (error) {
    showToast(error.message, "error");
    addLog(`Wallet connection failed: ${error.message}`);
  }
}

function handleWalletEvents() {
  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", async (accounts) => {
    state.connectedAddress = accounts[0] || "";

    if (state.connectedAddress) {
      localStorage.setItem("powConnectedAddress", state.connectedAddress);
      await apiRequest(`/wallet/${encodeURIComponent(state.connectedAddress)}`).catch(() => {});
      addLog(`MetaMask account changed: ${shortAddress(state.connectedAddress)}`);
    } else {
      localStorage.removeItem("powConnectedAddress");
      addLog("MetaMask disconnected.");
    }

    applyConnectedWallet();
    await refreshAll();
  });

  window.ethereum.on("chainChanged", () => {
    addLog("MetaMask network changed.");
    showToast("MetaMask network changed.", "info");
  });
}

function setupNavigation() {
  const title = $("#current-view-title");

  $$(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      const viewName = button.dataset.view;
      $$(".nav-link").forEach((item) => item.classList.remove("active"));
      $$(".view").forEach((view) => view.classList.remove("active"));

      button.classList.add("active");
      $(`#view-${viewName}`)?.classList.add("active");

      if (title) {
        title.textContent = button.textContent.trim();
      }
    });
  });
}

function renderStats(chainData) {
  const chain = chainData.chain || [];
  setText("#chain-height", chain.length);
  setText("#pending-count", (chainData.pendingTransactions || []).length);
  setText("#difficulty-value", chainData.difficulty);
  setText("#wallet-count", state.wallets.length);
  setText("#refresh-label", chainData.valid ? "Valid" : "Invalid");
  setText("#demo-status-badge", `Demo: ${chainData.demo?.isRunning ? "Running" : "Stopped"}`);
  setText("#last-refresh-time", `Updated: ${new Date().toLocaleTimeString()}`);
}

function renderBlocks(chainData) {
  const chain = chainData.chain || [];
  const blocksList = $("#blocks-list");
  const chart = $("#block-chart");

  if (chart) {
    chart.innerHTML = chain.slice(-12).map((block) => {
      const count = block.transactions?.length || 0;
      const height = Math.max(12, Math.min(160, count * 28));
      return `<div class="bar" title="Block ${block.index}: ${count} tx" style="height:${height}px"></div>`;
    }).join("");
  }

  if (blocksList) {
    blocksList.innerHTML = chain.slice(-6).reverse().map((block) => {
      const txCount = block.transactions?.length || 0;
      return `
        <article class="block-card">
          <div class="block-row">
            <strong>#${block.index}</strong>
          <span>${txCount} tx</span>
          </div>
          <div class="mono-tiny">${block.hash}</div>
        </article>
      `;
    }).join("");
  }

  const latest = chain[chain.length - 1];
  const latestBlock = $("#latest-mined-block");
  if (latestBlock && latest) {
    latestBlock.innerHTML = `
      <div class="block-card">
        <div class="block-row">
          <strong>Block #${latest.index}</strong>
          <span>${latest.nonce} nonce</span>
        </div>
        <div class="mono-tiny">${latest.hash}</div>
      </div>
    `;
  }
}

function renderWallets() {
  const list = $("#wallets-list");
  if (!list) return;

  if (!state.wallets.length) {
    list.textContent = "No accounts found.";
    return;
  }

  list.innerHTML = state.wallets.map((wallet) => {
    const connectedClass = wallet.address?.toLowerCase() === state.connectedAddress.toLowerCase()
      ? " connected-wallet"
      : "";

    return `
      <article class="wallet-card${connectedClass}">
        <div class="block-row">
          <strong>${shortAddress(wallet.address)}</strong>
          <span>${connectedClass ? "MetaMask" : "Demo"}</span>
        </div>
        <div class="mono-tiny">${wallet.address}</div>
        <div class="wallet-balances">
          <span>TokenA: ${wallet.balances?.TokenA ?? 0}</span>
          <span>TokenB: ${wallet.balances?.TokenB ?? 0}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderSwapWalletOptions() {
  const select = $("#swap-wallet-select");
  if (!select) return;

  const addresses = new Set();
  if (state.connectedAddress) addresses.add(state.connectedAddress);
  state.wallets.forEach((wallet) => addresses.add(wallet.address));

  select.innerHTML = Array.from(addresses).map((address) => {
    const label = address.toLowerCase() === state.connectedAddress.toLowerCase()
      ? `${shortAddress(address)} (MetaMask)`
      : shortAddress(address);
    return `<option value="${address}">${label}</option>`;
  }).join("");

  if (state.connectedAddress) {
    select.value = state.connectedAddress;
  }
}

function renderMiners() {
  const list = $("#miners-list");
  if (!list) return;

  const miners = state.miners.miners || state.miners || [];
  if (!miners.length) {
    list.textContent = "No operators found.";
    return;
  }

  const totalPower = miners.reduce((sum, miner) => sum + Number(miner.hashPower || 0), 0);
  const lastSummary = state.chain?.lastMiningSummary;
  const lastRound = lastSummary?.poolRound || [];
  const rewards = lastSummary?.rewardBreakdown || [];

  setText("#pool-total-power", `${totalPower} HP`);
  setText("#pool-reward", "50 TokenA");
  setText("#pool-last-block", lastSummary ? `#${lastSummary.blockIndex}` : "--");

  const roundList = $("#pool-round-list");
  if (roundList) {
    if (!lastRound.length) {
      roundList.textContent = "No pool round has been recorded yet. Shares appear after a mined block.";
    } else {
      const totalContribution = lastRound.reduce(
        (sum, miner) => sum + Number(miner.contribution || 0),
        0
      );

      roundList.innerHTML = lastRound.map((miner) => {
        const contribution = Number(miner.contribution || 0);
        const percent = totalContribution
          ? Math.round((contribution / totalContribution) * 100)
          : 0;
        const reward = rewards.find((item) => item.receiver === miner.address)?.amount || 0;

        return `
          <article class="pool-round-card">
            <div class="block-row">
              <strong>${miner.name}</strong>
              <span>${percent}% share</span>
            </div>
            <div class="pool-meter"><span style="width:${percent}%"></span></div>
            <div class="wallet-balances">
              <span>Share: ${contribution}</span>
              <span>Reward: ${reward} TokenA</span>
            </div>
          </article>
        `;
      }).join("");
    }
  }

  list.innerHTML = miners.map((miner) => `
    <article class="miner-card">
      <div class="block-row">
        <strong>${miner.name || shortAddress(miner.address)}</strong>
        <span>${miner.hashPower} HP</span>
      </div>
      <div class="mono-tiny">${miner.address}</div>
      <div class="pool-meter"><span style="width:${totalPower ? (miner.hashPower / totalPower) * 100 : 0}%"></span></div>
      <div class="wallet-balances">
        <span>Hash share: ${totalPower ? Math.round((miner.hashPower / totalPower) * 100) : 0}%</span>
        <span>Total reward: ${Number(miner.totalEarned ?? 0).toFixed(4)} TokenA</span>
        <span>Total shares: ${miner.totalContribution ?? 0}</span>
      </div>
    </article>
  `).join("");
}

function renderLogs() {
  const list = $("#log-list");
  if (!list) return;

  list.innerHTML = state.logs.map((log) => `<div class="log-item">${log}</div>`).join("");
}

async function refreshAll() {
  try {
    const [chainData, wallets, miners] = await Promise.all([
      apiRequest("/chain"),
      apiRequest("/wallets"),
      apiRequest("/miners"),
    ]);

    state.chain = chainData;
    state.wallets = wallets;
    state.miners = miners;

    setApiStatus(true);
    renderStats(chainData);
    renderBlocks(chainData);
    renderWallets();
    renderSwapWalletOptions();
    renderMiners();
  } catch (error) {
    setApiStatus(false);
    addLog(`API sync failed: ${error.message}`);
  }
}

function setupApiControls() {
  const input = $("#api-base-url");
  if (input) input.value = state.apiBaseUrl;

  $("#save-api-url")?.addEventListener("click", async () => {
    state.apiBaseUrl = input.value.trim() || "http://localhost:3000";
    localStorage.setItem("powApiBaseUrl", state.apiBaseUrl);
    addLog(`API endpoint saved: ${state.apiBaseUrl}`);
    await refreshAll();
  });
}

function setupActions() {
  $("#connect-wallet-button")?.addEventListener("click", connectWallet);
  $("#clear-logs")?.addEventListener("click", () => {
    state.logs = [];
    renderLogs();
  });

  const mine = async () => {
    setText("#mining-status", "Mining...");
    setText("#mining-status-alt", "Mining...");
    try {
      const result = await apiRequest("/mine");
      addLog(result.message || "Block mined.");
      showToast("Block mined.", "success");
      await refreshAll();
    } catch (error) {
      showToast(error.message, "error");
      addLog(`Mining error: ${error.message}`);
    } finally {
      setText("#mining-status", "Ready");
      setText("#mining-status-alt", "Ready");
    }
  };

  $("#mine-button")?.addEventListener("click", mine);
  $("#mine-button-alt")?.addEventListener("click", mine);

  $("#demo-start-button")?.addEventListener("click", async () => {
    const result = await apiRequest("/demo/start");
    addLog(result.message);
    await refreshAll();
  });

  $("#demo-stop-button")?.addEventListener("click", async () => {
    const result = await apiRequest("/demo/stop");
    addLog(result.message);
    await refreshAll();
  });

  $("#wallet-lookup-button")?.addEventListener("click", async () => {
    const input = $("#wallet-lookup-input");
    const result = $("#wallet-lookup-result");
    const address = input?.value.trim();
    if (!address || !result) return;

    try {
      const wallet = await apiRequest(`/wallet/${encodeURIComponent(address)}`);
      result.innerHTML = `
        <article class="wallet-card">
          <div class="block-row">
            <strong>${shortAddress(wallet.address)}</strong>
            <span>Verified</span>
          </div>
          <div class="wallet-balances">
            <span>TokenA: ${wallet.balances?.TokenA ?? 0}</span>
            <span>TokenB: ${wallet.balances?.TokenB ?? 0}</span>
          </div>
        </article>
      `;
      await refreshAll();
    } catch (error) {
      result.textContent = error.message;
    }
  });

  $("#transaction-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());

    if (state.connectedAddress) {
      payload.sender = state.connectedAddress;
      form.elements.sender.value = state.connectedAddress;
    }

    payload.amount = Number(payload.amount);

    try {
      const result = await apiRequest("/transaction", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setText("#transaction-message", result.message);
      addLog(`${shortAddress(payload.sender)} -> ${shortAddress(payload.receiver)} | ${payload.amount} ${payload.token}`);
      showToast("Transaction queued.", "success");
      await refreshAll();
    } catch (error) {
      setText("#transaction-message", error.message);
      showToast(error.message, "error");
    }
  });

  $("#swap-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.amount = Number(payload.amount);
    payload.fromToken = "TokenA";
    payload.toToken = "TokenB";

    try {
      const result = await apiRequest("/swap", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setText("#swap-message", result.message);
      addLog(`${shortAddress(payload.address)} swapped ${payload.amount} TokenA`);
      showToast("Swap queued.", "success");
      await refreshAll();
    } catch (error) {
      setText("#swap-message", error.message);
      showToast(error.message, "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  setupApiControls();
  setupActions();
  handleWalletEvents();
  applyConnectedWallet();

  if (state.connectedAddress) {
    await apiRequest(`/wallet/${encodeURIComponent(state.connectedAddress)}`).catch(() => {});
  }

  await refreshAll();
  window.setInterval(refreshAll, 5000);
});
