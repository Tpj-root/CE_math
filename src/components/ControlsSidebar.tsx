import React, { useRef, useState } from 'react';
import {
  Upload,
  RefreshCw,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { StrategyConfig, BacktestMetrics } from '../types/trading';

interface ControlsSidebarProps {
  config: StrategyConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrategyConfig>>;
  metrics: BacktestMetrics;
  noiseStats?: import('../types/trading').NoiseReductionStats;
  totalTicks: number;
  totalCandles: number;
  onSelectDataset: (preset: 'official' | 'trending' | 'choppy' | 'volatility') => void;
  onFileUpload: (file: File) => void;
  onCustomCsvSubmit: (text: string) => void;
  currentDatasetName: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const ControlsSidebar: React.FC<ControlsSidebarProps> = ({
  config,
  setConfig,
  metrics,
  noiseStats,
  totalTicks,
  totalCandles,
  onSelectDataset,
  onFileUpload,
  onCustomCsvSubmit,
  currentDatasetName,
  isOpen,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  if (!isOpen) return null;

  return (
    <aside className="w-80 shrink-0 bg-[#0d131f] border-r border-[#1e293b] flex flex-col h-full overflow-y-auto text-slate-300 text-xs select-none">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-slate-100 text-sm">Parameters & Data</span>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">v2.4-calibrated</span>
      </div>

      <div className="p-4 space-y-6 flex-1">
        {/* Dataset Selection */}
        <div className="space-y-2">
          <label className="text-slate-400 font-medium block">Tick Data Source</label>
          <div className="space-y-1.5">
            <button
              onClick={() => onSelectDataset('official')}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                currentDatasetName === 'official'
                  ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                  : 'bg-[#131d2e] border-[#223049] hover:bg-[#182438] text-slate-300'
              }`}
            >
              <div className="font-medium text-slate-100">frxXAUUSD Official Gold</div>
              <div className="text-[10px] text-slate-400">Timestamp 1790274600 + real ticks</div>
            </button>

            <button
              onClick={() => onSelectDataset('trending')}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                currentDatasetName === 'trending'
                  ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                  : 'bg-[#131d2e] border-[#223049] hover:bg-[#182438] text-slate-300'
              }`}
            >
              <div className="font-medium text-slate-100">Gold Bullish Breakout Run</div>
              <div className="text-[10px] text-slate-400">Strong directional trend test</div>
            </button>

            <button
              onClick={() => onSelectDataset('choppy')}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                currentDatasetName === 'choppy'
                  ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                  : 'bg-[#131d2e] border-[#223049] hover:bg-[#182438] text-slate-300'
              }`}
            >
              <div className="font-medium text-slate-100">Choppy Mean-Reverting Session</div>
              <div className="text-[10px] text-slate-400">Whipsaw & stop resistance test</div>
            </button>

            <button
              onClick={() => onSelectDataset('volatility')}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                currentDatasetName === 'volatility'
                  ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                  : 'bg-[#131d2e] border-[#223049] hover:bg-[#182438] text-slate-300'
              }`}
            >
              <div className="font-medium text-slate-100">High Volatility Multi-Wave</div>
              <div className="text-[10px] text-slate-400">Dynamic ATR expansion test</div>
            </button>
          </div>

          {/* Upload & Paste Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#131d2e] hover:bg-[#1b283d] border border-[#273752] rounded-lg text-slate-200 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              <span>Upload CSV</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  onFileUpload(e.target.files[0]);
                }
              }}
            />

            <button
              onClick={() => setPasteModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#131d2e] hover:bg-[#1b283d] border border-[#273752] rounded-lg text-slate-200 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
              <span>Paste CSV</span>
            </button>
          </div>
        </div>

        {/* Timeframe Aggregation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-slate-400 font-medium">Candle Timeframe</label>
            <span className="font-mono text-sky-400">
              {config.timeframeSec >= 60
                ? `${config.timeframeSec / 60}m (${config.timeframeSec}s)`
                : `${config.timeframeSec}s`}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: '5s', sec: 5 },
              { label: '15s', sec: 15 },
              { label: '30s', sec: 30 },
              { label: '1m', sec: 60 },
              { label: '2m', sec: 120 },
              { label: '5m', sec: 300 },
              { label: '15m', sec: 900 },
              { label: 'Custom', sec: config.timeframeSec },
            ].map(t => (
              <button
                key={t.label}
                onClick={() => {
                  if (t.label !== 'Custom') {
                    setConfig(prev => ({ ...prev, timeframeSec: t.sec }));
                  }
                }}
                className={`py-1.5 text-center font-mono rounded border transition-colors ${
                  config.timeframeSec === t.sec && t.label !== 'Custom'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-semibold'
                    : 'bg-[#131d2e] border-[#223049] hover:bg-[#1a263c] text-slate-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-500">Seconds:</span>
            <input
              type="number"
              min={1}
              max={86400}
              value={config.timeframeSec}
              onChange={(e) => {
                const val = Math.max(1, parseInt(e.target.value) || 60);
                setConfig(prev => ({ ...prev, timeframeSec: val }));
              }}
              className="bg-[#131d2e] border border-[#273752] rounded px-2 py-1 text-slate-200 font-mono w-24 text-right"
            />
          </div>
        </div>

        {/* Chandelier Exit Parameters */}
        <div className="space-y-3 pt-2 border-t border-[#1e293b]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-100">Chandelier Exit Config</span>
          </div>

          {/* ATR Period */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">ATR Period</span>
              <span className="font-mono text-emerald-400 font-semibold">{config.atrPeriod}</span>
            </div>
            <input
              type="range"
              min={2}
              max={100}
              value={config.atrPeriod}
              onChange={(e) => setConfig(prev => ({ ...prev, atrPeriod: parseInt(e.target.value) }))}
              className="w-full accent-emerald-500 h-1.5 bg-[#1b263b] rounded-lg cursor-pointer"
            />
          </div>

          {/* ATR Multiplier */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">ATR Multiplier</span>
              <span className="font-mono text-emerald-400 font-semibold">{config.atrMultiplier.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={8.0}
              step={0.1}
              value={config.atrMultiplier}
              onChange={(e) => setConfig(prev => ({ ...prev, atrMultiplier: parseFloat(e.target.value) }))}
              className="w-full accent-emerald-500 h-1.5 bg-[#1b263b] rounded-lg cursor-pointer"
            />
          </div>

          {/* Algorithm Mode */}
          <div className="space-y-1.5 pt-1">
            <span className="text-slate-400 block font-medium">Chandelier Ratchet Mode</span>
            <div className="space-y-1">
              <button
                onClick={() => setConfig(prev => ({ ...prev, algorithm: 'tradingview' }))}
                className={`w-full text-left px-2.5 py-1.5 rounded border transition-colors ${
                  config.algorithm === 'tradingview'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-medium'
                    : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>TradingView EverGet Standard</div>
                <div className="text-[10px] text-slate-500">Ratchets on prev close (close[1] &gt; stop)</div>
              </button>

              <button
                onClick={() => setConfig(prev => ({ ...prev, algorithm: 'user_original' }))}
                className={`w-full text-left px-2.5 py-1.5 rounded border transition-colors ${
                  config.algorithm === 'user_original'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-medium'
                    : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Original Python Script Logic</div>
                <div className="text-[10px] text-slate-500">Compares current close[i]</div>
              </button>

              <button
                onClick={() => setConfig(prev => ({ ...prev, algorithm: 'classic' }))}
                className={`w-full text-left px-2.5 py-1.5 rounded border transition-colors ${
                  config.algorithm === 'classic'
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-medium'
                    : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200'
                }`}
              >
                <div>Classic LeBeau Chandelier</div>
                <div className="text-[10px] text-slate-500">Pure trailing band with ATR buffer</div>
              </button>
            </div>
          </div>
        </div>

        {/* Extremums Engine & Noise Reduction */}
        <div className="space-y-3 pt-2.5 border-t border-[#1e293b]">
          {/* Pipeline Flow Indicator */}
          <div className="bg-[#111928] border border-[#1e2b40] rounded-lg p-2 space-y-1">
            <span className="text-[10px] text-slate-400 font-mono block font-semibold">
              QUANT PIPELINE ARCHITECTURE:
            </span>
            <div className="flex items-center text-[10px] font-mono text-slate-300 gap-1 flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60">1. Candle</span>
              <span className="text-slate-500">➔</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">2. HEIKIN_ASHI</span>
              <span className="text-slate-500">➔</span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-950/90 text-cyan-300 font-bold border border-cyan-500/50">3. Extremums (Filter)</span>
              <span className="text-slate-500">➔</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60">4. Chandelier</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-100 flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block animate-pulse"></span>
              Extremums Noise Reduction
            </span>
            <button
              onClick={() => setConfig(prev => ({ ...prev, useCloseForExtremums: !prev.useCloseForExtremums }))}
              className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-all border ${
                config.useCloseForExtremums
                  ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400 shadow-sm shadow-cyan-950'
                  : 'bg-[#131d2e] text-slate-400 border-[#273752] hover:text-slate-200'
              }`}
              title="When ON: highest/lowest uses Close instead of wicks. When OFF: wicks are included."
            >
              🛡️ Close Filter: {config.useCloseForExtremums ? 'ON (Wicks Cut)' : 'OFF (Wicks Kept)'}
            </button>
          </div>

          {/* Noise Explanation & Real-time Metrics Card */}
          <div className={`p-2.5 rounded-lg border text-[11px] font-mono space-y-1.5 ${
            config.useCloseForExtremums
              ? 'bg-[#0f1b2b] border-cyan-500/40 text-cyan-200'
              : 'bg-[#181a24] border-amber-500/30 text-amber-200'
          }`}>
            <div className="flex items-center justify-between font-bold text-[10px]">
              <span>{config.useCloseForExtremums ? '✓ NOISE REDUCTION ACTIVE' : '⚠ NOISE REDUCTION OFF'}</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-black/40">
                {config.useCloseForExtremums ? 'Wicks Ignored' : 'Wicks Included'}
              </span>
            </div>
            
            <p className="text-[10px] text-slate-300 leading-relaxed font-sans">
              {config.useCloseForExtremums ? (
                <>
                  <strong className="text-cyan-300">Highest = max(Close)</strong> &amp; <strong className="text-cyan-300">Lowest = min(Close)</strong>. Sudden wick spikes are filtered out so trailing stops don&apos;t get tripped by market noise.
                </>
              ) : (
                <>
                  <strong className="text-amber-300">Highest = max(High)</strong> &amp; <strong className="text-amber-300">Lowest = min(Low)</strong>. Full wicks are included, making stops susceptible to liquidity spikes.
                </>
              )}
            </p>

            {noiseStats && (
              <div className="pt-1.5 border-t border-slate-700/50 grid grid-cols-2 gap-1 text-[10px]">
                <div className="bg-black/30 p-1 rounded">
                  <span className="text-slate-400 text-[9px] block">Wick Noise Filtered:</span>
                  <span className="text-cyan-300 font-bold">{noiseStats.totalNoisePoints.toFixed(1)} pts</span>
                </div>
                <div className="bg-black/30 p-1 rounded">
                  <span className="text-slate-400 text-[9px] block">Wick Noise Ratio:</span>
                  <span className="text-emerald-400 font-bold">{noiseStats.noiseReductionPercent.toFixed(1)}% of bar</span>
                </div>
              </div>
            )}

            <div className="text-[9px] text-slate-400 pt-0.5">
              <span>Example (H=105, C=101, L=98): </span>
              <span className={config.useCloseForExtremums ? 'text-cyan-300 font-bold' : 'text-amber-300 font-bold'}>
                {config.useCloseForExtremums ? 'Highest = 101' : 'Highest = 105'}
              </span>
            </div>
          </div>

          {/* 4 Radio Buttons for Formulas */}
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
              Select Extremum Formula:
            </span>
            {[
              {
                id: 'close_extremum',
                title: 'F1: Close Extremums (User Given Formula)',
                sub: 'max/min of Close vs High/Low wicks (Noise Reduction)',
              },
              {
                id: 'range_ma_crossover',
                title: 'F2: Range MA Crossover',
                sub: 'Dynamic rolling envelope vs Moving Average',
              },
              {
                id: 'ma_plus_crest',
                title: 'F3: MA+ Crest / Trough',
                sub: 'Inflection wave peaks & valleys along smoothed MA',
              },
              {
                id: 'structural_sr',
                title: 'F4: Structural Pivot S/R',
                sub: '3-bar fractal swing pivots support & resistance',
              },
            ].map(f => (
              <label
                key={f.id}
                onClick={() => setConfig(prev => ({ ...prev, extremumFormula: f.id as any }))}
                className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                  config.extremumFormula === f.id
                    ? 'bg-cyan-500/15 border-cyan-400 text-cyan-200'
                    : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200 hover:bg-[#18253a]'
                }`}
              >
                <input
                  type="radio"
                  name="sidebar_extremum_radio"
                  checked={config.extremumFormula === f.id}
                  onChange={() => setConfig(prev => ({ ...prev, extremumFormula: f.id as any }))}
                  className="accent-cyan-400 mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="font-medium text-slate-200 text-xs">{f.title}</div>
                  <div className="text-[10px] text-slate-500">{f.sub}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Additional Moving Average Controls if F2 or F3 selected */}
          {(config.extremumFormula === 'range_ma_crossover' || config.extremumFormula === 'ma_plus_crest') && (
            <div className="p-2 bg-[#101827] rounded border border-[#1e293b] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">MA Smoothing Type:</span>
                <select
                  value={config.maType}
                  onChange={(e) => setConfig(prev => ({ ...prev, maType: e.target.value as any }))}
                  className="bg-[#131d2e] border border-[#273752] rounded px-2 py-0.5 text-slate-200 font-mono text-xs"
                >
                  <option value="EMA">EMA</option>
                  <option value="SMA">SMA</option>
                  <option value="WMA">WMA</option>
                  <option value="HMA">HMA (Hull)</option>
                  <option value="ZLEMA">ZLEMA</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">MA Length:</span>
                <input
                  type="number"
                  min={3}
                  max={200}
                  value={config.maLength}
                  onChange={(e) => setConfig(prev => ({ ...prev, maLength: Math.max(3, parseInt(e.target.value) || 20) }))}
                  className="bg-[#131d2e] border border-[#273752] rounded px-2 py-0.5 text-slate-200 font-mono w-16 text-right text-xs"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Channel Lookback:</span>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={config.extremumLookback}
                  onChange={(e) => setConfig(prev => ({ ...prev, extremumLookback: Math.max(2, parseInt(e.target.value) || 5) }))}
                  className="bg-[#131d2e] border border-[#273752] rounded px-2 py-0.5 text-slate-200 font-mono w-16 text-right text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Execution Rule */}
        <div className="space-y-2 pt-2 border-t border-[#1e293b]">
          <span className="text-slate-400 block font-medium">Order Execution Rule</span>
          <div className="space-y-1">
            <button
              onClick={() => setConfig(prev => ({ ...prev, executionRule: 'next_open' }))}
              className={`w-full text-left px-2.5 py-1.5 rounded border transition-colors ${
                config.executionRule === 'next_open'
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-medium'
                  : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div>Candle N+1 Real Open (Realistic)</div>
              <div className="text-[10px] text-slate-500">No lookahead bias, fills at market open</div>
            </button>

            <button
              onClick={() => setConfig(prev => ({ ...prev, executionRule: 'signal_close' }))}
              className={`w-full text-left px-2.5 py-1.5 rounded border transition-colors ${
                config.executionRule === 'signal_close'
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-medium'
                  : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div>Signal Candle Close (Real Close)</div>
              <div className="text-[10px] text-slate-500">Executes on close confirmation</div>
            </button>

            <button
              onClick={() => setConfig(prev => ({ ...prev, executionRule: 'ha_synthetic' }))}
              className={`w-full text-left px-2.5 py-1.5 rounded border transition-colors ${
                config.executionRule === 'ha_synthetic'
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 font-medium'
                  : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div>TradingView HA Synthetic Price</div>
              <div className="text-[10px] text-slate-500">Demonstrates why TV strategy tester diverges</div>
            </button>
          </div>
        </div>

        {/* Quick Backtest Summary Card */}
        <div className="p-3 bg-[#131d2e] border border-[#1e293b] rounded-lg space-y-2">
          <div className="flex items-center justify-between text-slate-400 font-medium">
            <span>Quick Performance</span>
            <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block">Total PnL</span>
              <span
                className={`font-semibold ${
                  metrics.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {metrics.totalPnl >= 0 ? `+${metrics.totalPnl.toFixed(2)}` : metrics.totalPnl.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Win Rate</span>
              <span className="font-semibold text-slate-200">{metrics.winRate}%</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Total Trades</span>
              <span className="text-slate-200">{metrics.totalTrades}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Profit Factor</span>
              <span className="text-slate-200">{metrics.profitFactor.toFixed(2)}</span>
            </div>
          </div>
          <div className="pt-1 text-[10px] text-slate-500 flex justify-between">
            <span>Ticks: {totalTicks.toLocaleString()}</span>
            <span>Candles: {totalCandles.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Paste Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#0f172a] border border-[#273752] rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Paste Tick CSV Data</h3>
              <button
                onClick={() => setPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Format: <code>times,prices</code> (e.g. <code>1790274600,4274.65</code>). Duplicates
              and non-numeric values will be sanitized automatically.
            </p>
            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="times,prices&#10;1790274600,4274.65&#10;1790274601,4274.58&#10;..."
              className="w-full bg-[#0b0f17] border border-[#223049] rounded-lg p-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPasteModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#273752] text-slate-300 hover:bg-[#182438]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onCustomCsvSubmit(pasteText);
                  setPasteModalOpen(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
              >
                Apply Data
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
