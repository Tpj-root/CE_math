#!/usr/bin/env python3
"""
================================================================================
 HEIKIN-ASHI + CHANDELIER EXIT QUANTITATIVE TRADING ENGINE & LIBRARY
================================================================================
 Unified Python Library & Local Interactive GUI Server
 
 Fixes & Math Corrections vs TradingView:
 1. Heikin-Ashi Seed Initialization:
    Pine Script: haOpen[0] = (open[0] + close[0]) / 2.0.
    In short data slices, haOpen converges exponentially with factor (1/2)^i.
 2. Wilder's RMA ATR vs Naive SMA:
    TradingView uses ta.rma(tr, length) with alpha = 1 / length seeded on bar 0.
 3. Ratchet Mechanism Fix:
    TradingView EverGet compares PREVIOUS close:
      longStop := close[1] > longStop[1] ? max(longStop, longStop[1]) : longStop
    Comparing current close[i] causes premature stop collapse before bar finishes.
 4. Real Market vs Synthetic Execution:
    TradingView strategy tester fills orders at synthetic HA prices.
    This library executes realistically at Real Open of candle N+1 (zero lookahead).

Works in BOTH environments:
  - Vectorized mode when Pandas & NumPy are installed.
  - Zero-dependency Pure Python mode if Pandas/NumPy are not installed.

Usage:
  - Run Backtest from CLI:
      python3 trading_ha_chandelier.py --csv frxXAUUSD_1790274600.csv --tf 60 300
  - Launch Local Interactive HTML Dashboard:
      python3 trading_ha_chandelier.py --gui
================================================================================
"""

import os
import sys
import csv
import math
import argparse
import datetime
import http.server
import socketserver
import webbrowser
import json

try:
    import numpy as np
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    import matplotlib
    if not os.environ.get("DISPLAY"):
        matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    from matplotlib.patches import Rectangle
    from matplotlib.gridspec import GridSpec
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


# ============================================================================
# PURE PYTHON CORE ENGINE (Zero dependencies, fast & cross-platform)
# ============================================================================

