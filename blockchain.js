const Block = require("./block");
const MiningPool = require("./miner");
const Transaction = require("./transaction");
const Wallet = require("./wallet");

class Blockchain {
  constructor(options = {}) {
    this.difficulty = options.difficulty ?? 4;
    this.blockTransactionLimit = options.blockTransactionLimit ?? 3;
    this.miningReward = options.miningReward ?? 50;
    this.rewardToken = "TokenA";
    this.swapToken = "TokenB";
    this.swapRate = options.swapRate ?? 2;
    this.pendingTransactions = [];
    this.wallets = new Map();
    this.isMining = false;
    this.systemAddress = "SYSTEM";
    this.networkAddress = "NETWORK";
    this.swapPoolAddress = "swap-pool";
    this.lastMiningSummary = null;

    this.demoWallets = ["alice-wallet", "bob-wallet", "carol-wallet"];

    this.miningPool = new MiningPool(
      options.miners ?? [
        { name: "Worker Alpha", address: "miner-alpha", hashPower: 5 },
        { name: "Worker Beta", address: "miner-beta", hashPower: 3 },
        { name: "Worker Gamma", address: "miner-gamma", hashPower: 2 },
      ],
      this.rewardToken
    );

    this.bootstrapWallets();
    this.chain = [this.createGenesisBlock()];
    this.applyBlockTransactions(this.chain[0]);
  }

  bootstrapWallets() {
    this.ensureWallet(this.swapPoolAddress);

    for (const address of this.demoWallets) {
      this.ensureWallet(address);
    }

    for (const miner of this.miningPool.getMiners()) {
      this.ensureWallet(miner.address);
    }
  }

  createGenesisBlock() {
    const genesisTransactions = [
      new Transaction({
        sender: this.systemAddress,
        receiver: this.swapPoolAddress,
        amount: 10000,
        token: this.swapToken,
        type: "genesis-liquidity",
      }).toRecord(),
      new Transaction({
        sender: this.systemAddress,
        receiver: "alice-wallet",
        amount: 200,
        token: this.swapToken,
        type: "genesis-funding",
      }).toRecord(),
      new Transaction({
        sender: this.systemAddress,
        receiver: "bob-wallet",
        amount: 200,
        token: this.swapToken,
        type: "genesis-funding",
      }).toRecord(),
      new Transaction({
        sender: this.systemAddress,
        receiver: "carol-wallet",
        amount: 200,
        token: this.swapToken,
        type: "genesis-funding",
      }).toRecord(),
    ];

    const genesisBlock = new Block({
      index: 0,
      timestamp: new Date().toISOString(),
      transactions: genesisTransactions,
      previousHash: "0",
    });

    genesisBlock.seal(genesisBlock.calculateHashWithNonce(0));
    return genesisBlock;
  }

