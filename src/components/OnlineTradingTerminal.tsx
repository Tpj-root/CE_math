/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Sliders,
  DollarSign,
  Shield,
  Layers,
  Activity,
  ArrowRight,
  Maximize2,
  Terminal,
  Zap,
  Info
} from 'lucide-react';
import {
  Tick,
  StrategyConfig,
  MT5Position,
  MT5Tick,
  AlgoTradingState,
  VolumeCalculation
} from '../types/trading';
import { ticksToCandles, toHeikinAshi, computeChandelierExit } from '../utils/engine';

interface OnlineTradingTerminalProps {
  config: StrategyConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrategyConfig>>;
  algoTrading: AlgoTradingState;
  setAlgoTrading: React.Dispatch<React.SetStateAction<AlgoTradingState>>;
  onToggleAlgoTrading: () => void;
  onNavigateToTab: (tab: any) => void;
}

export const OnlineTradingTerminal: React.FC<OnlineTradingTerminalProps> = ({
  config,
  setConfig,
  algoTrading,
  setAlgoTrading,
  onToggleAlgoTrading,
  onNavigateToTab,
}) => {
  // Live Tick Streaming State
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [streamSpeedMs, setStreamSpeedMs] = useState<number>(1000);
  const [symbol, setSymbol] = useState<string>('XAUUSD');
  const [contractSize, setContractSize] = useState<number>(100.0);
  const [liveBid, setLiveBid] = useState<number>(4274.50);
  const [liveAsk, setLiveAsk] = useState<number>(4274.65);
  const [tickCount, setTickCount] = useState<number>(180);

  // Position Update Loop (Every 5 minutes = 300 seconds)
  const [updateIntervalSec, setUpdateIntervalSec] = useState<number>(300);
  const [countdownSec, setCountdownSec] = useState<number>(300);
  const [lastUpdateReport, setLastUpdateReport] = useState<string>('Engine initialized. Ready for 5-min position ratchets.');

  // Volume Sizing Configuration
  const [volumeMode, setVolumeMode] = useState<'fixed' | 'risk_percent'>('fixed');
  const [fixedLots, setFixedLots] = useState<number>(0.10);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [accountBalance, setAccountBalance] = useState<number>(10000.0);

  // Open MT5 Positions & Deal History
  const [positions, setPositions] = useState<MT5Position[]>([
    {
      ticket: 10001,
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: 0.10,
      openPrice: 4270.00,
      currentPrice: 4274.50,
      sl: 4265.20,
      tp: 4290.00,
      trailingSl: 4265.20,
      profit: 45.00,
      profitPercent: 1.05,
      openTime: Math.floor(Date.now() / 1000) - 450,
      comment: 'CE_BUY_SIGNAL',
    },
  ]);

  const [tradeLogs, setTradeLogs] = useState<{ id: number; time: string; msg: string; type: 'buy' | 'sell' | 'sl' | 'close' | 'error' }[]>([
    {
      id: 1,
      time: new Date().toLocaleTimeString(),
      msg: 'Connected to MT5 Tick Stream [XAUUSD]. Algo Trading state: ' + (algoTrading.enabled ? 'ENABLED' : 'DISABLED'),
      type: algoTrading.enabled ? 'buy' : 'error',
    },
    {
      id: 2,
      time: new Date().toLocaleTimeString(),
      msg: 'Initial Position #10001 BUY 0.10 @ 4270.00 loaded with Chandelier Trailing SL @ 4265.20',
      type: 'buy',
    },
  ]);

  const [errorMessageBanner, setErrorMessageBanner] = useState<string | null>(null);

  // Buffer of live ticks for real-time OHLC & Heikin-Ashi calculation
  const [tickBuffer, setTickBuffer] = useState<Tick[]>(() => {
    const arr: Tick[] = [];
    const baseTime = Math.floor(Date.now() / 1000) - 300 * 60;
    let p = 4270.0;
    for (let i = 0; i < 300; i++) {
      p += (Math.random() - 0.48) * 0.4;
      arr.push({ time: baseTime + i * 60, price: Math.round(p * 100) / 100 });
    }
    return arr;
  });

  // Calculate live candles, Heikin-Ashi, and Chandelier Exit stops
  const { currentCandles, currentHa, currentCe, latestBar } = useMemo(() => {
    if (tickBuffer.length === 0) {
      return { currentCandles: [], currentHa: [], currentCe: [], latestBar: null };
    }
    const c = ticksToCandles(tickBuffer, config.timeframeSec);
    const ha = toHeikinAshi(c);
    const ce = computeChandelierExit(
      ha,
      config.atrPeriod,
      config.atrMultiplier,
      config.algorithm,
      config.useCloseForExtremums,
      config.extremumFormula,
      config.maType,
      config.maLength,
      config.extremumLookback
    );
    const last = ce.length > 0 ? ce[ce.length - 1] : null;
    return { currentCandles: c, currentHa: ha, currentCe: ce, latestBar: last };
  }, [tickBuffer, config]);

  // Dynamic Volume Calculator based on Risk and Chandelier Stop Loss distance
  const calculatedVolume = useMemo(() => {
    if (volumeMode === 'fixed') {
      return fixedLots;
    }
    if (!latestBar) return fixedLots;
    const isLong = latestBar.direction === 1;
    const entry = isLong ? liveAsk : liveBid;
    const targetStop = isLong ? latestBar.longStop : latestBar.shortStop;
    const slDist = Math.abs(entry - targetStop);
    if (slDist <= 0.05) return fixedLots;

    const riskDollars = (accountBalance * riskPercent) / 100.0;
    const lots = riskDollars / (slDist * contractSize);
    // Normalize to 0.01 steps, bounded between 0.01 and 50.0
    const rounded = Math.max(0.01, Math.min(50.0, Math.round(lots * 100) / 100));
    return rounded;
  }, [volumeMode, fixedLots, riskPercent, accountBalance, latestBar, liveAsk, liveBid, contractSize]);

  // Tick generator stream effect
  useEffect(() => {
    if (!isStreaming) return;

    const timer = setInterval(() => {
      setLiveAsk(prev => {
        const delta = (Math.random() - 0.49) * 0.35;
        const newAsk = Math.max(100.0, Math.round((prev + delta) * 100) / 100);
        const newBid = Math.round((newAsk - 0.15) * 100) / 100;
        setLiveBid(newBid);

        const nowSec = Math.floor(Date.now() / 1000);
        setTickCount(c => c + 1);

        setTickBuffer(buf => {
          const next = [...buf, { time: nowSec, price: newAsk }];
          return next.slice(-1500); // keep bounded
        });

        // Update floating PnL on open positions
        setPositions(currentPositions =>
          currentPositions.map(pos => {
            const currentPrice = pos.side === 'BUY' ? newBid : newAsk;
            const priceDiff = pos.side === 'BUY' ? currentPrice - pos.openPrice : pos.openPrice - currentPrice;
            const pnl = Math.round(priceDiff * pos.volume * contractSize * 100) / 100;
            const pnlPercent = Math.round(((priceDiff / pos.openPrice) * 100) * 100) / 100;
            return {
              ...pos,
              currentPrice,
              profit: pnl,
              profitPercent: pnlPercent,
            };
          })
        );

        return newAsk;
      });
    }, streamSpeedMs);

    return () => clearInterval(timer);
  }, [isStreaming, streamSpeedMs, contractSize]);

  // Trailing Stop Loss Automatic Ratchet (Synchronized with Chandelier Exit points)
  useEffect(() => {
    if (!latestBar) return;
    const longStop = latestBar.longStop;
    const shortStop = latestBar.shortStop;

    setPositions(curr => {
      let modified = false;
      const updated = curr.map(p => {
        if (p.side === 'BUY') {
          // Can only ratchet UP
          if (longStop > p.trailingSl && longStop < liveBid) {
            modified = true;
            addLog(`Ticket #${p.ticket} (BUY): Trailing Stop ratcheted UP: ${p.trailingSl.toFixed(2)} ➔ ${longStop.toFixed(2)} (CE Long Stop)`, 'sl');
            return { ...p, trailingSl: longStop, sl: longStop };
          }
        } else {
          // Can only ratchet DOWN
          if ((shortStop < p.trailingSl || p.trailingSl === 0) && shortStop > liveAsk) {
            modified = true;
            addLog(`Ticket #${p.ticket} (SELL): Trailing Stop ratcheted DOWN: ${p.trailingSl.toFixed(2)} ➔ ${shortStop.toFixed(2)} (CE Short Stop)`, 'sl');
            return { ...p, trailingSl: shortStop, sl: shortStop };
          }
        }
        return p;
      });
      return modified ? updated : curr;
    });
  }, [latestBar, liveBid, liveAsk]);

  // Automated Signal Trigger & Auto-Execution Check
  useEffect(() => {
    if (!latestBar) return;

    if (latestBar.buySignal || latestBar.sellSignal) {
      const signalType = latestBar.buySignal ? 'BUY' : 'SELL';

      if (!algoTrading.enabled) {
        setErrorMessageBanner(`Please enable Algo Trading or (CTRL + E) — Signal ${signalType} ignored because toolbar is RED.`);
        addLog(`[REJECTED] Signal ${signalType} triggered, but AutoTrading is DISABLED (Toolbar RED). Press CTRL+E.`, 'error');
        return;
      }

      // Auto Trading IS enabled: execute automatic order
      if (latestBar.buySignal) {
        handleExecuteBuy('AUTO_SIGNAL_CE_FLIP');
      } else if (latestBar.sellSignal) {
        handleExecuteSell('AUTO_SIGNAL_CE_FLIP');
      }
    }
  }, [latestBar?.buySignal, latestBar?.sellSignal, algoTrading.enabled]);

  // 5-Minute Position Update Countdown Timer (same routine as position_update.py)
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdownSec(prev => {
        if (prev <= 1) {
          executePositionUpdateRoutine();
          return updateIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [updateIntervalSec, latestBar, positions, algoTrading.enabled]);

  // Routine matching position_update.py
  const executePositionUpdateRoutine = () => {
    if (!algoTrading.enabled) {
      setLastUpdateReport(`[${new Date().toLocaleTimeString()}] Position update skipped: Algo Trading is DISABLED (Toolbar is RED). Press CTRL+E.`);
      return;
    }

    if (!latestBar) {
      setLastUpdateReport(`[${new Date().toLocaleTimeString()}] No Chandelier Exit data available.`);
      return;
    }

    const longStop = latestBar.longStop;
    const shortStop = latestBar.shortStop;
    let countUpdated = 0;

    setPositions(curr =>
      curr.map(p => {
        if (p.side === 'BUY' && longStop > p.trailingSl && longStop < liveBid) {
          countUpdated++;
          return { ...p, trailingSl: longStop, sl: longStop };
        }
        if (p.side === 'SELL' && (shortStop < p.trailingSl || p.trailingSl === 0) && shortStop > liveAsk) {
          countUpdated++;
          return { ...p, trailingSl: shortStop, sl: shortStop };
        }
        return p;
      })
    );

    const report = `[${new Date().toLocaleTimeString()}] 5-Min Position Ratchet Complete. Evaluated ${positions.length} positions. Ratcheted: ${countUpdated}. CE Long Stop: ${longStop.toFixed(2)} | CE Short Stop: ${shortStop.toFixed(2)}`;
    setLastUpdateReport(report);
    addLog(report, 'sl');
  };

  const addLog = (msg: string, type: 'buy' | 'sell' | 'sl' | 'close' | 'error') => {
    setTradeLogs(prev => [
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), msg, type },
      ...prev.slice(0, 49),
    ]);
  };

  // BUY Order Dispatch
  const handleExecuteBuy = (source: string = 'MANUAL_DISPATCH') => {
    // Check AutoTrading status first!
    if (!algoTrading.enabled) {
      setErrorMessageBanner('Please enable Algo Trading or (CTRL + E) — Buy order cannot be dispatched when toolbar is RED.');
      addLog('[ERROR] BUY order rejected: Please enable Algo Trading or (CTRL + E)', 'error');
      return;
    }

    setErrorMessageBanner(null);
    const newTicket = Math.floor(10000 + Math.random() * 90000);
    const stoploss = latestBar ? latestBar.longStop : Math.round((liveAsk - 10.0) * 100) / 100;
    const takeprofit = Math.round((liveAsk + 20.0) * 100) / 100;
    const vol = calculatedVolume;

    const newPos: MT5Position = {
      ticket: newTicket,
      symbol,
      side: 'BUY',
      volume: vol,
      openPrice: liveAsk,
      currentPrice: liveBid,
      sl: stoploss,
      tp: takeprofit,
      trailingSl: stoploss,
      profit: 0.0,
      profitPercent: 0.0,
      openTime: Math.floor(Date.now() / 1000),
      comment: source,
    };

    setPositions(prev => [newPos, ...prev]);
    addLog(`[BUY OK] Ticket #${newTicket} | Symbol: ${symbol} | Vol: ${vol} lots @ Ask: ${liveAsk.toFixed(2)} | SL: ${stoploss.toFixed(2)} (CE Long Stop)`, 'buy');
  };

  // SELL Order Dispatch
  const handleExecuteSell = (source: string = 'MANUAL_DISPATCH') => {
    // Check AutoTrading status first!
    if (!algoTrading.enabled) {
      setErrorMessageBanner('Please enable Algo Trading or (CTRL + E) — Sell order cannot be dispatched when toolbar is RED.');
      addLog('[ERROR] SELL order rejected: Please enable Algo Trading or (CTRL + E)', 'error');
      return;
    }

    setErrorMessageBanner(null);
    const newTicket = Math.floor(10000 + Math.random() * 90000);
    const stoploss = latestBar ? latestBar.shortStop : Math.round((liveBid + 10.0) * 100) / 100;
    const takeprofit = Math.round((liveBid - 20.0) * 100) / 100;
    const vol = calculatedVolume;

    const newPos: MT5Position = {
      ticket: newTicket,
      symbol,
      side: 'SELL',
      volume: vol,
      openPrice: liveBid,
      currentPrice: liveAsk,
      sl: stoploss,
      tp: takeprofit,
      trailingSl: stoploss,
      profit: 0.0,
      profitPercent: 0.0,
      openTime: Math.floor(Date.now() / 1000),
      comment: source,
    };

    setPositions(prev => [newPos, ...prev]);
    addLog(`[SELL OK] Ticket #${newTicket} | Symbol: ${symbol} | Vol: ${vol} lots @ Bid: ${liveBid.toFixed(2)} | SL: ${stoploss.toFixed(2)} (CE Short Stop)`, 'sell');
  };

  // Close Position
  const handleClosePosition = (ticket: number) => {
    const target = positions.find(p => p.ticket === ticket);
    if (!target) return;
    setPositions(prev => prev.filter(p => p.ticket !== ticket));
    addLog(`[CLOSED] Ticket #${ticket} closed | Realized PnL: $${target.profit.toFixed(2)} (${target.profitPercent.toFixed(2)}%)`, 'close');
  };

  // Partial Close (50% or custom volume)
  const handlePartialClose = (ticket: number) => {
    setPositions(prev =>
      prev.map(p => {
        if (p.ticket === ticket) {
          const halfVol = Math.round((p.volume / 2.0) * 100) / 100;
          if (halfVol <= 0.01) {
            handleClosePosition(ticket);
            return p;
          }
          const closedPnl = Math.round((p.profit / 2.0) * 100) / 100;
          addLog(`[PARTIAL CLOSE] Ticket #${ticket} closed ${halfVol} lots | Remaining: ${halfVol} lots | Booked PnL: $${closedPnl.toFixed(2)}`, 'close');
          return {
            ...p,
            volume: halfVol,
            profit: p.profit - closedPnl,
          };
        }
        return p;
      })
    );
  };

  // Close All Positions
  const handleCloseAllPositions = () => {
    if (positions.length === 0) return;
    const totalBooked = positions.reduce((acc, p) => acc + p.profit, 0);
    setPositions([]);
    addLog(`[CLOSE ALL] Closed ${positions.length} open positions | Total PnL: $${totalBooked.toFixed(2)}`, 'close');
  };

  const totalFloatingPnl = useMemo(() => {
    return positions.reduce((acc, p) => acc + p.profit, 0);
  }, [positions]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080d16] text-slate-200 overflow-y-auto">
      {/* Top Banner Alert if AutoTrading is Disabled */}
      {!algoTrading.enabled && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-3 flex items-center justify-between gap-3 text-rose-200 animate-pulse">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="font-semibold text-sm">
              Please enable Algo Trading or (CTRL + E)
            </span>
            <span className="text-xs text-rose-300/80 hidden md:inline">
              — Toolbar button is <strong className="text-rose-400 uppercase font-mono">RED</strong> (Disabled). Live buy/sell triggers and order dispatches are currently blocked.
            </span>
          </div>
          <button
            onClick={onToggleAlgoTrading}
            className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-md shadow transition-colors shrink-0 flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Enable Now (CTRL+E)</span>
          </button>
        </div>
      )}

      {/* Dynamic Error Notification Banner */}
      {errorMessageBanner && algoTrading.enabled && (
        <div className="bg-amber-950/80 border-b border-amber-800/80 px-4 py-2.5 flex items-center justify-between text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{errorMessageBanner}</span>
          </div>
          <button onClick={() => setErrorMessageBanner(null)} className="text-amber-400 hover:text-white font-bold">✕</button>
        </div>
      )}

      {/* Main Terminal Header & Status Strip */}
      <div className="p-4 sm:p-5 border-b border-[#1e293b] bg-[#0c1322] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-sky-400" />
              ONLINE METHOD: MT5 LIVE TICK TERMINAL
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-sky-950 text-sky-400 border border-sky-800">
              SYMBOL: {symbol}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
              TF: {config.timeframeSec}s ({config.timeframeSec / 60}m)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time MetaTrader 5 Tick Streaming ➔ Candle ➔ Heikin-Ashi ➔ Extremums (Noise Filter) ➔ Chandelier Exit ➔ Dynamic Trailing SL ➔ BUY/SELL
          </p>
        </div>

        {/* Algo Trading Toolbar Toggle & Color Notes */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] text-slate-400 font-mono">
              Toolbar Status Rule:
            </div>
            <div className="text-[10px] font-mono">
              <span className="text-rose-400 font-bold">RED = Disabled</span>
              <span className="text-slate-500 mx-1.5">|</span>
              <span className="text-emerald-400 font-bold">GREEN = Enabled</span>
            </div>
          </div>

          <button
            onClick={onToggleAlgoTrading}
            className={`px-4 py-2 rounded-lg font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer border ${
              algoTrading.enabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-emerald-950/50 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border-rose-400 shadow-rose-950/50 hover:bg-rose-500/30'
            }`}
            title="Toggle MT5 AutoTrading (Keyboard shortcut: CTRL + E)"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${algoTrading.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span>{algoTrading.enabled ? '🟢 ALGO TRADING: ENABLED' : '🔴 ALGO TRADING: DISABLED'}</span>
            <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] border border-white/10">CTRL+E</span>
          </button>
        </div>
      </div>

      {/* Grid: 4 Top KPI Cards */}
      <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Live MT5 Tick Prices */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>MT5 LIVE TICK FEED</span>
            <span className={`flex items-center gap-1 font-bold ${isStreaming ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
              {isStreaming ? 'STREAMING' : 'PAUSED'}
            </span>
          </div>

          <div className="my-2.5">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-mono block">BID</span>
                <span className="text-xl font-bold font-mono text-rose-400">${liveBid.toFixed(2)}</span>
              </div>
              <div className="text-center px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-[10px] font-mono text-slate-400">
                Spread: ${(liveAsk - liveBid).toFixed(2)}
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase font-mono block">ASK</span>
                <span className="text-xl font-bold font-mono text-emerald-400">${liveAsk.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-[#1e293b] pt-2 mt-1">
            <span>Tick #{tickCount}</span>
            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className="text-xs text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1"
            >
              {isStreaming ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {isStreaming ? 'Pause' : 'Resume'}
            </button>
          </div>
        </div>

        {/* Card 2: Chandelier Exit State & Stop Ratchet */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>CHANDELIER EXIT RATCHET</span>
            <span className="text-[10px] text-slate-500 font-mono">Formula: CLOSE</span>
          </div>

          <div className="my-2">
            <div className="flex items-center gap-2">
              <span className={`text-xl font-bold font-mono ${latestBar?.direction === 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {latestBar?.direction === 1 ? '▲ BULLISH (Direction +1)' : '▼ BEARISH (Direction -1)'}
              </span>
            </div>
            <div className="text-xs font-mono text-slate-300 mt-1 flex items-center justify-between">
              <span>Active Trailing Stop:</span>
              <span className="font-bold text-sky-400 text-sm">
                ${latestBar ? (latestBar.direction === 1 ? latestBar.longStop.toFixed(2) : latestBar.shortStop.toFixed(2)) : '---'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-[#1e293b] pt-2 mt-1">
            <span>ATR ({config.atrPeriod}, {config.atrMultiplier}x): {latestBar?.atr.toFixed(2) || '0.00'}</span>
            <span className="text-emerald-400 font-mono font-semibold">Wicks Filtered: ON</span>
          </div>
        </div>

        {/* Card 3: 5-Minute Position Updater Routine */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>5-MIN POSITION UPDATER</span>
            <Clock className="w-3.5 h-3.5 text-sky-400" />
          </div>

          <div className="my-2">
            <div className="text-[11px] text-slate-400">Next Trailing SL Ratchet In:</div>
            <div className="text-xl font-bold font-mono text-sky-400">
              {Math.floor(countdownSec / 60)}m {countdownSec % 60 < 10 ? '0' : ''}{countdownSec % 60}s
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate" title={lastUpdateReport}>
              {lastUpdateReport}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#1e293b] pt-2 mt-1">
            <span className="text-[11px] text-slate-400">Cycle: Every 300s</span>
            <button
              onClick={executePositionUpdateRoutine}
              className="text-[11px] text-sky-300 hover:text-white bg-sky-950/80 hover:bg-sky-900 border border-sky-800 px-2 py-0.5 rounded font-mono transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              <span>Ratchet Now</span>
            </button>
          </div>
        </div>

        {/* Card 4: Live Portfolio & Open Positions KPI */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>MT5 POSITIONS & PNL</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          </div>

          <div className="my-2">
            <div className="text-[10px] text-slate-500 uppercase font-mono">Floating Net Profit/Loss</div>
            <div className={`text-xl font-bold font-mono ${totalFloatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalFloatingPnl >= 0 ? '+' : ''}${totalFloatingPnl.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Open Positions: <strong className="text-slate-200">{positions.length}</strong>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#1e293b] pt-2 mt-1 text-[11px]">
            <span className="text-slate-400">Account: ${accountBalance.toLocaleString()}</span>
            <button
              onClick={handleCloseAllPositions}
              disabled={positions.length === 0}
              className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40 font-mono"
            >
              Close All
            </button>
          </div>
        </div>
      </div>

      {/* Middle Interactive Section: Order Dispatch Terminal + Volume Sizing */}
      <div className="px-4 sm:px-5 pb-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Panel 1: Order Dispatch Terminal (Buy / Sell Only Working Code) */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-slate-100 font-mono uppercase tracking-wide">
                  BUY & SELL Order Terminal
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Order Type: <strong className="text-sky-400">DEAL (IOC/FOK)</strong>
              </span>
            </div>

            {/* Volume Variable Selector */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
                <span className="text-slate-300">Volume Variable (Lots):</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVolumeMode('fixed')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      volumeMode === 'fixed' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    Fixed Lots
                  </button>
                  <button
                    onClick={() => setVolumeMode('risk_percent')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      volumeMode === 'risk_percent' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    Risk-Based %
                  </button>
                </div>
              </div>

              {volumeMode === 'fixed' ? (
                <div className="flex items-center gap-2">
                  {[0.01, 0.05, 0.10, 0.50, 1.00].map(v => (
                    <button
                      key={v}
                      onClick={() => setFixedLots(v)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors ${
                        fixedLots === v
                          ? 'bg-sky-500/20 text-sky-300 border-sky-400'
                          : 'bg-[#131d2e] text-slate-400 border-[#1e293b] hover:text-slate-200'
                      }`}
                    >
                      {v.toFixed(2)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-[#131d2e] border border-[#1e293b] rounded-lg p-2.5 text-xs font-mono">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400">Risk % per Trade:</span>
                    <span className="text-emerald-400 font-bold">{riskPercent}% (${((accountBalance * riskPercent) / 100).toFixed(0)})</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.5"
                    value={riskPercent}
                    onChange={e => setRiskPercent(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                  />
                  <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1">
                    <span>Account: ${accountBalance}</span>
                    <span>Calculated Volume: <strong className="text-sky-300">{calculatedVolume} lots</strong></span>
                  </div>
                </div>
              )}
            </div>

            {/* Chandelier Stoploss Preview */}
            <div className="bg-[#131d2e] border border-[#1e293b] rounded-lg p-3 text-xs font-mono space-y-1.5 mb-4">
              <div className="flex justify-between text-slate-400">
                <span>Chandelier Long Stop (BUY SL):</span>
                <span className="text-emerald-400 font-bold">${latestBar ? latestBar.longStop.toFixed(2) : '---'}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Chandelier Short Stop (SELL SL):</span>
                <span className="text-rose-400 font-bold">${latestBar ? latestBar.shortStop.toFixed(2) : '---'}</span>
              </div>
              <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                * Stoploss automatically attaches to orders and ratchets upward/downward as trend advances.
              </div>
            </div>
          </div>

          {/* Action Buttons: BUY and SELL */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => handleExecuteBuy('MANUAL_TERMINAL')}
              className={`py-3 px-4 rounded-xl font-bold font-mono text-sm transition-all flex flex-col items-center justify-center gap-1 shadow-lg ${
                algoTrading.enabled
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/40 cursor-pointer active:scale-[0.98]'
                  : 'bg-emerald-950/40 text-emerald-600 border border-emerald-900/50 cursor-not-allowed'
              }`}
              title={algoTrading.enabled ? 'Execute BUY order at live Ask' : 'Please enable Algo Trading or (CTRL + E)'}
            >
              <span className="flex items-center gap-1.5 text-base">
                <TrendingUp className="w-4 h-4" />
                <span>BUY {calculatedVolume} LOTS</span>
              </span>
              <span className="text-[11px] opacity-80">Ask: ${liveAsk.toFixed(2)}</span>
            </button>

            <button
              onClick={() => handleExecuteSell('MANUAL_TERMINAL')}
              className={`py-3 px-4 rounded-xl font-bold font-mono text-sm transition-all flex flex-col items-center justify-center gap-1 shadow-lg ${
                algoTrading.enabled
                  ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-950/40 cursor-pointer active:scale-[0.98]'
                  : 'bg-rose-950/40 text-rose-600 border border-rose-900/50 cursor-not-allowed'
              }`}
              title={algoTrading.enabled ? 'Execute SELL order at live Bid' : 'Please enable Algo Trading or (CTRL + E)'}
            >
              <span className="flex items-center gap-1.5 text-base">
                <TrendingDown className="w-4 h-4" />
                <span>SELL {calculatedVolume} LOTS</span>
              </span>
              <span className="text-[11px] opacity-80">Bid: ${liveBid.toFixed(2)}</span>
            </button>
          </div>
        </div>

        {/* Panel 2: Live Quant Rules & Noise Filter Visualizer */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-sm text-slate-100 font-mono uppercase tracking-wide">
                  Quant Pipeline & Rule Integrity
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono">
                FORMULA 1: CLOSE
              </span>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="p-2.5 rounded bg-[#131d2e] border border-[#1e293b]">
                <div className="text-slate-300 font-bold mb-1 flex items-center justify-between">
                  <span>1. MT5 Live Tick Ingestion</span>
                  <span className="text-emerald-400">● LIVE</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Ticks aggregated into continuous OHLC candles every {config.timeframeSec}s.
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#131d2e] border border-[#1e293b]">
                <div className="text-slate-300 font-bold mb-1 flex items-center justify-between">
                  <span>2. Heikin-Ashi Smoothing</span>
                  <span className="text-indigo-400">PINE COMPLIANT</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Eliminates intra-bar volatility spikes using HA Open and HA Close averages.
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#131d2e] border border-[#1e293b]">
                <div className="text-slate-300 font-bold mb-1 flex items-center justify-between">
                  <span>3. Extremums Noise Filter</span>
                  <span className="text-cyan-400">WICKS CUT</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Anchor prices calculated strictly on Close prices. Upper & lower wicks are discarded to prevent false stopouts.
                </div>
              </div>

              <div className="p-2.5 rounded bg-[#131d2e] border border-[#1e293b]">
                <div className="text-slate-300 font-bold mb-1 flex items-center justify-between">
                  <span>4. Dynamic Trailing SL</span>
                  <span className="text-amber-400">5-MIN RATCHET</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Stops strictly ratchet in favorable direction. Stop loss never expands or retreats.
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#1e293b] flex items-center justify-between text-xs">
            <span className="text-slate-400">Need offline testing?</span>
            <button
              onClick={() => onNavigateToTab('charts')}
              className="text-sky-400 hover:text-sky-300 font-mono font-medium flex items-center gap-1"
            >
              <span>Switch to Offline CSV</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Panel 3: Real-Time Execution Console & Terminal Logs */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e293b] pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-100 font-mono uppercase tracking-wide">
                  MT5 Execution Console
                </h3>
              </div>
              <button
                onClick={() => setTradeLogs([])}
                className="text-[10px] text-slate-500 hover:text-slate-300 font-mono"
              >
                Clear
              </button>
            </div>

            <div className="bg-[#070b12] border border-[#1a2333] rounded-lg p-3 font-mono text-xs h-60 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
              {tradeLogs.length === 0 ? (
                <div className="text-slate-600 text-center py-10">No execution logs yet. Orders and trailing SL updates will stream here.</div>
              ) : (
                tradeLogs.map(log => (
                  <div key={log.id} className="leading-relaxed">
                    <span className="text-slate-500 text-[10px] mr-2">[{log.time}]</span>
                    <span
                      className={
                        log.type === 'buy'
                          ? 'text-emerald-400'
                          : log.type === 'sell'
                          ? 'text-rose-400'
                          : log.type === 'sl'
                          ? 'text-cyan-300 font-semibold'
                          : log.type === 'close'
                          ? 'text-amber-300'
                          : 'text-rose-500 font-bold'
                      }
                    >
                      {log.msg}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#1e293b] flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Terminal status: 200 OK</span>
            <span className="text-emerald-400">MetaTrader5 RPC: Connected</span>
          </div>
        </div>
      </div>

      {/* Active MT5 Open Positions Table */}
      <div className="px-4 sm:px-5 pb-6">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[#1e293b] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h3 className="font-bold text-sm text-slate-100 font-mono uppercase tracking-wide">
                Live Open MT5 Positions ({positions.length})
              </h3>
            </div>
            <div className="text-xs font-mono text-slate-400 flex items-center gap-3">
              <span>Trailing SL Engine: <strong className="text-emerald-400">ACTIVE</strong></span>
              <span>Ratcheted every 5-min</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-[#131d2e] text-slate-400 border-b border-[#1e293b] uppercase text-[10px]">
                  <th className="py-2.5 px-3">Ticket</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Volume</th>
                  <th className="py-2.5 px-3">Open Price</th>
                  <th className="py-2.5 px-3">Live Price</th>
                  <th className="py-2.5 px-3">Trailing SL (CE)</th>
                  <th className="py-2.5 px-3">Take Profit</th>
                  <th className="py-2.5 px-3">Live PnL ($)</th>
                  <th className="py-2.5 px-3">PnL (%)</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-500">
                      No open positions in MT5 terminal. Dispatch a BUY or SELL order above.
                    </td>
                  </tr>
                ) : (
                  positions.map(p => (
                    <tr key={p.ticket} className="hover:bg-[#131d2e]/50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-300">#{p.ticket}</td>
                      <td className="py-2.5 px-3 text-slate-200">{p.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.side === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {p.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-sky-300">{p.volume.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-slate-300">${p.openPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-100">${p.currentPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 font-bold text-sky-400">
                        ${p.trailingSl.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">${p.tp > 0 ? p.tp.toFixed(2) : 'None'}</td>
                      <td className={`py-2.5 px-3 font-bold ${p.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {p.profit >= 0 ? '+' : ''}${p.profit.toFixed(2)}
                      </td>
                      <td className={`py-2.5 px-3 font-semibold ${p.profitPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {p.profitPercent >= 0 ? '+' : ''}{p.profitPercent.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePartialClose(p.ticket)}
                            className="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 text-amber-300 text-[10px] rounded transition-colors"
                            title="Close 50% of position volume"
                          >
                            Partial (50%)
                          </button>
                          <button
                            onClick={() => handleClosePosition(p.ticket)}
                            className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 text-[10px] rounded transition-colors"
                            title="Close full position"
                          >
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
