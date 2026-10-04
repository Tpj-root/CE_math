import React from 'react';
import {
  ChandelierBar,
  StrategyConfig,
  StepMathDetail,
} from '../types/trading';
import { getDetailedStepMath } from '../utils/engine';
import {
  ChevronLeft,
  ChevronRight,
  Calculator,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Info
} from 'lucide-react';

interface StepInspectorProps {
  bars: ChandelierBar[];
  selectedCandleIndex: number;
  setSelectedCandleIndex: (idx: number) => void;
  config: StrategyConfig;
}

export const StepInspector: React.FC<StepInspectorProps> = ({
  bars,
  selectedCandleIndex,
  setSelectedCandleIndex,
  config,
}) => {
  const n = bars.length;

  const detail: StepMathDetail | null = React.useMemo(() => {
    return getDetailedStepMath(bars, selectedCandleIndex, config.atrPeriod, config.atrMultiplier, config);
  }, [bars, selectedCandleIndex, config]);

  if (n === 0 || !detail) {
    return (
      <div className="p-8 text-center text-slate-500">
        No candle data loaded to inspect.
      </div>
    );
  }

  // Find next and previous signals for quick jumps
  const prevSignalIndex = bars
    .map((b, i) => (i < selectedCandleIndex && (b.buySignal || b.sellSignal) ? i : -1))
    .filter(i => i !== -1)
    .pop();

  const nextSignalIndex = bars.findIndex(
    (b, i) => i > selectedCandleIndex && (b.buySignal || b.sellSignal)
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] overflow-y-auto p-6 space-y-6 select-none">
      {/* Top Bar: Candle Selector Slider & Buttons */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-lg text-sky-400">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">
                Mathematical Step Inspector
              </h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1e293b] text-sky-300">
                Bar #{selectedCandleIndex} of {n - 1}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Scrub through every bar to examine exact input variables, formulas, and substituted values.
            </p>
          </div>
        </div>

        {/* Step Navigation Controls */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {prevSignalIndex !== undefined && (
            <button
              onClick={() => setSelectedCandleIndex(prevSignalIndex)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[#182438] hover:bg-[#20304a] text-slate-300 border border-[#273852] transition-colors"
              title="Jump to Previous Signal"
            >
              Prev Signal (#{prevSignalIndex})
            </button>
          )}

          <button
            disabled={selectedCandleIndex <= 0}
            onClick={() => setSelectedCandleIndex(Math.max(0, selectedCandleIndex - 1))}
            className="p-1.5 rounded-lg bg-[#182438] hover:bg-[#20304a] text-slate-300 disabled:opacity-40 border border-[#273852]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <input
            type="range"
            min={0}
            max={n - 1}
            value={selectedCandleIndex}
            onChange={(e) => setSelectedCandleIndex(parseInt(e.target.value))}
            className="w-44 accent-sky-400 cursor-pointer"
          />

          <button
            disabled={selectedCandleIndex >= n - 1}
            onClick={() => setSelectedCandleIndex(Math.min(n - 1, selectedCandleIndex + 1))}
            className="p-1.5 rounded-lg bg-[#182438] hover:bg-[#20304a] text-slate-300 disabled:opacity-40 border border-[#273852]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {nextSignalIndex !== -1 && (
            <button
              onClick={() => setSelectedCandleIndex(nextSignalIndex)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[#182438] hover:bg-[#20304a] text-slate-300 border border-[#273852] transition-colors"
              title="Jump to Next Signal"
            >
              Next Signal (#{nextSignalIndex})
            </button>
          )}
        </div>
      </div>

      {/* Signal Alert Banner (if signal triggered on this candle) */}
      {(detail.buySignal || detail.sellSignal || detail.enterLong || detail.enterShort) && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            detail.buySignal
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
              : detail.sellSignal
              ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              : 'bg-sky-950/40 border-sky-500/50 text-sky-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <Flame className="w-5 h-5 shrink-0" />
            <div>
              <div className="font-semibold text-sm">
                {detail.buySignal && 'BUY SIGNAL TRIGGERED ON CLOSE'}
                {detail.sellSignal && 'SELL SIGNAL TRIGGERED ON CLOSE'}
                {!detail.buySignal && !detail.sellSignal && 'ORDER EXECUTED ON THIS BAR OPEN'}
              </div>
              <div className="text-xs opacity-90">{detail.signalReason}</div>
            </div>
          </div>
          <div className="text-right font-mono text-xs">
            {detail.enterLong && (
              <span className="px-2.5 py-1 bg-emerald-500 text-slate-950 font-bold rounded">
                ENTER LONG @ {detail.realOpen.toFixed(2)}
              </span>
            )}
            {detail.enterShort && (
              <span className="px-2.5 py-1 bg-rose-500 text-slate-950 font-bold rounded">
                ENTER SHORT @ {detail.realOpen.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Step Grid: 6 Distinct Step Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* STEP 1: REAL MARKET OHLC */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-xs font-semibold">
                STEP 1
              </span>
              <span className="text-slate-100 font-semibold text-xs">Real Market OHLC from Ticks</span>
            </div>
            <span className="text-slate-500 text-[11px] font-mono">{detail.timeStr} UTC</span>
          </div>

          <p className="text-xs text-slate-400">
            Aggregated from <span className="text-sky-300 font-mono font-medium">{detail.ticksInCandle}</span> ticks
            in this {config.timeframeSec}s time bucket:
          </p>

          <div className="grid grid-cols-4 gap-2 pt-1 font-mono text-xs">
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-[10px] text-slate-500 block">Real Open</span>
              <span className="font-semibold text-slate-200">{detail.realOpen.toFixed(2)}</span>
            </div>
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-[10px] text-slate-500 block">Real High</span>
              <span className="font-semibold text-slate-200">{detail.realHigh.toFixed(2)}</span>
            </div>
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-[10px] text-slate-500 block">Real Low</span>
              <span className="font-semibold text-slate-200">{detail.realLow.toFixed(2)}</span>
            </div>
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-[10px] text-slate-500 block">Real Close</span>
              <span className="font-semibold text-slate-200">{detail.realClose.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* STEP 2: HEIKIN-ASHI FORMULAS */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-semibold">
                STEP 2
              </span>
              <span className="text-slate-100 font-semibold text-xs">Heikin-Ashi Transformation</span>
            </div>
            <span className="text-emerald-400 font-mono text-xs">
              {detail.haClose >= detail.haOpen ? 'Bullish HA' : 'Bearish HA'}
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block">ha_close = (O + H + L + C) / 4</span>
              <span className="text-emerald-300">{detail.haCloseFormula}</span>
            </div>

            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block">ha_open = (prev_ha_open + prev_ha_close) / 2</span>
              <span className="text-emerald-300">{detail.haOpenFormula}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
                <span className="text-slate-400 text-[10px] block">ha_high = max(H, haO, haC)</span>
                <span className="text-slate-200">{detail.haHigh.toFixed(3)}</span>
              </div>
              <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
                <span className="text-slate-400 text-[10px] block">ha_low = min(L, haO, haC)</span>
                <span className="text-slate-200">{detail.haLow.toFixed(3)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 3: TRUE RANGE & ATR */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-xs font-semibold">
                STEP 3
              </span>
              <span className="text-slate-100 font-semibold text-xs">Wilder's ATR (ta.rma)</span>
            </div>
            <span className="text-amber-400 font-mono text-xs">Period: {config.atrPeriod}</span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block">
                True Range = max(H - L, |H - C_prev|, |L - C_prev|)
              </span>
              <span className="text-amber-300">{detail.trFormula}</span>
            </div>

            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block">
                Wilder RMA ATR = (ATR_prev × (N-1) + TR) / N
              </span>
              <span className="text-amber-300">{detail.atrFormula}</span>
            </div>
          </div>
        </div>

        {/* STEP 4: EXTREMUMS ENGINE & NOISE REDUCTION */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-xs font-semibold">
                STEP 4
              </span>
              <span className="text-slate-100 font-semibold text-xs">Extremums Engine &amp; Noise Reduction Filter</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-cyan-400">
                Formula: {detail.extremumFormulaName.split(':')[0]}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-indigo-400">Mult: {config.atrMultiplier}x</span>
            </div>
          </div>

          {/* Extremums Engine Rule & Noise Filter Explanation */}
          <div className="p-3 bg-[#131d2e] rounded-lg border border-[#223049] space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300 font-semibold">
              <span className="text-cyan-300 font-mono">{detail.extremumFormulaName}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                detail.useCloseForExtremums ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}>
                {detail.useCloseForExtremums ? '🛡️ Use Close Price = ON (Noise Filter Active)' : '⚠ Use Close Price = OFF (Raw Wicks Included)'}
              </span>
            </div>

            <p className="text-slate-400 font-mono text-[11px]">
              {detail.extremumBasisText}
            </p>

            <div className="p-2 bg-[#0b101b] rounded border border-[#1b263b] font-mono text-[11px] text-slate-300 space-y-1.5">
              <div className="text-slate-400 text-[10px]">Mathematical Formula:</div>
              <div className="text-cyan-300 font-semibold">{detail.extremumFormulaMath}</div>
              <div className="text-slate-400 text-[10px] pt-1">Extremum Values Breakdown:</div>
              <div className="text-emerald-300 text-[10px]">{detail.extremumValuesSummary}</div>
              <div className="text-sky-300 text-[10px] pt-1 border-t border-slate-800">
                {detail.noiseReductionBenefit}
              </div>
              <div className="text-slate-400 text-[10px] italic">
                {detail.noiseExampleText}
              </div>
            </div>
          </div>

          {/* This Candle's Specific Wick Noise vs Rolling Extremums */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block">Rolling Highest Close</span>
              <span className="text-cyan-300 font-semibold">{detail.highestClose.toFixed(2)}</span>
            </div>
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block">Rolling Highest High</span>
              <span className="text-amber-300 font-semibold">{detail.highestHigh.toFixed(2)}</span>
              <span className="text-[10px] text-cyan-400 block">Wick Noise: +{(detail.highestHigh - detail.highestClose).toFixed(2)} pts</span>
            </div>
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block">Rolling Lowest Close</span>
              <span className="text-cyan-300 font-semibold">{detail.lowestClose.toFixed(2)}</span>
            </div>
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block">Rolling Lowest Low</span>
              <span className="text-amber-300 font-semibold">{detail.lowestLow.toFixed(2)}</span>
              <span className="text-[10px] text-cyan-400 block">Wick Noise: -{(detail.lowestClose - detail.lowestLow).toFixed(2)} pts</span>
            </div>
          </div>

          {/* Candle Wick Noise Isolation */}
          <div className="p-2.5 bg-[#0f172a] rounded-lg border border-[#1e293b] flex items-center justify-between text-xs font-mono flex-wrap gap-2">
            <span className="text-slate-400 text-[11px]">Candle #{detail.candleIndex} Instant Wick Noise:</span>
            <div className="flex items-center gap-3">
              <span className="text-amber-300 text-[11px]">
                Upper Wick: <strong className="text-slate-200">+{detail.candleUpperWickNoise.toFixed(2)}</strong>
              </span>
              <span className="text-amber-300 text-[11px]">
                Lower Wick: <strong className="text-slate-200">+{detail.candleLowerWickNoise.toFixed(2)}</strong>
              </span>
              <span className="text-cyan-300 text-[11px] font-bold">
                Total Wick Noise: {detail.candleTotalWickNoise.toFixed(2)} pts
              </span>
            </div>
          </div>

          {/* Ratchet Logic Walkthrough */}
          <div className="space-y-2 text-xs font-mono">
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-emerald-400 text-[10px] block font-semibold">Long Stop Ratchet:</span>
              <span className="text-slate-300">{detail.longStopRatchetFormula}</span>
            </div>

            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-rose-400 text-[10px] block font-semibold">Short Stop Ratchet:</span>
              <span className="text-slate-300">{detail.shortStopRatchetFormula}</span>
            </div>
          </div>
        </div>

        {/* STEP 5: DIRECTION STATE & SIGNALS */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-xs font-semibold">
                STEP 5
              </span>
              <span className="text-slate-100 font-semibold text-xs">Direction & Signal Evaluation</span>
            </div>
            <span
              className={`font-mono text-xs font-bold ${
                detail.direction === 1 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {detail.directionLabel} ({detail.direction})
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2 bg-[#131d2e] rounded border border-[#223049] font-mono">
              <span className="text-slate-400 text-[10px] block">Direction Evaluation:</span>
              <span className="text-slate-200">{detail.directionFormula}</span>
            </div>

            <div className="p-2 bg-[#131d2e] rounded border border-[#223049]">
              <span className="text-slate-400 text-[10px] block font-mono">Signal Result:</span>
              <span className="text-slate-200">{detail.signalReason}</span>
            </div>
          </div>
        </div>

        {/* STEP 6: REAL ORDER EXECUTION (N+1 RULE) */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-xs font-semibold">
                STEP 6
              </span>
              <span className="text-slate-100 font-semibold text-xs">Execution Simulation (N+1 Rule)</span>
            </div>
            <span className="text-cyan-400 font-mono text-xs">Zero Lookahead</span>
          </div>

          <p className="text-xs text-slate-400">
            Signals confirmed at the close of candle N are executed at the Open of candle N+1 at real broker market price.
          </p>

          <div className="p-2.5 bg-[#131d2e] rounded border border-[#223049] text-xs font-mono">
            <span className="text-slate-400 text-[10px] block">Execution Action:</span>
            <span className="text-cyan-300 font-semibold">{detail.executionNote}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
