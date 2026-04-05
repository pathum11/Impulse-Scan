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
  const pivots = findPivots(candles, 3, 3);
  if (pivots.length < 3) return null;

  const lastPrice = candles[candles.length - 1].haClose;
  
  // 1. Full 5-Wave Impulse Detection (0-1-2-3-4-5)
  if (pivots.length >= 6) {
    const last6 = pivots.slice(-6);
    const [p0, p1, p2, p3, p4, p5] = last6;

    // Bullish 5-Wave
    if (!p0.isHigh && p1.isHigh && !p2.isHigh && p3.isHigh && !p4.isHigh && p5.isHigh) {
      const w1 = p1.price - p0.price;
      const w3 = p3.price - p2.price;
      const w5 = p5.price - p4.price;
      
      // Rules: W3 not shortest, W4 doesn't overlap W1
      if (w3 > w1 || w3 > w5) {
        if (p4.price > p1.price) {
          return {
            symbol,
            isImpulse: true,
            type: 'BULLISH',
            confidence: 0.95,
            wave: 5,
            status: 'COMPLETE',
            pattern: 'IMPULSE',
            lastPrice
          };
        }
      }
    }

    // Bearish 5-Wave
    if (p0.isHigh && !p1.isHigh && p2.isHigh && !p3.isHigh && p4.isHigh && !p5.isHigh) {
      const w1 = p0.price - p1.price;
      const w3 = p2.price - p3.price;
      const w5 = p4.price - p5.price;
      
      if (w3 > w1 || w3 > w5) {
        if (p4.price < p1.price) {
          return {
            symbol,
            isImpulse: true,
            type: 'BEARISH',
            confidence: 0.95,
            wave: 5,
            status: 'COMPLETE',
            pattern: 'IMPULSE',
            lastPrice
          };
        }
      }
    }
  }

  // 2. A-B-C Correction Detection
  if (pivots.length >= 4) {
    const last4 = pivots.slice(-4);
    const [p0, p1, p2, p3] = last4;

    // Bullish Zigzag (Correction of a Bearish move)
    if (!p0.isHigh && p1.isHigh && !p2.isHigh && p3.isHigh) {
      if (p1.price > p0.price && p2.price > p0.price && p3.price > p1.price) {
        return {
          symbol,
          isImpulse: false,
          type: 'BULLISH',
          confidence: 0.85,
          wave: 3, // C wave
          status: 'COMPLETE',
          pattern: 'ZIGZAG',
          lastPrice
        };
      }
    }

    // Bearish Zigzag
    if (p0.isHigh && !p1.isHigh && p2.isHigh && !p3.isHigh) {
      if (p1.price < p0.price && p2.price < p0.price && p3.price < p1.price) {
        return {
          symbol,
          isImpulse: false,
          type: 'BEARISH',
          confidence: 0.85,
          wave: 3, // C wave
          status: 'COMPLETE',
          pattern: 'ZIGZAG',
          lastPrice
        };
      }
    }
  }

  // 3. New Wave 3 Impulse (Breakout)
  const last3 = pivots.slice(-3);
  const p0 = last3[0];
  const p1 = last3[1];
  const p2 = last3[2];

  if (!p0.isHigh && p1.isHigh && !p2.isHigh) {
    const w1Len = p1.price - p0.price;
    const w2Retrace = (p1.price - p2.price) / w1Len;
    if (w2Retrace > 0.3 && w2Retrace < 0.9 && lastPrice > p1.price) {
      const wasBelow = candles.slice(-5, -1).some(c => c.haClose <= p1.price);
      if (wasBelow) {
        return {
          symbol,
          isImpulse: true,
          type: 'BULLISH',
          confidence: 0.8,
          wave: 3,
          status: 'NEW',
          pattern: 'IMPULSE',
          lastPrice
        };
      }
    }
  }

  if (p0.isHigh && !p1.isHigh && p2.isHigh) {
    const w1Len = p0.price - p1.price;
    const w2Retrace = (p2.price - p1.price) / w1Len;
    if (w2Retrace > 0.3 && w2Retrace < 0.9 && lastPrice < p1.price) {
      const wasAbove = candles.slice(-5, -1).some(c => c.haClose >= p1.price);
      if (wasAbove) {
        return {
          symbol,
          isImpulse: true,
          type: 'BEARISH',
          confidence: 0.8,
          wave: 3,
          status: 'NEW',
          pattern: 'IMPULSE',
          lastPrice
        };
      }
    }
  }

  return null;
}
