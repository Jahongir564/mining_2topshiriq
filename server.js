const express = require("express");
const path = require("path");
const Blockchain = require("./blockchain");

const app = express();
const port = 3000;
const blockchain = new Blockchain({
  difficulty: 4,
  miningReward: 50,
  blockTransactionLimit: 3,
  swapRate: 2,
});
const demoState = {
  intervalId: null,
  isRunning: false,
  tick: 0,
  intervalMs: 4000,
};

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json());
app.use(express.static(__dirname));

app.get("/chain", (req, res) => {
  res.json({
    valid: blockchain.isChainValid(),
    difficulty: blockchain.difficulty,
    pendingTransactions: blockchain.pendingTransactions,
    lastMiningSummary: blockchain.lastMiningSummary,
    demo: {
      isRunning: demoState.isRunning,
      intervalMs: demoState.intervalMs,
    },
    pool: blockchain.getPoolStatus(),
    chain: blockchain.getChain(),
  });
});

app.post("/transaction", (req, res) => {
  try {
    const result = blockchain.addTransaction(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/mine", (req, res) => {
  const result = blockchain.minePendingTransactions({ reason: "manual", force: true });
  res.json(result);
});

app.get("/wallet/:address", (req, res) => {
  res.json(blockchain.getWallet(req.params.address));
});

app.post("/swap", (req, res) => {
  try {
    const result = blockchain.swapTokens(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/wallets", (req, res) => {
  res.json(blockchain.getWallets());
});

app.get("/miners", (req, res) => {
  res.json(blockchain.getPoolStatus());
});

app.get("/demo/status", (req, res) => {
  res.json({
    isRunning: demoState.isRunning,
    intervalMs: demoState.intervalMs,
    tick: demoState.tick,
  });
});

app.post("/demo/start", (req, res) => {
  const result = startDemoActivity();
  res.json(result);
});

app.post("/demo/stop", (req, res) => {
  const result = stopDemoActivity();
  res.json(result);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function queueStartupTransactions() {
  blockchain.addTransactions([
    {
      sender: "alice-wallet",
      receiver: "bob-wallet",
      amount: 20,
      token: "TokenB",
      type: "demo-transfer",
    },
    {
      sender: "bob-wallet",
      receiver: "carol-wallet",
      amount: 15,
      token: "TokenB",
      type: "demo-transfer",
    },
    {
      sender: "carol-wallet",
      receiver: "alice-wallet",
      amount: 10,
      token: "TokenB",
      type: "demo-transfer",
    },
  ]);
}

function runDemoStep() {
  const tokenATransfers = [
    { sender: "miner-alpha", receiver: "alice-wallet", amount: 6 },
    { sender: "miner-beta", receiver: "bob-wallet", amount: 4 },
    { sender: "miner-gamma", receiver: "carol-wallet", amount: 3 },
  ];

  try {
    const step = demoState.tick % 4;

    if (step === 0) {
      const transfer = tokenATransfers[demoState.tick % tokenATransfers.length];
      blockchain.addTransaction({
        sender: transfer.sender,
        receiver: transfer.receiver,
        amount: transfer.amount,
        token: "TokenA",
        type: "miner-transfer",
      });
    } else if (step === 1) {
      blockchain.addTransaction({
        sender: "alice-wallet",
        receiver: "bob-wallet",
        amount: 5,
        token: "TokenB",
        type: "demo-transfer",
      });
    } else if (step === 2) {
      if (blockchain.getWallet("alice-wallet").balances.TokenA >= 5) {
        blockchain.swapTokens({
          address: "alice-wallet",
          amount: 5,
          fromToken: "TokenA",
          toToken: "TokenB",
        });
      } else {
        blockchain.addTransaction({
          sender: "bob-wallet",
          receiver: "carol-wallet",
          amount: 7,
          token: "TokenB",
          type: "demo-transfer",
        });
      }
    } else {
      blockchain.addTransaction({
        sender: "carol-wallet",
        receiver: "alice-wallet",
        amount: 6,
        token: "TokenB",
        type: "demo-transfer",
      });
    }

    demoState.tick += 1;
  } catch (error) {
    console.log(`[demo] ${error.message}`);
    demoState.tick += 1;
  }
}

function startDemoActivity() {
  if (demoState.isRunning) {
    return {
      message: "Demo auto activity is already running.",
      demo: {
        isRunning: demoState.isRunning,
        intervalMs: demoState.intervalMs,
        tick: demoState.tick,
      },
    };
  }

  demoState.intervalId = setInterval(runDemoStep, demoState.intervalMs);
  demoState.isRunning = true;

  console.log("[demo] Auto activity started.");

  return {
    message: "Demo auto activity started.",
    demo: {
      isRunning: demoState.isRunning,
      intervalMs: demoState.intervalMs,
      tick: demoState.tick,
    },
  };
}

function stopDemoActivity() {
  if (demoState.intervalId) {
    clearInterval(demoState.intervalId);
    demoState.intervalId = null;
  }

  demoState.isRunning = false;
  console.log("[demo] Auto activity stopped.");

  return {
    message: "Demo auto activity stopped.",
    demo: {
      isRunning: demoState.isRunning,
      intervalMs: demoState.intervalMs,
      tick: demoState.tick,
    },
  };
}

app.listen(port, () => {
  console.log(`Demo blockchain API running at http://localhost:${port}`);
  console.log("Sample wallets: alice-wallet, bob-wallet, carol-wallet");
  console.log("Pool miners: miner-alpha, miner-beta, miner-gamma");

  queueStartupTransactions();
  startDemoActivity();
});
