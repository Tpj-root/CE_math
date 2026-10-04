import React, { useState } from 'react';
import { Download, Copy, Check, Terminal, Code2, Play, BookOpen, ShieldCheck, Sparkles, Activity } from 'lucide-react';
import { FULL_PYTHON_SCRIPT, FULL_TEST_SUITE_SCRIPT } from '../utils/fullPythonScript';

interface PythonLibraryViewProps {
  onDownloadPython: () => void;
}

export const PythonLibraryView: React.FC<PythonLibraryViewProps> = ({
  onDownloadPython,
}) => {
  const [activeFile, setActiveFile] = useState<'engine' | 'testing'>('engine');
  const [copied, setCopied] = useState(false);

  const activeCode = activeFile === 'engine' ? FULL_PYTHON_SCRIPT : FULL_TEST_SUITE_SCRIPT;
  const activeFileName = activeFile === 'engine' ? 'trading_ha_chandelier.py' : 'test_suite.py';

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (activeFile === 'engine') {
      onDownloadPython();
    } else {
      const blob = new Blob([FULL_TEST_SUITE_SCRIPT], { type: 'text/x-python;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'test_suite.py';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
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
              <span className="font-mono text-cyan-300">{activeFileName}</span>
            </h2>
          </div>
          <p className="text-slate-400 text-xs">
            {activeFile === 'engine'
              ? 'Complete quantitative engine with 4 Extremum formulas, Pine Script ratchet corrections, 6-panel GUI server, and zero-lookahead order simulator.'
              : 'Production Three-Tier Software Testing Library: Unit Tests, Integration Tests, System Tests, CSV Function Output Generator, and Audit Reports.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* File Switcher */}
          <div className="flex items-center bg-[#131d2e] border border-[#273852] rounded-lg p-1 text-xs font-mono">
            <button
              onClick={() => setActiveFile('engine')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                activeFile === 'engine'
                  ? 'bg-emerald-400 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>trading_ha_chandelier.py</span>
            </button>
            <button
              onClick={() => setActiveFile('testing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                activeFile === 'testing'
                  ? 'bg-cyan-400 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>test_suite.py (Testing Library)</span>
            </button>
          </div>

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
            <span>Download {activeFileName}</span>
          </button>
        </div>
      </div>

      {/* Terminal Command Quickstart Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
            <Terminal className="w-4 h-4" />
            <span>1. Run Three-Tier Software Testing</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Executes Unit Tests, Integration Tests, and System Tests on your CSV:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-sky-300">
            python3 test_suite.py --csv frxXAUUSD_1790274600.csv --report
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
            <Sparkles className="w-4 h-4" />
            <span>2. Generate Discrete Function Outputs</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Generates 7 discrete JSON output files for each pipeline function:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-cyan-300">
            python3 test_suite.py --generate-output
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
            <Activity className="w-4 h-4" />
            <span>3. Save Golden Baseline &amp; Regression</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Audit future code changes against golden mathematical baseline:
          </p>
          <div className="p-2.5 bg-[#090d14] rounded-lg border border-[#1e293b] font-mono text-[11px] text-emerald-300 space-y-1">
            <div>python3 test_suite.py --baseline save</div>
            <div>python3 test_suite.py --baseline compare</div>
          </div>
        </div>
      </div>

      {/* Code Viewer */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm flex flex-col flex-1">
        <div className="p-3 bg-[#111927] border-b border-[#1e293b] flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200">{activeFileName}</span>
            <span>({activeCode.split('\n').length} lines, fully typed &amp; tested)</span>
          </div>
          <span className="text-emerald-400">Python 3.8+ / Zero Mandatory Dependencies</span>
        </div>
        <div className="p-4 overflow-x-auto flex-1 font-mono text-[11px] text-slate-300 leading-relaxed max-h-[600px] overflow-y-auto bg-[#070b12]">
          <pre className="select-text">{activeCode}</pre>
        </div>
      </div>
    </div>
  );
};
