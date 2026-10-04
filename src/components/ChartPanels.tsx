import React, { useState, useMemo, useRef } from 'react';
import {
  Tick,
  ChandelierBar,
  Trade,
  StrategyConfig
} from '../types/trading';
import { Eye, EyeOff, ZoomIn, ZoomOut, RotateCcw, Crosshair } from 'lucide-react';

interface ChartPanelsProps {
  ticks: Tick[];
  bars: ChandelierBar[];
  trades: Trade[];
  config: StrategyConfig;
  setConfig?: React.Dispatch<React.SetStateAction<StrategyConfig>>;
  noiseStats?: import('../types/trading').NoiseReductionStats;
  selectedCandleIndex: number;
  onSelectCandle: (index: number) => void;
  onOpenStepInspector: (index: number) => void;
}

export const ChartPanels: React.FC<ChartPanelsProps> = ({
  ticks,
  bars,
  trades,
  config,
  setConfig,
  noiseStats,
  selectedCandleIndex,
  onSelectCandle,
  onOpenStepInspector,
}) => {
  // Panel visibility toggles (6 Panels total)
  const [showTicks, setShowTicks] = useState(true);
  const [showRealOhlc, setShowRealOhlc] = useState(true);
  const [showHeikinAshi, setShowHeikinAshi] = useState(true);
  const [showExtremums, setShowExtremums] = useState(true);
  const [showAtr, setShowAtr] = useState(true);
  const [showEquity, setShowEquity] = useState(true);

  // Zoom & Pan windowing
  const [zoomRange, setZoomRange] = useState<[number, number]>([0, 100]); // percentage of candles
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Filtered bars according to zoom range
  const visibleBars = useMemo(() => {
    if (bars.length === 0) return [];
    const start = Math.floor((zoomRange[0] / 100) * bars.length);
    const end = Math.min(bars.length, Math.ceil((zoomRange[1] / 100) * bars.length));
    return bars.slice(start, Math.max(start + 5, end));
  }, [bars, zoomRange]);

  const startIndex = Math.floor((zoomRange[0] / 100) * bars.length);

  // Current active bar for HUD stats
  const activeBar = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < bars.length
    ? bars[hoverIndex]
    : bars[selectedCandleIndex] || bars[bars.length - 1];

  // SVG dimensions
  const chartWidth = 1000;
  const paddingX = 50;
  const paddingRight = 60;
  const plotWidth = chartWidth - paddingX - paddingRight;

  // Global time domain for visible bars
  const minTime = visibleBars.length > 0 ? visibleBars[0].time : 0;
  const maxTime = visibleBars.length > 0 ? visibleBars[visibleBars.length - 1].time : 1;
  const timeSpan = Math.max(1, maxTime - minTime);

  const getXForTime = (time: number) => {
    return paddingX + ((time - minTime) / timeSpan) * plotWidth;
  };

  const getXForBarIndex = (localIdx: number) => {
    if (visibleBars.length <= 1) return paddingX + plotWidth / 2;
    return paddingX + (localIdx / (visibleBars.length - 1)) * plotWidth;
  };

  // Zoom controls
  const handleZoom = (direction: 'in' | 'out') => {
    setZoomRange(([min, max]) => {
      const span = max - min;
      if (direction === 'in') {
        if (span <= 15) return [min, max]; // minimum 15% window
        const mid = (min + max) / 2;
        return [Math.max(0, mid - span * 0.35), Math.min(100, mid + span * 0.35)];
      } else {
        const mid = (min + max) / 2;
        return [Math.max(0, mid - span * 0.7), Math.min(100, mid + span * 0.7)];
      }
    });
  };

  const resetZoom = () => setZoomRange([0, 100]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] overflow-y-auto select-none">
      {/* Top HUD: Synchronized Inspection Header */}
      <div className="p-3 bg-[#0d131f] border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 flex-wrap">
          {activeBar && (
            <>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-500">TIME:</span>
                <span className="text-sky-300 font-semibold">{activeBar.timeStr}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-500">REAL C:</span>
                <span className="text-slate-200">{activeBar.realClose.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-500">HA O/H/L/C:</span>
                <span className="text-emerald-400 font-semibold">
                  {activeBar.haOpen.toFixed(2)} / {activeBar.haHigh.toFixed(2)} / {activeBar.haLow.toFixed(2)} / {activeBar.haClose.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-500">ATR:</span>
                <span className="text-amber-400 font-semibold">{activeBar.atr.toFixed(3)}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-500">DIR:</span>
                <span className={activeBar.direction === 1 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {activeBar.direction === 1 ? '▲ BULLISH' : '▼ BEARISH'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-500">STOP:</span>
                <span className={activeBar.direction === 1 ? 'text-emerald-400' : 'text-rose-400'}>
                  {activeBar.direction === 1 ? activeBar.longStop.toFixed(2) : activeBar.shortStop.toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Panel Toggles & Zoom Toolbar */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#131d2e] rounded-lg p-0.5 border border-[#223049]">
            <button
              onClick={() => setShowTicks(prev => !prev)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                showTicks ? 'bg-[#1b283e] text-sky-400 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              1. Ticks
            </button>
            <button
              onClick={() => setShowRealOhlc(prev => !prev)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                showRealOhlc ? 'bg-[#1b283e] text-slate-200 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              2. Real OHLC
            </button>
            <button
              onClick={() => setShowHeikinAshi(prev => !prev)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                showHeikinAshi ? 'bg-[#1b283e] text-emerald-400 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              3. Heikin Ashi + CE
            </button>
            <button
              onClick={() => setShowExtremums(prev => !prev)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                showExtremums ? 'bg-[#1b283e] text-cyan-400 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              4. Extremums
            </button>
            <button
              onClick={() => setShowAtr(prev => !prev)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                showAtr ? 'bg-[#1b283e] text-amber-400 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              5. ATR
            </button>
            <button
              onClick={() => setShowEquity(prev => !prev)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                showEquity ? 'bg-[#1b283e] text-indigo-300 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              6. Equity
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#131d2e] rounded-lg p-0.5 border border-[#223049]">
            <button
              onClick={() => handleZoom('in')}
              className="p-1 text-slate-400 hover:text-slate-100"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="p-1 text-slate-400 hover:text-slate-100"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetZoom}
              className="p-1 text-slate-400 hover:text-slate-100"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Charts Scrollable Area */}
      <div className="p-4 space-y-4">
        {/* PANEL 1: RAW TICKS */}
        {showTicks && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block"></span>
                <span className="font-semibold text-slate-100 text-xs tracking-wide">
                  PANEL 1 — RAW TICK STREAM
                </span>
                <span className="text-slate-500 text-[11px] font-mono">
                  {ticks.length.toLocaleString()} total ticks
                </span>
              </div>
              <span className="text-sky-400 font-mono text-[11px]">
                {ticks.length > 0 ? `Latest: ${ticks[ticks.length - 1].price.toFixed(2)}` : ''}
              </span>
            </div>
            <TickSvgPanel
              ticks={ticks}
              minTime={minTime}
              maxTime={maxTime}
              width={chartWidth}
              plotWidth={plotWidth}
              paddingX={paddingX}
              paddingRight={paddingRight}
              height={140}
            />
          </div>
        )}

        {/* PANEL 2: REAL OHLC CANDLESTICKS */}
        {showRealOhlc && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span>
                <span className="font-semibold text-slate-100 text-xs tracking-wide">
                  PANEL 2 — REAL MARKET OHLC CANDLES
                </span>
                <span className="text-slate-500 text-[11px]">
                  (Unmodified broker prices · Real trade execution open/close)
                </span>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">
                TF: {config.timeframeSec >= 60 ? `${config.timeframeSec / 60}m` : `${config.timeframeSec}s`}
              </span>
            </div>
            <RealOhlcSvgPanel
              bars={visibleBars}
              trades={trades}
              startIndex={startIndex}
              width={chartWidth}
              plotWidth={plotWidth}
              paddingX={paddingX}
              paddingRight={paddingRight}
              height={220}
              hoverIndex={hoverIndex}
              setHoverIndex={setHoverIndex}
              selectedCandleIndex={selectedCandleIndex}
              onSelectCandle={onSelectCandle}
              onOpenStepInspector={onOpenStepInspector}
            />
          </div>
        )}

        {/* PANEL 3: HEIKIN-ASHI & CHANDELIER EXIT */}
        {showHeikinAshi && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                <span className="font-semibold text-slate-100 text-xs tracking-wide">
                  PANEL 3 — HEIKIN-ASHI CANDLES + CHANDELIER EXIT
                </span>
                <span className="text-emerald-400 text-[11px] font-mono">
                  ATR({config.atrPeriod}) Mult={config.atrMultiplier}x [{config.algorithm.toUpperCase()}]
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-3 h-0.5 bg-emerald-400 inline-block"></span> Long Stop
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-3 h-0.5 bg-rose-400 inline-block"></span> Short Stop
                </span>
              </div>
            </div>
            <HeikinAshiSvgPanel
              bars={visibleBars}
              startIndex={startIndex}
              width={chartWidth}
              plotWidth={plotWidth}
              paddingX={paddingX}
              paddingRight={paddingRight}
              height={280}
              hoverIndex={hoverIndex}
              setHoverIndex={setHoverIndex}
              selectedCandleIndex={selectedCandleIndex}
              onSelectCandle={onSelectCandle}
              onOpenStepInspector={onOpenStepInspector}
            />
          </div>
        )}

        {/* PANEL 4: EXTREMUMS ENGINE & CHANDELIER BASIS */}
        {showExtremums && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 shadow-md space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-[#1e293b] flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block animate-pulse"></span>
                <span className="font-semibold text-slate-100 text-xs tracking-wide">
                  PANEL 4 — EXTREMUMS ENGINE &amp; NOISE REDUCTION
                </span>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                  config.useCloseForExtremums
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}>
                  {config.useCloseForExtremums ? '🛡️ Noise Filter: ON (Wicks Ignored)' : '⚠ Noise Filter: OFF (Wicks Included)'}
                </span>

                {noiseStats && (
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800">
                    Wick Noise: <strong className="text-cyan-300">{noiseStats.totalNoisePoints.toFixed(1)} pts</strong> ({noiseStats.noiseReductionPercent.toFixed(1)}% of bar range)
                  </span>
                )}
              </div>

              {/* Close Price for Extremums Toggle Switch */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Use Close Price for Extremums:</span>
                <button
                  onClick={() => {
                    if (setConfig) {
                      setConfig(prev => ({ ...prev, useCloseForExtremums: !prev.useCloseForExtremums }));
                    }
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all border cursor-pointer ${
                    config.useCloseForExtremums
                      ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400 shadow-sm shadow-cyan-900/40'
                      : 'bg-[#131d2e] text-slate-400 border-[#273752] hover:text-slate-200'
                  }`}
                  title="When ON: highest/lowest uses Close instead of wicks. When OFF: wicks are included."
                >
                  {config.useCloseForExtremums ? '🛡️ ON (Close Only · Wicks Ignored)' : '✗ OFF (Wicks Included)'}
                </button>
              </div>
            </div>

            {/* Pipeline Flow Callout */}
            <div className="bg-[#0b101b] border border-[#1d283a] rounded-lg px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-slate-300 flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="text-slate-500 font-semibold">PIPELINE FLOW:</span>
                <span className="text-sky-300">candle</span>
                <span className="text-slate-600">➔</span>
                <span className="text-indigo-300">HEIKIN_ASHI</span>
                <span className="text-slate-600">➔</span>
                <span className="text-cyan-300 font-bold">Extremums (Noise Filter)</span>
                <span className="text-slate-600">➔</span>
                <span className="text-amber-300">chandelier exit</span>
              </div>
              <div className="text-[10px] text-slate-400 italic">
                “When looking for the highest/lowest price, look only at where candles closed, not how far their wicks went.”
              </div>
            </div>

            {/* 4 Formula Radio Buttons Selector */}
            <div className="bg-[#0b101b] border border-[#1d283a] rounded-lg p-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span>Select Extremum Formula:</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  {
                    id: 'close_extremum',
                    label: 'F1: Close Extremums (User Given Formula)',
                    desc: 'max/min Close vs High/Low wicks',
                  },
                  {
                    id: 'range_ma_crossover',
                    label: 'F2: Range MA Crossover',
                    desc: 'Dynamic rolling channel vs Moving Average',
                  },
                  {
                    id: 'ma_plus_crest',
                    label: 'F3: MA+ Crest / Trough',
                    desc: 'Inflection wave peaks & valleys along smoothed MA',
                  },
                  {
                    id: 'structural_sr',
                    label: 'F4: Structural Pivot S/R',
                    desc: '3-bar fractal swing pivots support & resistance',
                  },
                ].map(f => (
                  <label
                    key={f.id}
                    onClick={() => {
                      if (setConfig) {
                        setConfig(prev => ({ ...prev, extremumFormula: f.id as any }));
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md cursor-pointer border transition-colors ${
                      config.extremumFormula === f.id
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold shadow-sm'
                        : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200 hover:bg-[#18253a]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="extremum_formula_panel4"
                      checked={config.extremumFormula === f.id}
                      onChange={() => {
                        if (setConfig) {
                          setConfig(prev => ({ ...prev, extremumFormula: f.id as any }));
                        }
                      }}
                      className="accent-cyan-400 w-3 h-3 cursor-pointer"
                    />
                    <span className="text-[11px]">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Live Mathematical Formula & Example Card */}
            <div className="bg-[#111a2c]/90 border border-[#202e47] rounded-lg p-2.5 text-[11px] font-mono text-slate-300 space-y-2">
              <div className="flex items-center justify-between text-slate-400 border-b border-[#1f2b42] pb-1">
                <span className="text-cyan-400 font-semibold">
                  {config.extremumFormula === 'close_extremum' && 'FORMULA 1: “Use Close Price for Extremums” vs Candle Wicks'}
                  {config.extremumFormula === 'range_ma_crossover' && 'FORMULA 2: Range MA Crossover Dynamic Trend Channel'}
                  {config.extremumFormula === 'ma_plus_crest' && 'FORMULA 3: Moving Average Crest & Trough Inflection Waves'}
                  {config.extremumFormula === 'structural_sr' && 'FORMULA 4: Structural Swing Pivot Support & Resistance Bands'}
                </span>
                <span className="text-slate-500">
                  Lookback Period: {config.atrPeriod} bars · ATR Mult: {config.atrMultiplier}x
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0.5">
                <div className="bg-[#0b101b] p-2 rounded border border-[#1b263b] space-y-1">
                  <div className="text-[10px] text-slate-400 font-medium">Mathematical Definition &amp; Simple Example:</div>
                  <div className="text-slate-200">
                    {config.useCloseForExtremums ? (
                      <span className="text-cyan-300">
                        Highest = max(Close_1..Close_{config.atrPeriod}) &amp; Lowest = min(Close_1..Close_{config.atrPeriod}) <span className="text-emerald-400 font-bold">[Wicks Ignored]</span>
                      </span>
                    ) : (
                      <span className="text-amber-300">
                        Highest = max(High_1..High_{config.atrPeriod}) &amp; Lowest = min(Low_1..Low_{config.atrPeriod}) <span className="text-slate-400">[Wicks Included]</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 pt-0.5">
                    Example (High=105, Close=101, Low=98): <span className="text-cyan-300 font-semibold">{config.useCloseForExtremums ? 'Highest = 101 (ON)' : 'Highest = 105 (OFF)'}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Chandelier Starting Point:{' '}
                    <span className="text-emerald-300">
                      {config.useCloseForExtremums
                        ? `LongStop = HighestClose - ATR×${config.atrMultiplier}`
                        : `LongStop = HighestHigh - ATR×${config.atrMultiplier}`}
                    </span>
                  </div>
                </div>

                <div className="bg-[#0b101b] p-2 rounded border border-[#1b263b] space-y-1">
                  <div className="text-[10px] text-slate-400 font-medium">
                    Current Candle ({activeBar?.timeStr || 'N/A'}) Live Extremum Values:
                  </div>
                  <div className="text-slate-200 flex items-center justify-between">
                    <span>
                      Highest Close: <span className="text-cyan-300 font-bold">{activeBar?.extremum.highestClose.toFixed(2)}</span> vs High: <span className="text-amber-300">{activeBar?.extremum.highestHigh.toFixed(2)}</span>
                    </span>
                    <span className="text-[10px] text-amber-400">
                      Wick Δ: +{((activeBar?.extremum.highestHigh || 0) - (activeBar?.extremum.highestClose || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-slate-200 flex items-center justify-between">
                    <span>
                      Lowest Close: <span className="text-cyan-300 font-bold">{activeBar?.extremum.lowestClose.toFixed(2)}</span> vs Low: <span className="text-amber-300">{activeBar?.extremum.lowestLow.toFixed(2)}</span>
                    </span>
                    <span className="text-[10px] text-amber-400">
                      Wick Δ: -{((activeBar?.extremum.lowestClose || 0) - (activeBar?.extremum.lowestLow || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 pt-0.5">
                    Active Anchor: <span className="text-sky-300 font-semibold">{activeBar?.highest.toFixed(2)}</span> · Raw Long Stop: <span className="text-emerald-400">{activeBar?.longStopRaw.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SVG Plot for Panel 4 */}
            <ExtremumSvgPanel
              bars={visibleBars}
              startIndex={startIndex}
              config={config}
              width={chartWidth}
              plotWidth={plotWidth}
              paddingX={paddingX}
              paddingRight={paddingRight}
              height={230}
              hoverIndex={hoverIndex}
              setHoverIndex={setHoverIndex}
              selectedCandleIndex={selectedCandleIndex}
              onSelectCandle={onSelectCandle}
              onOpenStepInspector={onOpenStepInspector}
            />
          </div>
        )}

        {/* PANEL 5: WILDER'S ATR INDICATOR */}
        {showAtr && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                <span className="font-semibold text-slate-100 text-xs tracking-wide">
                  PANEL 5 — AVERAGE TRUE RANGE (ATR)
                </span>
                <span className="text-slate-500 text-[11px]">
                  Wilder's RMA Smoothing (Pine Script ta.rma)
                </span>
              </div>
              <span className="text-amber-400 font-mono text-[11px]">
                {activeBar ? `Current: ${activeBar.atr.toFixed(3)}` : ''}
              </span>
            </div>
            <AtrSvgPanel
              bars={visibleBars}
              width={chartWidth}
              plotWidth={plotWidth}
              paddingX={paddingX}
              paddingRight={paddingRight}
              height={110}
            />
          </div>
        )}

        {/* PANEL 6: CUMULATIVE STRATEGY EQUITY */}
        {showEquity && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block"></span>
                <span className="font-semibold text-slate-100 text-xs tracking-wide">
                  PANEL 6 — CUMULATIVE STRATEGY EQUITY CURVE
                </span>
                <span className="text-slate-500 text-[11px]">
                  Walk-forward trade execution on Candle N+1 Real Open
                </span>
              </div>
              <span className="text-slate-300 font-mono text-[11px]">
                {trades.length} trades executed
              </span>
            </div>
            <EquitySvgPanel
              trades={trades}
              bars={bars}
              minTime={minTime}
              maxTime={maxTime}
              width={chartWidth}
              plotWidth={plotWidth}
              paddingX={paddingX}
              paddingRight={paddingRight}
              height={140}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// PANEL 1 COMPONENT: TICKS SVG
// ----------------------------------------------------------------------------
const TickSvgPanel: React.FC<{
  ticks: Tick[];
  minTime: number;
  maxTime: number;
  width: number;
  plotWidth: number;
  paddingX: number;
  paddingRight: number;
  height: number;
}> = ({ ticks, minTime, maxTime, width, plotWidth, paddingX, paddingRight, height }) => {
  const visibleTicks = useMemo(() => {
    if (ticks.length === 0) return [];
    return ticks.filter(t => t.time >= minTime && t.time <= maxTime);
  }, [ticks, minTime, maxTime]);

  if (visibleTicks.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center text-slate-500 text-xs">
        No ticks in current timeframe window.
      </div>
    );
  }

  let minP = visibleTicks[0].price;
  let maxP = visibleTicks[0].price;
  for (const t of visibleTicks) {
    if (t.price < minP) minP = t.price;
    if (t.price > maxP) maxP = t.price;
  }
  const rangeP = Math.max(0.1, maxP - minP);
  const timeSpan = Math.max(1, maxTime - minTime);

  const getX = (t: number) => paddingX + ((t - minTime) / timeSpan) * plotWidth;
  const getY = (p: number) => height - 20 - ((p - minP) / rangeP) * (height - 35);

  const points = visibleTicks.map(t => `${getX(t.time).toFixed(1)},${getY(t.price).toFixed(1)}`).join(' ');
  const areaPoints = `${getX(visibleTicks[0].time).toFixed(1)},${height - 20} ${points} ${getX(visibleTicks[visibleTicks.length - 1].time).toFixed(1)},${height - 20}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
      {/* Grid lines */}
      <line x1={paddingX} y1={20} x2={paddingX + plotWidth} y2={20} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height / 2} x2={paddingX + plotWidth} y2={height / 2} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height - 20} x2={paddingX + plotWidth} y2={height - 20} stroke="#1e293b" />

      {/* Price Labels */}
      <text x={paddingX + plotWidth + 8} y={24} fill="#64748b" fontSize={10} fontFamily="monospace">
        {maxP.toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 8} y={height / 2 + 3} fill="#64748b" fontSize={10} fontFamily="monospace">
        {((maxP + minP) / 2).toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 8} y={height - 20} fill="#64748b" fontSize={10} fontFamily="monospace">
        {minP.toFixed(2)}
      </text>

      {/* Tick Path */}
      <polygon points={areaPoints} fill="rgba(56, 189, 248, 0.08)" />
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth={1.2} />
    </svg>
  );
};

// ----------------------------------------------------------------------------
// PANEL 2 COMPONENT: REAL OHLC CANDLESTICKS
// ----------------------------------------------------------------------------
const RealOhlcSvgPanel: React.FC<{
  bars: ChandelierBar[];
  trades: Trade[];
  startIndex: number;
  width: number;
  plotWidth: number;
  paddingX: number;
  paddingRight: number;
  height: number;
  hoverIndex: number | null;
  setHoverIndex: (idx: number | null) => void;
  selectedCandleIndex: number;
  onSelectCandle: (index: number) => void;
  onOpenStepInspector: (index: number) => void;
}> = ({
  bars,
  trades,
  startIndex,
  width,
  plotWidth,
  paddingX,
  paddingRight,
  height,
  hoverIndex,
  setHoverIndex,
  selectedCandleIndex,
  onSelectCandle,
  onOpenStepInspector,
}) => {
  if (bars.length === 0) return null;

  let minP = bars[0].realLow;
  let maxP = bars[0].realHigh;
  for (const b of bars) {
    if (b.realLow < minP) minP = b.realLow;
    if (b.realHigh > maxP) maxP = b.realHigh;
  }
  const rangeP = Math.max(0.1, maxP - minP);

  const getX = (idx: number) => {
    if (bars.length <= 1) return paddingX + plotWidth / 2;
    return paddingX + (idx / (bars.length - 1)) * plotWidth;
  };
  const getY = (p: number) => height - 25 - ((p - minP) / rangeP) * (height - 45);

  const candleWidth = Math.max(2, Math.min(18, (plotWidth / bars.length) * 0.7));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto overflow-visible select-none cursor-crosshair"
      onMouseLeave={() => setHoverIndex(null)}
    >
      {/* Background Grid */}
      <line x1={paddingX} y1={25} x2={paddingX + plotWidth} y2={25} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height / 2} x2={paddingX + plotWidth} y2={height / 2} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height - 25} x2={paddingX + plotWidth} y2={height - 25} stroke="#1e293b" />

      {/* Price Labels */}
      <text x={paddingX + plotWidth + 8} y={28} fill="#64748b" fontSize={10} fontFamily="monospace">
        {maxP.toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 8} y={height / 2 + 3} fill="#64748b" fontSize={10} fontFamily="monospace">
        {((maxP + minP) / 2).toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 8} y={height - 25} fill="#64748b" fontSize={10} fontFamily="monospace">
        {minP.toFixed(2)}
      </text>

      {/* Candles */}
      {bars.map((bar, i) => {
        const globalIdx = startIndex + i;
        const cx = getX(i);
        const yOpen = getY(bar.realOpen);
        const yClose = getY(bar.realClose);
        const yHigh = getY(bar.realHigh);
        const yLow = getY(bar.realLow);

        const isBullish = bar.realClose >= bar.realOpen;
        const color = isBullish ? '#10b981' : '#ef4444';
        const isSelected = selectedCandleIndex === globalIdx;

        const bodyY = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));

        return (
          <g
            key={`real-${bar.time}`}
            onMouseEnter={() => setHoverIndex(globalIdx)}
            onClick={() => {
              onSelectCandle(globalIdx);
              onOpenStepInspector(globalIdx);
            }}
            className="cursor-pointer"
          >
            {/* Selection Highlight */}
            {isSelected && (
              <rect
                x={cx - candleWidth}
                y={15}
                width={candleWidth * 2}
                height={height - 35}
                fill="rgba(56, 189, 248, 0.12)"
                stroke="#38bdf8"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            )}

            {/* Wick */}
            <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />

            {/* Body */}
            <rect
              x={cx - candleWidth / 2}
              y={bodyY}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
              stroke={color}
              strokeWidth={0.5}
            />

            {/* Executed entry marker dots */}
            {bar.enterLong && (
              <circle
                cx={cx}
                cy={yOpen}
                r={4}
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            )}
            {bar.enterShort && (
              <circle
                cx={cx}
                cy={yOpen}
                r={4}
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            )}
          </g>
        );
      })}

      {/* Hover Line */}
      {hoverIndex !== null && hoverIndex >= startIndex && hoverIndex < startIndex + bars.length && (
        <line
          x1={getX(hoverIndex - startIndex)}
          y1={15}
          x2={getX(hoverIndex - startIndex)}
          y2={height - 20}
          stroke="#94a3b8"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  );
};

// ----------------------------------------------------------------------------
// PANEL 3 COMPONENT: HEIKIN-ASHI & CHANDELIER EXIT
// ----------------------------------------------------------------------------
const HeikinAshiSvgPanel: React.FC<{
  bars: ChandelierBar[];
  startIndex: number;
  width: number;
  plotWidth: number;
  paddingX: number;
  paddingRight: number;
  height: number;
  hoverIndex: number | null;
  setHoverIndex: (idx: number | null) => void;
  selectedCandleIndex: number;
  onSelectCandle: (index: number) => void;
  onOpenStepInspector: (index: number) => void;
}> = ({
  bars,
  startIndex,
  width,
  plotWidth,
  paddingX,
  paddingRight,
  height,
  hoverIndex,
  setHoverIndex,
  selectedCandleIndex,
  onSelectCandle,
  onOpenStepInspector,
}) => {
  if (bars.length === 0) return null;

  let minP = bars[0].haLow;
  let maxP = bars[0].haHigh;
  for (const b of bars) {
    if (b.haLow < minP) minP = b.haLow;
    if (b.haHigh > maxP) maxP = b.haHigh;
    if (b.direction === 1 && b.longStop < minP) minP = b.longStop;
    if (b.direction === -1 && b.shortStop > maxP) maxP = b.shortStop;
  }
  const rangeP = Math.max(0.1, maxP - minP);

  const getX = (idx: number) => {
    if (bars.length <= 1) return paddingX + plotWidth / 2;
    return paddingX + (idx / (bars.length - 1)) * plotWidth;
  };
  const getY = (p: number) => height - 30 - ((p - minP) / rangeP) * (height - 55);

  const candleWidth = Math.max(2, Math.min(18, (plotWidth / bars.length) * 0.7));

  // Build Chandelier Stop stair-step paths
  const longStopSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const shortStopSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (let i = 0; i < bars.length; i++) {
    const cur = bars[i];
    const cx = getX(i);
    const halfW = candleWidth / 2;

    if (cur.direction === 1) {
      const y = getY(cur.longStop);
      longStopSegments.push({ x1: cx - halfW, y1: y, x2: cx + halfW, y2: y });
      if (i > 0 && bars[i - 1].direction === 1) {
        const prevY = getY(bars[i - 1].longStop);
        const prevCx = getX(i - 1);
        longStopSegments.push({ x1: prevCx + halfW, y1: prevY, x2: cx - halfW, y2: y });
      }
    } else {
      const y = getY(cur.shortStop);
      shortStopSegments.push({ x1: cx - halfW, y1: y, x2: cx + halfW, y2: y });
      if (i > 0 && bars[i - 1].direction === -1) {
        const prevY = getY(bars[i - 1].shortStop);
        const prevCx = getX(i - 1);
        shortStopSegments.push({ x1: prevCx + halfW, y1: prevY, x2: cx - halfW, y2: y });
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto overflow-visible select-none cursor-crosshair"
      onMouseLeave={() => setHoverIndex(null)}
    >
      {/* Background Grid */}
      <line x1={paddingX} y1={25} x2={paddingX + plotWidth} y2={25} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height / 2} x2={paddingX + plotWidth} y2={height / 2} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height - 30} x2={paddingX + plotWidth} y2={height - 30} stroke="#1e293b" />

      {/* Price Labels */}
      <text x={paddingX + plotWidth + 8} y={28} fill="#64748b" fontSize={10} fontFamily="monospace">
        {maxP.toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 8} y={height / 2 + 3} fill="#64748b" fontSize={10} fontFamily="monospace">
        {((maxP + minP) / 2).toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 8} y={height - 30} fill="#64748b" fontSize={10} fontFamily="monospace">
        {minP.toFixed(2)}
      </text>

      {/* Chandelier Stop Lines */}
      {longStopSegments.map((s, idx) => (
        <line
          key={`ls-${idx}`}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="#00e676"
          strokeWidth={2.2}
        />
      ))}
      {shortStopSegments.map((s, idx) => (
        <line
          key={`ss-${idx}`}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke="#ff1744"
          strokeWidth={2.2}
        />
      ))}

      {/* Heikin-Ashi Candles */}
      {bars.map((bar, i) => {
        const globalIdx = startIndex + i;
        const cx = getX(i);
        const yOpen = getY(bar.haOpen);
        const yClose = getY(bar.haClose);
        const yHigh = getY(bar.haHigh);
        const yLow = getY(bar.haLow);

        const isBullish = bar.haClose >= bar.haOpen;
        const color = isBullish ? '#26a69a' : '#ef5350';
        const isSelected = selectedCandleIndex === globalIdx;

        const bodyY = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));

        return (
          <g
            key={`ha-${bar.time}`}
            onMouseEnter={() => setHoverIndex(globalIdx)}
            onClick={() => {
              onSelectCandle(globalIdx);
              onOpenStepInspector(globalIdx);
            }}
            className="cursor-pointer"
          >
            {/* Selection Box */}
            {isSelected && (
              <rect
                x={cx - candleWidth}
                y={15}
                width={candleWidth * 2}
                height={height - 40}
                fill="rgba(56, 189, 248, 0.12)"
                stroke="#38bdf8"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            )}

            {/* Wick */}
            <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />

            {/* Body */}
            <rect
              x={cx - candleWidth / 2}
              y={bodyY}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
              stroke={color}
              strokeWidth={0.5}
            />

            {/* Buy Signal Arrow Marker */}
            {bar.buySignal && (
              <g transform={`translate(${cx}, ${yLow + 16})`}>
                <polygon points="0,-10 -6,0 6,0" fill="#00e676" stroke="#ffffff" strokeWidth={0.8} />
                <text x={0} y={10} fill="#00e676" fontSize={8} textAnchor="middle" fontWeight="bold">
                  BUY
                </text>
              </g>
            )}

            {/* Sell Signal Arrow Marker */}
            {bar.sellSignal && (
              <g transform={`translate(${cx}, ${yHigh - 16})`}>
                <polygon points="0,10 -6,0 6,0" fill="#ff1744" stroke="#ffffff" strokeWidth={0.8} />
                <text x={0} y={-4} fill="#ff1744" fontSize={8} textAnchor="middle" fontWeight="bold">
                  SELL
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Hover Line */}
      {hoverIndex !== null && hoverIndex >= startIndex && hoverIndex < startIndex + bars.length && (
        <line
          x1={getX(hoverIndex - startIndex)}
          y1={15}
          x2={getX(hoverIndex - startIndex)}
          y2={height - 25}
          stroke="#94a3b8"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  );
};

// ----------------------------------------------------------------------------
// PANEL 4 COMPONENT: EXTREMUM SVG PANEL
// ----------------------------------------------------------------------------
const ExtremumSvgPanel: React.FC<{
  bars: ChandelierBar[];
  startIndex: number;
  config: StrategyConfig;
  width: number;
  plotWidth: number;
  paddingX: number;
  paddingRight: number;
  height: number;
  hoverIndex: number | null;
  setHoverIndex: (idx: number | null) => void;
  selectedCandleIndex: number;
  onSelectCandle: (index: number) => void;
  onOpenStepInspector: (index: number) => void;
}> = ({
  bars,
  startIndex,
  config,
  width,
  plotWidth,
  paddingX,
  paddingRight,
  height,
  hoverIndex,
  setHoverIndex,
  selectedCandleIndex,
  onSelectCandle,
  onOpenStepInspector,
}) => {
  if (bars.length === 0) return null;

  // Determine vertical price bounds across visible extremum series
  let minP = bars[0].extremum.lowestLow;
  let maxP = bars[0].extremum.highestHigh;

  for (const b of bars) {
    if (b.extremum.lowestLow < minP) minP = b.extremum.lowestLow;
    if (b.extremum.lowestClose < minP) minP = b.extremum.lowestClose;
    if (b.extremum.prevLow < minP) minP = b.extremum.prevLow;
    if (b.extremum.maValue < minP) minP = b.extremum.maValue;

    if (b.extremum.highestHigh > maxP) maxP = b.extremum.highestHigh;
    if (b.extremum.highestClose > maxP) maxP = b.extremum.highestClose;
    if (b.extremum.prevHigh > maxP) maxP = b.extremum.prevHigh;
    if (b.extremum.maValue > maxP) maxP = b.extremum.maValue;
  }

  const rangeP = Math.max(0.5, maxP - minP);

  const getX = (localIdx: number) => {
    if (bars.length <= 1) return paddingX + plotWidth / 2;
    return paddingX + (localIdx / (bars.length - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    return height - 25 - ((val - minP) / rangeP) * (height - 45);
  };

  const latestBar = bars[bars.length - 1];

  // Helper series points for Formula 1:
  const highestClosePoints = bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.highestClose).toFixed(1)}`).join(' ');
  const lowestClosePoints = bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.lowestClose).toFixed(1)}`).join(' ');
  const highestHighPoints = bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.highestHigh).toFixed(1)}`).join(' ');
  const lowestLowPoints = bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.lowestLow).toFixed(1)}`).join(' ');
  const haClosePoints = bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.haClose).toFixed(1)}`).join(' ');

  // Shaded Wick Ignored Zones for Formula 1:
  const topWickZonePolygon = [
    ...bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.highestHigh).toFixed(1)}`),
    ...[...bars].reverse().map((b, i) => {
      const origIdx = bars.length - 1 - i;
      return `${getX(origIdx).toFixed(1)},${getY(b.extremum.highestClose).toFixed(1)}`;
    }),
  ].join(' ');

  const bottomWickZonePolygon = [
    ...bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.lowestClose).toFixed(1)}`),
    ...[...bars].reverse().map((b, i) => {
      const origIdx = bars.length - 1 - i;
      return `${getX(origIdx).toFixed(1)},${getY(b.extremum.lowestLow).toFixed(1)}`;
    }),
  ].join(' ');

  // Range MA Channel Polygon for Formula 2:
  const rangeChannelPolygon = [
    ...bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.prevHigh).toFixed(1)}`),
    ...[...bars].reverse().map((b, i) => {
      const origIdx = bars.length - 1 - i;
      return `${getX(origIdx).toFixed(1)},${getY(b.extremum.prevLow).toFixed(1)}`;
    }),
  ].join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto overflow-visible select-none cursor-crosshair"
      onMouseLeave={() => setHoverIndex(null)}
    >
      {/* Grid lines */}
      <line x1={paddingX} y1={20} x2={paddingX + plotWidth} y2={20} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height / 2} x2={paddingX + plotWidth} y2={height / 2} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height - 20} x2={paddingX + plotWidth} y2={height - 20} stroke="#1e293b" />

      {/* Axis Scale labels on right */}
      <text x={paddingX + plotWidth + 6} y={24} fill="#94a3b8" fontSize={10} fontFamily="monospace">
        {maxP.toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 6} y={height / 2} fill="#64748b" fontSize={10} fontFamily="monospace">
        {((maxP + minP) / 2).toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 6} y={height - 22} fill="#94a3b8" fontSize={10} fontFamily="monospace">
        {minP.toFixed(2)}
      </text>

      {/* ------------------------------------------------------------------ */}
      {/* FORMULA 1 RENDERING: CLOSE EXTREMUMS vs HIGH/LOW WICKS            */}
      {/* ------------------------------------------------------------------ */}
      {config.extremumFormula === 'close_extremum' && (
        <g>
          {/* Shaded Wick Extension Ignored Zones */}
          <polygon points={topWickZonePolygon} fill="rgba(245, 158, 11, 0.12)" />
          <polygon points={bottomWickZonePolygon} fill="rgba(245, 158, 11, 0.12)" />

          {/* Wick Extreme Boundaries (Amber Dashed) */}
          <polyline
            points={highestHighPoints}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.2}
            strokeDasharray="4 3"
            opacity={0.8}
          />
          <polyline
            points={lowestLowPoints}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.2}
            strokeDasharray="4 3"
            opacity={0.8}
          />

          {/* Close Price Extreme Boundaries (Cyan Solid) */}
          <polyline
            points={highestClosePoints}
            fill="none"
            stroke="#06b6d4"
            strokeWidth={2}
          />
          <polyline
            points={lowestClosePoints}
            fill="none"
            stroke="#06b6d4"
            strokeWidth={2}
          />

          {/* Subtle Candle Close Trace Line */}
          <polyline
            points={haClosePoints}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={1}
            opacity={0.4}
          />

          {/* Right boundary tags for Formula 1 */}
          <text x={paddingX + plotWidth + 6} y={getY(latestBar.extremum.highestHigh) + 3} fill="#f59e0b" fontSize={9} fontFamily="monospace">
            WickH: {latestBar.extremum.highestHigh.toFixed(1)}
          </text>
          <text x={paddingX + plotWidth + 6} y={getY(latestBar.extremum.highestClose) + 3} fill="#06b6d4" fontSize={9} fontFamily="monospace" fontWeight="bold">
            CloseH: {latestBar.extremum.highestClose.toFixed(1)}
          </text>
          <text x={paddingX + plotWidth + 6} y={getY(latestBar.extremum.lowestClose) + 3} fill="#06b6d4" fontSize={9} fontFamily="monospace" fontWeight="bold">
            CloseL: {latestBar.extremum.lowestClose.toFixed(1)}
          </text>
          <text x={paddingX + plotWidth + 6} y={getY(latestBar.extremum.lowestLow) + 3} fill="#f59e0b" fontSize={9} fontFamily="monospace">
            WickL: {latestBar.extremum.lowestLow.toFixed(1)}
          </text>

          {/* Visual Legend in top left of SVG */}
          <g transform={`translate(${paddingX + 10}, 18)`}>
            <rect x={0} y={0} width={380} height={20} fill="#0f172a" fillOpacity={0.85} rx={4} stroke="#1e293b" />
            <line x1={8} y1={10} x2={24} y2={10} stroke="#06b6d4" strokeWidth={2} />
            <text x={28} y={13} fill="#06b6d4" fontSize={10} fontFamily="monospace">Highest/Lowest Close (Wicks Ignored)</text>

            <line x1={220} y1={10} x2={236} y2={10} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 2" />
            <text x={240} y={13} fill="#f59e0b" fontSize={10} fontFamily="monospace">High/Low Wicks (Wicks Zone)</text>
          </g>
        </g>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* FORMULA 2 RENDERING: RANGE MA CROSSOVER DYNAMIC CHANNEL            */}
      {/* ------------------------------------------------------------------ */}
      {config.extremumFormula === 'range_ma_crossover' && (
        <g>
          {/* Shaded Range Envelope */}
          <polygon points={rangeChannelPolygon} fill="rgba(99, 102, 241, 0.12)" />

          {/* Upper & Lower Rolling Range Series */}
          <polyline
            points={bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.prevHigh).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#818cf8"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
          <polyline
            points={bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.prevLow).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#818cf8"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />

          {/* Moving Average Line with Dynamic Trend Gradient / Segments */}
          {bars.map((b, i) => {
            if (i === 0) return null;
            const x1 = getX(i - 1);
            const y1 = getY(bars[i - 1].extremum.maValue);
            const x2 = getX(i);
            const y2 = getY(b.extremum.maValue);
            const strokeColor = b.extremum.maTrendColor === 'green' ? '#10b981' : '#f43f5e';
            return (
              <line key={`ma-seg-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeColor} strokeWidth={2.2} />
            );
          })}

          {/* Crossover Triangles */}
          {bars.map((b, i) => {
            const x = getX(i);
            if (b.extremum.rangeCrossLong) {
              const y = getY(b.extremum.prevLow) + 12;
              return (
                <polygon
                  key={`cross-long-${i}`}
                  points={`${x},${y - 8} ${x - 5},${y + 2} ${x + 5},${y + 2}`}
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth={0.5}
                />
              );
            }
            if (b.extremum.rangeCrossShort) {
              const y = getY(b.extremum.prevHigh) - 12;
              return (
                <polygon
                  key={`cross-short-${i}`}
                  points={`${x},${y + 8} ${x - 5},${y - 2} ${x + 5},${y - 2}`}
                  fill="#f43f5e"
                  stroke="#ffffff"
                  strokeWidth={0.5}
                />
              );
            }
            return null;
          })}

          {/* Legend */}
          <g transform={`translate(${paddingX + 10}, 18)`}>
            <rect x={0} y={0} width={360} height={20} fill="#0f172a" fillOpacity={0.85} rx={4} stroke="#1e293b" />
            <line x1={8} y1={10} x2={24} y2={10} stroke="#10b981" strokeWidth={2} />
            <text x={28} y={13} fill="#10b981" fontSize={10} fontFamily="monospace">MA({config.maType},{config.maLength}) Rising</text>

            <line x1={155} y1={10} x2={171} y2={10} stroke="#f43f5e" strokeWidth={2} />
            <text x={175} y={13} fill="#f43f5e" fontSize={10} fontFamily="monospace">MA Falling</text>

            <line x1={255} y1={10} x2={271} y2={10} stroke="#818cf8" strokeWidth={1.5} strokeDasharray="3 2" />
            <text x={275} y={13} fill="#818cf8" fontSize={10} fontFamily="monospace">Range Channel</text>
          </g>
        </g>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* FORMULA 3 RENDERING: MA+ CREST & TROUGH INFLECTION WAVES           */}
      {/* ------------------------------------------------------------------ */}
      {config.extremumFormula === 'ma_plus_crest' && (
        <g>
          {/* Smoothed Trajectory Curve */}
          <polyline
            points={bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.extremum.maValue).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2}
          />

          {/* Crest Peaks & Trough Valleys Markers */}
          {bars.map((b, i) => {
            const x = getX(i);
            const y = getY(b.extremum.maValue);

            if (b.extremum.isCrest) {
              return (
                <g key={`crest-${i}`}>
                  <polygon
                    points={`${x},${y - 8} ${x + 6},${y} ${x},${y + 8} ${x - 6},${y}`}
                    fill="#fbbf24"
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                  <text x={x} y={y - 12} fill="#fbbf24" fontSize={9} textAnchor="middle" fontFamily="monospace">
                    Peak {b.extremum.maValue.toFixed(1)}
                  </text>
                </g>
              );
            }
            if (b.extremum.isTrough) {
              return (
                <g key={`trough-${i}`}>
                  <polygon
                    points={`${x},${y - 8} ${x + 6},${y} ${x},${y + 8} ${x - 6},${y}`}
                    fill="#2dd4bf"
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                  <text x={x} y={y + 18} fill="#2dd4bf" fontSize={9} textAnchor="middle" fontFamily="monospace">
                    Valley {b.extremum.maValue.toFixed(1)}
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* Dotted Anchor Projections */}
          <line
            x1={paddingX}
            y1={getY(latestBar.highest)}
            x2={paddingX + plotWidth}
            y2={getY(latestBar.highest)}
            stroke="#fbbf24"
            strokeDasharray="4 4"
            strokeWidth={1.2}
          />
          <line
            x1={paddingX}
            y1={getY(latestBar.lowest)}
            x2={paddingX + plotWidth}
            y2={getY(latestBar.lowest)}
            stroke="#2dd4bf"
            strokeDasharray="4 4"
            strokeWidth={1.2}
          />

          {/* Legend */}
          <g transform={`translate(${paddingX + 10}, 18)`}>
            <rect x={0} y={0} width={340} height={20} fill="#0f172a" fillOpacity={0.85} rx={4} stroke="#1e293b" />
            <polygon points="15,6 20,10 15,14 10,10" fill="#fbbf24" />
            <text x={26} y={13} fill="#fbbf24" fontSize={10} fontFamily="monospace">Crest Peak (Resistance)</text>

            <polygon points="180,6 185,10 180,14 175,10" fill="#2dd4bf" />
            <text x={191} y={13} fill="#2dd4bf" fontSize={10} fontFamily="monospace">Trough Valley (Support)</text>
          </g>
        </g>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* FORMULA 4 RENDERING: STRUCTURAL SWING PIVOT SUPPORT & RESISTANCE   */}
      {/* ------------------------------------------------------------------ */}
      {config.extremumFormula === 'structural_sr' && (
        <g>
          {/* Stepped Support & Resistance Channel */}
          <polyline
            points={bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.highest).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={1.8}
          />
          <polyline
            points={bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.lowest).toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#10b981"
            strokeWidth={1.8}
          />

          {/* Pivot High / Low Candle Markers */}
          {bars.map((b, i) => {
            const x = getX(i);
            return (
              <g key={`pivot-${i}`}>
                {b.extremum.isPivotHigh && (
                  <g>
                    <circle cx={x} cy={getY(b.realHigh) - 6} r={4} fill="#f43f5e" />
                    <text x={x} y={getY(b.realHigh) - 12} fill="#f43f5e" fontSize={8} textAnchor="middle" fontFamily="monospace">
                      H
                    </text>
                  </g>
                )}
                {b.extremum.isPivotLow && (
                  <g>
                    <circle cx={x} cy={getY(b.realLow) + 6} r={4} fill="#10b981" />
                    <text x={x} y={getY(b.realLow) + 16} fill="#10b981" fontSize={8} textAnchor="middle" fontFamily="monospace">
                      L
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Legend */}
          <g transform={`translate(${paddingX + 10}, 18)`}>
            <rect x={0} y={0} width={340} height={20} fill="#0f172a" fillOpacity={0.85} rx={4} stroke="#1e293b" />
            <line x1={8} y1={10} x2={24} y2={10} stroke="#f43f5e" strokeWidth={2} />
            <text x={28} y={13} fill="#f43f5e" fontSize={10} fontFamily="monospace">Structural Pivot Resistance</text>

            <line x1={180} y1={10} x2={196} y2={10} stroke="#10b981" strokeWidth={2} />
            <text x={200} y={13} fill="#10b981" fontSize={10} fontFamily="monospace">Structural Pivot Support</text>
          </g>
        </g>
      )}

      {/* Interactive Bar Hover Rectangles */}
      {bars.map((b, i) => {
        const x = getX(i);
        const candleWidth = Math.max(3, plotWidth / bars.length);
        const isHovered = hoverIndex === startIndex + i;
        const isSelected = selectedCandleIndex === startIndex + i;

        return (
          <g key={`hitbox-${i}`}>
            <rect
              x={x - candleWidth / 2}
              y={10}
              width={candleWidth}
              height={height - 20}
              fill={isSelected ? 'rgba(6, 182, 212, 0.15)' : 'transparent'}
              className="cursor-pointer hover:fill-white/5 transition-colors"
              onMouseEnter={() => setHoverIndex(startIndex + i)}
              onClick={() => onSelectCandle(startIndex + i)}
            />
          </g>
        );
      })}

      {/* Synchronized Hover Crosshair Line */}
      {hoverIndex !== null && hoverIndex >= startIndex && hoverIndex < startIndex + bars.length && (
        <line
          x1={getX(hoverIndex - startIndex)}
          y1={15}
          x2={getX(hoverIndex - startIndex)}
          y2={height - 20}
          stroke="#06b6d4"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
    </svg>
  );
};

// ----------------------------------------------------------------------------
// PANEL 5 COMPONENT: ATR SVG
// ----------------------------------------------------------------------------
const AtrSvgPanel: React.FC<{
  bars: ChandelierBar[];
  width: number;
  plotWidth: number;
  paddingX: number;
  paddingRight: number;
  height: number;
}> = ({ bars, width, plotWidth, paddingX, paddingRight, height }) => {
  if (bars.length === 0) return null;

  let minAtr = bars[0].atr;
  let maxAtr = bars[0].atr;
  for (const b of bars) {
    if (b.atr < minAtr) minAtr = b.atr;
    if (b.atr > maxAtr) maxAtr = b.atr;
  }
  const rangeAtr = Math.max(0.01, maxAtr - minAtr);

  const getX = (idx: number) => {
    if (bars.length <= 1) return paddingX + plotWidth / 2;
    return paddingX + (idx / (bars.length - 1)) * plotWidth;
  };
  const getY = (v: number) => height - 18 - ((v - minAtr) / rangeAtr) * (height - 35);

  const points = bars.map((b, i) => `${getX(i).toFixed(1)},${getY(b.atr).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
      <line x1={paddingX} y1={18} x2={paddingX + plotWidth} y2={18} stroke="#1e293b" strokeDasharray="3 3" />
      <line x1={paddingX} y1={height - 18} x2={paddingX + plotWidth} y2={height - 18} stroke="#1e293b" />

      <text x={paddingX + plotWidth + 8} y={22} fill="#f59e0b" fontSize={10} fontFamily="monospace">
        {maxAtr.toFixed(3)}
      </text>
      <text x={paddingX + plotWidth + 8} y={height - 18} fill="#f59e0b" fontSize={10} fontFamily="monospace">
        {minAtr.toFixed(3)}
      </text>

      <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
    </svg>
  );
};

// ----------------------------------------------------------------------------
// PANEL 5 COMPONENT: EQUITY CURVE SVG
// ----------------------------------------------------------------------------
const EquitySvgPanel: React.FC<{
  trades: Trade[];
  bars: ChandelierBar[];
  minTime: number;
  maxTime: number;
  width: number;
  plotWidth: number;
  paddingX: number;
  paddingRight: number;
  height: number;
}> = ({ trades, bars, minTime, maxTime, width, plotWidth, paddingX, paddingRight, height }) => {
  if (trades.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center text-slate-500 text-xs">
        No completed trades to plot cumulative equity curve.
      </div>
    );
  }

  let minPnl = 0;
  let maxPnl = 0;
  for (const t of trades) {
    if (t.cumPnl < minPnl) minPnl = t.cumPnl;
    if (t.cumPnl > maxPnl) maxPnl = t.cumPnl;
  }
  const rangePnl = Math.max(1, maxPnl - minPnl);
  const timeSpan = Math.max(1, maxTime - minTime);

  const getX = (t: number) => paddingX + ((t - minTime) / timeSpan) * plotWidth;
  const getY = (val: number) => height - 20 - ((val - minPnl) / rangePnl) * (height - 40);

  const zeroY = getY(0);

  // Build step points
  let stepPoints = `${getX(trades[0].entryTime).toFixed(1)},${zeroY.toFixed(1)} `;
  for (const t of trades) {
    const x = getX(t.exitTime).toFixed(1);
    const y = getY(t.cumPnl).toFixed(1);
    stepPoints += `${x},${y} `;
  }

  const finalCum = trades[trades.length - 1].cumPnl;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
      {/* Zero benchmark line */}
      <line x1={paddingX} y1={zeroY} x2={paddingX + plotWidth} y2={zeroY} stroke="#475569" strokeDasharray="3 3" />

      {/* Labels */}
      <text x={paddingX + plotWidth + 8} y={22} fill="#94a3b8" fontSize={10} fontFamily="monospace">
        +{maxPnl.toFixed(2)}
      </text>
      <text x={paddingX + plotWidth + 8} y={zeroY + 3} fill="#64748b" fontSize={10} fontFamily="monospace">
        0.00
      </text>
      <text x={paddingX + plotWidth + 8} y={height - 20} fill="#94a3b8" fontSize={10} fontFamily="monospace">
        {minPnl.toFixed(2)}
      </text>

      {/* Step Curve */}
      <polyline
        points={stepPoints}
        fill="none"
        stroke={finalCum >= 0 ? '#10b981' : '#f43f5e'}
        strokeWidth={2}
      />
    </svg>
  );
};
