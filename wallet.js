class Wallet {
  constructor(address) {
    this.address = address;
    this.balances = {
      TokenA: 0,
      TokenB: 0,
    };
  }

  credit(token, amount) {
    this.ensureToken(token);
    this.balances[token] += Number(amount);
  }

  debit(token, amount) {
    this.ensureToken(token);

    if (this.balances[token] < amount) {
      throw new Error(`Insufficient ${token} balance for wallet ${this.address}.`);
    }

    this.balances[token] -= Number(amount);
  }

  getBalance(token = "TokenA") {
    this.ensureToken(token);
    return this.balances[token];
  }

  snapshot() {
    return {
      address: this.address,
      balance: this.getBalance("TokenA"),
      balances: { ...this.balances },
    };
  }

  ensureToken(token) {
    if (this.balances[token] === undefined) {
      this.balances[token] = 0;
    }
  }
}

module.exports = Wallet;
