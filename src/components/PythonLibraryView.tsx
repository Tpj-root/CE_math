import React, { useState } from 'react';
import { Download, Copy, Check, Terminal, Code2, Play, BookOpen, ShieldCheck, Sparkles, Activity, Clock, Zap } from 'lucide-react';
import {
  FULL_PYTHON_SCRIPT,
  FULL_TEST_SUITE_SCRIPT,
  FULL_MT5_TRADING_SCRIPT,
  FULL_MT5_LIVE_TRADER_SCRIPT,
  FULL_POSITION_UPDATE_SCRIPT,
} from '../utils/fullPythonScript';

interface PythonLibraryViewProps {
  onDownloadPython: () => void;
}

type FileKey = 'mt5_trading' | 'mt5_live' | 'position_update' | 'engine' | 'testing';

export const PythonLibraryView: React.FC<PythonLibraryViewProps> = ({
  onDownloadPython,
}) => {
  const [activeFile, setActiveFile] = useState<FileKey>('mt5_trading');
  const [copied, setCopied] = useState(false);

  const fileMap: Record<FileKey, { name: string; code: string; desc: string; icon: any }> = {
    mt5_trading: {
      name: 'mt5_trading.py',
      code: FULL_MT5_TRADING_SCRIPT,
      desc: 'MT5 Online Library: check_autotrading(), buy(), sell(), trailing_stoploss(), partial_close(), and volume sizing.',
      icon: Zap,
    },
    position_update: {
      name: 'position_update.py',
      code: FULL_POSITION_UPDATE_SCRIPT,
      desc: '5-Minute Position Updater: Periodically ratchets open position stoploss forward to Chandelier Exit trailing levels.',
      icon: Clock,
    },
    mt5_live: {
      name: 'mt5_live_trader.py',
      code: FULL_MT5_LIVE_TRADER_SCRIPT,
      desc: 'Live Automated MT5 Trader with Browser GUI: Tick ➔ Candle ➔ Heikin-Ashi ➔ Extremums ➔ Chandelier Trailing Stop.',
      icon: Activity,
    },
    engine: {
      name: 'trading_ha_chandelier.py',
      code: FULL_PYTHON_SCRIPT,
      desc: 'Core Quant Pipeline: All 4 Extremum formulas, Wilder RMA ATR, Pine Script calibration, and order simulator.',
      icon: Code2,
    },
    testing: {
      name: 'test_suite.py',
      code: FULL_TEST_SUITE_SCRIPT,
      desc: 'Three-Tier Testing Suite: Unit Tests (UT-01..15), Integration Tests, System Tests, and CSV Output Generator.',
      icon: ShieldCheck,
    },
  };

  const current = fileMap[activeFile];

  const handleCopy = () => {
    navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([current.code], { type: 'text/x-python;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = current.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] overflow-y-auto p-6 space-y-6 text-slate-300 text-xs select-none">
      {/* Header Info */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              Production Python Suite:
              <span className="font-mono text-cyan-300">{current.name}</span>
            </h2>
          </div>
          <p className="text-slate-400 text-xs">{current.desc}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#131d2e] hover:bg-[#1c2a3f] border border-[#273852] rounded-lg text-slate-200 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Download {current.name}</span>
          </button>
        </div>
      </div>

      {/* File Switcher Tabs */}
      <div className="flex items-center bg-[#070b12] border border-[#1e293b] rounded-xl p-1.5 overflow-x-auto gap-1">
        {(Object.keys(fileMap) as FileKey[]).map(key => {
          const item = fileMap[key];
          const Icon = item.icon;
          const isActive = activeFile === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFile(key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400/60 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#131d2e]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-sky-300' : 'text-slate-400'}`} />
              <span>{item.name}</span>
            </button>
          );
        })}
      </div>

      {/* Terminal Command Quickstart Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>1. Launch MT5 Live Trader Bot &amp; GUI</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Streams live MT5 ticks, executes buy/sell deals, and serves local web GUI:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-sky-300">
            python3 mt5_live_trader.py --gui --symbol XAUUSD
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
            <Clock className="w-4 h-4 text-sky-400" />
            <span>2. 5-Minute Position Trailing SL Updater</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Continuously ratchets open position stop losses to Chandelier Exit levels:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-cyan-300">
            python3 position_update.py --interval 300 --symbol XAUUSD
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>3. Three-Tier Software Testing Suite</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Runs 21 Unit, Integration, and System Tests on CSV and generates audit report:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-emerald-300">
            python3 test_suite.py --report
          </div>
        </div>
      </div>

      {/* Code Viewer */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex flex-col flex-1">
        <div className="p-3 bg-[#111927] border-b border-[#1e293b] flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200">{current.name}</span>
            <span>({current.code.split('\n').length} lines, fully typed &amp; tested)</span>
          </div>
          <span className="text-emerald-400">Python 3.8+ / MetaTrader 5 Ready</span>
        </div>
        <div className="p-4 overflow-x-auto flex-1 font-mono text-[11px] text-slate-300 leading-relaxed max-h-[600px] overflow-y-auto bg-[#070b12]">
          <pre className="select-text">{current.code}</pre>
        </div>
      </div>
    </div>
  );
};
