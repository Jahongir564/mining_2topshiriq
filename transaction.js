class Transaction {
  constructor({
    sender,
    receiver,
    amount,
    token = "TokenA",
    type = "transfer",
    timestamp = new Date().toISOString(),
  }) {
    this.sender = sender;
    this.receiver = receiver;
    this.amount = Number(amount);
    this.token = token;
    this.type = type;
    this.timestamp = timestamp;
  }

  validate() {
    if (!this.sender || !this.receiver) {
      throw new Error("Transaction requires both sender and receiver.");
    }

    if (!Number.isFinite(this.amount) || this.amount <= 0) {
      throw new Error("Transaction amount must be a positive number.");
    }

    return true;
  }

  toRecord() {
    return {
      sender: this.sender,
      receiver: this.receiver,
      amount: this.amount,
      token: this.token,
      type: this.type,
      timestamp: this.timestamp,
    };
  }
}

module.exports = Transaction;
