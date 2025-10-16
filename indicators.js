const { SMA, RSI, MACD, BollingerBands } = require("technicalindicators");

function getIndicators(data) {
  const closes = data.map(c => parseFloat(c[4]));
  const price = closes[closes.length - 1];

  const sma = SMA.calculate({ period: 20, values: closes }).pop();
  const rsi = RSI.calculate({ period: 14, values: closes }).pop();
  const macd = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  }).pop()?.MACD || 0;

  const boll = BollingerBands.calculate({
    period: 20,
    stdDev: 2,
    values: closes
  }).pop();

  const band = price < boll.lower ? "lower" : price > boll.upper ? "upper" : "middle";

  return { price, sma, rsi, macd, boll: { ...boll, band } };
}

module.exports = { getIndicators };
