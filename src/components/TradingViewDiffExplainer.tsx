import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Bug,
  HelpCircle,
  TrendingUp,
  Cpu,
  ArrowRight,
  Code
} from 'lucide-react';
import { StrategyConfig } from '../types/trading';

interface TradingViewDiffExplainerProps {
  config: StrategyConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrategyConfig>>;
}

export const TradingViewDiffExplainer: React.FC<TradingViewDiffExplainerProps> = ({
  config,
  setConfig,
}) => {
  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] overflow-y-auto p-6 space-y-6 text-slate-300 text-xs select-none">
      {/* Header Banner */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-rose-400" />
          <h2 className="text-base font-semibold text-slate-100">
            Why TradingView Heikin-Ashi & Output Differ From Offline Python (And How We Fixed It)
          </h2>
        </div>
        <p className="text-slate-400 text-xs leading-relaxed max-w-4xl">
          You noticed: <span className="text-amber-300 font-mono italic">"tradingview heikin ashi and my output very diffrent why ?? but normal candle perefcly work... why //?? SO find bug... and .. FIx the code."</span>
          <br />
          Here is the complete mathematical and architectural breakdown of the 4 exact reasons why offline Python scripts diverge from TradingView, and how our unified library resolves them.
        </p>

        {/* Live Interactive Switch */}
        <div className="pt-3 border-t border-[#1e293b] flex items-center gap-3">
          <span className="font-semibold text-slate-200">Active Engine Calibration:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfig(prev => ({ ...prev, algorithm: 'tradingview' }))}
              className={`px-3 py-1.5 rounded-lg border font-mono transition-colors ${
                config.algorithm === 'tradingview'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                  : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200'
              }`}
            >
              ✓ TradingView EverGet Calibrated (Fixed)
            </button>
            <button
              onClick={() => setConfig(prev => ({ ...prev, algorithm: 'user_original' }))}
              className={`px-3 py-1.5 rounded-lg border font-mono transition-colors ${
                config.algorithm === 'user_original'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                  : 'bg-[#131d2e] border-[#223049] text-slate-400 hover:text-slate-200'
              }`}
            >
              ⚠ Original Python Script Logic
            </button>
          </div>
        </div>
      </div>

      {/* 4 Deep Dives */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* REASON 1: THE RATCHET LOGIC BUG */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono font-bold text-xs">
                BUG 1
              </span>
              <h3 className="font-semibold text-slate-100 text-sm">
                The Chandelier Stop Ratchet Logic
              </h3>
            </div>
            <span className="text-rose-400 font-mono text-[11px]">Primary Cause of Signal Divergence</span>
          </div>

          <div className="space-y-3 leading-relaxed">
            <p>
              In your original Python code:
            </p>
            <div className="p-3 bg-[#090d14] rounded-lg border border-rose-500/30 font-mono text-[11px] text-rose-300">
              <code>{`# Original Python script:\nif i > 0 and not np.isnan(long_stop[i - 1]) and close[i] > long_stop[i - 1]:\n    ls = max(ls, long_stop[i - 1])`}</code>
            </div>

            <p>
              Notice you compared <code className="text-rose-400 font-bold">close[i]</code> (the CURRENT candle close) against <code className="text-slate-300">long_stop[i-1]</code>.
            </p>

            <div className="p-3 bg-[#090d14] rounded-lg border border-emerald-500/30 font-mono text-[11px] text-emerald-300">
              <code>{`# TradingView EverGet Official Pine Script:\nlongStop := close[1] > longStop[1] ? math.max(longStop, longStop[1]) : longStop\nshortStop := close[1] < shortStop[1] ? math.min(shortStop, shortStop[1]) : shortStop`}</code>
            </div>

            <p className="text-slate-300">
              <span className="text-emerald-400 font-bold">The Fix:</span> TradingView tests <code className="text-emerald-400 font-bold">close[1]</code> (the PREVIOUS candle close). If the current candle price drops, your stop must NOT immediately drop before the candle closes and confirms direction!
            </p>
          </div>
        </div>

        {/* REASON 2: WILDER'S RMA ATR INITIALIZATION */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-xs">
                BUG 2
              </span>
              <h3 className="font-semibold text-slate-100 text-sm">
                Wilder's RMA ATR vs Naive SMA Seed
              </h3>
            </div>
            <span className="text-amber-400 font-mono text-[11px]">NaN Discrepancy</span>
          </div>

          <div className="space-y-3 leading-relaxed">
            <p>
              In your original Python code:
            </p>
            <div className="p-3 bg-[#090d14] rounded-lg border border-amber-500/30 font-mono text-[11px] text-amber-300">
              <code>{`# Original script waited 22 bars:\nif n >= atr_period:\n    atr[atr_period - 1] = tr[:atr_period].mean()  # 21 bars are NaN!`}</code>
            </div>

            <p>
              Because bars 0 through 20 were <code className="text-amber-400">NaN</code>, no Chandelier Stops or direction calculations could run during the entire first 22 candles.
            </p>

            <div className="p-3 bg-[#090d14] rounded-lg border border-emerald-500/30 font-mono text-[11px] text-emerald-300">
              <code>{`# TradingView ta.rma recursive formula:\nalpha = 1.0 / period\natr[0] = tr[0]\nfor i in range(1, n):\n    atr[i] = (atr[i-1] * (period - 1) + tr[i]) / period`}</code>
            </div>

            <p className="text-slate-300">
              <span className="text-emerald-400 font-bold">The Fix:</span> TradingView streams RMA from the first available bar, allowing ATR and stops to be valid immediately from bar 1!
            </p>
          </div>
        </div>

        {/* REASON 3: HEIKIN-ASHI SEED & LOOKBACK DECAY */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold text-xs">
                DIFF 3
              </span>
              <h3 className="font-semibold text-slate-100 text-sm">
                Recursive History Warm-up & Decay
              </h3>
            </div>
            <span className="text-sky-400 font-mono text-[11px]">Seed Dependency</span>
          </div>

          <div className="space-y-3 leading-relaxed">
            <p>
              Heikin-Ashi Open is a recursive autoregressive equation:
            </p>
            <div className="p-3 bg-[#090d14] rounded-lg border border-sky-500/30 font-mono text-[11px] text-sky-300">
              <code>{`ha_open[i] = 0.5 * ha_open[i-1] + 0.5 * ha_close[i-1]`}</code>
            </div>

            <p>
              Notice the coefficient is <code className="text-sky-400 font-bold">0.5</code>. Any difference in the initial seed candle decays as <code className="text-sky-400 font-mono">(0.5)^i</code>:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>Bar 1: 50% initial seed weight</li>
              <li>Bar 5: 3.1% initial seed weight</li>
              <li>Bar 10: 0.09% initial seed weight</li>
              <li>Bar 20: &lt; 0.0001% initial seed weight</li>
            </ul>

            <p className="text-slate-300">
              In TradingView, your chart loads hundreds of historical bars before today. In an offline CSV slice, bar 0 is the start of your file! Thus, the first 10-15 bars will show minor decimal offsets until the recursive memory converges to 99.999%.
            </p>
          </div>
        </div>

        {/* REASON 4: THE EXECUTION REALITY GAP */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold text-xs">
                DIFF 4
              </span>
              <h3 className="font-semibold text-slate-100 text-sm">
                Why Normal Candle Works But HA Strategy Diverges
              </h3>
            </div>
            <span className="text-purple-400 font-mono text-[11px]">Synthetic Price Trap</span>
          </div>

          <div className="space-y-3 leading-relaxed">
            <p className="text-slate-300">
              You asked: <span className="text-amber-300 italic">"why normal candle perefcly work, but tradingview heikin ashi very diffrent??"</span>
            </p>

            <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-lg text-purple-200">
              <strong>The TradingView Heikin-Ashi Illusion:</strong>
              <br />
              When you put a strategy on a TradingView Heikin-Ashi chart, TradingView fills simulated trades at the <em>Heikin-Ashi synthetic price</em> (which is an average of 4 numbers), NOT the real bid/ask or real candle open!
            </div>

            <p className="text-slate-300">
              In reality (and in your Python script), you <span className="text-rose-400 font-bold">CANNOT buy or sell at synthetic Heikin-Ashi prices</span>. The exchange will execute you at the real market price (<code className="text-emerald-400">real_open</code>).
            </p>

            <p className="text-slate-400">
              That is why your original script had realistic results, whereas a naive TradingView HA strategy backtest reports unrealistic paper profits! Our engine allows you to toggle both modes so you can see the exact difference.
            </p>
          </div>
        </div>

        {/* DIFF 5: USE CLOSE PRICE FOR EXTREMUMS (TRADINGVIEW INPUT OPTION) */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1e293b] pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-xs">
                DIFF 5
              </span>
              <h3 className="font-semibold text-slate-100 text-sm">
                The "Use Close Price for Extremums" Parameter in TradingView Pine Script
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs">Toggle Mode:</span>
              <button
                onClick={() => setConfig(prev => ({ ...prev, useCloseForExtremums: !prev.useCloseForExtremums }))}
                className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-all border ${
                  config.useCloseForExtremums
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                    : 'bg-[#131d2e] text-slate-400 border-[#273752]'
                }`}
              >
                Use Close Price: {config.useCloseForExtremums ? 'ON (Wicks Ignored)' : 'OFF (Wicks Included)'}
              </button>
            </div>
          </div>

          <div className="space-y-3 leading-relaxed">
            <p className="text-slate-300">
              In TradingView's official Chandelier Exit indicator by EverGet, there is an input option called{' '}
              <span className="text-cyan-300 font-mono font-semibold">"Use Close Price for Extremums"</span>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3 bg-[#131d2e] rounded-lg border border-[#223049] space-y-1.5">
                <span className="text-amber-400 font-semibold block">Without “Use Close Price” (OFF):</span>
                <p className="text-slate-400 text-[11px]">
                  Highest = max(High_1, High_2, ... High_22)
                  <br />
                  Lowest = min(Low_1, Low_2, ... Low_22)
                  <br />
                  <span className="text-slate-300">Candle wicks are included.</span>
                </p>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-[#1e293b]">
                  LongStop = HighestHigh_22 - ATR_22 × 3
                  <br />
                  ShortStop = LowestLow_22 + ATR_22 × 3
                </div>
              </div>

              <div className="p-3 bg-[#131d2e] rounded-lg border border-[#223049] space-y-1.5">
                <span className="text-cyan-400 font-semibold block">With “Use Close Price” (ON):</span>
                <p className="text-slate-400 text-[11px]">
                  Highest = max(Close_1, Close_2, ... Close_22)
                  <br />
                  Lowest = min(Close_1, Close_2, ... Close_22)
                  <br />
                  <span className="text-cyan-300 font-semibold">Wicks are completely ignored!</span>
                </p>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-[#1e293b]">
                  LongStop = HighestClose_22 - ATR_22 × 3
                  <br />
                  ShortStop = LowestClose_22 + ATR_22 × 3
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#0b101b] rounded-lg border border-[#1b263b] font-mono text-xs text-slate-300 space-y-1">
              <div className="text-slate-400 font-medium text-[11px]">Simple Concrete Example:</div>
              <div>Suppose one candle has: High = 105, Close = 101, Low = 98</div>
              <div>If Use Close Price = OFF: <span className="text-amber-300">Highest = 105 (Uses Wick High)</span></div>
              <div>If Use Close Price = ON: <span className="text-cyan-300 font-semibold">Highest = 101 (Uses Candle Close)</span></div>
            </div>

            <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-lg text-cyan-200 text-xs">
              <strong>Why This Matters In Live Trading:</strong>
              <br />
              During flash crashes or liquidity sweeps, violent single-tick wicks can shoot up or down without any real volume closing there. When <code className="text-cyan-300 font-bold">Use Close Price = ON</code>, your Chandelier Exit trailing stop will not be distorted by outlier wicks, keeping your stop anchored strictly to confirmed closing price action.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
