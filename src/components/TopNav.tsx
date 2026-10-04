import React from 'react';
import { Download, Sliders, Layers, Calculator, HelpCircle, FileText, Code2 } from 'lucide-react';

export type ActiveTab = 'charts' | 'inspector' | 'tv_diff' | 'trades' | 'python_lib';

interface TopNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onExportCsv: () => void;
  onDownloadPython: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedCandleIndex: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  onExportCsv,
  onDownloadPython,
  sidebarOpen,
  setSidebarOpen,
  selectedCandleIndex,
}) => {
  return (
    <header className="flex items-center justify-between px-5 py-3 bg-[#0b0f17] border-b border-[#1e293b] select-none shrink-0 z-30">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(prev => !prev)}
          className={`p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#1e293b] transition-colors ${
            sidebarOpen ? 'bg-[#1e293b] text-sky-400' : ''
          }`}
          title="Toggle Parameters Panel"
        >
          <Sliders className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight text-slate-100">
            QUANT STUDIO
          </span>
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">
            HA + Chandelier Exit Engine
          </span>
        </div>
      </div>

      {/* Zone 2: Navigation tabs */}
      <nav className="flex items-center gap-1 sm:gap-2">
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
          <span>TradingView Diff & Fix</span>
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
          onClick={() => setActiveTab('python_lib')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'python_lib'
              ? 'bg-[#1e293b] text-emerald-400 font-semibold shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#131d2e]'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Python Library (.py)</span>
        </button>
      </nav>

      {/* Zone 3: Primary actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onExportCsv}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#131d2e] hover:bg-[#1e293b] border border-[#27354a] rounded-lg transition-colors whitespace-nowrap"
          title="Export Computed Candles & Signals to CSV"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Data</span>
        </button>
        <button
          onClick={onDownloadPython}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap"
          title="Download Standalone trading_ha_chandelier.py"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Get .py Library</span>
        </button>
      </div>
    </header>
  );
};
