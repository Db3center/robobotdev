function getIndicators(candles) {
  const closePrices = candles.map(c => parseFloat(c[4]));
  const volumes = candles.map(c => parseFloat(c[5]));

  const price = closePrices[closePrices.length - 1];
  const volume = volumes[volumes.length - 1];
  const averageVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  const ema = calculateEMA(closePrices, 21);
  const rsi = calculateRSI(closePrices, 14);
  const { macd, signal } = calculateMACD(closePrices);
  const boll = calculateBollingerBands(closePrices);

  return { price, ema, rsi, macd, signal, boll, volume, averageVolume };
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(prices, period) {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[prices.length - i] - prices[prices.length - i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;

  const signal = calculateEMA(prices.slice(-9).map((_, i) => macd), 9);
  return { macd, signal };
}

function calculateBollingerBands(prices, period = 20) {
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = mean + 2 * stdDev;
  const lower = mean - 2 * stdDev;

  const band = prices[prices.length - 1] > upper
    ? "upper"
    : prices[prices.length - 1] < lower
    ? "lower"
    : "middle";

  return { upper, lower, mean, band };
}

module.exports = { getIndicators };

