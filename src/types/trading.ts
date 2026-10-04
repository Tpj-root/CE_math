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

export type ExtremumFormulaType =
  | 'close_extremum'
  | 'range_ma_crossover'
  | 'ma_plus_crest'
  | 'structural_sr';

export type MovingAverageType = 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'ZLEMA';

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

export interface ExtremumData {
  highestClose: number;
  lowestClose: number;
  highestHigh: number;
  lowestLow: number;
  // Noise Reduction Fields:
  upperWickNoise: number;        // haHigh - haClose
  lowerWickNoise: number;        // haClose - haLow
  totalWickNoise: number;        // upper + lower
  highestHighNoiseDelta: number; // highestHigh - highestClose
  lowestLowNoiseDelta: number;   // lowestClose - lowestLow
  wickSpikeFiltered: boolean;    // true if high/low went beyond close extremum
  // For Range MA Crossover:
  prevHigh: number;
  prevLow: number;
  maValue: number;
  maTrendColor: 'green' | 'red';
  rangeCrossLong: boolean;
  rangeCrossShort: boolean;
  // For MA+ Crest/Trough:
  isCrest: boolean;
  isTrough: boolean;
  extremumPointPrice?: number;
  // For S/R Levels:
  isPivotHigh: boolean;
  isPivotLow: boolean;
}

export interface NoiseReductionStats {
  useCloseForExtremums: boolean;
  totalUpperWickNoise: number;
  totalLowerWickNoise: number;
  totalNoisePoints: number;
  avgNoisePerBar: number;
  wickSpikesFilteredCount: number;
  noiseReductionPercent: number;
}

export interface ChandelierBar extends HeikinAshiCandle {
  tr: number;
  atr: number;
  highest: number;
  lowest: number;
  highestClose: number;
  lowestClose: number;
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
  // Extremum calculations:
  extremum: ExtremumData;
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
  // Extremum formula options:
  useCloseForExtremums: boolean;
  extremumFormula: ExtremumFormulaType;
  maType: MovingAverageType;
  maLength: number;
  extremumLookback: number;
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

  // Step 4: Extremums Engine & Noise Reduction
  useCloseForExtremums: boolean;
  highestHigh: number;
  lowestLow: number;
  highestClose: number;
  lowestClose: number;
  extremumBasisText: string;
  candleUpperWickNoise: number;
  candleLowerWickNoise: number;
  candleTotalWickNoise: number;
  noiseReductionBenefit: string;
  noiseExampleText: string;
  longStopRaw: number;
  shortStopRaw: number;
  longStopRatchetFormula: string;
  longStop: number;
  shortStopRatchetFormula: string;
  shortStop: number;

  // Step 4B: Selected Extremum Engine Formula Breakdown
  extremumFormulaName: string;
  extremumFormulaMath: string;
  extremumValuesSummary: string;

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
