import {
  Tick,
  Candle,
  HeikinAshiCandle,
  ChandelierBar,
  Trade,
  BacktestMetrics,
  StrategyConfig,
  StepMathDetail,
} from '../types/trading';

/**
 * Parses raw CSV string into clean, sorted, de-duplicated Ticks.
 */
export function parseCsvTicks(csvText: string): { ticks: Tick[]; error?: string } {
  try {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return { ticks: [], error: 'CSV must contain at least a header row and one data row.' };
    }

    const header = lines[0].toLowerCase().split(',').map(s => s.trim());
    let timeColIdx = header.findIndex(h => h.includes('time') || h === 't' || h === 'ts' || h === 'timestamp');
    let priceColIdx = header.findIndex(h => h.includes('price') || h === 'p' || h === 'close' || h === 'last');

    if (timeColIdx === -1) timeColIdx = 0;
    if (priceColIdx === -1) priceColIdx = 1;

    const rawTicks: Tick[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length <= Math.max(timeColIdx, priceColIdx)) continue;

      const tRaw = parseFloat(parts[timeColIdx]);
      const pRaw = parseFloat(parts[priceColIdx]);

      if (!isNaN(tRaw) && !isNaN(pRaw)) {
        // Support milliseconds timestamps by converting to seconds if > 1e11
        const timeSec = tRaw > 1e11 ? Math.floor(tRaw / 1000) : Math.floor(tRaw);
        rawTicks.push({ time: timeSec, price: pRaw });
      }
    }

    if (rawTicks.length === 0) {
      return { ticks: [], error: 'No valid numeric time and price rows found.' };
    }

    // Sort by time
    rawTicks.sort((a, b) => a.time - b.time);

    // Remove duplicate timestamps (keep last price if duplicate)
    const uniqueTicks: Tick[] = [];
    const seenTimes = new Set<number>();

    for (let i = rawTicks.length - 1; i >= 0; i--) {
      if (!seenTimes.has(rawTicks[i].time)) {
        seenTimes.add(rawTicks[i].time);
        uniqueTicks.unshift(rawTicks[i]);
      }
    }

    return { ticks: uniqueTicks };
  } catch (err) {
    return { ticks: [], error: `Failed to parse CSV: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Aggregates tick stream into N-second OHLC candles.
 */
export function ticksToCandles(ticks: Tick[], seconds: number): Candle[] {
  if (ticks.length === 0 || seconds <= 0) return [];

  const buckets = new Map<number, number[]>();

  for (const tick of ticks) {
    const bucketTime = Math.floor(tick.time / seconds) * seconds;
    let prices = buckets.get(bucketTime);
    if (!prices) {
      prices = [];
      buckets.set(bucketTime, prices);
    }
    prices.push(tick.price);
  }

  const sortedBucketTimes = Array.from(buckets.keys()).sort((a, b) => a - b);
  const candles: Candle[] = [];

  for (const bTime of sortedBucketTimes) {
    const prices = buckets.get(bTime)!;
    const open = prices[0];
    let high = prices[0];
    let low = prices[0];
    const close = prices[prices.length - 1];

    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > high) high = prices[i];
      if (prices[i] < low) low = prices[i];
    }

    const d = new Date(bTime * 1000);
    const timeStr = d.toISOString().substring(11, 19);

    candles.push({
      time: bTime,
      timeStr,
      open,
      high,
      low,
      close,
      ticks: prices.length,
    });
  }

  return candles;
}

/**
 * Converts regular OHLC candles to Heikin-Ashi candles.
 */
export function toHeikinAshi(candles: Candle[]): HeikinAshiCandle[] {
  const n = candles.length;
  if (n === 0) return [];

  const haCandles: HeikinAshiCandle[] = [];

  let prevHaOpen = 0;
  let prevHaClose = 0;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4.0;

    let haOpen: number;
    if (i === 0) {
      // TradingView seed convention: (open[0] + close[0]) / 2.0
      haOpen = (c.open + c.close) / 2.0;
    } else {
      haOpen = (prevHaOpen + prevHaClose) / 2.0;
    }

    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    haCandles.push({
      ...c,
      haOpen,
      haHigh,
      haLow,
      haClose,
      realOpen: c.open,
      realHigh: c.high,
      realLow: c.low,
      realClose: c.close,
    });

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  return haCandles;
}

/**
 * Moving Average Calculation Functions
 */
export function computeSMA(src: number[], len: number): number[] {
  const res = new Array<number>(src.length);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= len) sum -= src[i - len];
    res[i] = i >= len - 1 ? sum / len : sum / (i + 1);
  }
  return res;
}

export function computeEMA(src: number[], len: number): number[] {
  const res = new Array<number>(src.length);
  if (src.length === 0) return res;
  const k = 2 / (len + 1);
  res[0] = src[0];
  for (let i = 1; i < src.length; i++) {
    res[i] = src[i] * k + res[i - 1] * (1 - k);
  }
  return res;
}

export function computeWMA(src: number[], len: number): number[] {
  const res = new Array<number>(src.length);
  const norm = (len * (len + 1)) / 2;
  for (let i = 0; i < src.length; i++) {
    if (i < len - 1) {
      let subNorm = 0;
      let sum = 0;
      for (let j = 0; j <= i; j++) {
        const weight = j + 1;
        sum += src[j] * weight;
        subNorm += weight;
      }
      res[i] = sum / (subNorm || 1);
    } else {
      let sum = 0;
      for (let j = 0; j < len; j++) {
        sum += src[i - len + 1 + j] * (j + 1);
      }
      res[i] = sum / norm;
    }
  }
  return res;
}

export function computeHMA(src: number[], len: number): number[] {
  const halfLen = Math.max(1, Math.round(len / 2));
  const sqrtLen = Math.max(1, Math.round(Math.sqrt(len)));
  const wmaHalf = computeWMA(src, halfLen);
  const wmaFull = computeWMA(src, len);
  const diff = new Array<number>(src.length);
  for (let i = 0; i < src.length; i++) {
    diff[i] = 2 * wmaHalf[i] - wmaFull[i];
  }
  return computeWMA(diff, sqrtLen);
}

export function computeZLEMA(src: number[], len: number): number[] {
  const lag = Math.max(1, Math.floor(len / 2));
  const zSrc = new Array<number>(src.length);
  for (let i = 0; i < src.length; i++) {
    const lagVal = i >= lag ? src[i - lag] : src[0];
    zSrc[i] = src[i] + (src[i] - lagVal);
  }
  return computeEMA(zSrc, len);
}

export function computeMA(
  src: number[],
  type: import('../types/trading').MovingAverageType,
  len: number
): number[] {
  switch (type) {
    case 'SMA': return computeSMA(src, len);
    case 'EMA': return computeEMA(src, len);
    case 'WMA': return computeWMA(src, len);
    case 'HMA': return computeHMA(src, len);
    case 'ZLEMA': return computeZLEMA(src, len);
    default: return computeEMA(src, len);
  }
}

/**
 * Computes Chandelier Exit over Heikin-Ashi candles with Extremum Engine.
 */
export function computeChandelierExit(
  ha: HeikinAshiCandle[],
  atrPeriod: number = 22,
  atrMult: number = 3.0,
  algorithm: 'tradingview' | 'classic' | 'user_original' = 'tradingview',
  useCloseForExtremums: boolean = false,
  extremumFormula: import('../types/trading').ExtremumFormulaType = 'close_extremum',
  maType: import('../types/trading').MovingAverageType = 'EMA',
  maLength: number = 20,
  extremumLookback: number = 5
): ChandelierBar[] {
  const n = ha.length;
  if (n === 0) return [];

  // Step 1: True Range
  const tr = new Array<number>(n);
  tr[0] = ha[0].haHigh - ha[0].haLow;

  for (let i = 1; i < n; i++) {
    const h = ha[i].haHigh;
    const l = ha[i].haLow;
    const prevClose = ha[i - 1].haClose;
    tr[i] = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
  }

  // Step 2: Wilder's ATR (TradingView uses ta.rma(tr, length))
  const atr = new Array<number>(n);
  if (algorithm === 'user_original') {
    for (let i = 0; i < n; i++) {
      if (i < atrPeriod - 1) {
        atr[i] = NaN;
      } else if (i === atrPeriod - 1) {
        let sum = 0;
        for (let j = 0; j < atrPeriod; j++) sum += tr[j];
        atr[i] = sum / atrPeriod;
      } else {
        atr[i] = (atr[i - 1] * (atrPeriod - 1) + tr[i]) / atrPeriod;
      }
    }
  } else {
    let runningAtr = tr[0];
    atr[0] = runningAtr;
    for (let i = 1; i < n; i++) {
      runningAtr = (runningAtr * (atrPeriod - 1) + tr[i]) / atrPeriod;
      atr[i] = runningAtr;
    }
  }

  // Step 3: Rolling Highest & Lowest
  // Formula 1: "Use Close Price for Extremums"
  // If ON:  Highest = max(Close), Lowest = min(Close) (wicks ignored)
  // If OFF: Highest = max(High),  Lowest = min(Low)   (wicks included)
  const highestHigh = new Array<number>(n);
  const lowestLow = new Array<number>(n);
  const highestClose = new Array<number>(n);
  const lowestClose = new Array<number>(n);
  const highest = new Array<number>(n);
  const lowest = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const startIdx = Math.max(0, i - atrPeriod + 1);
    let hMax = ha[startIdx].haHigh;
    let lMin = ha[startIdx].haLow;
    let cMax = ha[startIdx].haClose;
    let cMin = ha[startIdx].haClose;

    for (let j = startIdx + 1; j <= i; j++) {
      if (ha[j].haHigh > hMax) hMax = ha[j].haHigh;
      if (ha[j].haLow < lMin) lMin = ha[j].haLow;
      if (ha[j].haClose > cMax) cMax = ha[j].haClose;
      if (ha[j].haClose < cMin) cMin = ha[j].haClose;
    }

    highestHigh[i] = hMax;
    lowestLow[i] = lMin;
    highestClose[i] = cMax;
    lowestClose[i] = cMin;

    highest[i] = useCloseForExtremums ? cMax : hMax;
    lowest[i] = useCloseForExtremums ? cMin : lMin;
  }

  // Pre-calculate Extremum Curves for Formula 2, 3, 4
  const haCloses = ha.map(b => b.haClose);
  const maValues = computeMA(haCloses, maType, maLength);

  // Range MA rolling extremes over extremumLookback
  const prevHighs = new Array<number>(n);
  const prevLows = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - extremumLookback + 1);
    let maxH = useCloseForExtremums ? ha[start].haClose : ha[start].haHigh;
    let minL = useCloseForExtremums ? ha[start].haClose : ha[start].haLow;
    for (let j = start + 1; j <= i; j++) {
      const curH = useCloseForExtremums ? ha[j].haClose : ha[j].haHigh;
      const curL = useCloseForExtremums ? ha[j].haClose : ha[j].haLow;
      if (curH > maxH) maxH = curH;
      if (curL < minL) minL = curL;
    }
    prevHighs[i] = maxH;
    prevLows[i] = minL;
  }

  // Formula 3: Track Crests (Peaks) & Troughs (Valleys) along MA curve
  const crests = new Array<boolean>(n).fill(false);
  const troughs = new Array<boolean>(n).fill(false);
  const lastCrestVal = new Array<number>(n);
  const lastTroughVal = new Array<number>(n);

  let currentCrest = highestHigh[0];
  let currentTrough = lowestLow[0];

  for (let i = 0; i < n; i++) {
    if (i >= 2) {
      const slopeCur = maValues[i] - maValues[i - 1];
      const slopePrev = maValues[i - 1] - maValues[i - 2];
      if (slopePrev > 0 && slopeCur <= 0) {
        crests[i] = true;
        currentCrest = maValues[i - 1];
      }
      if (slopePrev < 0 && slopeCur >= 0) {
        troughs[i] = true;
        currentTrough = maValues[i - 1];
      }
    }
    lastCrestVal[i] = currentCrest;
    lastTroughVal[i] = currentTrough;
  }

  // Formula 4: Structural Swing Pivots (3-bar fractal highs / lows)
  const pivotHighs = new Array<boolean>(n).fill(false);
  const pivotLows = new Array<boolean>(n).fill(false);
  const activePivotHigh = new Array<number>(n);
  const activePivotLow = new Array<number>(n);

  let currentPivotH = highestHigh[0];
  let currentPivotL = lowestLow[0];

  for (let i = 0; i < n; i++) {
    if (i >= 2) {
      const prevH = useCloseForExtremums ? ha[i - 1].haClose : ha[i - 1].haHigh;
      const curH = useCloseForExtremums ? ha[i].haClose : ha[i].haHigh;
      const prev2H = useCloseForExtremums ? ha[i - 2].haClose : ha[i - 2].haHigh;

      const prevL = useCloseForExtremums ? ha[i - 1].haClose : ha[i - 1].haLow;
      const curL = useCloseForExtremums ? ha[i].haClose : ha[i].haLow;
      const prev2L = useCloseForExtremums ? ha[i - 2].haClose : ha[i - 2].haLow;

      if (prevH > curH && prevH > prev2H) {
        pivotHighs[i - 1] = true;
        currentPivotH = prevH;
      }
      if (prevL < curL && prevL < prev2L) {
        pivotLows[i - 1] = true;
        currentPivotL = prevL;
      }
    }
    activePivotHigh[i] = currentPivotH;
    activePivotLow[i] = currentPivotL;
  }

  // Choose the active starting anchors based on the selected Extremum Formula
  const activeUpperAnchor = new Array<number>(n);
  const activeLowerAnchor = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    if (extremumFormula === 'range_ma_crossover') {
      activeUpperAnchor[i] = prevHighs[i];
      activeLowerAnchor[i] = prevLows[i];
    } else if (extremumFormula === 'ma_plus_crest') {
      activeUpperAnchor[i] = lastCrestVal[i];
      activeLowerAnchor[i] = lastTroughVal[i];
    } else if (extremumFormula === 'structural_sr') {
      activeUpperAnchor[i] = activePivotHigh[i];
      activeLowerAnchor[i] = activePivotLow[i];
    } else {
      // Default: 'close_extremum' (User Given Formula)
      activeUpperAnchor[i] = highest[i];
      activeLowerAnchor[i] = lowest[i];
    }
  }

  // Step 4: Ratcheting Stops & Direction Flip
  const longStopRaw = new Array<number>(n);
  const shortStopRaw = new Array<number>(n);
  const longStop = new Array<number>(n);
  const shortStop = new Array<number>(n);
  const direction = new Array<1 | -1>(n);
  const buySignal = new Array<boolean>(n).fill(false);
  const sellSignal = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const curAtr = isNaN(atr[i]) ? tr[i] : atr[i];
    const curHighest = activeUpperAnchor[i];
    const curLowest = activeLowerAnchor[i];
    const close = ha[i].haClose;

    const lsRaw = curHighest - atrMult * curAtr;
    const ssRaw = curLowest + atrMult * curAtr;

    longStopRaw[i] = lsRaw;
    shortStopRaw[i] = ssRaw;

    let ls = lsRaw;
    let ss = ssRaw;

    if (algorithm === 'tradingview') {
      // TradingView EverGet Official Logic:
      // longStop := close[1] > longStop[1] ? math.max(longStop, longStop[1]) : longStop
      // shortStop := close[1] < shortStop[1] ? math.min(shortStop, shortStop[1]) : shortStop
      if (i > 0) {
        const prevClose = ha[i - 1].haClose;
        const prevLongStop = longStop[i - 1];
        const prevShortStop = shortStop[i - 1];

        if (prevClose > prevLongStop) {
          ls = Math.max(ls, prevLongStop);
        }
        if (prevClose < prevShortStop) {
          ss = Math.min(ss, prevShortStop);
        }
      }

      longStop[i] = ls;
      shortStop[i] = ss;

      if (i === 0) {
        direction[0] = 1;
      } else {
        const prevShortStop = shortStop[i - 1];
        const prevLongStop = longStop[i - 1];
        const prevDir = direction[i - 1];

        if (close > prevShortStop) {
          direction[i] = 1;
        } else if (close < prevLongStop) {
          direction[i] = -1;
        } else {
          direction[i] = prevDir;
        }
      }
    } else if (algorithm === 'user_original') {
      if (i > 0 && !isNaN(longStop[i - 1]) && close > longStop[i - 1]) {
        ls = Math.max(ls, longStop[i - 1]);
      }
      if (i > 0 && !isNaN(shortStop[i - 1]) && close < shortStop[i - 1]) {
        ss = Math.min(ss, shortStop[i - 1]);
      }

      longStop[i] = ls;
      shortStop[i] = ss;

      if (i === 0) {
        direction[0] = 1;
      } else {
        const lsPrev = longStop[i - 1];
        const ssPrev = shortStop[i - 1];
        if (isNaN(lsPrev) || isNaN(ssPrev)) {
          direction[i] = 1;
        } else if (close > ssPrev) {
          direction[i] = 1;
        } else if (close < lsPrev) {
          direction[i] = -1;
        } else {
          direction[i] = direction[i - 1];
        }
      }
    } else {
      if (i > 0) {
        if (direction[i - 1] === 1) {
          ls = Math.max(ls, longStop[i - 1]);
        } else {
          ss = Math.min(ss, shortStop[i - 1]);
        }
      }
      longStop[i] = ls;
      shortStop[i] = ss;

      if (i === 0) {
        direction[0] = 1;
      } else {
        if (direction[i - 1] === 1 && close < longStop[i]) {
          direction[i] = -1;
        } else if (direction[i - 1] === -1 && close > shortStop[i]) {
          direction[i] = 1;
        } else {
          direction[i] = direction[i - 1];
        }
      }
    }

    if (i > 0) {
      if (direction[i] === 1 && direction[i - 1] === -1) {
        buySignal[i] = true;
      } else if (direction[i] === -1 && direction[i - 1] === 1) {
        sellSignal[i] = true;
      }
    }
  }

  // Build final bars with Extremum data
  const result: ChandelierBar[] = [];
  for (let i = 0; i < n; i++) {
    const rangeCrossLong = i > 0 && prevLows[i] > maValues[i] && prevLows[i - 1] <= maValues[i - 1];
    const rangeCrossShort = i > 0 && prevHighs[i] < maValues[i] && prevHighs[i - 1] >= maValues[i - 1];

    result.push({
      ...ha[i],
      tr: tr[i],
      atr: isNaN(atr[i]) ? tr[i] : atr[i],
      highest: activeUpperAnchor[i],
      lowest: activeLowerAnchor[i],
      highestClose: highestClose[i],
      lowestClose: lowestClose[i],
      longStopRaw: longStopRaw[i],
      shortStopRaw: shortStopRaw[i],
      longStop: longStop[i],
      shortStop: shortStop[i],
      direction: direction[i],
      buySignal: buySignal[i],
      sellSignal: sellSignal[i],
      enterLong: i > 0 ? buySignal[i - 1] : false,
      enterShort: i > 0 ? sellSignal[i - 1] : false,
      extremum: {
        highestClose: highestClose[i],
        lowestClose: lowestClose[i],
        highestHigh: highestHigh[i],
        lowestLow: lowestLow[i],
        prevHigh: prevHighs[i],
        prevLow: prevLows[i],
        maValue: maValues[i],
        maTrendColor: (i > 0 && maValues[i] >= maValues[i - 1]) ? 'green' : 'red',
        rangeCrossLong,
        rangeCrossShort,
        isCrest: crests[i],
        isTrough: troughs[i],
        extremumPointPrice: crests[i] || troughs[i] ? maValues[i - 1] : undefined,
        isPivotHigh: pivotHighs[i],
        isPivotLow: pivotLows[i],
      },
    });
  }

  return result;
}

/**
 * Runs walk-forward simulation according to the chosen execution rule.
 */
export function simulateTrades(
  bars: ChandelierBar[],
  config: StrategyConfig
): { trades: Trade[]; metrics: BacktestMetrics; processedBars: ChandelierBar[] } {
  const n = bars.length;
  if (n === 0) {
    return {
      trades: [],
      metrics: emptyMetrics(0, 0),
      processedBars: [],
    };
  }

  const processedBars = bars.map(b => ({ ...b }));
  const trades: Trade[] = [];

  let position: 0 | 1 | -1 = 0;
  let entryPrice = 0;
  let entryIndex = 0;
  let entryTime = 0;
  let entryTimeStr = '';
  let cumPnl = 0;

  for (let i = 0; i < n; i++) {
    const bar = processedBars[i];

    // Determine execution triggers based on config rule
    let triggerLong = false;
    let triggerShort = false;
    let execPrice = 0;

    if (config.executionRule === 'next_open') {
      // Signal fired at candle i-1 -> execute at candle i OPEN
      triggerLong = bar.enterLong;
      triggerShort = bar.enterShort;
      execPrice = bar.realOpen;
    } else if (config.executionRule === 'signal_close') {
      // Signal fired at candle i -> execute at candle i CLOSE
      triggerLong = bar.buySignal;
      triggerShort = bar.sellSignal;
      execPrice = bar.realClose;
    } else {
      // TradingView HA synthetic mode: executed at haClose or haOpen
      triggerLong = bar.enterLong;
      triggerShort = bar.enterShort;
      execPrice = bar.haOpen;
    }

    if (triggerLong || triggerShort) {
      bar.executionPrice = execPrice;
    }

    // Position State Machine
    if (position === 0) {
      if (triggerLong) {
        position = 1;
        entryPrice = execPrice + config.slippagePoints;
        entryIndex = i;
        entryTime = bar.time;
        entryTimeStr = bar.timeStr;
      } else if (triggerShort) {
        position = -1;
        entryPrice = execPrice - config.slippagePoints;
        entryIndex = i;
        entryTime = bar.time;
        entryTimeStr = bar.timeStr;
      }
    } else if (position === 1 && triggerShort) {
      // Close Long, open Short
      const exitPrice = execPrice - config.slippagePoints;
      const rawPnl = (exitPrice - entryPrice) * config.contractSize;
      const netPnl = rawPnl - config.commissionPerTrade * 2;
      cumPnl += netPnl;

      trades.push({
        id: trades.length + 1,
        side: 'LONG',
        entryIndex,
        entryTime,
        entryTimeStr,
        entryPrice: round(entryPrice, 4),
        exitIndex: i,
        exitTime: bar.time,
        exitTimeStr: bar.timeStr,
        exitPrice: round(exitPrice, 4),
        pnl: round(netPnl, 4),
        pnlPercent: round(((exitPrice - entryPrice) / entryPrice) * 100, 3),
        cumPnl: round(cumPnl, 4),
        durationCandles: i - entryIndex,
        durationSeconds: bar.time - entryTime,
      });

      // Flip to Short
      position = -1;
      entryPrice = execPrice - config.slippagePoints;
      entryIndex = i;
      entryTime = bar.time;
      entryTimeStr = bar.timeStr;
    } else if (position === -1 && triggerLong) {
      // Close Short, open Long
      const exitPrice = execPrice + config.slippagePoints;
      const rawPnl = (entryPrice - exitPrice) * config.contractSize;
      const netPnl = rawPnl - config.commissionPerTrade * 2;
      cumPnl += netPnl;

      trades.push({
        id: trades.length + 1,
        side: 'SHORT',
        entryIndex,
        entryTime,
        entryTimeStr,
        entryPrice: round(entryPrice, 4),
        exitIndex: i,
        exitTime: bar.time,
        exitTimeStr: bar.timeStr,
        exitPrice: round(exitPrice, 4),
        pnl: round(netPnl, 4),
        pnlPercent: round(((entryPrice - exitPrice) / entryPrice) * 100, 3),
        cumPnl: round(cumPnl, 4),
        durationCandles: i - entryIndex,
        durationSeconds: bar.time - entryTime,
      });

      // Flip to Long
      position = 1;
      entryPrice = execPrice + config.slippagePoints;
      entryIndex = i;
      entryTime = bar.time;
      entryTimeStr = bar.timeStr;
    }
  }

  // Force-close open position on the last candle
  if (position !== 0 && n > 0) {
    const lastBar = processedBars[n - 1];
    const exitPrice =
      position === 1
        ? lastBar.realClose - config.slippagePoints
        : lastBar.realClose + config.slippagePoints;
    const rawPnl =
      position === 1
        ? (exitPrice - entryPrice) * config.contractSize
        : (entryPrice - exitPrice) * config.contractSize;
    const netPnl = rawPnl - config.commissionPerTrade * 2;
    cumPnl += netPnl;

    trades.push({
      id: trades.length + 1,
      side: position === 1 ? 'LONG' : 'SHORT',
      entryIndex,
      entryTime,
      entryTimeStr,
      entryPrice: round(entryPrice, 4),
      exitIndex: n - 1,
      exitTime: lastBar.time,
      exitTimeStr: lastBar.timeStr,
      exitPrice: round(exitPrice, 4),
      pnl: round(netPnl, 4),
      pnlPercent: round(
        position === 1
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - exitPrice) / entryPrice) * 100,
        3
      ),
      cumPnl: round(cumPnl, 4),
      durationCandles: n - 1 - entryIndex,
      durationSeconds: lastBar.time - entryTime,
    });
  }

  const metrics = calculateMetrics(trades, n, config.initialCapital);
  return { trades, metrics, processedBars };
}

function calculateMetrics(trades: Trade[], totalCandles: number, initialCapital: number): BacktestMetrics {
  if (trades.length === 0) {
    return emptyMetrics(totalCandles, 0);
  }

  let wins = 0;
  let losses = 0;
  let scratches = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let totalPnl = 0;
  let bestTrade = -Infinity;
  let worstTrade = Infinity;

  let peak = 0;
  let maxDd = 0;
  let runningCum = 0;

  for (const t of trades) {
    totalPnl += t.pnl;
    runningCum += t.pnl;

    if (runningCum > peak) {
      peak = runningCum;
    }
    const dd = peak - runningCum;
    if (dd > maxDd) {
      maxDd = dd;
    }

    if (t.pnl > 0) {
      wins++;
      grossWin += t.pnl;
    } else if (t.pnl < 0) {
      losses++;
      grossLoss += Math.abs(t.pnl);
    } else {
      scratches++;
    }

    if (t.pnl > bestTrade) bestTrade = t.pnl;
    if (t.pnl < worstTrade) worstTrade = t.pnl;
  }

  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999.99 : 0;
  const avgTradePnl = trades.length > 0 ? totalPnl / trades.length : 0;
  const avgWin = wins > 0 ? grossWin / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;

  const winProb = wins / trades.length;
  const lossProb = losses / trades.length;
  const expectancy = winProb * avgWin - lossProb * avgLoss;

  return {
    totalTrades: trades.length,
    winningTrades: wins,
    losingTrades: losses,
    scratchTrades: scratches,
    winRate: round(winRate, 2),
    totalPnl: round(totalPnl, 4),
    totalPnlPercent: round((totalPnl / initialCapital) * 100, 2),
    profitFactor: round(profitFactor, 2),
    maxDrawdown: round(maxDd, 4),
    maxDrawdownPercent: round((maxDd / initialCapital) * 100, 2),
    avgTradePnl: round(avgTradePnl, 4),
    avgWin: round(avgWin, 4),
    avgLoss: round(avgLoss, 4),
    bestTrade: round(bestTrade, 4),
    worstTrade: round(worstTrade, 4),
    expectancy: round(expectancy, 4),
    totalCandles,
    totalTicks: 0,
  };
}

function emptyMetrics(totalCandles: number, totalTicks: number): BacktestMetrics {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    scratchTrades: 0,
    winRate: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    avgTradePnl: 0,
    avgWin: 0,
    avgLoss: 0,
    bestTrade: 0,
    worstTrade: 0,
    expectancy: 0,
    totalCandles,
    totalTicks,
  };
}

/**
 * Extracts a crystal-clear, deep step-by-step breakdown of how a specific candle was computed.
 */
export function getDetailedStepMath(
  bars: ChandelierBar[],
  index: number,
  atrPeriod: number = 22,
  atrMult: number = 3.0,
  config?: import('../types/trading').StrategyConfig
): StepMathDetail | null {
  if (index < 0 || index >= bars.length) return null;
  const bar = bars[index];
  const prevBar = index > 0 ? bars[index - 1] : null;

  const useClose = config ? config.useCloseForExtremums : false;
  const extremumFormula = config ? config.extremumFormula : 'close_extremum';

  // Step 2 formulas
  const haCloseFormula = `(${bar.realOpen.toFixed(2)} + ${bar.realHigh.toFixed(2)} + ${bar.realLow.toFixed(2)} + ${bar.realClose.toFixed(2)}) / 4 = ${bar.haClose.toFixed(3)}`;
  
  let haOpenFormula: string;
  if (index === 0) {
    haOpenFormula = `(RealOpen[0] + RealClose[0]) / 2 = (${bar.realOpen.toFixed(2)} + ${bar.realClose.toFixed(2)}) / 2 = ${bar.haOpen.toFixed(3)} (TradingView Seed)`;
  } else {
    haOpenFormula = `(haOpen[i-1] + haClose[i-1]) / 2 = (${prevBar!.haOpen.toFixed(3)} + ${prevBar!.haClose.toFixed(3)}) / 2 = ${bar.haOpen.toFixed(3)}`;
  }

  const haHighFormula = `max(High: ${bar.realHigh.toFixed(2)}, haOpen: ${bar.haOpen.toFixed(3)}, haClose: ${bar.haClose.toFixed(3)}) = ${bar.haHigh.toFixed(3)}`;
  const haLowFormula = `min(Low: ${bar.realLow.toFixed(2)}, haOpen: ${bar.haOpen.toFixed(3)}, haClose: ${bar.haClose.toFixed(3)}) = ${bar.haLow.toFixed(3)}`;

  // Step 3: TR & ATR
  let trFormula: string;
  if (index === 0) {
    trFormula = `haHigh - haLow = ${bar.haHigh.toFixed(3)} - ${bar.haLow.toFixed(3)} = ${bar.tr.toFixed(3)}`;
  } else {
    trFormula = `max(H - L: ${(bar.haHigh - bar.haLow).toFixed(3)}, |H - C_prev|: ${Math.abs(bar.haHigh - prevBar!.haClose).toFixed(3)}, |L - C_prev|: ${Math.abs(bar.haLow - prevBar!.haClose).toFixed(3)}) = ${bar.tr.toFixed(3)}`;
  }

  let atrFormula: string;
  if (index === 0) {
    atrFormula = `Initial bar seed TR = ${bar.tr.toFixed(3)}`;
  } else {
    atrFormula = `(${prevBar!.atr.toFixed(3)} × ${atrPeriod - 1} + ${bar.tr.toFixed(3)}) / ${atrPeriod} = ${bar.atr.toFixed(3)}`;
  }

  // Step 4: Chandelier Bands & Extremums
  const longStopRaw = bar.longStopRaw;
  const shortStopRaw = bar.shortStopRaw;

  const hHigh = bar.extremum.highestHigh;
  const lLow = bar.extremum.lowestLow;
  const hClose = bar.extremum.highestClose;
  const lClose = bar.extremum.lowestClose;

  const extremumBasisText = useClose
    ? `Use Close Price for Extremums = ON: Upper Anchor = HighestClose (${hClose.toFixed(2)}), Lower Anchor = LowestClose (${lClose.toFixed(2)}) [Wicks Ignored]`
    : `Use Close Price for Extremums = OFF: Upper Anchor = HighestHigh (${hHigh.toFixed(2)}), Lower Anchor = LowestLow (${lLow.toFixed(2)}) [Wicks Included]`;

  let longStopRatchetFormula: string;
  let shortStopRatchetFormula: string;

  if (index === 0) {
    longStopRatchetFormula = `Anchor(${bar.highest.toFixed(2)}) - ${atrMult} × ${bar.atr.toFixed(3)} = ${longStopRaw.toFixed(3)}`;
    shortStopRatchetFormula = `Anchor(${bar.lowest.toFixed(2)}) + ${atrMult} × ${bar.atr.toFixed(3)} = ${shortStopRaw.toFixed(3)}`;
  } else {
    const prevC = prevBar!.haClose;
    const prevLs = prevBar!.longStop;
    const prevSs = prevBar!.shortStop;

    if (prevC > prevLs) {
      longStopRatchetFormula = `prevClose (${prevC.toFixed(3)}) > prevLongStop (${prevLs.toFixed(3)}) → max(Raw: ${longStopRaw.toFixed(3)}, prevStop: ${prevLs.toFixed(3)}) = ${bar.longStop.toFixed(3)} (Ratcheted UP)`;
    } else {
      longStopRatchetFormula = `prevClose (${prevC.toFixed(3)}) <= prevLongStop (${prevLs.toFixed(3)}) → reset to Raw = ${bar.longStop.toFixed(3)}`;
    }

    if (prevC < prevSs) {
      shortStopRatchetFormula = `prevClose (${prevC.toFixed(3)}) < prevShortStop (${prevSs.toFixed(3)}) → min(Raw: ${shortStopRaw.toFixed(3)}, prevStop: ${prevSs.toFixed(3)}) = ${bar.shortStop.toFixed(3)} (Ratcheted DOWN)`;
    } else {
      shortStopRatchetFormula = `prevClose (${prevC.toFixed(3)}) >= prevShortStop (${prevSs.toFixed(3)}) → reset to Raw = ${bar.shortStop.toFixed(3)}`;
    }
  }

  // Step 4B: Selected Extremum Engine Formula Breakdown
  let extremumFormulaName = 'Formula 1: Close Extremums (Use Close Price vs Wicks)';
  let extremumFormulaMath = `Highest = max(Close_1..Close_${atrPeriod}), Lowest = min(Close_1..Close_${atrPeriod})`;
  let extremumValuesSummary = `Close ON: LongStop = ${hClose.toFixed(2)} - ${atrMult}×${bar.atr.toFixed(3)} = ${(hClose - atrMult * bar.atr).toFixed(3)} | Close OFF: LongStop = ${hHigh.toFixed(2)} - ${atrMult}×${bar.atr.toFixed(3)} = ${(hHigh - atrMult * bar.atr).toFixed(3)}`;

  if (extremumFormula === 'range_ma_crossover') {
    extremumFormulaName = 'Formula 2: Range Moving Average Crossover Extremums';
    extremumFormulaMath = `MA(${config?.maType || 'EMA'}, ${config?.maLength || 20}) = ${bar.extremum.maValue.toFixed(2)} | Rolling Channel [${bar.extremum.prevLow.toFixed(2)}, ${bar.extremum.prevHigh.toFixed(2)}]`;
    extremumValuesSummary = `Trend Slope: ${bar.extremum.maTrendColor.toUpperCase()} | Range Cross Bull: ${bar.extremum.rangeCrossLong ? 'YES' : 'NO'} | Range Cross Bear: ${bar.extremum.rangeCrossShort ? 'YES' : 'NO'}`;
  } else if (extremumFormula === 'ma_plus_crest') {
    extremumFormulaName = 'Formula 3: MA+ Crest / Trough Inflection Extremums';
    extremumFormulaMath = `Inflection wave detection along smoothed ${config?.maType || 'EMA'} trajectory`;
    extremumValuesSummary = `Current Crest: ${bar.extremum.isCrest ? 'NEW CREST PEAK' : 'Tracking'} | Current Trough: ${bar.extremum.isTrough ? 'NEW TROUGH VALLEY' : 'Tracking'} | Active Anchor: ${bar.highest.toFixed(2)}`;
  } else if (extremumFormula === 'structural_sr') {
    extremumFormulaName = 'Formula 4: Structural Swing Pivot Support & Resistance';
    extremumFormulaMath = `3-Bar Fractal Pivots (Swing High: H[t-1] > H[t] & H[t-1] > H[t-2])`;
    extremumValuesSummary = `Pivot High: ${bar.extremum.isPivotHigh ? 'ACTIVE PIVOT HIGH' : 'Level active'} | Pivot Low: ${bar.extremum.isPivotLow ? 'ACTIVE PIVOT LOW' : 'Level active'} | Resistance: ${bar.highest.toFixed(2)} / Support: ${bar.lowest.toFixed(2)}`;
  }

  // Step 5: Direction
  let directionFormula: string;
  let signalReason = 'No flip detected — trend continuation.';

  if (index === 0) {
    directionFormula = 'Initial seed direction = 1 (Bullish)';
  } else {
    const prevSs = prevBar!.shortStop;
    const prevLs = prevBar!.longStop;

    if (bar.haClose > prevSs) {
      directionFormula = `haClose (${bar.haClose.toFixed(3)}) > prevShortStop (${prevSs.toFixed(3)}) → Flip to BULLISH (+1)`;
      if (prevBar!.direction === -1) {
        signalReason = 'Bearish to Bullish transition: BuySignal triggered!';
      }
    } else if (bar.haClose < prevLs) {
      directionFormula = `haClose (${bar.haClose.toFixed(3)}) < prevLongStop (${prevLs.toFixed(3)}) → Flip to BEARISH (-1)`;
      if (prevBar!.direction === 1) {
        signalReason = 'Bullish to Bearish transition: SellSignal triggered!';
      }
    } else {
      directionFormula = `haClose (${bar.haClose.toFixed(3)}) between stops → Maintain previous direction (${prevBar!.direction === 1 ? '+1 BULLISH' : '-1 BEARISH'})`;
    }
  }

  // Step 6: Execution
  let executionNote = 'No trade execution trigger on this candle open.';
  if (bar.enterLong) {
    executionNote = `BuySignal from previous candle fired! Enter LONG executed at current Real Open = ${bar.realOpen.toFixed(2)}`;
  } else if (bar.enterShort) {
    executionNote = `SellSignal from previous candle fired! Enter SHORT executed at current Real Open = ${bar.realOpen.toFixed(2)}`;
  }

  return {
    candleIndex: index,
    timeStr: bar.timeStr,
    ticksInCandle: bar.ticks,
    realOpen: bar.realOpen,
    realHigh: bar.realHigh,
    realLow: bar.realLow,
    realClose: bar.realClose,
    haOpenFormula,
    haOpen: bar.haOpen,
    haCloseFormula,
    haClose: bar.haClose,
    haHighFormula,
    haHigh: bar.haHigh,
    haLowFormula,
    haLow: bar.haLow,
    trFormula,
    tr: bar.tr,
    atrFormula,
    atr: bar.atr,
    useCloseForExtremums: useClose,
    highestHigh: hHigh,
    lowestLow: lLow,
    highestClose: hClose,
    lowestClose: lClose,
    extremumBasisText,
    longStopRaw,
    shortStopRaw,
    longStopRatchetFormula,
    longStop: bar.longStop,
    shortStopRatchetFormula,
    shortStop: bar.shortStop,
    extremumFormulaName,
    extremumFormulaMath,
    extremumValuesSummary,
    directionFormula,
    direction: bar.direction,
    directionLabel: bar.direction === 1 ? 'BULLISH' : 'BEARISH',
    buySignal: bar.buySignal,
    sellSignal: bar.sellSignal,
    signalReason,
    enterLong: bar.enterLong,
    enterShort: bar.enterShort,
    executionPrice: bar.executionPrice,
    executionNote,
  };
}

function round(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}