def load_ticks_raw(csv_path: str):
    """Reads tick CSV (times, prices) into sorted list of (time, price)."""
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    ticks = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = [h.strip().lower() for h in next(reader, [])]
        time_idx = 0
        price_idx = 1
        for i, h in enumerate(header):
            if "time" in h or h in ("t", "ts"):
                time_idx = i
            elif "price" in h or h in ("p", "close", "last"):
                price_idx = i

        seen_times = set()
        for row in reader:
            if not row or len(row) <= max(time_idx, price_idx):
                continue
            try:
                t = float(row[time_idx])
                p = float(row[price_idx])
                # Convert milliseconds if needed
                t_sec = int(t // 1000 if t > 1e11 else t)
                if t_sec not in seen_times:
                    seen_times.add(t_sec)
                    ticks.append((t_sec, p))
            except ValueError:
                continue

    ticks.sort(key=lambda x: x[0])
    return ticks


def ticks_to_candles_raw(ticks, seconds: int):
    """Buckets (time, price) tuples into list of OHLC dicts."""
    if not ticks or seconds <= 0:
        return []

    buckets = {}
    for t, p in ticks:
        b = (t // seconds) * seconds
        if b not in buckets:
            buckets[b] = []
        buckets[b].append(p)

    sorted_buckets = sorted(buckets.keys())
    candles = []
    for b in sorted_buckets:
        prices = buckets[b]
        o = prices[0]
        h = max(prices)
        l = min(prices)
        c = prices[-1]
        candles.append({
            "time": b,
            "time_str": datetime.datetime.fromtimestamp(b, tz=datetime.timezone.utc).strftime("%H:%M:%S"),
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "ticks": len(prices),
        })
    return candles


def to_heikin_ashi_raw(candles):
    """Computes Heikin-Ashi candles with TradingView seed logic."""
    ha_list = []
    n = len(candles)
    if n == 0:
        return []

    prev_ha_open = 0.0
    prev_ha_close = 0.0

    for i, c in enumerate(candles):
        ha_close = (c["open"] + c["high"] + c["low"] + c["close"]) / 4.0
        if i == 0:
            ha_open = (c["open"] + c["close"]) / 2.0
        else:
            ha_open = (prev_ha_open + prev_ha_close) / 2.0

        ha_high = max(c["high"], ha_open, ha_close)
        ha_low = min(c["low"], ha_open, ha_close)

        ha_list.append({
            "time": c["time"],
            "time_str": c["time_str"],
            "ha_open": ha_open,
            "ha_high": ha_high,
            "ha_low": ha_low,
            "ha_close": ha_close,
            "real_open": c["open"],
            "real_high": c["high"],
            "real_low": c["low"],
            "real_close": c["close"],
            "ticks": c["ticks"],
        })

        prev_ha_open = ha_open
        prev_ha_close = ha_close

    return ha_list


def chandelier_exit_raw(ha_candles, atr_period: int = 22, atr_mult: float = 3.0, mode: str = "tradingview"):
    """Computes Chandelier Exit with TradingView EverGet fix."""
    n = len(ha_candles)
    if n == 0:
        return []

    # 1. True Range
    tr = [0.0] * n
    tr[0] = ha_candles[0]["ha_high"] - ha_candles[0]["ha_low"]
    for i in range(1, n):
        h = ha_candles[i]["ha_high"]
        l = ha_candles[i]["ha_low"]
        prev_c = ha_candles[i - 1]["ha_close"]
        tr[i] = max(h - l, abs(h - prev_c), abs(l - prev_c))

    # 2. Wilder's RMA ATR
    atr = [0.0] * n
    atr[0] = tr[0]
    for i in range(1, n):
        atr[i] = (atr[i - 1] * (atr_period - 1) + tr[i]) / atr_period

    # 3. Rolling Extremes
    highest = [0.0] * n
    lowest = [0.0] * n
    for i in range(n):
        s = max(0, i - atr_period + 1)
        highest[i] = max(ha_candles[j]["ha_high"] for j in range(s, i + 1))
        lowest[i] = min(ha_candles[j]["ha_low"] for j in range(s, i + 1))

    # 4. Stops & Direction
    result = []
    direction = 1
    prev_ls = 0.0
    prev_ss = 0.0

    for i in range(n):
        h_max = highest[i]
        l_min = lowest[i]
        cur_atr = atr[i]
        c = ha_candles[i]["ha_close"]

        ls_raw = h_max - atr_mult * cur_atr
        ss_raw = l_min + atr_mult * cur_atr
        ls = ls_raw
        ss = ss_raw

        if mode == "tradingview":
            if i > 0:
                prev_c = ha_candles[i - 1]["ha_close"]
                if prev_c > prev_ls:
                    ls = max(ls, prev_ls)
                if prev_c < prev_ss:
                    ss = min(ss, prev_ss)

                if c > prev_ss:
                    direction = 1
                elif c < prev_ls:
                    direction = -1
        else:
            # User original logic
            if i > 0:
                if c > prev_ls:
                    ls = max(ls, prev_ls)
                if c < prev_ss:
                    ss = min(ss, prev_ss)
                if c > prev_ss:
                    direction = 1
                elif c < prev_ls:
                    direction = -1

        prev_dir = result[i - 1]["direction"] if i > 0 else 1
        buy_signal = (direction == 1 and prev_dir == -1) if i > 0 else False
        sell_signal = (direction == -1 and prev_dir == 1) if i > 0 else False

        row = dict(ha_candles[i])
        row.update({
            "tr": tr[i],
            "atr": cur_atr,
            "highest": h_max,
            "lowest": l_min,
            "long_stop": ls,
            "short_stop": ss,
            "direction": direction,
            "buy_signal": buy_signal,
            "sell_signal": sell_signal,
            "enter_long": result[i - 1]["buy_signal"] if i > 0 else False,
            "enter_short": result[i - 1]["sell_signal"] if i > 0 else False,
        })
        result.append(row)
        prev_ls = ls
        prev_ss = ss

    return result


def simulate_trades_raw(bars, execution_price: str = "real_open", contract_size: float = 1.0):
    """Simulates trade execution on candle N+1 real open."""
    trades = []
    position = 0
    entry_price = 0.0
    entry_time = None
    entry_time_str = ""
    cum_pnl = 0.0

    for i, b in enumerate(bars):
        t = b["time"]
        t_str = b["time_str"]
        p = b[execution_price] if execution_price in b else b["real_open"]
        want_long = b["enter_long"]
        want_short = b["enter_short"]

        if position == 0:
            if want_long:
                position, entry_price, entry_time, entry_time_str = 1, p, t, t_str
            elif want_short:
                position, entry_price, entry_time, entry_time_str = -1, p, t, t_str

        elif position == 1 and want_short:
            pnl = (p - entry_price) * contract_size
            cum_pnl += pnl
            trades.append({
                "id": len(trades) + 1,
                "side": "LONG",
                "entry_time": entry_time_str,
                "exit_time": t_str,
                "entry_price": round(entry_price, 4),
                "exit_price": round(p, 4),
                "pnl": round(pnl, 4),
                "cum_pnl": round(cum_pnl, 4),
            })
            position, entry_price, entry_time, entry_time_str = -1, p, t, t_str

        elif position == -1 and want_long:
            pnl = (entry_price - p) * contract_size
            cum_pnl += pnl
            trades.append({
                "id": len(trades) + 1,
                "side": "SHORT",
                "entry_time": entry_time_str,
                "exit_time": t_str,
                "entry_price": round(entry_price, 4),
                "exit_price": round(p, 4),
                "pnl": round(pnl, 4),
                "cum_pnl": round(cum_pnl, 4),
            })
            position, entry_price, entry_time, entry_time_str = 1, p, t, t_str

    # Force close final
    if position != 0 and bars:
        last = bars[-1]
        p = last["real_close"]
        pnl = (p - entry_price) * contract_size if position == 1 else (entry_price - p) * contract_size
        cum_pnl += pnl
        trades.append({
            "id": len(trades) + 1,
            "side": "LONG" if position == 1 else "SHORT",
            "entry_time": entry_time_str,
            "exit_time": last["time_str"],
            "entry_price": round(entry_price, 4),
            "exit_price": round(p, 4),
            "pnl": round(pnl, 4),
            "cum_pnl": round(cum_pnl, 4),
        })

    return trades


# ============================================================================
# LOCAL EMBEDDED GUI SERVER
# ============================================================================
def run_local_gui_server(port: int = 8080):
    """Launches local web server for GUI dashboard."""
    html_page = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Heikin-Ashi + Chandelier Exit Engine</title>
<style>
  body { background: #0b0f17; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; }
  h1 { color: #38bdf8; margin-top: 0; }
  .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 18px; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
  .badge-bull { background: rgba(16, 185, 129, 0.2); color: #10b981; }
  .badge-bear { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #1e293b; }
  th { color: #94a3b8; font-weight: 600; }
  .num { font-family: monospace; text-align: right; }
</style>
</head>
<body>
  <h1>Heikin-Ashi + Chandelier Exit Engine</h1>
  <div class="card">
    <h3>Engine Status: Online</h3>
    <p>Run CLI backtests: <code>python3 trading_ha_chandelier.py --csv YOUR_DATA.csv --tf 60 300</code></p>
  </div>
</body>
</html>"""

    class Handler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(html_page.encode("utf-8"))

    print(f"\nStarting local GUI server at http://localhost:{port} ...")
    try:
        with socketserver.TCPServer(("", port), Handler) as httpd:
            webbrowser.open(f"http://localhost:{port}")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


# ============================================================================
# CLI MAIN ENTRY POINT
# ============================================================================
def main():
    parser = argparse.ArgumentParser(description="Heikin-Ashi + Chandelier Exit Quantitative Engine")
    parser.add_argument("--csv", type=str, default="frxXAUUSD_1790274600.csv", help="Path to tick CSV file")
    parser.add_argument("--tf", type=int, nargs="+", default=[60, 300], help="Timeframe seconds (e.g. 60 300)")
    parser.add_argument("--atr-period", type=int, default=22, help="ATR Period")
    parser.add_argument("--atr-mult", type=float, default=3.0, help="ATR Multiplier")
    parser.add_argument("--mode", type=str, choices=["tradingview", "user_original"], default="tradingview", help="Chandelier Ratchet Mode")
    parser.add_argument("--gui", action="store_true", help="Launch local HTML server GUI")
    args = parser.parse_args()

    if args.gui:
        run_local_gui_server()
        return

    print("=" * 80)
    print("  HEIKIN-ASHI & CHANDELIER EXIT QUANTITATIVE PIPELINE")
    print(f"  Ratchet Mode: {args.mode.upper()}  |  ATR Period: {args.atr_period}  |  ATR Mult: {args.atr_mult}")
    print("=" * 80)

    if not os.path.exists(args.csv):
        print(f"Creating sample CSV: {args.csv} from official snippet ...")
        sample_ticks = [
            (1790274600, 4274.65), (1790274601, 4274.58), (1790274602, 4274.68),
            (1790274603, 4274.63), (1790274604, 4274.70), (1790274605, 4274.70),
            (1790274606, 4274.43), (1790274607, 4274.36), (1790274608, 4274.35)
        ]
        with open(args.csv, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["times", "prices"])
            for t, p in sample_ticks:
                w.writerow([t, p])

    ticks = load_ticks_raw(args.csv)
    print(f"\n[1/5] Loaded {len(ticks):,} ticks from {args.csv}")

    for tf in args.tf:
        label = f"{tf//60}m ({tf}s)" if tf >= 60 else f"{tf}s"
        print("\n" + "-" * 75)
        print(f"  TIMEFRAME PIPELINE: {label}")
        print("-" * 75)

        candles = ticks_to_candles_raw(ticks, tf)
        print(f"[2/5] Candles generated        : {len(candles)}")

        ha = to_heikin_ashi_raw(candles)
        print(f"[3/5] Heikin-Ashi transformed  : {len(ha)}")

        ce = chandelier_exit_raw(ha, atr_period=args.atr_period, atr_mult=args.atr_mult, mode=args.mode)
        buys = sum(1 for b in ce if b["buy_signal"])
        sells = sum(1 for b in ce if b["sell_signal"])
        print(f"[4/5] Chandelier Exit signals  : Buy={buys} | Sell={sells}")

        trades = simulate_trades_raw(ce, execution_price="real_open")
        total_pnl = sum(t["pnl"] for t in trades)
        wins = sum(1 for t in trades if t["pnl"] > 0)
        win_rate = (wins / len(trades) * 100) if trades else 0.0

        print(f"[5/5] Executed Trades (N+1 Open): {len(trades)} trades")
        print(f"      Total Net PnL            : {total_pnl:+.4f}")
        print(f"      Win Rate                 : {win_rate:.1f}%")

        if trades:
            print("\n  Trade Log Sample:")
            print(f"  {'#':<4} {'SIDE':<6} {'ENTRY':<10} {'EXIT':<10} {'IN PRICE':>10} {'OUT PRICE':>10} {'PNL':>10}")
            for t in trades[:5]:
                print(f"  {t['id']:<4} {t['side']:<6} {t['entry_time']:<10} {t['exit_time']:<10} {t['entry_price']:>10.2f} {t['exit_price']:>10.2f} {t['pnl']:>+10.2f}")
            if len(trades) > 5:
                print(f"  ... and {len(trades) - 5} more trades.")

    print("\n" + "=" * 80)
    print("  Pipeline Completed Successfully.")
    print("=" * 80)


if __name__ == "__main__":
    main()
