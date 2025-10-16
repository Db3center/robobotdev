require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");
const WebSocket = require("ws");
const { getIndicators } = require("./indicators");

let MODE = process.env.MODE || "simulado";

function getKeys() {
  return MODE === "real"
    ? {
        API_URL: "https://api.binance.com",
        API_KEY: process.env.API_KEY_REAL,
        SECRET_KEY: process.env.SECRET_KEY_REAL
      }
    : {
        API_URL: "https://testnet.binance.vision",
        API_KEY: process.env.API_KEY_TESTNET,
        SECRET_KEY: process.env.SECRET_KEY_TESTNET
      };
}

let { API_URL, API_KEY, SECRET_KEY } = getKeys();

const SYMBOLS = ["BTCUSDT", "XRPUSDT", "DOGEUSDT"];
const QUANTITY = "0.001";
const INTERVAL = "15m";
const LIMIT = 100;
const STOP_LOSS_PERCENT = 0.03;

const state = Object.fromEntries(SYMBOLS.map(s => [s, { opened: false, entryPrice: 0 }]));
const wss = new WebSocket.Server({ port: 8080 });

function broadcast(message) {
  const payload = typeof message === "string" ? message : JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function switchMode() {
  MODE = MODE === "real" ? "simulado" : "real";
  const updatedEnv = `
MODE=${MODE}
API_KEY_TESTNET=${process.env.API_KEY_TESTNET}
SECRET_KEY_TESTNET=${process.env.SECRET_KEY_TESTNET}
API_KEY_REAL=${process.env.API_KEY_REAL}
SECRET_KEY_REAL=${process.env.SECRET_KEY_REAL}
`.trim();

  fs.writeFileSync(".env", updatedEnv);
  ({ API_URL, API_KEY, SECRET_KEY } = getKeys());
  broadcast(`🔁 Modo alterado para: ${MODE.toUpperCase()}`);
}

wss.on("connection", socket => {
  socket.on("message", msg => {
    if (msg === "toggle-mode") switchMode();
  });
});

async function newOrder(symbol, quantity, side) {
  const order = {
    symbol,
    side,
    type: "MARKET",
    quantity,
    timestamp: Date.now()
  };

  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(new URLSearchParams(order).toString())
    .digest("hex");

  order.signature = signature;

  try {
    const { data } = await axios.post(
      `${API_URL}/api/v3/order`,
      new URLSearchParams(order).toString(),
      { headers: { "X-MBX-APIKEY": API_KEY } }
    );
    broadcast(`✅ ${side} ${symbol}: ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    broadcast(`❌ ${symbol} error: ${err.response?.data?.msg || err.message}`);
    return null;
  }
}

async function getBalance() {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(query)
    .digest("hex");

  try {
    const { data } = await axios.get(`${API_URL}/api/v3/account?${query}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": API_KEY }
    });

    const saldo = {};
    ["USDT", "BTC", "XRP", "DOGE"].forEach(asset => {
      const b = data.balances.find(x => x.asset === asset);
      saldo[asset] = parseFloat(b?.free || 0);
    });

    broadcast({ type: "balance", saldo });
  } catch (err) {
    broadcast(`❌ Erro ao obter saldo: ${err.response?.data?.msg || err.message}`);
  }
}

async function analyzeSymbol(symbol) {
  try {
    const { data } = await axios.get(`${API_URL}/api/v3/klines`, {
      params: { symbol, interval: INTERVAL, limit: LIMIT }
    });

    const indicators = getIndicators(data);
    const { price, sma, rsi, macd, boll } = indicators;

    broadcast({ symbol, price });

    const log = `[${symbol}] 💹 Price: ${price.toFixed(4)} | SMA: ${sma.toFixed(4)} | RSI: ${rsi.toFixed(2)} | MACD: ${macd.toFixed(4)} | Band: ${boll.band}`;
    broadcast(log);

    const buySignal = price > sma && rsi > 55 && macd > 0 && boll.band === "lower";
    const sellSignal = price < sma && rsi < 45 && macd < 0 && boll.band === "upper";
    const stopLossTriggered = state[symbol].opened && price < state[symbol].entryPrice * (1 - STOP_LOSS_PERCENT);

    if (!state[symbol].opened && buySignal) {
      const order = await newOrder(symbol, QUANTITY, "BUY");
      if (order) {
        state[symbol] = { opened: true, entryPrice: price };
      }
    } else if (state[symbol].opened && (sellSignal || stopLossTriggered)) {
      await newOrder(symbol, QUANTITY, "SELL");
      state[symbol] = { opened: false, entryPrice: 0 };
      if (stopLossTriggered) broadcast(`🛑 Stop-loss ativado para ${symbol}`);
    } else {
      broadcast(`[${symbol}] ⏳ Aguardando sinal claro...`);
    }
  } catch (err) {
    broadcast(`Erro ${symbol}: ${err.message}`);
  }
}

async function startBot() {
  console.log(`📊 Análise: ${new Date().toLocaleTimeString()} | Modo: ${MODE.toUpperCase()}`);
  getBalance();
  for (const symbol of SYMBOLS) {
    await analyzeSymbol(symbol);
  }
}

setInterval(startBot, 60000);
startBot();
