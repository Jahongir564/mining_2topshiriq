const crypto = require("crypto");

class Block {
  constructor({
    index,
    timestamp = new Date().toISOString(),
    transactions = [],
    previousHash = "0",
  }) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions.map((transaction) => ({ ...transaction }));
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = null;
  }

  calculateHashWithNonce(nonce = this.nonce) {
    return crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          index: this.index,
          timestamp: this.timestamp,
          transactions: this.transactions,
          previousHash: this.previousHash,
          nonce,
        })
      )
      .digest("hex");
  }

  seal(hash) {
    if (this.hash) {
      throw new Error("Block hash is immutable once created.");
    }

    this.hash = hash;

    for (const transaction of this.transactions) {
      Object.freeze(transaction);
    }

    Object.freeze(this.transactions);
    Object.freeze(this);
  }

  mine(difficulty) {
    const targetPrefix = "0".repeat(difficulty);
    let attempts = 0;

    while (true) {
      const candidateHash = this.calculateHashWithNonce(this.nonce);
      attempts += 1;

      if (candidateHash.startsWith(targetPrefix)) {
        this.seal(candidateHash);
        return {
          nonce: this.nonce,
          hash: candidateHash,
          attempts,
        };
      }

      this.nonce += 1;
    }
  }
}

module.exports = Block;
