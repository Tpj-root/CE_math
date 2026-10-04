import React, { useState } from 'react';
import { Trade, BacktestMetrics } from '../types/trading';
import { Download, Filter, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface TradeLogTableProps {
  trades: Trade[];
  metrics: BacktestMetrics;
  onExportTradesCsv: () => void;
  onSelectCandle: (index: number) => void;
  onOpenStepInspector: (index: number) => void;
}

export const TradeLogTable: React.FC<TradeLogTableProps> = ({
  trades,
  metrics,
  onExportTradesCsv,
  onSelectCandle,
  onOpenStepInspector,
}) => {
  const [filterSide, setFilterSide] = useState<'ALL' | 'LONG' | 'SHORT' | 'WINS' | 'LOSSES'>('ALL');

  const filteredTrades = trades.filter(t => {
    if (filterSide === 'LONG') return t.side === 'LONG';
    if (filterSide === 'SHORT') return t.side === 'SHORT';
    if (filterSide === 'WINS') return t.pnl > 0;
    if (filterSide === 'LOSSES') return t.pnl < 0;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f17] overflow-y-auto p-6 space-y-6 select-none">
      {/* Metrics Performance Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Total Net PnL</span>
          <div
            className={`text-lg font-mono font-bold ${
              metrics.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {metrics.totalPnl >= 0 ? `+${metrics.totalPnl.toFixed(2)}` : metrics.totalPnl.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500 block">Real execution price</span>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Win Rate</span>
          <div className="text-lg font-mono font-bold text-slate-100">{metrics.winRate}%</div>
          <span className="text-[10px] text-slate-500 block">
            {metrics.winningTrades}W / {metrics.losingTrades}L
          </span>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Profit Factor</span>
          <div className="text-lg font-mono font-bold text-sky-400">
            {metrics.profitFactor.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500 block">Gross win / loss</span>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Max Drawdown</span>
          <div className="text-lg font-mono font-bold text-rose-400">
            -{metrics.maxDrawdown.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500 block">Peak to trough</span>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Avg Trade PnL</span>
          <div
            className={`text-lg font-mono font-bold ${
              metrics.avgTradePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {metrics.avgTradePnl >= 0 ? `+${metrics.avgTradePnl.toFixed(2)}` : metrics.avgTradePnl.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500 block">Expectancy: {metrics.expectancy.toFixed(2)}</span>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3.5 space-y-1">
          <span className="text-[11px] text-slate-400 block">Total Trades</span>
          <div className="text-lg font-mono font-bold text-slate-100">{metrics.totalTrades}</div>
          <span className="text-[10px] text-slate-500 block">Across {metrics.totalCandles} bars</span>
        </div>
      </div>

      {/* Trade Log Table Container */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden">
        {/* Table Controls Header */}
        <div className="p-4 border-b border-[#1e293b] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100 text-sm">Detailed Trade Ledger</span>
            <span className="text-slate-500 text-xs font-mono">
              ({filteredTrades.length} of {trades.length} trades)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Tabs */}
            <div className="flex items-center bg-[#131d2e] rounded-lg p-0.5 border border-[#223049] text-xs">
              {(['ALL', 'LONG', 'SHORT', 'WINS', 'LOSSES'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilterSide(tab)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    filterSide === tab
                      ? 'bg-[#1b283e] text-sky-400 font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <button
              onClick={onExportTradesCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#131d2e] hover:bg-[#1b283e] border border-[#273752] rounded-lg text-xs font-medium text-slate-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#111927] border-b border-[#1e293b] text-slate-400 font-mono">
                <th className="py-2.5 px-3 text-center">#</th>
                <th className="py-2.5 px-3">Side</th>
                <th className="py-2.5 px-3">Entry Time</th>
                <th className="py-2.5 px-3">Exit Time</th>
                <th className="py-2.5 px-3 text-right">Entry Price</th>
                <th className="py-2.5 px-3 text-right">Exit Price</th>
                <th className="py-2.5 px-3 text-center">Duration</th>
                <th className="py-2.5 px-3 text-right">Trade PnL</th>
                <th className="py-2.5 px-3 text-right">Cum PnL</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182335]">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-mono">
                    No trades match the current filter.
                  </td>
                </tr>
              ) : (
                filteredTrades.map(trade => {
                  const isWin = trade.pnl > 0;
                  const isLoss = trade.pnl < 0;

                  return (
                    <tr
                      key={trade.id}
                      className="hover:bg-[#141f33] transition-colors font-mono"
                    >
                      <td className="py-2.5 px-3 text-center text-slate-500">{trade.id}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                            trade.side === 'LONG'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {trade.side === 'LONG' ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {trade.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{trade.entryTimeStr}</td>
                      <td className="py-2.5 px-3 text-slate-300">{trade.exitTimeStr}</td>
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        {trade.entryPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        {trade.exitPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-400">
                        {trade.durationCandles} bars ({trade.durationSeconds}s)
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          isWin ? 'text-emerald-400' : isLoss ? 'text-rose-400' : 'text-slate-400'
                        }`}
                      >
                        {isWin ? `+${trade.pnl.toFixed(2)}` : trade.pnl.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          trade.cumPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {trade.cumPnl >= 0 ? `+${trade.cumPnl.toFixed(2)}` : trade.cumPnl.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => {
                            onSelectCandle(trade.entryIndex);
                            onOpenStepInspector(trade.entryIndex);
                          }}
                          className="px-2 py-1 text-[10px] rounded bg-[#1e2c44] hover:bg-[#283a5a] text-sky-300 transition-colors"
                          title="Inspect entry bar mathematical steps"
                        >
                          Inspect Bar #{trade.entryIndex}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
