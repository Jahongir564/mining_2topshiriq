const Transaction = require("./transaction");

class MiningPool {
  constructor(miners = [], rewardToken = "TokenA") {
    this.rewardToken = rewardToken;
    this.miners = miners.map((miner) => ({
      name: miner.name,
      address: miner.address,
      hashPower: miner.hashPower,
      totalEarned: 0,
      totalContribution: 0,
    }));
  }

  getMiners() {
    return this.miners.map((miner) => ({ ...miner }));
  }

  prepareRewardTransactions(totalReward) {
    const round = this.miners.map((miner) => {
      const contribution =
        miner.hashPower * (10 + Math.floor(Math.random() * 20)) +
        Math.floor(Math.random() * 10);

      return {
        ...miner,
        contribution,
      };
    });

    const totalContribution = round.reduce(
      (sum, miner) => sum + miner.contribution,
      0
    );

    let remainingReward = Number(totalReward);

    const rewardTransactions = round.map((miner, index) => {
      const rawShare =
        index === round.length - 1
          ? remainingReward
          : (totalReward * miner.contribution) / totalContribution;
      const rewardShare = Number(rawShare.toFixed(8));

      remainingReward = Number((remainingReward - rewardShare).toFixed(8));

      return new Transaction({
        sender: "NETWORK",
        receiver: miner.address,
        amount: rewardShare,
        token: this.rewardToken,
        type: "mining-reward",
      }).toRecord();
    });

    return {
      round,
      rewardTransactions,
    };
  }

  recordRound(round, rewardTransactions) {
    for (const miner of round) {
      const poolMiner = this.miners.find(
        (candidate) => candidate.address === miner.address
      );

      if (!poolMiner) {
        continue;
      }

      const rewardTransaction = rewardTransactions.find(
        (transaction) => transaction.receiver === miner.address
      );

      poolMiner.totalContribution += miner.contribution;
      poolMiner.totalEarned += rewardTransaction ? rewardTransaction.amount : 0;
    }
  }
}

module.exports = MiningPool;
