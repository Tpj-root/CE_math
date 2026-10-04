import React from 'react';
import { BookOpen, Terminal, CheckCircle2, Sliders, Calculator, Layers, HelpCircle, FileText, ArrowRight } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchTab: (tab: any) => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({
  isOpen,
  onClose,
  onSwitchTab,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 select-none">
      <div className="bg-[#0f172a] border border-[#273752] rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#1e293b] flex items-center justify-between bg-[#131d2e]">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">
              Heikin-Ashi + Chandelier Exit: Complete User Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-[#1e293b]"
          >
            ✕
          </button>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs leading-relaxed">
          {/* Section 1: Overview */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-sky-400 flex items-center gap-2">
              <span>1. How the Pipeline Works</span>
            </h3>
            <div className="p-3 bg-[#080d16] rounded-xl border border-[#1e293b] font-mono text-[11px] text-slate-300">
              Raw Tick CSV (times,prices) ➔ Candle Buckets (1m / 5m) ➔ Heikin-Ashi Transform ➔ Wilder ATR(22) ➔ Chandelier Exit Trailing Bands ➔ Buy/Sell Flips ➔ N+1 Open Execution
            </div>
            <p className="text-slate-400">
              This engine processes raw price ticks, aggregates them into standard OHLC time candles, calculates smoothed Heikin-Ashi bars, applies ratcheted Chandelier trailing stop bands, and simulates trades at the Real Market Open of candle N+1 (eliminating all lookahead bias).
            </p>
          </div>

          {/* Section 2: Step-by-Step UI Guide */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
              <span>2. How to Use the Web Studio Interface</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-[#131d2e] rounded-xl border border-[#223049] space-y-1.5">
                <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  <span>A. Parameters Sidebar (Left)</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  • <strong>Tick Data Source:</strong> Choose between official gold ticks (1790274600), breakout trends, or click <em>"Upload CSV"</em> to load your custom file.
                  <br />
                  • <strong>Timeframe:</strong> Select 5s, 15s, 60s (1m), 300s (5m), or any custom second value.
                  <br />
                  • <strong>ATR Period &amp; Mult:</strong> Default is 22 and 3.0x.
                  <br />
                  • <strong>Ratchet Mode:</strong> Select <em>TradingView EverGet Standard</em> (fixed) or <em>Original Script Logic</em>.
                </p>
              </div>

              <div className="p-3 bg-[#131d2e] rounded-xl border border-[#223049] space-y-1.5">
                <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>B. Separated Charts Tab</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  • Displays 5 independent, color-separated panels: Raw Ticks (Blue), Real OHLC, Heikin-Ashi with Long Stop (Green) &amp; Short Stop (Red), Wilder ATR, and Equity Step Curve.
                  <br />
                  • Toggle any panel on/off using the toolbar buttons.
                  <br />
                  • Click on any candle to immediately open its step-by-step math!
                </p>
              </div>

              <div className="p-3 bg-[#131d2e] rounded-xl border border-[#223049] space-y-1.5">
                <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-amber-400" />
                  <span>C. Step-by-Step Math Inspector</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  • Scrub through any bar with the slider or Prev/Next buttons.
                  <br />
                  • See all 6 steps with actual numbers plugged into each formula:
                  Real OHLC ➔ Heikin-Ashi equations ➔ TR &amp; ATR ➔ Stop Ratchet ➔ Direction (+1/-1) ➔ Execution.
                </p>
              </div>

              <div className="p-3 bg-[#131d2e] rounded-xl border border-[#223049] space-y-1.5">
                <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-rose-400" />
                  <span>D. TradingView Diff &amp; Fix Tab</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  • In-depth side-by-side diagnosis explaining the 4 exact bugs in your original Python script: the ratchet condition (`close[1]` vs `close[i]`), Wilder RMA seed, lookback decay, and synthetic vs real order fills.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Terminal CLI Guide */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-sky-400 flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              <span>3. How to Use the Python CLI &amp; Local Server</span>
            </h3>

            <div className="space-y-2">
              <p className="text-slate-400">
                You can run the engine directly on your Linux terminal (e.g. <code>when@master:~/Documents/PROJECT_TRADE/DEEP_1/2$</code>):
              </p>

              <div className="space-y-1 font-mono text-[11px]">
                <div className="p-2.5 bg-[#080d16] rounded-lg border border-[#1e293b] text-sky-300">
                  # 1. Run multi-timeframe backtest on 1m (60s) and 5m (300s):
                  <br />
                  python3 trading_ha_chandelier.py --csv frxXAUUSD_1790274600.csv --tf 60 300
                </div>

                <div className="p-2.5 bg-[#080d16] rounded-lg border border-[#1e293b] text-emerald-300">
                  # 2. Launch the zero-dependency interactive local browser GUI:
                  <br />
                  python3 trading_ha_chandelier.py --gui
                </div>

                <div className="p-2.5 bg-[#080d16] rounded-lg border border-[#1e293b] text-amber-300">
                  # 3. Test custom ATR period and multiplier:
                  <br />
                  python3 trading_ha_chandelier.py --csv YOUR_DATA.csv --tf 60 --atr-period 14 --atr-mult 2.5
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#1e293b] flex items-center justify-between bg-[#131d2e]">
          <span className="text-slate-400 text-xs">
            Tip: You can export clean CSV results anytime using the top button.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg text-xs transition-colors"
          >
            Got it, Let's Trade!
          </button>
        </div>
      </div>
    </div>
  );
};
