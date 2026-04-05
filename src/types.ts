export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HACandle extends Candle {
  haOpen: number;
  haHigh: number;
  haLow: number;
  haClose: number;
}

export interface Pivot {
  index: number;
  price: number;
  isHigh: boolean;
  time: number;
}

export interface ImpulseResult {
  symbol: string;
  isImpulse: boolean;
  type: 'BULLISH' | 'BEARISH' | 'NONE';
  confidence: number;
  wave: number; // 1, 2, 3, 4, 5
  status: 'NEW' | 'COMPLETE';
  pattern: 'IMPULSE' | 'ZIGZAG';
  lastPrice: number;
  change24h: number;
}
