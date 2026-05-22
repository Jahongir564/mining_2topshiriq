# PoW Blockchain Demo

Small localhost blockchain demo built with Node.js and Express.

## Features

- Proof of Work mining using SHA-256
- Auto-mining when enough transactions are queued
- Wallet ledger with `TokenA` and `TokenB`
- Mining pool reward splitting by simulated worker contribution
- Local token swap from `TokenA` to `TokenB`
- Demo traffic that keeps the chain growing

## Run

```bash
npm install
npm start
```

Server URL:

```text
http://localhost:3000
```

## Endpoints

- `GET /chain`
- `POST /transaction`
- `GET /mine`
- `GET /wallet/:address`
- `POST /swap`
- `GET /wallets`
- `GET /miners`

## Example Requests

Create a transfer:

```bash
curl -X POST http://localhost:3000/transaction \
  -H "Content-Type: application/json" \
  -d "{\"sender\":\"alice-wallet\",\"receiver\":\"bob-wallet\",\"amount\":10,\"token\":\"TokenB\"}"
```

Swap mined tokens:

```bash
curl -X POST http://localhost:3000/swap \
  -H "Content-Type: application/json" \
  -d "{\"address\":\"alice-wallet\",\"amount\":5,\"fromToken\":\"TokenA\",\"toToken\":\"TokenB\"}"
```