  ensureWallet(address) {
    if (!this.wallets.has(address)) {
      this.wallets.set(address, new Wallet(address));
    }

    return this.wallets.get(address);
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  getProjectedBalance(address, token) {
    const wallet = this.ensureWallet(address);
    const currentBalance = wallet.getBalance(token);

    const pendingDelta = this.pendingTransactions.reduce((delta, transaction) => {
      if (transaction.token !== token) {
        return delta;
      }

      if (transaction.sender === address) {
        return delta - transaction.amount;
      }

      if (transaction.receiver === address) {
        return delta + transaction.amount;
      }

      return delta;
    }, 0);

    return Number((currentBalance + pendingDelta).toFixed(8));
  }

  createTransaction(payload) {
    return new Transaction(payload);
  }

  addTransaction(payload, options = {}) {
    const transaction =
      payload instanceof Transaction ? payload : new Transaction(payload);
    transaction.validate();

    this.ensureWallet(transaction.sender);
    this.ensureWallet(transaction.receiver);

    if (
      ![this.systemAddress, this.networkAddress].includes(transaction.sender) &&
      this.getProjectedBalance(transaction.sender, transaction.token) <
        transaction.amount
    ) {
      throw new Error(
        `Wallet ${transaction.sender} does not have enough ${transaction.token}.`
      );
    }

    const record = transaction.toRecord();
    this.pendingTransactions.push(record);

    console.log(
      `[transaction] ${record.sender} -> ${record.receiver} | ${record.amount} ${record.token} (${record.type})`
    );

    const shouldTriggerAutoMine = options.triggerAutoMine !== false;

    if (
      shouldTriggerAutoMine &&
      this.pendingTransactions.length >= this.blockTransactionLimit &&
      !this.isMining
    ) {
      return this.minePendingTransactions({ reason: "auto" });
    }

    return {
      message: "Transaction added to pending queue.",
      pendingTransactions: this.pendingTransactions.length,
    };
  }

  addTransactions(transactions) {
    let latestResult = null;

    transactions.forEach((transaction, index) => {
      latestResult = this.addTransaction(transaction, {
        triggerAutoMine: index === transactions.length - 1,
      });
    });

    return latestResult;
  }

  swapTokens({
    address,
    amount,
    fromToken = this.rewardToken,
    toToken = this.swapToken,
  }) {
    if (fromToken === toToken) {
      throw new Error("Swap requires two different token symbols.");
    }

    if (fromToken !== this.rewardToken || toToken !== this.swapToken) {
      throw new Error(
        `Only ${this.rewardToken} -> ${this.swapToken} swaps are enabled in this demo.`
      );
    }

    const numericAmount = Number(amount);
    const outputAmount = Number((numericAmount * this.swapRate).toFixed(8));

    if (this.getProjectedBalance(address, fromToken) < numericAmount) {
      throw new Error(`Wallet ${address} does not have enough ${fromToken} to swap.`);
    }

    if (this.getProjectedBalance(this.swapPoolAddress, toToken) < outputAmount) {
      throw new Error("Swap pool does not have enough liquidity.");
    }

    console.log(
      `[swap] ${address} swapping ${numericAmount} ${fromToken} for ${outputAmount} ${toToken}`
    );

    return this.addTransactions([
      new Transaction({
        sender: address,
        receiver: this.swapPoolAddress,
        amount: numericAmount,
        token: fromToken,
        type: "swap-in",
      }),
      new Transaction({
        sender: this.swapPoolAddress,
        receiver: address,
        amount: outputAmount,
        token: toToken,
        type: "swap-out",
      }),
    ]);
  }

  minePendingTransactions({ reason = "manual", force = false } = {}) {
    if (this.isMining) {
      return {
        message: "Mining is already in progress.",
      };
    }

    if (this.pendingTransactions.length === 0) {
      return {
        message: "No transactions available to mine.",
      };
    }

    if (!force && this.pendingTransactions.length < this.blockTransactionLimit) {
      return {
        message: `Need ${this.blockTransactionLimit} transactions before auto-mining starts.`,
        pendingTransactions: this.pendingTransactions.length,
      };
    }

    this.isMining = true;

    try {
      const transactionsForBlock = this.pendingTransactions.splice(
        0,
        Math.min(this.blockTransactionLimit, this.pendingTransactions.length)
      );
      const { round, rewardTransactions } =
        this.miningPool.prepareRewardTransactions(this.miningReward);
      const blockTransactions = transactionsForBlock.concat(rewardTransactions);
      const newBlock = new Block({
        index: this.chain.length,
        timestamp: new Date().toISOString(),
        transactions: blockTransactions,
        previousHash: this.getLatestBlock().hash,
      });

      console.log(
        `[mining] Starting ${reason} mining for block #${newBlock.index} with ${transactionsForBlock.length} user transactions.`
      );

      for (const miner of round) {
        console.log(
          `[pool] ${miner.name} contributed ${miner.contribution} shares this round.`
        );
      }

      const miningResult = newBlock.mine(this.difficulty);

      console.log(
        `[mining] Block #${newBlock.index} mined with nonce ${miningResult.nonce} and hash ${miningResult.hash}`
      );

      this.chain.push(newBlock);
      this.applyBlockTransactions(newBlock);
      this.miningPool.recordRound(round, rewardTransactions);

      this.lastMiningSummary = {
        blockIndex: newBlock.index,
        hash: newBlock.hash,
        nonce: newBlock.nonce,
        attempts: miningResult.attempts,
        difficulty: this.difficulty,
        reason,
        poolRound: round,
        includedTransactions: blockTransactions,
        rewardBreakdown: rewardTransactions,
      };

      console.log(
        `[block] Added block #${newBlock.index}. Chain height is now ${this.chain.length}.`
      );

      const shouldContinueAutoMining =
        this.pendingTransactions.length >= this.blockTransactionLimit;

      if (shouldContinueAutoMining) {
        setImmediate(() => {
          this.minePendingTransactions({ reason: "backlog" });
        });
      }

      return {
        message: "Block mined successfully.",
        summary: this.lastMiningSummary,
      };
    } finally {
      this.isMining = false;
    }
  }

  applyBlockTransactions(block) {
    for (const transaction of block.transactions) {
      const senderIsMint = [this.systemAddress, this.networkAddress].includes(
        transaction.sender
      );

      this.ensureWallet(transaction.receiver);

      if (!senderIsMint) {
        this.ensureWallet(transaction.sender).debit(
          transaction.token,
          transaction.amount
        );
      }

      this.ensureWallet(transaction.receiver).credit(
        transaction.token,
        transaction.amount
      );
    }
  }

  getWallet(address) {
    return this.ensureWallet(address).snapshot();
  }

  getWallets() {
    return Array.from(this.wallets.values()).map((wallet) => wallet.snapshot());
  }

  getChain() {
    return this.chain.map((block) => ({
      index: block.index,
      timestamp: block.timestamp,
      transactions: block.transactions,
      previousHash: block.previousHash,
      nonce: block.nonce,
      hash: block.hash,
    }));
  }

  getPoolStatus() {
    return this.miningPool.getMiners();
  }

  isChainValid() {
    for (let index = 1; index < this.chain.length; index += 1) {
      const currentBlock = this.chain[index];
      const previousBlock = this.chain[index - 1];

      const recalculatedHash = currentBlock.calculateHashWithNonce(
        currentBlock.nonce
      );

      if (currentBlock.hash !== recalculatedHash) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }

    return true;
  }
}

module.exports = Blockchain;
