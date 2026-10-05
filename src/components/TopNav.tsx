import React from 'react';
import {
  Download,
  Sliders,
  Layers,
  Calculator,
  HelpCircle,
  FileText,
  Code2,
  BookOpen,
  ShieldCheck,
  Activity,
  FileSpreadsheet,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { DataMode, AlgoTradingState } from '../types/trading';

export type ActiveTab =
  | 'charts'
  | 'inspector'
  | 'tv_diff'
  | 'trades'
  | 'online_terminal'
  | 'test_suite'
  | 'python_lib';

interface TopNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  dataMode: DataMode;
  setDataMode: (mode: DataMode) => void;
  algoTrading: AlgoTradingState;
  onToggleAlgoTrading: () => void;
  onExportCsv: () => void;
  onDownloadPython: () => void;
  onOpenGuide: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedCandleIndex: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  dataMode,
  setDataMode,
  algoTrading,
  onToggleAlgoTrading,
  onExportCsv,
  onDownloadPython,
  onOpenGuide,
  sidebarOpen,
  setSidebarOpen,
  selectedCandleIndex,
}) => {
  return (
    <header className="flex flex-col bg-[#0b0f17] border-b border-[#1e293b] select-none shrink-0 z-30">
      {/* Top Bar Zone 1: Main Brand, Method Selector (Online vs Offline), and AutoTrade Toolbar Toggle */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b border-[#182234] gap-3 flex-wrap">
        {/* Left: Sidebar toggle & Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1e293b] transition-colors ${
              sidebarOpen ? 'bg-[#1e293b] text-sky-400' : ''
            }`}
            title="Toggle Parameters Panel"
          >
            <Sliders className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-bold tracking-tight text-slate-100">
              QUANT STUDIO
            </span>
            <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
              HA + Chandelier Exit Engine
            </span>
          </div>
        </div>

        {/* Center: TOP OF MENU OFFLINE (CSV) vs ONLINE (MT5 TICK) METHOD SELECTOR */}
        <div className="flex items-center bg-[#070b12] border border-[#1e293b] rounded-lg p-0.5 shadow-inner">
          <button
            onClick={() => {
              setDataMode('offline_csv');
              if (activeTab === 'online_terminal') {
                setActiveTab('charts');
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-all ${
              dataMode === 'offline_csv'
                ? 'bg-[#1e293b] text-sky-300 font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Offline Method: Connect to CSV data / Golden Dataset backtest"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
            <span>OFFLINE: Connect to CSV</span>
          </button>

          <button
            onClick={() => {
              setDataMode('online_mt5');
              setActiveTab('online_terminal');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-all ${
              dataMode === 'online_mt5'
                ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Online Method: Connect to MT5 TICK stream & real-time execution"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>ONLINE: Connect to MT5 TICK</span>
          </button>
        </div>

        {/* Right: TOP OF MENU ALGO TRADING ENABLE/DISABLE BUTTON */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleAlgoTrading}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shadow-md cursor-pointer border ${
                algoTrading.enabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-emerald-950/40 hover:bg-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-400 shadow-rose-950/40 hover:bg-rose-500/30'
              }`}
              title={
                algoTrading.enabled
                  ? 'Algo Trading is ENABLED (Toolbar is GREEN). Click or press CTRL+E to disable.'
                  : 'Algo Trading is DISABLED (Toolbar is RED). Click or press CTRL+E to enable.'
              }
            >
              <span className={`w-2.5 h-2.5 rounded-full ${algoTrading.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span>{algoTrading.enabled ? '🟢 ALGO TRADING: ON' : '🔴 ALGO TRADING: OFF'}</span>
              <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] border border-white/10 font-mono">
                CTRL+E
              </span>
            </button>

            {/* Note badge explaining Green vs Red */}
            <span
              className={`hidden xl:inline text-[10px] font-mono px-2 py-1 rounded border ${
                algoTrading.enabled
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
              }`}
            >
              {algoTrading.enabled ? 'Toolbar GREEN = Enabled (Ready to trade)' : 'Toolbar RED = Disabled (Press CTRL+E)'}
            </span>
          </div>

          <button
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:text-white bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg transition-colors whitespace-nowrap"
            title="Open User Guide & Manual"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Guide</span>
          </button>

          <button
            onClick={onDownloadPython}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap"
            title="Download MT5 Online & Quant Python Libraries"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download .py</span>
          </button>
        </div>
      </div>

      {/* Navigation tabs row */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-2 overflow-x-auto gap-2 scrollbar-none">
        <nav className="flex items-center gap-1 sm:gap-1.5">
          {/* Online MT5 Terminal Tab (Prominent) */}
          <button
            onClick={() => setActiveTab('online_terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'online_terminal'
                ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-xs'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-[#131d2e]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>MT5 Live Terminal</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-0.5" />
          </button>

          <button
            onClick={() => setActiveTab('charts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'charts'
                ? 'bg-[#1e293b] text-sky-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131d2e]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Separated Charts</span>
          </button>

          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'inspector'
                ? 'bg-[#1e293b] text-sky-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131d2e]'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Step-by-Step Math</span>
            <span className="text-[10px] text-slate-500 font-mono">#{selectedCandleIndex}</span>
          </button>

          <button
            onClick={() => setActiveTab('tv_diff')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'tv_diff'
                ? 'bg-[#1e293b] text-sky-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131d2e]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>TradingView Diff</span>
          </button>

          <button
            onClick={() => setActiveTab('trades')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'trades'
                ? 'bg-[#1e293b] text-sky-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131d2e]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Trade Log & Metrics</span>
          </button>

          <button
            onClick={() => setActiveTab('test_suite')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'test_suite'
                ? 'bg-[#1e293b] text-cyan-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131d2e]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Test Suite (Unit / Int / Sys)</span>
          </button>

          <button
            onClick={() => setActiveTab('python_lib')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'python_lib'
                ? 'bg-[#1e293b] text-emerald-400 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131d2e]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Python Libraries (.py)</span>
          </button>
        </nav>

        {/* Secondary action: Export data CSV */}
        <div className="flex items-center gap-2">
          <button
            onClick={onExportCsv}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#131d2e] hover:bg-[#1e293b] border border-[#27354a] rounded-lg transition-colors whitespace-nowrap"
            title="Export Computed Candles & Signals to CSV"
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>
    </header>
  );
};
