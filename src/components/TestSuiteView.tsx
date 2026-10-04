/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Copy,
  Check,
  Search,
  RefreshCw,
  FileCode,
  ShieldCheck,
  Cpu,
  Layers,
  Activity,
  ChevronDown,
  ChevronRight,
  Database,
  Terminal,
  Upload,
  Sliders,
  Table,
  Code2,
  GitCompare,
  FileSpreadsheet,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Filter,
} from 'lucide-react';
import {
  ALL_TESTS,
  UNIT_TESTS,
  INTEGRATION_TESTS,
  SYSTEM_TESTS,
  generateTestReport,
  generateFunctionOutput,
} from '../utils/testingEngine';
import {
  TestResult,
  TestSuiteSummary,
  TestTier,
  TestCase,
  TargetFunctionName,
  FunctionOutputResult,
  RegressionBaseline,
} from '../types/testing';
import { Tick, StrategyConfig } from '../types/trading';

interface TestSuiteViewProps {
  ticks: Tick[];
  datasetName: string;
  config: StrategyConfig;
  setConfig?: React.Dispatch<React.SetStateAction<StrategyConfig>>;
  onFileUpload?: (file: File) => void;
  onCustomCsvSubmit?: (csvText: string) => void;
}

export const TestSuiteView: React.FC<TestSuiteViewProps> = ({
  ticks,
  datasetName,
  config,
  setConfig,
  onFileUpload,
  onCustomCsvSubmit,
}) => {
  // Navigation inside Testing Suite
  const [activeMainTab, setActiveMainTab] = useState<'suite' | 'generator' | 'report'>('suite');

  // Three-Tier Test Runner State
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTierFilter, setActiveTierFilter] = useState<TestTier | 'all' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedTests, setExpandedTests] = useState<Record<string, boolean>>({});

  // Function Output Generator State
  const [selectedFunction, setSelectedFunction] = useState<TargetFunctionName>('all_pipeline');
  const [customCsvText, setCustomCsvText] = useState<string>('');
  const [generatedOutput, setGeneratedOutput] = useState<FunctionOutputResult | null>(null);
  const [activeOutputTab, setActiveOutputTab] = useState<'table' | 'json' | 'invariants'>('table');
  const [searchTableQuery, setSearchTableQuery] = useState<string>('');
  const [tablePage, setTablePage] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Future Regression Baseline State
  const [baseline, setBaseline] = useState<RegressionBaseline | null>(() => {
    try {
      const saved = localStorage.getItem('quant_test_baseline');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [regressionDiff, setRegressionDiff] = useState<string | null>(null);

  // Report & Clipboard State
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // Run a single test case
  const runSingleTest = async (test: TestCase): Promise<TestResult> => {
    const res = await test.run({
      customTicks: ticks,
      datasetName,
      customCsvText: customCsvText || undefined,
    });
    return res;
  };

  // Run all tests or specific subset
  const runTests = async (testsToRun: TestCase[] = ALL_TESTS) => {
    setIsRunning(true);
    const newResults = { ...results };

    for (const t of testsToRun) {
      try {
        const res = await runSingleTest(t);
        newResults[t.id] = res;
        setResults({ ...newResults });
      } catch (err: any) {
        newResults[t.id] = {
          id: t.id,
          tier: t.tier,
          functionName: t.functionName,
          name: t.name,
          description: t.description,
          status: 'failed',
          durationMs: 0,
          assertions: [
            {
              description: 'Test execution threw unexpected exception',
              passed: false,
              message: err?.message || String(err),
            },
          ],
          error: err?.message || String(err),
        };
        setResults({ ...newResults });
      }
    }
    setIsRunning(false);
  };

  // Run tests automatically on first mount if empty
  useEffect(() => {
    if (Object.keys(results).length === 0) {
      runTests(ALL_TESTS);
    }
  }, []);

  // Compute test summary metrics
  const summary: TestSuiteSummary = useMemo(() => {
    const resultsList = Object.values(results);
    const total = ALL_TESTS.length;
    const passed = resultsList.filter(r => r.status === 'passed').length;
    const failed = resultsList.filter(r => r.status === 'failed').length;
    const duration = resultsList.reduce((acc, r) => acc + r.durationMs, 0);

    const getTierStats = (tier: TestTier) => {
      const tierTests = ALL_TESTS.filter(t => t.tier === tier);
      const tierResults = resultsList.filter(r => r.tier === tier);
      const p = tierResults.filter(r => r.status === 'passed').length;
      const f = tierResults.filter(r => r.status === 'failed').length;
      return { total: tierTests.length, passed: p, failed: f };
    };

    return {
      timestamp: new Date().toISOString(),
      totalTests: total,
      passed,
      failed,
      skipped: total - (passed + failed),
      durationMs: duration,
      passRate: total > 0 ? (passed / total) * 100 : 0,
      unitTests: getTierStats('unit'),
      integrationTests: getTierStats('integration'),
      systemTests: getTierStats('system'),
      testedCsvName: datasetName,
      testedTicksCount: ticks.length,
      testedCandlesCount: Math.floor(ticks.length / (config.timeframeSec || 60)),
    };
  }, [results, ticks.length, datasetName, config.timeframeSec]);

  // Generated reports
  const reports = useMemo(() => {
    const resultsList = ALL_TESTS.map(
      t =>
        results[t.id] || {
          id: t.id,
          tier: t.tier,
          functionName: t.functionName,
          name: t.name,
          description: t.description,
          status: 'idle',
          durationMs: 0,
          assertions: [],
        }
    );
    return generateTestReport(resultsList, summary);
  }, [results, summary]);

  // Filtered test items for test runner tab
  const filteredTests = useMemo(() => {
    return ALL_TESTS.filter(test => {
      const res = results[test.id];
      if (activeTierFilter === 'failed' && res?.status !== 'failed') return false;
      if (activeTierFilter !== 'all' && activeTierFilter !== 'failed' && test.tier !== activeTierFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = test.name.toLowerCase().includes(q);
        const matchesFunc = test.functionName.toLowerCase().includes(q);
        const matchesId = test.id.toLowerCase().includes(q);
        const matchesDesc = test.description.toLowerCase().includes(q);
        return matchesName || matchesFunc || matchesId || matchesDesc;
      }
      return true;
    });
  }, [activeTierFilter, searchQuery, results]);

  const toggleExpand = (id: string) => {
    setExpandedTests(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Generate output for the selected function
  const handleGenerateFunctionOutput = () => {
    const res = generateFunctionOutput(
      selectedFunction,
      ticks,
      config,
      datasetName,
      customCsvText || undefined
    );
    setGeneratedOutput(res);
    setTablePage(1);

    // If regression baseline exists for this function, evaluate diff
    if (baseline && baseline.functionName === selectedFunction) {
      const countMatch = baseline.itemCount === res.outputSummary.itemCount;
      const metricsDiff: string[] = [];

      if (!countMatch) {
        metricsDiff.push(
          `Record Count Deviation: Baseline had ${baseline.itemCount} items, generated output has ${res.outputSummary.itemCount} items.`
        );
      }

      if (baseline.summaryMetrics && res.outputSummary.metricsSummary) {
        for (const [k, v] of Object.entries(res.outputSummary.metricsSummary)) {
          if (baseline.summaryMetrics[k] !== undefined && baseline.summaryMetrics[k] !== v) {
            metricsDiff.push(`Metric Changed '${k}': Baseline = ${baseline.summaryMetrics[k]} ➔ Generated = ${v}`);
          }
        }
      }

      if (metricsDiff.length === 0) {
        setRegressionDiff('✓ PERFECT MATCH: Current function output is 100% mathematically consistent with baseline!');
      } else {
        setRegressionDiff(`⚠️ REGRESSION DETECTED:\n${metricsDiff.join('\n')}`);
      }
    } else {
      setRegressionDiff(null);
    }
  };

  // Save current output as regression baseline
  const handleSaveAsBaseline = () => {
    if (!generatedOutput) return;
    const base: RegressionBaseline = {
      timestamp: new Date().toISOString(),
      functionName: generatedOutput.functionName,
      datasetName: generatedOutput.datasetName,
      itemCount: generatedOutput.outputSummary.itemCount,
      firstItemHash: generatedOutput.tableRows[0] ? JSON.stringify(generatedOutput.tableRows[0]) : '',
      summaryMetrics: generatedOutput.outputSummary.metricsSummary || {},
      jsonSnapshot: generatedOutput.jsonSnapshot.slice(0, 1000),
    };
    setBaseline(base);
    try {
      localStorage.setItem('quant_test_baseline', JSON.stringify(base));
    } catch {}
    setRegressionDiff('✓ Baseline saved successfully! Any future changes to this function will be audited against this golden snapshot.');
  };

  // Clear baseline
  const handleClearBaseline = () => {
    setBaseline(null);
    setRegressionDiff(null);
    try {
      localStorage.removeItem('quant_test_baseline');
    } catch {}
  };

  // Generate output automatically on first switch to generator
  useEffect(() => {
    if (activeMainTab === 'generator' && !generatedOutput) {
      handleGenerateFunctionOutput();
    }
  }, [activeMainTab]);

  // Handle local CSV upload inside test suite
  const handleLocalCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        const text = ev.target?.result as string;
        if (text) {
          setCustomCsvText(text);
          if (onFileUpload) {
            onFileUpload(file);
          }
          if (onCustomCsvSubmit) {
            onCustomCsvSubmit(text);
          }
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDownload = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(reports.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyJson = () => {
    if (!generatedOutput) return;
    navigator.clipboard.writeText(generatedOutput.jsonSnapshot);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Filtered rows for data table
  const filteredTableRows = useMemo(() => {
    if (!generatedOutput) return [];
    if (!searchTableQuery.trim()) return generatedOutput.tableRows;
    const q = searchTableQuery.toLowerCase();
    return generatedOutput.tableRows.filter(row =>
      row.some(cell => String(cell).toLowerCase().includes(q))
    );
  }, [generatedOutput, searchTableQuery]);

  const pageSize = 15;
  const totalPages = Math.ceil(filteredTableRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return filteredTableRows.slice(start, start + pageSize);
  }, [filteredTableRows, tablePage]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] text-slate-100 overflow-y-auto select-none p-5 space-y-5">
      {/* Top Banner & Header */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
                  SOFTWARE TESTING & AUDIT SUITE
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Production Tier
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Three-Tier Verification Architecture: Unit Tests ➔ Integration Tests ➔ System Tests
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-[#131d2e] border border-[#27354a] rounded-lg p-1 text-xs font-mono">
              <button
                onClick={() => setActiveMainTab('suite')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                  activeMainTab === 'suite'
                    ? 'bg-sky-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Test Runner</span>
              </button>

              <button
                onClick={() => setActiveMainTab('generator')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                  activeMainTab === 'generator'
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Function Output</span>
              </button>

              <button
                onClick={() => setActiveMainTab('report')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
                  activeMainTab === 'report'
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Audit Report</span>
              </button>
            </div>

            {activeMainTab === 'suite' && (
              <button
                onClick={() => runTests(ALL_TESTS)}
                disabled={isRunning}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs transition-all shadow-sm ${
                  isRunning
                    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold cursor-pointer'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                <span>{isRunning ? 'Running Test Suite...' : '▶ Run All Tests'}</span>
              </button>
            )}
          </div>
        </div>

        {/* User's Software Testing Architecture Diagram */}
        <div className="bg-[#0b101b] border border-[#1b2537] rounded-xl p-4 space-y-3 font-mono">
          <div className="text-[11px] text-slate-400 flex items-center justify-between border-b border-[#1b2537] pb-2 flex-wrap gap-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              SOFTWARE TESTING ARCHITECTURE HIERARCHY
            </span>
            <span className="text-[10px] text-slate-500">
              Active Dataset: <strong className="text-slate-300">{datasetName}</strong> ({ticks.length} ticks)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* TIER 1: UNIT TEST */}
            <div
              onClick={() => {
                setActiveMainTab('suite');
                setActiveTierFilter('unit');
              }}
              className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                activeTierFilter === 'unit' && activeMainTab === 'suite'
                  ? 'bg-sky-950/40 border-sky-400 ring-1 ring-sky-400 shadow-md'
                  : 'bg-[#101827] border-[#1e2a3e] hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                  TIER 1 &bull; UNIT TEST
                </span>
                <span className="text-slate-400 text-[11px]">
                  {summary.unitTests.passed} / {summary.unitTests.total} Passed
                </span>
              </div>
              <div className="font-bold text-slate-100 text-sm mb-1">One Function In Isolation</div>
              <p className="text-[11px] text-slate-400 font-sans mb-3">
                Validates individual equations: CSV parser, OHLC bucketing, Pine Script seed, Wilder RMA, Extremums Noise Filter, and ratchets.
              </p>
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-[#1b2537]">
                <span>Target: <code>all the function()</code></span>
                <span className={summary.unitTests.failed === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {summary.unitTests.failed === 0 ? '✓ 100% OK' : `${summary.unitTests.failed} Failed`}
                </span>
              </div>
            </div>

            {/* TIER 2: INTEGRATION TEST */}
            <div
              onClick={() => {
                setActiveMainTab('suite');
                setActiveTierFilter('integration');
              }}
              className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                activeTierFilter === 'integration' && activeMainTab === 'suite'
                  ? 'bg-indigo-950/40 border-indigo-400 ring-1 ring-indigo-400 shadow-md'
                  : 'bg-[#101827] border-[#1e2a3e] hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                  TIER 2 &bull; INTEGRATION TEST
                </span>
                <span className="text-slate-400 text-[11px]">
                  {summary.integrationTests.passed} / {summary.integrationTests.total} Passed
                </span>
              </div>
              <div className="font-bold text-slate-100 text-sm mb-1">Several Modules Pipeline</div>
              <p className="text-[11px] text-slate-400 font-sans mb-3">
                Connects readers, Heikin-Ashi converters, 4 Extremum formulas, ATR bands, signal generators, and execution brokers together.
              </p>
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-[#1b2537]">
                <span>Target: <code>reader + writer + pipeline</code></span>
                <span className={summary.integrationTests.failed === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {summary.integrationTests.failed === 0 ? '✓ 100% OK' : `${summary.integrationTests.failed} Failed`}
                </span>
              </div>
            </div>

            {/* TIER 3: SYSTEM TEST */}
            <div
              onClick={() => {
                setActiveMainTab('suite');
                setActiveTierFilter('system');
              }}
              className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                activeTierFilter === 'system' && activeMainTab === 'suite'
                  ? 'bg-emerald-950/40 border-emerald-400 ring-1 ring-emerald-400 shadow-md'
                  : 'bg-[#101827] border-[#1e2a3e] hover:border-slate-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  TIER 3 &bull; SYSTEM TEST
                </span>
                <span className="text-slate-400 text-[11px]">
                  {summary.systemTests.passed} / {summary.systemTests.total} Passed
                </span>
              </div>
              <div className="font-bold text-slate-100 text-sm mb-1">Whole Program / Complete App</div>
              <p className="text-[11px] text-slate-400 font-sans mb-3">
                Full end-to-end backtest verification on real tick files, zero-lookahead bias audit, noise reduction benchmark, and invariant checks.
              </p>
              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-[#1b2537]">
                <span>Target: <code>Complete app &amp; engine</code></span>
                <span className={summary.systemTests.failed === 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {summary.systemTests.failed === 0 ? '✓ 100% OK' : `${summary.systemTests.failed} Failed`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: THREE-TIER TEST RUNNER                                         */}
      {/* ===================================================================== */}
      {activeMainTab === 'suite' && (
        <div className="space-y-5">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 font-mono">
            <div className="p-3 bg-[#0f172a] border border-[#1e293b] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Total Tests</span>
                <span className="text-xl font-bold text-slate-100">{summary.totalTests}</span>
              </div>
              <Cpu className="w-6 h-6 text-sky-400/50" />
            </div>

            <div className="p-3 bg-[#0f172a] border border-[#1e293b] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Passed Tests</span>
                <span className="text-xl font-bold text-emerald-400">{summary.passed}</span>
              </div>
              <CheckCircle2 className="w-6 h-6 text-emerald-400/50" />
            </div>

            <div className="p-3 bg-[#0f172a] border border-[#1e293b] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Failed Tests</span>
                <span className={`text-xl font-bold ${summary.failed === 0 ? 'text-slate-400' : 'text-rose-400'}`}>
                  {summary.failed}
                </span>
              </div>
              <XCircle className={`w-6 h-6 ${summary.failed === 0 ? 'text-slate-600' : 'text-rose-400'}`} />
            </div>

            <div className="p-3 bg-[#0f172a] border border-[#1e293b] rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Pass Rate</span>
                <span className="text-xl font-bold text-cyan-400">{summary.passRate.toFixed(1)}%</span>
              </div>
              <ShieldCheck className="w-6 h-6 text-cyan-400/50" />
            </div>

            <div className="p-3 bg-[#0f172a] border border-[#1e293b] rounded-xl flex items-center justify-between col-span-2 sm:col-span-1">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase">Duration</span>
                <span className="text-xl font-bold text-amber-400">{summary.durationMs.toFixed(1)} ms</span>
              </div>
              <Clock className="w-6 h-6 text-amber-400/50" />
            </div>
          </div>

          {/* Filter Toolbar & Test List */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-mono">
                <button
                  onClick={() => setActiveTierFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeTierFilter === 'all'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-[#131d2e] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Tests ({ALL_TESTS.length})
                </button>
                <button
                  onClick={() => setActiveTierFilter('unit')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeTierFilter === 'unit'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-[#131d2e] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Unit Tests ({UNIT_TESTS.length})
                </button>
                <button
                  onClick={() => setActiveTierFilter('integration')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeTierFilter === 'integration'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-[#131d2e] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Integration Tests ({INTEGRATION_TESTS.length})
                </button>
                <button
                  onClick={() => setActiveTierFilter('system')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeTierFilter === 'system'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-[#131d2e] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  System Tests ({SYSTEM_TESTS.length})
                </button>
                {summary.failed > 0 && (
                  <button
                    onClick={() => setActiveTierFilter('failed')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      activeTierFilter === 'failed'
                        ? 'bg-rose-500 text-white font-bold'
                        : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                    }`}
                  >
                    Failed Only ({summary.failed})
                  </button>
                )}
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search test or function..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#131d2e] border border-[#27354a] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-sky-400 font-mono"
                />
              </div>
            </div>

            {/* Tests List */}
            <div className="divide-y divide-[#1e293b]">
              {filteredTests.map(test => {
                const res = results[test.id];
                const isExpanded = Boolean(expandedTests[test.id]);
                const isPassed = res?.status === 'passed';
                const isFailed = res?.status === 'failed';
                const passedAssertions = res?.assertions.filter(a => a.passed).length || 0;
                const totalAssertions = res?.assertions.length || 0;

                return (
                  <div key={test.id} className="transition-colors hover:bg-[#131d2e]/50">
                    <div
                      onClick={() => toggleExpand(test.id)}
                      className="p-4 flex items-center justify-between cursor-pointer gap-4 flex-wrap select-none"
                    >
                      <div className="flex items-center gap-3">
                        <button className="text-slate-500 hover:text-slate-300">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {test.id}
                          </span>
                          <span
                            className={`text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded ${
                              test.tier === 'unit'
                                ? 'bg-sky-950 text-sky-400 border border-sky-800'
                                : test.tier === 'integration'
                                ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                                : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            }`}
                          >
                            {test.tier}
                          </span>
                          <span className="font-semibold text-sm text-slate-200">{test.name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono">
                        <span className="text-slate-400">
                          Target: <code className="text-cyan-300">{test.functionName}</code>
                        </span>

                        {res && (
                          <>
                            <span className="text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              {res.durationMs.toFixed(1)}ms
                            </span>
                            <span className="text-slate-400">
                              {passedAssertions}/{totalAssertions} assertions
                            </span>
                          </>
                        )}

                        <div className="flex items-center gap-2">
                          {isPassed && (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              PASSED
                            </span>
                          )}
                          {isFailed && (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold text-xs">
                              <XCircle className="w-3.5 h-3.5" />
                              FAILED
                            </span>
                          )}
                          {!res && (
                            <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 text-xs">
                              IDLE
                            </span>
                          )}

                          <button
                            onClick={e => {
                              e.stopPropagation();
                              runTests([test]);
                            }}
                            className="p-1 rounded hover:bg-[#1e293b] text-slate-400 hover:text-sky-400"
                            title="Re-run this test"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-6 pb-4 pt-1 bg-[#0b101b] border-t border-[#1e293b] space-y-3 font-mono text-xs">
                        <p className="text-slate-400 font-sans text-xs">{test.description}</p>

                        {res && res.assertions.length > 0 && (
                          <div className="space-y-1.5 bg-[#101827] p-3 rounded-lg border border-[#1e293b]">
                            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">
                              Assertions Executed ({passedAssertions}/{totalAssertions} passed):
                            </span>
                            {res.assertions.map((a, idx) => (
                              <div
                                key={idx}
                                className={`flex items-start gap-2 p-1 rounded ${
                                  a.passed ? 'text-slate-300' : 'bg-rose-950/30 text-rose-200 font-semibold'
                                }`}
                              >
                                {a.passed ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                                )}
                                <span className="leading-snug">{a.description}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {res?.error && (
                          <div className="p-3 bg-rose-950/40 border border-rose-500/50 rounded-lg text-rose-200">
                            <strong className="block text-[11px] uppercase">Error Details:</strong>
                            <span className="font-mono text-xs">{res.error}</span>
                          </div>
                        )}

                        {res?.inputSnapshot && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-500 block uppercase">Input Sample:</span>
                            <pre className="p-2 bg-[#070b12] rounded border border-[#1b2537] text-slate-400 overflow-x-auto text-[11px] max-h-32">
                              {res.inputSnapshot}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: FUNCTION OUTPUT GENERATOR & SANDBOX                             */}
      {/* ===================================================================== */}
      {activeMainTab === 'generator' && (
        <div className="space-y-5">
          {/* Controls & Upload Strip */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 space-y-4 font-mono text-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1e293b] pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  DYNAMIC FUNCTION OUTPUT GENERATOR &amp; INVARIANT AUDIT
                </h2>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  Execute any function on your uploaded CSV, audit invariants, inspect results, and save golden baselines for future regression testing.
                </p>
              </div>

              {/* Function Selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-400 text-xs">Target Function:</span>
                <select
                  value={selectedFunction}
                  onChange={e => setSelectedFunction(e.target.value as TargetFunctionName)}
                  className="bg-[#131d2e] border border-[#27354a] rounded-lg px-3 py-1.5 text-xs text-cyan-300 font-bold focus:outline-hidden focus:border-cyan-400 cursor-pointer"
                >
                  <option value="all_pipeline">⚡ All Functions Sequential Pipeline (Full Bundle)</option>
                  <option value="parseCsvTicks">1. parseCsvTicks (Reader Module)</option>
                  <option value="ticksToCandles">2. ticksToCandles (OHLC Timeframe Buckets)</option>
                  <option value="toHeikinAshi">3. toHeikinAshi (Pine Script Transformation)</option>
                  <option value="computeExtremums">4. computeExtremums (Extremums &amp; Noise Filter)</option>
                  <option value="computeChandelierExit">5. computeChandelierExit (Bands &amp; Ratchets)</option>
                  <option value="simulateTrades">6. simulateTrades (Execution &amp; Equity)</option>
                  <option value="computeNoiseReductionAnalytics">7. computeNoiseReductionAnalytics (Wick Metrics)</option>
                </select>

                <button
                  onClick={handleGenerateFunctionOutput}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all cursor-pointer shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Generate Output</span>
                </button>
              </div>
            </div>

            {/* CSV File Upload & Parameter Sandbox */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Box 1: CSV Upload */}
              <div className="p-3.5 bg-[#0b101b] border border-[#1b2537] rounded-lg space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    Upload Your CSV File
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">times,prices</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleLocalCsvUpload}
                    accept=".csv,.txt"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-[#131d2e] hover:bg-[#1c293d] border border-[#27354a] text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Choose CSV File...</span>
                  </button>
                </div>
                <div className="text-[10px] text-slate-500">
                  Current Data: <strong className="text-slate-300">{datasetName}</strong> ({ticks.length} ticks)
                </div>
              </div>

              {/* Box 2: Timeframe & Lookback Tuning */}
              <div className="p-3.5 bg-[#0b101b] border border-[#1b2537] rounded-lg space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    Parameter Sandbox
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Active in computation</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Timeframe (sec)</label>
                    <select
                      value={config.timeframeSec}
                      onChange={e => setConfig && setConfig(prev => ({ ...prev, timeframeSec: Number(e.target.value) }))}
                      className="w-full bg-[#131d2e] border border-[#27354a] rounded px-2 py-1 text-slate-200"
                    >
                      <option value={10}>10s</option>
                      <option value={30}>30s</option>
                      <option value={60}>60s (1m)</option>
                      <option value={300}>300s (5m)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">ATR Period / Lookback</label>
                    <input
                      type="number"
                      min={2}
                      max={100}
                      value={config.atrPeriod}
                      onChange={e => setConfig && setConfig(prev => ({ ...prev, atrPeriod: Number(e.target.value) || 22 }))}
                      className="w-full bg-[#131d2e] border border-[#27354a] rounded px-2 py-1 text-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Box 3: Noise Reduction Toggle (Formula 1 Close Price) */}
              <div className="p-3.5 bg-[#0b101b] border border-[#1b2537] rounded-lg space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-emerald-400" />
                    Extremums Noise Filter
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${config.useCloseForExtremums ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'}`}>
                    {config.useCloseForExtremums ? 'CLOSE ON' : 'WICKS OFF'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig && setConfig(prev => ({ ...prev, useCloseForExtremums: !prev.useCloseForExtremums }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer transition-all ${
                      config.useCloseForExtremums
                        ? 'bg-cyan-950/60 border-cyan-400 text-cyan-200'
                        : 'bg-[#131d2e] border-[#27354a] text-slate-400'
                    }`}
                  >
                    <span>Use Close Price for Extremums:</span>
                    <strong className="text-white">{config.useCloseForExtremums ? 'ON' : 'OFF'}</strong>
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 leading-tight font-sans">
                  {config.useCloseForExtremums
                    ? 'Highest = max(Close), Lowest = min(Close) — Wicks completely ignored for noise reduction.'
                    : 'Highest = max(High), Lowest = min(Low) — Wicks included.'}
                </div>
              </div>
            </div>

            {/* Regression Baseline Box */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#111928] border border-[#1e2b40] rounded-lg">
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <span className="font-bold text-slate-200 text-xs">Future Regression Testing Sandbox:</span>
                  <span className="text-[11px] text-slate-400 ml-2 font-sans">
                    {baseline
                      ? `Saved baseline active for '${baseline.functionName}' (${baseline.itemCount} items from ${new Date(baseline.timestamp).toLocaleTimeString()})`
                      : 'No baseline saved. Generate output and click "Save As Baseline" below.'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSaveAsBaseline}
                  disabled={!generatedOutput}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs cursor-pointer transition-colors"
                >
                  <Check className="w-3 h-3" />
                  <span>Save As Baseline</span>
                </button>
                {baseline && (
                  <button
                    onClick={handleClearBaseline}
                    className="px-2 py-1.5 rounded text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Regression Notification if diff exists */}
            {regressionDiff && (
              <div
                className={`p-3 rounded-lg border text-xs whitespace-pre-line ${
                  regressionDiff.includes('PERFECT MATCH')
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : regressionDiff.includes('REGRESSION')
                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-200 font-bold'
                    : 'bg-sky-950/40 border-sky-500/50 text-sky-200'
                }`}
              >
                {regressionDiff}
              </div>
            )}
          </div>

          {/* Generated Function Output Display */}
          {generatedOutput && (
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm space-y-0">
              {/* Header */}
              <div className="p-4 border-b border-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#131d2e]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                      OUTPUT GENERATED
                    </span>
                    <h3 className="font-bold text-slate-100 text-sm font-mono">
                      {generatedOutput.functionDisplayName}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {generatedOutput.outputSummary.description} &bull; Execution Time:{' '}
                    <strong className="text-amber-300 font-mono">{generatedOutput.executionTimeMs} ms</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Export Buttons */}
                  {generatedOutput.csvExportText && (
                    <button
                      onClick={() =>
                        handleDownload(
                          generatedOutput.csvExportText || '',
                          `${generatedOutput.functionName}_output_${Date.now()}.csv`,
                          'text/csv'
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a2538] hover:bg-[#22314a] border border-slate-700 text-slate-300 transition-colors"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Download .csv</span>
                    </button>
                  )}

                  <button
                    onClick={() =>
                      handleDownload(
                        generatedOutput.jsonSnapshot,
                        `${generatedOutput.functionName}_output_${Date.now()}.json`,
                        'application/json'
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a2538] hover:bg-[#22314a] border border-slate-700 text-slate-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-400" />
                    <span>Download .json</span>
                  </button>

                  <button
                    onClick={handleCopyJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a2538] hover:bg-[#22314a] border border-slate-700 text-slate-300 transition-colors"
                  >
                    {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedJson ? 'Copied JSON!' : 'Copy JSON'}</span>
                  </button>
                </div>
              </div>

              {/* Invariant Health Checklist Strip */}
              <div className="p-4 bg-[#0b101b] border-b border-[#1e293b]">
                <div className="text-[11px] font-mono text-slate-400 mb-2 font-bold flex items-center justify-between">
                  <span>MATHEMATICAL INVARIANTS &amp; SANITY CHECKS:</span>
                  <span
                    className={`font-bold ${
                      generatedOutput.allInvariantsPassed ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {generatedOutput.allInvariantsPassed ? '✓ 100% INVARIANTS PASSED' : '⚠️ INVARIANT FAILURE DETECTED'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                  {generatedOutput.invariants.map((inv, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                        inv.passed
                          ? 'bg-[#101827] border-[#1e293b] text-slate-300'
                          : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                      }`}
                    >
                      {inv.passed ? (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <strong className="block text-slate-100">{inv.name}</strong>
                        <span className="text-[11px] text-slate-400 font-sans">{inv.details}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* View Switcher: Table vs JSON */}
              <div className="p-3 border-b border-[#1e293b] flex items-center justify-between flex-wrap gap-3 bg-[#0d1424]">
                <div className="flex items-center gap-1 text-xs font-mono">
                  <button
                    onClick={() => setActiveOutputTab('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-colors ${
                      activeOutputTab === 'table'
                        ? 'bg-sky-500 text-slate-950 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Formatted Data Table ({filteredTableRows.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveOutputTab('json')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-colors ${
                      activeOutputTab === 'json'
                        ? 'bg-sky-500 text-slate-950 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Raw JSON Snapshot</span>
                  </button>
                </div>

                {activeOutputTab === 'table' && (
                  <div className="relative min-w-[200px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter table rows..."
                      value={searchTableQuery}
                      onChange={e => {
                        setSearchTableQuery(e.target.value);
                        setTablePage(1);
                      }}
                      className="w-full bg-[#131d2e] border border-[#27354a] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-sky-400 font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Tab Content: Data Table */}
              {activeOutputTab === 'table' && (
                <div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs divide-y divide-[#1e293b]">
                      <thead className="bg-[#111928] text-slate-400 text-[11px] uppercase tracking-wider">
                        <tr>
                          {generatedOutput.tableColumns.map((col, idx) => (
                            <th key={idx} className="p-3 font-semibold whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e293b] text-slate-300">
                        {paginatedRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-[#131d2e]/50 transition-colors">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-3 whitespace-nowrap">
                                {String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="p-3 border-t border-[#1e293b] flex items-center justify-between text-xs font-mono text-slate-400 bg-[#0d1424]">
                    <span>
                      Showing {(tablePage - 1) * pageSize + 1} to{' '}
                      {Math.min(tablePage * pageSize, filteredTableRows.length)} of {filteredTableRows.length} rows
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setTablePage(p => Math.max(1, p - 1))}
                        disabled={tablePage === 1}
                        className="px-2.5 py-1 rounded bg-[#131d2e] disabled:opacity-50 hover:bg-[#1e293b] text-slate-300"
                      >
                        Previous
                      </button>
                      <span>
                        Page {tablePage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                        disabled={tablePage >= totalPages}
                        className="px-2.5 py-1 rounded bg-[#131d2e] disabled:opacity-50 hover:bg-[#1e293b] text-slate-300"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content: JSON Snapshot */}
              {activeOutputTab === 'json' && (
                <div className="p-4 bg-[#070b12] font-mono text-xs overflow-x-auto max-h-[600px] text-cyan-300">
                  <pre className="whitespace-pre select-text leading-relaxed">
                    {generatedOutput.jsonSnapshot}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: AUDIT REPORT GENERATOR & EXPORTER                              */}
      {/* ===================================================================== */}
      {activeMainTab === 'report' && (
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm space-y-0">
          {/* Header */}
          <div className="p-4 border-b border-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#131d2e]">
            <div className="flex items-center gap-2">
              <FileCode className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="font-bold text-slate-100 text-sm font-mono">
                  SOFTWARE TESTING AUDIT REPORT
                </h3>
                <p className="text-xs text-slate-400 font-sans">
                  Exportable production verification report covering all Unit, Integration, and System tiers.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Markdown!' : 'Copy Markdown'}</span>
              </button>
              <button
                onClick={() =>
                  handleDownload(reports.markdown, `test_report_${Date.now()}.md`, 'text/markdown')
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .md</span>
              </button>
              <button
                onClick={() =>
                  handleDownload(reports.json, `test_report_${Date.now()}.json`, 'application/json')
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a2538] text-slate-300 border border-slate-700 hover:bg-[#22314a] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .json</span>
              </button>
              <button
                onClick={() =>
                  handleDownload(reports.html, `test_report_${Date.now()}.html`, 'text/html')
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a2538] text-slate-300 border border-slate-700 hover:bg-[#22314a] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .html</span>
              </button>
            </div>
          </div>

          {/* Report Markdown Preview */}
          <div className="p-6 bg-[#0b0f17] font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed select-text">
            <pre className="whitespace-pre-wrap">{reports.markdown}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
