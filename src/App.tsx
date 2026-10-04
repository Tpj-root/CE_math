/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Tick,
  StrategyConfig,
  ChandelierBar,
  Trade,
  BacktestMetrics
} from './types/trading';
import {
  generateRealisticTicks,
  ticksToCsvString,
} from './utils/sampleData';
import {
  parseCsvTicks,
  ticksToCandles,
  toHeikinAshi,
  computeChandelierExit,
  simulateTrades
} from './utils/engine';
import { TopNav, ActiveTab } from './components/TopNav';
import { ControlsSidebar } from './components/ControlsSidebar';
import { ChartPanels } from './components/ChartPanels';
import { StepInspector } from './components/StepInspector';
import { TradingViewDiffExplainer } from './components/TradingViewDiffExplainer';
import { TradeLogTable } from './components/TradeLogTable';
import { PythonLibraryView } from './components/PythonLibraryView';

export default function App() {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('charts');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState<number>(0);
  const [currentDatasetName, setCurrentDatasetName] = useState<string>('official');

  // Strategy Configuration
  const [config, setConfig] = useState<StrategyConfig>({
    timeframeSec: 60, // 1 minute default
    atrPeriod: 22,
    atrMultiplier: 3.0,
    algorithm: 'tradingview',
    executionRule: 'next_open',
    initialCapital: 10000,
    contractSize: 1.0,
    slippagePoints: 0.0,
    commissionPerTrade: 0.0,
  });

  // Ticks Stream State
  const [ticks, setTicks] = useState<Tick[]>(() => {
    return generateRealisticTicks(1790274600, 4274.65, 2400, 'balanced');
  });

  // Pipeline Computation: Ticks -> Candles -> Heikin-Ashi -> Chandelier Exit -> Simulation
  const { bars, trades, metrics } = useMemo(() => {
    if (ticks.length === 0) {
      return {
        bars: [] as ChandelierBar[],
        trades: [] as Trade[],
        metrics: {
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
          totalCandles: 0,
          totalTicks: 0,
        },
      };
    }

    // Step 2: Candles
    const candles = ticksToCandles(ticks, config.timeframeSec);

    // Step 3: Heikin-Ashi
    const haCandles = toHeikinAshi(candles);

    // Step 4: Chandelier Exit
    const ceBars = computeChandelierExit(
      haCandles,
      config.atrPeriod,
      config.atrMultiplier,
      config.algorithm
    );

    // Step 5 & 6: Walk-Forward Simulation
    const simResult = simulateTrades(ceBars, config);

    return {
      bars: simResult.processedBars,
      trades: simResult.trades,
      metrics: {
        ...simResult.metrics,
        totalTicks: ticks.length,
      },
    };
  }, [ticks, config]);

  // Adjust selected candle if out of bounds
  useEffect(() => {
    if (bars.length > 0 && selectedCandleIndex >= bars.length) {
      setSelectedCandleIndex(bars.length - 1);
    }
  }, [bars.length, selectedCandleIndex]);

  // Dataset switchers
  const handleSelectDataset = (preset: 'official' | 'trending' | 'choppy' | 'volatility') => {
    setCurrentDatasetName(preset);
    let regime: 'balanced' | 'trending_up' | 'choppy' | 'high_volatility' = 'balanced';
    if (preset === 'trending') regime = 'trending_up';
    if (preset === 'choppy') regime = 'choppy';
    if (preset === 'volatility') regime = 'high_volatility';

    const newTicks = generateRealisticTicks(1790274600, 4274.65, 2400, regime);
    setTicks(newTicks);
    setSelectedCandleIndex(0);
  };

  // CSV file upload handler
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const { ticks: parsedTicks, error } = parseCsvTicks(text);
        if (error) {
          alert(`CSV Error: ${error}`);
        } else if (parsedTicks.length > 0) {
          setTicks(parsedTicks);
          setCurrentDatasetName(file.name);
          setSelectedCandleIndex(0);
        }
      }
    };
    reader.readAsText(file);
  };

  // Direct CSV text paste handler
  const handleCustomCsvSubmit = (csvText: string) => {
    const { ticks: parsedTicks, error } = parseCsvTicks(csvText);
    if (error) {
      alert(`CSV Error: ${error}`);
    } else if (parsedTicks.length > 0) {
      setTicks(parsedTicks);
      setCurrentDatasetName('Pasted CSV');
      setSelectedCandleIndex(0);
    }
  };

  // Export computed candles to CSV
  const handleExportDataCsv = () => {
    if (bars.length === 0) return;
    const header =
      'time,time_utc,real_open,real_high,real_low,real_close,ha_open,ha_high,ha_low,ha_close,atr,highest,lowest,long_stop,short_stop,direction,buy_signal,sell_signal,enter_long,enter_short\n';
    const rows = bars
      .map(b =>
        [
          b.time,
          b.timeStr,
          b.realOpen.toFixed(2),
          b.realHigh.toFixed(2),
          b.realLow.toFixed(2),
          b.realClose.toFixed(2),
          b.haOpen.toFixed(3),
          b.haHigh.toFixed(3),
          b.haLow.toFixed(3),
          b.haClose.toFixed(3),
          b.atr.toFixed(4),
          b.highest.toFixed(2),
          b.lowest.toFixed(2),
          b.longStop.toFixed(3),
          b.shortStop.toFixed(3),
          b.direction,
          b.buySignal ? 1 : 0,
          b.sellSignal ? 1 : 0,
          b.enterLong ? 1 : 0,
          b.enterShort ? 1 : 0,
        ].join(',')
      )
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `heikin_ashi_chandelier_${config.timeframeSec}s.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export trades to CSV
  const handleExportTradesCsv = () => {
    if (trades.length === 0) return;
    const header = 'id,side,entry_time,exit_time,entry_price,exit_price,duration_bars,duration_sec,pnl,cum_pnl\n';
    const rows = trades
      .map(t =>
        [
          t.id,
          t.side,
          t.entryTimeStr,
          t.exitTimeStr,
          t.entryPrice.toFixed(4),
          t.exitPrice.toFixed(4),
          t.durationCandles,
          t.durationSeconds,
          t.pnl.toFixed(4),
          t.cumPnl.toFixed(4),
        ].join(',')
      )
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `trades_${config.timeframeSec}s.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download Python file
  const handleDownloadPython = () => {
    const pythonCode = `#!/usr/bin/env python3
"""
================================================================================
 HEIKIN-ASHI + CHANDELIER EXIT QUANTITATIVE TRADING ENGINE & LIBRARY
================================================================================
 Calibrated for Pine Script EverGet exact compatibility + Real Market Execution
"""
import os
import sys
import numpy as np
import pandas as pd

def load_ticks(csv_path):
    df = pd.read_csv(csv_path)
    df.columns = [c.strip().lower() for c in df.columns]
    time_col = next((c for c in df.columns if "time" in c or c in ("t", "ts")), None)
    price_col = next((c for c in df.columns if "price" in c or c in ("p", "close", "last")), None)
    df = df[[time_col, price_col]].rename(columns={time_col: "times", price_col: "prices"})
    df["times"] = pd.to_numeric(df["times"], errors="coerce")
    df["prices"] = pd.to_numeric(df["prices"], errors="coerce")
    df = df.dropna().astype({"times": np.int64, "prices": float})
    if len(df) > 0 and df["times"].iloc[0] > 1e11:
        df["times"] = df["times"] // 1000
    return df.drop_duplicates("times").sort_values("times").reset_index(drop=True)

def ticks_to_candles(ticks, seconds):
    t = ticks.copy()
    t["bucket"] = (t["times"] // seconds) * seconds
    g = t.groupby("bucket")["prices"]
    candles = pd.DataFrame({
        "open": g.first(), "high": g.max(), "low": g.min(), "close": g.last(), "ticks": g.size()
    })
    candles.index = pd.to_datetime(candles.index, unit="s", utc=True)
    return candles

def to_heikin_ashi(candles):
    o, h, l, c = candles["open"].values, candles["high"].values, candles["low"].values, candles["close"].values
    n = len(candles)
    ha_close = (o + h + l + c) / 4.0
    ha_open = np.empty(n)
    if n > 0:
        ha_open[0] = (o[0] + c[0]) / 2.0
        for i in range(1, n):
            ha_open[i] = (ha_open[i - 1] + ha_close[i - 1]) / 2.0
    ha_high = np.maximum.reduce([h, ha_open, ha_close])
    ha_low = np.minimum.reduce([l, ha_open, ha_close])
    return pd.DataFrame({
        "ha_open": ha_open, "ha_high": ha_high, "ha_low": ha_low, "ha_close": ha_close,
        "real_open": o, "real_close": c, "ticks": candles["ticks"].values
    }, index=candles.index)

def chandelier_exit(ha, atr_period=22, atr_mult=3.0, mode="tradingview"):
    df = ha.copy()
    n = len(df)
    high, low, close = df["ha_high"].values, df["ha_low"].values, df["ha_close"].values
    tr = np.empty(n)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        tr[i] = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))
    atr = np.empty(n)
    atr[0] = tr[0]
    for i in range(1, n):
        atr[i] = (atr[i - 1] * (atr_period - 1) + tr[i]) / atr_period
    highest = np.empty(n)
    lowest = np.empty(n)
    for i in range(n):
        s = max(0, i - atr_period + 1)
        highest[i] = high[s: i + 1].max()
        lowest[i] = low[s: i + 1].min()
    long_stop = highest - atr_mult * atr
    short_stop = lowest + atr_mult * atr
    direction = np.ones(n, dtype=int)
    for i in range(1, n):
        prev_c = close[i - 1]
        prev_ls = long_stop[i - 1]
        prev_ss = short_stop[i - 1]
        if prev_c > prev_ls:
            long_stop[i] = max(long_stop[i], prev_ls)
        if prev_c < prev_ss:
            short_stop[i] = min(short_stop[i], prev_ss)
        if close[i] > prev_ss:
            direction[i] = 1
        elif close[i] < prev_ls:
            direction[i] = -1
        else:
            direction[i] = direction[i - 1]
    buy = np.zeros(n, dtype=bool)
    sell = np.zeros(n, dtype=bool)
    for i in range(1, n):
        if direction[i] == 1 and direction[i - 1] == -1:
            buy[i] = True
        elif direction[i] == -1 and direction[i - 1] == 1:
            sell[i] = True
    df["ATR"] = atr
    df["LongStop"] = long_stop
    df["ShortStop"] = short_stop
    df["Direction"] = direction
    df["BuySignal"] = buy
    df["SellSignal"] = sell
    return df

if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "frxXAUUSD_1790274600.csv"
    ticks = load_ticks(csv_file)
    candles = ticks_to_candles(ticks, 60)
    ha = to_heikin_ashi(candles)
    ce = chandelier_exit(ha, 22, 3.0)
    print(f"Processed {len(candles)} candles. Buy signals: {ce['BuySignal'].sum()}, Sell signals: {ce['SellSignal'].sum()}")
`;

    const blob = new Blob([pythonCode], { type: 'text/x-python;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'trading_ha_chandelier.py');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f17] text-slate-100 overflow-hidden font-sans">
      {/* Top Bar Navigation */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onExportCsv={handleExportDataCsv}
        onDownloadPython={handleDownloadPython}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        selectedCandleIndex={selectedCandleIndex}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar for Parameters & CSV Inputs */}
        <ControlsSidebar
          config={config}
          setConfig={setConfig}
          metrics={metrics}
          totalTicks={ticks.length}
          totalCandles={bars.length}
          onSelectDataset={handleSelectDataset}
          onFileUpload={handleFileUpload}
          onCustomCsvSubmit={handleCustomCsvSubmit}
          currentDatasetName={currentDatasetName}
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
        />

        {/* Dynamic Center Viewport */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {activeTab === 'charts' && (
            <ChartPanels
              ticks={ticks}
              bars={bars}
              trades={trades}
              config={config}
              selectedCandleIndex={selectedCandleIndex}
              onSelectCandle={setSelectedCandleIndex}
              onOpenStepInspector={(idx) => {
                setSelectedCandleIndex(idx);
                setActiveTab('inspector');
              }}
            />
          )}

          {activeTab === 'inspector' && (
            <StepInspector
              bars={bars}
              selectedCandleIndex={selectedCandleIndex}
              setSelectedCandleIndex={setSelectedCandleIndex}
              config={config}
            />
          )}

          {activeTab === 'tv_diff' && (
            <TradingViewDiffExplainer config={config} setConfig={setConfig} />
          )}

          {activeTab === 'trades' && (
            <TradeLogTable
              trades={trades}
              metrics={metrics}
              onExportTradesCsv={handleExportTradesCsv}
              onSelectCandle={setSelectedCandleIndex}
              onOpenStepInspector={(idx) => {
                setSelectedCandleIndex(idx);
                setActiveTab('inspector');
              }}
            />
          )}

          {activeTab === 'python_lib' && (
            <PythonLibraryView onDownloadPython={handleDownloadPython} />
          )}
        </main>
      </div>
    </div>
  );
}
