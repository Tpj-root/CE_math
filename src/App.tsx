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
  BacktestMetrics,
  DataMode,
  AlgoTradingState
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
  computeNoiseReductionAnalytics,
  simulateTrades
} from './utils/engine';
import { TopNav, ActiveTab } from './components/TopNav';
import { ControlsSidebar } from './components/ControlsSidebar';
import { ChartPanels } from './components/ChartPanels';
import { StepInspector } from './components/StepInspector';
import { TradingViewDiffExplainer } from './components/TradingViewDiffExplainer';
import { TradeLogTable } from './components/TradeLogTable';
import { TestSuiteView } from './components/TestSuiteView';
import { PythonLibraryView } from './components/PythonLibraryView';
import { OnlineTradingTerminal } from './components/OnlineTradingTerminal';
import { GuideModal } from './components/GuideModal';
import { FULL_PYTHON_SCRIPT } from './utils/fullPythonScript';

export default function App() {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<ActiveTab>('charts');
  const [dataMode, setDataMode] = useState<DataMode>('offline_csv');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState<number>(0);
  const [currentDatasetName, setCurrentDatasetName] = useState<string>('official');

  // Algo Trading (AutoTrade) State with Green / Red indicator & CTRL+E
  const [algoTrading, setAlgoTrading] = useState<AlgoTradingState>({
    enabled: true,
    statusText: 'Algo Trading: ENABLED',
    toolbarColor: 'green',
    lastUpdated: Date.now(),
  });

  const handleToggleAlgoTrading = useCallback(() => {
    setAlgoTrading(prev => {
      const nextEnabled = !prev.enabled;
      return {
        enabled: nextEnabled,
        statusText: nextEnabled ? 'Algo Trading: ENABLED' : 'Algo Trading: DISABLED',
        toolbarColor: nextEnabled ? 'green' : 'red',
        errorMessage: nextEnabled ? undefined : 'Please enable Algo Trading or (CTRL + E)',
        lastUpdated: Date.now(),
      };
    });
  }, []);

  // Global Keyboard Shortcut: CTRL + E to toggle Algo Trading
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        handleToggleAlgoTrading();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleAlgoTrading]);

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
    useCloseForExtremums: false,
    extremumFormula: 'close_extremum',
    maType: 'EMA',
    maLength: 20,
    extremumLookback: 5,
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

    // Step 4: Chandelier Exit with Extremums Engine
    const ceBars = computeChandelierExit(
      haCandles,
      config.atrPeriod,
      config.atrMultiplier,
      config.algorithm,
      config.useCloseForExtremums,
      config.extremumFormula,
      config.maType,
      config.maLength,
      config.extremumLookback
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

  // Noise Reduction Statistics across bars
  const noiseStats = useMemo(() => {
    return computeNoiseReductionAnalytics(bars, config.useCloseForExtremums);
  }, [bars, config.useCloseForExtremums]);

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
    const blob = new Blob([FULL_PYTHON_SCRIPT], { type: 'text/x-python;charset=utf-8;' });
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
        dataMode={dataMode}
        setDataMode={setDataMode}
        algoTrading={algoTrading}
        onToggleAlgoTrading={handleToggleAlgoTrading}
        onExportCsv={handleExportDataCsv}
        onDownloadPython={handleDownloadPython}
        onOpenGuide={() => setGuideOpen(true)}
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
          noiseStats={noiseStats}
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
          {/* Top Pipeline Architecture & Noise Reduction Flow Banner */}
          <div className="bg-[#0e1422] border-b border-[#1e293b] px-4 py-2 flex items-center justify-between text-xs font-mono overflow-x-auto gap-4 shrink-0 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider shrink-0">
                Quant Pipeline:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60 font-medium text-[11px]">
                  1. Candle (OHLC)
                </span>
                <span className="text-slate-500">➔</span>
                <span className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-medium text-[11px]">
                  2. HEIKIN_ASHI
                </span>
                <span className="text-slate-500">➔</span>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, useCloseForExtremums: !prev.useCloseForExtremums }))}
                  className={`px-2.5 py-0.5 rounded font-bold border transition-all flex items-center gap-1.5 cursor-pointer text-[11px] ${
                    config.useCloseForExtremums
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-sm shadow-cyan-900/40 hover:bg-cyan-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
                  }`}
                  title="Click to toggle: Use Close Price for Extremums (filters out noise wicks)"
                >
                  <span>🛡️ 3. Extremums (Filter: {config.useCloseForExtremums ? 'ON · Wicks Cut' : 'OFF · Wicks Kept'})</span>
                </button>
                <span className="text-slate-500">➔</span>
                <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-medium text-[11px]">
                  4. Chandelier Exit ({config.atrPeriod} · {config.atrMultiplier}x)
                </span>
                <span className="text-slate-500">➔</span>
                <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-medium text-[11px]">
                  5. Buy/Sell Signals (N+1 Open)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 text-[11px]">
              <div>
                <span className="text-slate-400">Wick Noise Filtered: </span>
                <span className="text-cyan-300 font-bold">{noiseStats.totalNoisePoints.toFixed(1)} pts</span>
                <span className="text-slate-500 text-[10px]"> ({noiseStats.noiseReductionPercent.toFixed(1)}%)</span>
              </div>
              <div className="hidden lg:block">
                <span className="text-slate-400">Wick Spikes Filtered: </span>
                <span className="text-emerald-400 font-bold">{noiseStats.wickSpikesFilteredCount} bars</span>
              </div>
            </div>
          </div>

          {activeTab === 'charts' && (
            <ChartPanels
              ticks={ticks}
              bars={bars}
              trades={trades}
              config={config}
              setConfig={setConfig}
              noiseStats={noiseStats}
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

          {activeTab === 'online_terminal' && (
            <OnlineTradingTerminal
              config={config}
              setConfig={setConfig}
              algoTrading={algoTrading}
              setAlgoTrading={setAlgoTrading}
              onToggleAlgoTrading={handleToggleAlgoTrading}
              onNavigateToTab={setActiveTab}
            />
          )}

          {activeTab === 'test_suite' && (
            <TestSuiteView
              ticks={ticks}
              datasetName={currentDatasetName}
              config={config}
              setConfig={setConfig}
              onFileUpload={handleFileUpload}
              onCustomCsvSubmit={handleCustomCsvSubmit}
            />
          )}

          {activeTab === 'python_lib' && (
            <PythonLibraryView onDownloadPython={handleDownloadPython} />
          )}
        </main>
      </div>

      {/* Interactive Guide & Documentation Modal */}
      <GuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        onSwitchTab={(tab) => {
          setActiveTab(tab);
          setGuideOpen(false);
        }}
      />
    </div>
  );
}
