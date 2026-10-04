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
  selectedCandleIndex: number;
  onSelectCandle: (index: number) => void;
  onOpenStepInspector: (index: number) => void;
}

export const ChartPanels: React.FC<ChartPanelsProps> = ({
  ticks,
  bars,
  trades,
  config,
  selectedCandleIndex,
  onSelectCandle,
  onOpenStepInspector,
}) => {
  // Panel visibility toggles
  const [showTicks, setShowTicks] = useState(true);
  const [showRealOhlc, setShowRealOhlc] = useState(true);
  const [showHeikinAshi, setShowHeikinAshi] = useState(true);
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
              onClick={() => setShowAtr(prev => !prev)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                showAtr ? 'bg-[#1b283e] text-amber-400 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              4. ATR
            </button>
            <button
              onClick={() => setShowEquity(prev => !prev)}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                showEquity ? 'bg-[#1b283e] text-emerald-300 font-medium' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              5. Equity
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

        {/* PANEL 4: WILDER'S ATR INDICATOR */}
        {showAtr && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                <span className="font-semibold text-slate-100 text-xs tracking-wide">
                  PANEL 4 — AVERAGE TRUE RANGE (ATR)
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

        {/* PANEL 5: CUMULATIVE STRATEGY EQUITY */}
        {showEquity && (
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 shadow-md">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1e293b]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block"></span>
                <span className="font-semibold text-slate-100 text-xs tracking-wide">
                  PANEL 5 — CUMULATIVE STRATEGY EQUITY CURVE
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
// PANEL 4 COMPONENT: ATR SVG
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
