import axios from 'axios';
import { Candle, HACandle, Pivot } from '../types';

const BINANCE_FUTURES_URL = 'https://fapi.binance.com';

export async function getFutureSymbols(): Promise<string[]> {
  try {
    const response = await axios.get(`${BINANCE_FUTURES_URL}/fapi/v1/exchangeInfo`);
    return response.data.symbols
      .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map((s: any) => s.symbol);
  } catch (error) {
    console.error('Error fetching symbols:', error);
    return [];
  }
}

export async function getKlines(symbol: string, interval: string = '5m', limit: number = 100): Promise<Candle[]> {
  try {
    const response = await axios.get(`${BINANCE_FUTURES_URL}/fapi/v1/klines`, {
      params: { symbol, interval, limit }
    });
    return response.data.map((k: any) => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (error) {
    console.error(`Error fetching klines for ${symbol}:`, error);
    return [];
  }
}

export function calculateHeikinAshi(candles: Candle[]): HACandle[] {
  const haCandles: HACandle[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    let haOpen: number;
    let haClose: number;
    
    haClose = (c.open + c.high + c.low + c.close) / 4;
    
    if (i === 0) {
      haOpen = (c.open + c.close) / 2;
    } else {
      const prev = haCandles[i - 1];
      haOpen = (prev.haOpen + prev.haClose) / 2;
    }
    
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    
    haCandles.push({
      ...c,
      haOpen,
      haHigh,
      haLow,
      haClose
    });
  }
  
  return haCandles;
}

export function findPivots(candles: HACandle[], leftLen: number = 5, rightLen: number = 5): Pivot[] {
  const pivots: Pivot[] = [];
  
  for (let i = leftLen; i < candles.length - rightLen; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;
    
    for (let j = i - leftLen; j <= i + rightLen; j++) {
      if (i === j) continue;
      if (candles[j].haHigh > current.haHigh) isHigh = false;
      if (candles[j].haLow < current.haLow) isLow = false;
    }
    
    if (isHigh) {
      pivots.push({ index: i, price: current.haHigh, isHigh: true, time: current.time });
    } else if (isLow) {
      pivots.push({ index: i, price: current.haLow, isHigh: false, time: current.time });
    }
  }
  
  return pivots;
}

export function detectImpulse(symbol: string, candles: HACandle[]): any {
  if (candles.length < 2) return null;
  const last = candles[candles.length - 1];
  const lastPrice = last.haClose;
  const prev = candles[candles.length - 2];

  // Simulating "Fair Value Line Color" based on momentum changes of the last 2 candles.
  const isFairValueBlue = last.haClose > prev.haClose;
  const isFairValueOrange = last.haClose < prev.haClose;
  
  // AR Bands logic:
  // Simulate band levels based on relative price movement
  const isUpperBandHit = last.haHigh >= lastPrice * 1.015; 
  const isLowerBandHit = last.haLow <= lastPrice * 0.985;
  
  // Danger zone: Don't Buy if too high, Don't Sell if too low
  const isNearUpperBand = last.haHigh >= lastPrice * 1.01;
  const isNearLowerBand = last.haLow <= lastPrice * 0.99;

  // Sell Signal: Upper Band hit AND Fair Value Line is Orange AND NOT near Lower band
  if (isUpperBandHit && isFairValueOrange && !isNearLowerBand) {
    return {
      symbol,
      isImpulse: true,
      type: 'BEARISH',
      confidence: 0.95,
      wave: 0,
      status: 'NEW',
      pattern: 'SELL SIGNAL (AR BANDS)',
      lastPrice
    };
  }

  // Buy Signal: Lower Band hit AND Fair Value Line is Blue AND NOT near Upper band
  if (isLowerBandHit && isFairValueBlue && !isNearUpperBand) {
    return {
      symbol,
      isImpulse: true,
      type: 'BULLISH',
      confidence: 0.95,
      wave: 0,
      status: 'NEW',
      pattern: 'BUY SIGNAL (AR BANDS)',
      lastPrice
    };
  }

  return null;
}
