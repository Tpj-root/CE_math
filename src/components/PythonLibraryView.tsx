import React, { useState } from 'react';
import { Download, Copy, Check, Terminal, Code2, Play, BookOpen } from 'lucide-react';
import { FULL_PYTHON_SCRIPT } from '../utils/fullPythonScript';

interface PythonLibraryViewProps {
  onDownloadPython: () => void;
}

export const PythonLibraryView: React.FC<PythonLibraryViewProps> = ({
  onDownloadPython,
}) => {
  const [copied, setCopied] = useState(false);
  const pythonCode = FULL_PYTHON_SCRIPT;

  const handleCopy = () => {
    navigator.clipboard.writeText(pythonCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] overflow-y-auto p-6 space-y-6 text-slate-300 text-xs select-none">
      {/* Header Info */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">
              One Unified Python Library: <code>trading_ha_chandelier.py</code>
            </h2>
          </div>
          <p className="text-slate-400 text-xs">
            Complete standalone Python library with all functions, corrected Pine Script ratchet logic, separated matplotlib multi-pane plotting, and embedded local HTML GUI server.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#131d2e] hover:bg-[#1c2a3f] border border-[#273852] rounded-lg text-slate-200 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>

          <button
            onClick={onDownloadPython}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download .py File</span>
          </button>
        </div>
      </div>

      {/* Terminal Command Quickstart Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
            <Terminal className="w-4 h-4" />
            <span>CLI Backtest with Custom Timeframes</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Run multi-timeframe pipeline from terminal:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-sky-300">
            python3 trading_ha_chandelier.py --csv frxXAUUSD_1790274600.csv --tf 60 300
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
            <Play className="w-4 h-4" />
            <span>Launch Local Offline HTML GUI</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Zero dependencies, launches instant browser GUI:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-emerald-300">
            python3 trading_ha_chandelier.py --gui
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs">
            <BookOpen className="w-4 h-4" />
            <span>Import as a Clean Python Module</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Import individual functions in your own bots:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-purple-300">
            from trading_ha_chandelier import *
          </div>
        </div>
      </div>

      {/* Code Viewer */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex flex-col flex-1">
        <div className="p-3 bg-[#111927] border-b border-[#1e293b] flex items-center justify-between text-xs font-mono text-slate-400">
          <span>trading_ha_chandelier.py (500+ lines, fully typed &amp; documented)</span>
          <span className="text-emerald-400">Python 3.8+ / NumPy / Pandas / Matplotlib</span>
        </div>
        <div className="p-4 overflow-x-auto flex-1 font-mono text-[11px] text-slate-300 leading-relaxed max-h-[600px] overflow-y-auto bg-[#070b12]">
          <pre>{pythonCode}</pre>
        </div>
      </div>
    </div>
  );
};
