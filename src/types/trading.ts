export interface Tick {
  time: number; // Unix timestamp in seconds
  price: number;
}

export interface Candle {
  time: number; // Bucket start timestamp in seconds
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number;
}

export interface HeikinAshiCandle extends Candle {
  haOpen: number;
  haHigh: number;
  haLow: number;
  haClose: number;
  realOpen: number;
  realHigh: number;
  realLow: number;
  realClose: number;
}

export interface ChandelierBar extends HeikinAshiCandle {
  tr: number;
  atr: number;
  highest: number;
  lowest: number;
  longStopRaw: number;
  shortStopRaw: number;
  longStop: number;
  shortStop: number;
  direction: 1 | -1;
  buySignal: boolean;
  sellSignal: boolean;
  enterLong: boolean;
  enterShort: boolean;
  executionPrice?: number;
}

export interface Trade {
  id: number;
  side: 'LONG' | 'SHORT';
  entryIndex: number;
  entryTime: number;
  entryTimeStr: string;
  entryPrice: number;
  exitIndex: number;
  exitTime: number;
  exitTimeStr: string;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  cumPnl: number;
  durationCandles: number;
  durationSeconds: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  scratchTrades: number;
  winRate: number; // 0 to 100
  totalPnl: number;
  totalPnlPercent: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgTradePnl: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  expectancy: number;
  totalCandles: number;
  totalTicks: number;
}

export type ChandelierAlgorithm = 'tradingview' | 'classic' | 'user_original';
export type ExecutionRule = 'next_open' | 'signal_close' | 'ha_synthetic';

export interface StrategyConfig {
  timeframeSec: number;
  atrPeriod: number;
  atrMultiplier: number;
  algorithm: ChandelierAlgorithm;
  executionRule: ExecutionRule;
  initialCapital: number;
  contractSize: number;
  slippagePoints: number;
  commissionPerTrade: number;
}

export interface StepMathDetail {
  candleIndex: number;
  timeStr: string;
  ticksInCandle: number;
  
  // Step 1: Real OHLC
  realOpen: number;
  realHigh: number;
  realLow: number;
  realClose: number;

  // Step 2: Heikin-Ashi
  haOpenFormula: string;
  haOpen: number;
  haCloseFormula: string;
  haClose: number;
  haHighFormula: string;
  haHigh: number;
  haLowFormula: string;
  haLow: number;

  // Step 3: True Range & ATR
  trFormula: string;
  tr: number;
  atrFormula: string;
  atr: number;

  // Step 4: Chandelier Bands
  highestHigh: number;
  lowestLow: number;
  longStopRaw: number;
  shortStopRaw: number;
  longStopRatchetFormula: string;
  longStop: number;
  shortStopRatchetFormula: string;
  shortStop: number;

  // Step 5: Direction & Signals
  directionFormula: string;
  direction: 1 | -1;
  directionLabel: 'BULLISH' | 'BEARISH';
  buySignal: boolean;
  sellSignal: boolean;
  signalReason: string;

  // Step 6: Execution (if applicable)
  enterLong: boolean;
  enterShort: boolean;
  executionPrice?: number;
  executionNote: string;
}
