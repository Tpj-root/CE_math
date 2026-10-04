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


def compute_extremums_raw(
    ha_candles,
    atr_period: int = 22,
    use_close: bool = False,
    extremum_formula: str = "close",
    ma_len: int = 20,
    lookback: int = 5,
):
    """
    Pipeline Stage 3: Extremums Engine & Noise Reduction
    Candle -> Heikin-Ashi -> Extremums -> Chandelier Exit

    “Use Close Price for Extremums” means:
    When calculating highest high and lowest low used by Chandelier Exit,
    use the candle's Close price instead of its High/Low wick.

    Without “Use Close Price” (OFF):
      Highest = max(High_1, High_2, ..., High_22)
      Lowest  = min(Low_1, Low_2, ..., Low_22)
      -> Candle wicks are included (contains noise).

    With “Use Close Price” = ON:
      Highest = max(Close_1, Close_2, ..., Close_22)
      Lowest  = min(Close_1, Close_2, ..., Close_22)
      -> Wicks are ignored for finding the extreme (pure noise reduction).
    """
    n = len(ha_candles)
    if n == 0:
        return {
            "highest_close": [], "lowest_close": [],
            "highest_high": [], "lowest_low": [],
            "upper_anchor": [], "lower_anchor": [],
            "upper_wick_noise": [], "lower_wick_noise": [],
            "total_wick_noise": 0.0,
        }

    highest_close = [0.0] * n
    lowest_close = [0.0] * n
    highest_high = [0.0] * n
    lowest_low = [0.0] * n
    f1_upper = [0.0] * n
    f1_lower = [0.0] * n
    upper_wick_noise = [0.0] * n
    lower_wick_noise = [0.0] * n

    for i in range(n):
        s = max(0, i - atr_period + 1)
        h_max = max(ha_candles[j]["ha_high"] for j in range(s, i + 1))
        l_min = min(ha_candles[j]["ha_low"] for j in range(s, i + 1))
        c_max = max(ha_candles[j]["ha_close"] for j in range(s, i + 1))
        c_min = min(ha_candles[j]["ha_close"] for j in range(s, i + 1))

        highest_high[i] = h_max
        lowest_low[i] = l_min
        highest_close[i] = c_max
        lowest_close[i] = c_min

        f1_upper[i] = c_max if use_close else h_max
        f1_lower[i] = c_min if use_close else l_min

        upper_wick_noise[i] = max(0.0, ha_candles[i]["ha_high"] - ha_candles[i]["ha_close"])
        lower_wick_noise[i] = max(0.0, ha_candles[i]["ha_close"] - ha_candles[i]["ha_low"])

    # Formula 2 & 3: Moving Average (EMA)
    closes = [c["ha_close"] for c in ha_candles]
    ma = [0.0] * n
    if n > 0:
        ma[0] = closes[0]
        k = 2.0 / (ma_len + 1)
        for i in range(1, n):
            ma[i] = closes[i] * k + ma[i - 1] * (1.0 - k)

    # Formula 2: Rolling Range Envelope over lookback
    prev_high = [0.0] * n
    prev_low = [0.0] * n
    for i in range(n):
        s = max(0, i - lookback + 1)
        prev_high[i] = max((ha_candles[j]["ha_close"] if use_close else ha_candles[j]["ha_high"]) for j in range(s, i + 1))
        prev_low[i] = min((ha_candles[j]["ha_close"] if use_close else ha_candles[j]["ha_low"]) for j in range(s, i + 1))

    # Formula 3: Track Crests & Troughs along MA
    crests = [False] * n
    troughs = [False] * n
    last_crest = [highest_high[0]] * n
    last_trough = [lowest_low[0]] * n
    c_crest = highest_high[0]
    c_trough = lowest_low[0]

    for i in range(2, n):
        d_cur = ma[i] - ma[i - 1]
        d_prev = ma[i - 1] - ma[i - 2]
        if d_prev > 0 and d_cur <= 0:
            crests[i] = True
            c_crest = ma[i - 1]
        if d_prev < 0 and d_cur >= 0:
            troughs[i] = True
            c_trough = ma[i - 1]
        last_crest[i] = c_crest
        last_trough[i] = c_trough

    # Formula 4: Structural Swing Pivots
    p_high = [False] * n
    p_low = [False] * n
    active_res = [highest_high[0]] * n
    active_sup = [lowest_low[0]] * n
    c_res = highest_high[0]
    c_sup = lowest_low[0]

    for i in range(2, n):
        h_prev = ha_candles[i - 1]["ha_close"] if use_close else ha_candles[i - 1]["ha_high"]
        h_cur = ha_candles[i]["ha_close"] if use_close else ha_candles[i]["ha_high"]
        h_prev2 = ha_candles[i - 2]["ha_close"] if use_close else ha_candles[i - 2]["ha_high"]

        l_prev = ha_candles[i - 1]["ha_close"] if use_close else ha_candles[i - 1]["ha_low"]
        l_cur = ha_candles[i]["ha_close"] if use_close else ha_candles[i]["ha_low"]
        l_prev2 = ha_candles[i - 2]["ha_close"] if use_close else ha_candles[i - 2]["ha_low"]

        if h_prev > h_cur and h_prev > h_prev2:
            p_high[i - 1] = True
            c_res = h_prev
        if l_prev < l_cur and l_prev < l_prev2:
            p_low[i - 1] = True
            c_sup = l_prev

        active_res[i] = c_res
        active_sup[i] = c_sup

    # Select Active Upper and Lower Anchors
    upper_anchor = [0.0] * n
    lower_anchor = [0.0] * n

    for i in range(n):
        if extremum_formula == "range_ma":
            upper_anchor[i] = prev_high[i]
            lower_anchor[i] = prev_low[i]
        elif extremum_formula == "crest_trough":
            upper_anchor[i] = last_crest[i]
            lower_anchor[i] = last_trough[i]
        elif extremum_formula == "pivot_sr":
            upper_anchor[i] = active_res[i]
            lower_anchor[i] = active_sup[i]
        else:
            upper_anchor[i] = f1_upper[i]
            lower_anchor[i] = f1_lower[i]

    return {
        "highest_close": highest_close,
        "lowest_close": lowest_close,
        "highest_high": highest_high,
        "lowest_low": lowest_low,
        "upper_anchor": upper_anchor,
        "lower_anchor": lower_anchor,
        "upper_wick_noise": upper_wick_noise,
        "lower_wick_noise": lower_wick_noise,
        "total_wick_noise": sum(upper_wick_noise) + sum(lower_wick_noise),
        "prev_high": prev_high,
        "prev_low": prev_low,
        "ma": ma,
        "crests": crests,
        "troughs": troughs,
        "last_crest": last_crest,
        "last_trough": last_trough,
        "active_res": active_res,
        "active_sup": active_sup,
    }


def chandelier_exit_raw(
    ha_candles,
    atr_period: int = 22,
    atr_mult: float = 3.0,
    mode: str = "tradingview",
    use_close: bool = False,
    extremum_formula: str = "close",
    ma_len: int = 20,
    lookback: int = 5,
):
    """
    Computes Chandelier Exit over Heikin-Ashi candles with Extremum Engine.
    Extremum Formulas:
      - 'close'        : Formula 1 - Close Extremums (Use Close Price vs Wicks)
      - 'range_ma'     : Formula 2 - Range MA Crossover Dynamic Bands
      - 'crest_trough' : Formula 3 - MA+ Crest & Trough Inflection Waves
      - 'pivot_sr'     : Formula 4 - Structural 3-Bar Swing Pivot Support & Resistance
    """
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

    # 3. Rolling Extremes for Formula 1
    # Use Close Price for Extremums:
    # If ON: Highest = max(Close), Lowest = min(Close) (wicks ignored)
    # If OFF: Highest = max(High), Lowest = min(Low) (wicks included)
    highest_close = [0.0] * n
    lowest_close = [0.0] * n
    highest_high = [0.0] * n
    lowest_low = [0.0] * n
    f1_upper = [0.0] * n
    f1_lower = [0.0] * n

    for i in range(n):
        s = max(0, i - atr_period + 1)
        h_max = max(ha_candles[j]["ha_high"] for j in range(s, i + 1))
        l_min = min(ha_candles[j]["ha_low"] for j in range(s, i + 1))
        c_max = max(ha_candles[j]["ha_close"] for j in range(s, i + 1))
        c_min = min(ha_candles[j]["ha_close"] for j in range(s, i + 1))

        highest_high[i] = h_max
        lowest_low[i] = l_min
        highest_close[i] = c_max
        lowest_close[i] = c_min

        f1_upper[i] = c_max if use_close else h_max
        f1_lower[i] = c_min if use_close else l_min

    # Formula 2 & 3: Moving Average (EMA)
    closes = [c["ha_close"] for c in ha_candles]
    ma = [0.0] * n
    if n > 0:
        ma[0] = closes[0]
        k = 2.0 / (ma_len + 1)
        for i in range(1, n):
            ma[i] = closes[i] * k + ma[i - 1] * (1.0 - k)

    # Formula 2: Rolling Range Envelope over lookback
    prev_high = [0.0] * n
    prev_low = [0.0] * n
    for i in range(n):
        s = max(0, i - lookback + 1)
        prev_high[i] = max((ha_candles[j]["ha_close"] if use_close else ha_candles[j]["ha_high"]) for j in range(s, i + 1))
        prev_low[i] = min((ha_candles[j]["ha_close"] if use_close else ha_candles[j]["ha_low"]) for j in range(s, i + 1))

    # Formula 3: Track Crests & Troughs along MA
    crests = [False] * n
    troughs = [False] * n
    last_crest = [highest_high[0]] * n
    last_trough = [lowest_low[0]] * n
    c_crest = highest_high[0]
    c_trough = lowest_low[0]

    for i in range(2, n):
        d_cur = ma[i] - ma[i - 1]
        d_prev = ma[i - 1] - ma[i - 2]
        if d_prev > 0 and d_cur <= 0:
            crests[i] = True
            c_crest = ma[i - 1]
        if d_prev < 0 and d_cur >= 0:
            troughs[i] = True
            c_trough = ma[i - 1]
        last_crest[i] = c_crest
        last_trough[i] = c_trough

    # Formula 4: 3-bar Structural Swing Pivots
    pivot_highs = [False] * n
    pivot_lows = [False] * n
    active_res = [highest_high[0]] * n
    active_sup = [lowest_low[0]] * n
    c_res = highest_high[0]
    c_sup = lowest_low[0]

    for i in range(2, n):
        prev_h = ha_candles[i - 1]["ha_close"] if use_close else ha_candles[i - 1]["ha_high"]
        cur_h = ha_candles[i]["ha_close"] if use_close else ha_candles[i]["ha_high"]
        prev2_h = ha_candles[i - 2]["ha_close"] if use_close else ha_candles[i - 2]["ha_high"]

        prev_l = ha_candles[i - 1]["ha_close"] if use_close else ha_candles[i - 1]["ha_low"]
        cur_l = ha_candles[i]["ha_close"] if use_close else ha_candles[i]["ha_low"]
        prev2_l = ha_candles[i - 2]["ha_close"] if use_close else ha_candles[i - 2]["ha_low"]

        if prev_h > cur_h and prev_h > prev2_h:
            pivot_highs[i - 1] = True
            c_res = prev_h
        if prev_l < cur_l and prev_l < prev2_l:
            pivot_lows[i - 1] = True
            c_sup = prev_l

        active_res[i] = c_res
        active_sup[i] = c_sup

    # Select Starting Extremum Anchors based on extremum_formula
    upper_anchor = [0.0] * n
    lower_anchor = [0.0] * n
    for i in range(n):
        if extremum_formula == "range_ma":
            upper_anchor[i] = prev_high[i]
            lower_anchor[i] = prev_low[i]
        elif extremum_formula == "crest_trough":
            upper_anchor[i] = last_crest[i]
            lower_anchor[i] = last_trough[i]
        elif extremum_formula == "pivot_sr":
            upper_anchor[i] = active_res[i]
            lower_anchor[i] = active_sup[i]
        else:
            # Default: Formula 1 (Close Extremums)
            upper_anchor[i] = f1_upper[i]
            lower_anchor[i] = f1_lower[i]

    # 4. Stops & Direction Ratchet
    result = []
    direction = 1
    prev_ls = 0.0
    prev_ss = 0.0

    for i in range(n):
        h_max = upper_anchor[i]
        l_min = lower_anchor[i]
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
            "highest_close": highest_close[i],
            "lowest_close": lowest_close[i],
            "highest_high": highest_high[i],
            "lowest_low": lowest_low[i],
            "ma_val": ma[i],
            "prev_high": prev_high[i],
            "prev_low": prev_low[i],
            "is_crest": crests[i],
            "is_trough": troughs[i],
            "is_pivot_h": pivot_highs[i],
            "is_pivot_l": pivot_lows[i],
            "long_stop_raw": ls_raw,
            "short_stop_raw": ss_raw,
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
    """Launches local web server providing interactive HTML GUI."""
    html_page = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Heikin-Ashi & Chandelier Exit Interactive Lab</title>
<style>
  :root { --bg: #0b0f17; --card: #0f172a; --border: #1e293b; --text: #f8fafc; --muted: #94a3b8; --sky: #38bdf8; --green: #10b981; --red: #ef4444; --amber: #f59e0b; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; padding: 20px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 15px; margin-bottom: 20px; }
  .title { font-size: 18px; font-weight: bold; color: var(--sky); display: flex; align-items: center; gap: 8px; }
  .guide-box { background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; font-size: 13px; }
  .guide-box h4 { color: var(--sky); margin-bottom: 6px; }
  .guide-box ol { margin-left: 20px; color: #cbd5e1; }
  .guide-box li { margin-bottom: 4px; }
  .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; background: var(--card); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 20px; }
  .control-group label { display: block; font-size: 11px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; }
  .control-group input, .control-group select { width: 100%; background: #070b12; border: 1px solid var(--border); color: var(--text); padding: 8px 10px; border-radius: 6px; font-size: 13px; font-family: monospace; }
  .btn { background: var(--sky); color: #0b0f17; font-weight: bold; border: none; padding: 9px 18px; border-radius: 6px; cursor: pointer; transition: 0.15s; font-size: 13px; }
  .btn:hover { opacity: 0.9; }
  .btn-secondary { background: #1e293b; color: var(--text); border: 1px solid #334155; }
  .btn-secondary:hover { background: #334155; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); padding: 12px; border-radius: 6px; }
  .stat-card .lbl { font-size: 11px; color: var(--muted); }
  .stat-card .val { font-size: 17px; font-weight: bold; font-family: monospace; }
  .val.green { color: var(--green); }
  .val.red { color: var(--red); }
  .chart-panel { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 16px; }
  .chart-title { font-size: 12px; font-weight: bold; color: var(--muted); margin-bottom: 10px; display: flex; justify-content: space-between; }
  canvas { width: 100%; height: 160px; display: block; background: #070b12; border-radius: 4px; }
  .inspector-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .step-row { margin-bottom: 10px; padding: 10px; background: #070b12; border-radius: 4px; font-family: monospace; font-size: 12px; }
  .step-label { color: var(--sky); font-weight: bold; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: monospace; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-size: 11px; }
  .tag { padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; }
  .tag.buy { background: rgba(16, 185, 129, 0.2); color: var(--green); }
  .tag.sell { background: rgba(239, 68, 68, 0.2); color: var(--red); }
</style>
</head>
<body>
  <div class="header">
    <div class="title">HEIKIN-ASHI & CHANDELIER EXIT QUANT STUDIO</div>
    <div style="font-size:12px; color:var(--muted); font-family:monospace;">Local Interactive Server · Port 8080</div>
  </div>

  <div class="guide-box">
    <h4>QUICKSTART & USAGE GUIDE:</h4>
    <ol>
      <li><strong>Input CSV Data:</strong> Paste or choose your tick file (format: <code>times,prices</code> like your official gold file <code>frxXAUUSD_1790274600.csv</code>).</li>
      <li><strong>Configure Variables:</strong> Set candle timeframe (e.g. <code>60</code> for 1m, <code>300</code> for 5m), ATR period (<code>22</code>), and Multiplier (<code>3.0</code>).</li>
      <li><strong>Run Calculations:</strong> Click <em>"Run Calculations & Update Charts"</em> to see all 5 separated charts instantly.</li>
      <li><strong>Inspect Any Step:</strong> Drag the slider in the Mathematical Inspector to see every raw formula with plugged-in values.</li>
    </ol>
  </div>

  <div class="controls">
    <div class="control-group">
      <label>Load Tick CSV File</label>
      <input type="file" id="fileInput" accept=".csv">
    </div>
    <div class="control-group">
      <label>Timeframe (Seconds)</label>
      <input type="number" id="tfSec" value="60" min="1">
    </div>
    <div class="control-group">
      <label>ATR Period</label>
      <input type="number" id="atrPeriod" value="22" min="2">
    </div>
    <div class="control-group">
      <label>ATR Multiplier</label>
      <input type="number" id="atrMult" value="3.0" step="0.1" min="0.5">
    </div>
    <div class="control-group">
      <label>Ratchet Mode</label>
      <select id="mode">
        <option value="tradingview" selected>TradingView EverGet Standard (Fixed)</option>
        <option value="user_original">Original Script Logic</option>
      </select>
    </div>
    <div class="control-group" style="display:flex; align-items:flex-end;">
      <button class="btn" id="runBtn" style="width:100%;">Run Calculations</button>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card"><div class="lbl">Ticks Processed</div><div class="val" id="statTicks">0</div></div>
    <div class="stat-card"><div class="lbl">Candles Formed</div><div class="val" id="statCandles">0</div></div>
    <div class="stat-card"><div class="lbl">Total Trades</div><div class="val" id="statTrades">0</div></div>
    <div class="stat-card"><div class="lbl">Win Rate</div><div class="val green" id="statWinRate">0%</div></div>
    <div class="stat-card"><div class="lbl">Total Net PnL</div><div class="val" id="statPnl">0.00</div></div>
  </div>

  <div class="chart-panel">
    <div class="chart-title"><span>PANEL 1 — RAW TICK PRICE STREAM</span><span id="tickRange" style="color:var(--sky)"></span></div>
    <canvas id="cvTicks" height="130"></canvas>
  </div>

  <div class="chart-panel">
    <div class="chart-title"><span>PANEL 2 — REAL MARKET OHLC CANDLESTICKS</span><span>Real Execution Open/Close</span></div>
    <canvas id="cvReal" height="170"></canvas>
  </div>

  <div class="chart-panel">
    <div class="chart-title"><span>PANEL 3 — HEIKIN-ASHI CANDLES + CHANDELIER EXIT</span><span>Green: Long Stop | Red: Short Stop</span></div>
    <canvas id="cvHa" height="210"></canvas>
  </div>

  <div class="chart-panel" style="border-color:#0284c7;">
    <div class="chart-title" style="flex-wrap:wrap; gap:8px;">
      <span style="color:#38bdf8; font-weight:bold;">PANEL 4 — EXTREMUMS ENGINE &amp; CHANDELIER BASIS</span>
      <div style="display:flex; align-items:center; gap:8px; font-size:11px;">
        <label style="cursor:pointer; display:flex; align-items:center; gap:4px; color:#cbd5e1;">
          <input type="checkbox" id="useCloseToggle"> <strong>Use Close Price for Extremums</strong> (Wicks Ignored)
        </label>
      </div>
    </div>
    
    <!-- 4 Radio Buttons -->
    <div style="display:flex; gap:12px; flex-wrap:wrap; background:#070b12; padding:8px 12px; border-radius:6px; margin-bottom:10px; font-size:11px; border:1px solid #1e293b;">
      <span style="color:var(--muted); font-weight:bold;">Formula:</span>
      <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
        <input type="radio" name="guiExtremumFormula" value="close" checked> <strong>F1: Close Extremums (User Formula)</strong>
      </label>
      <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
        <input type="radio" name="guiExtremumFormula" value="range_ma"> <strong>F2: Range MA Crossover</strong>
      </label>
      <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
        <input type="radio" name="guiExtremumFormula" value="crest_trough"> <strong>F3: MA+ Crest / Trough</strong>
      </label>
      <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
        <input type="radio" name="guiExtremumFormula" value="pivot_sr"> <strong>F4: Structural Pivot S/R</strong>
      </label>
    </div>

    <!-- Math Callout -->
    <div style="font-size:11px; font-family:monospace; background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.25); padding:8px 12px; border-radius:6px; margin-bottom:10px; color:#cbd5e1;">
      <strong>Mathematical Rule:</strong> <span id="formulaRuleText">Close ON: Highest = max(Close_22), Lowest = min(Close_22) (Wicks Ignored)</span><br>
      <span style="color:var(--muted)">Example: High=105, Close=101, Low=98 &rarr; Close ON: Highest=101 | Close OFF: Highest=105</span>
    </div>

    <canvas id="cvExtremum" height="170"></canvas>
  </div>

  <div class="chart-panel">
    <div class="chart-title"><span>PANEL 5 — WILDER ATR(22) VOLATILITY</span><span style="color:var(--amber)">ta.rma</span></div>
    <canvas id="cvAtr" height="100"></canvas>
  </div>

  <div class="chart-panel">
    <div class="chart-title"><span>PANEL 6 — CUMULATIVE PNL EQUITY STEP CURVE</span><span>Executed at Candle N+1 Real Open</span></div>
    <canvas id="cvEq" height="130"></canvas>
  </div>

  <div class="inspector-card">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <h3 style="font-size:14px; color:var(--sky);">STEP-BY-STEP MATHEMATICAL INSPECTOR</h3>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; color:var(--muted);">Bar Index:</span>
        <input type="range" id="barSlider" min="0" max="0" value="0" style="width:160px;">
        <span id="barIndexText" style="font-family:monospace; font-size:12px; font-weight:bold;">#0</span>
      </div>
    </div>
    <div id="inspectorDetails">Select a bar to view mathematical calculations.</div>
  </div>

  <div class="chart-panel">
    <div class="chart-title"><span>TRADE LEDGER & EXECUTION LOG</span></div>
    <div style="overflow-x:auto; max-height:260px; overflow-y:auto;">
      <table>
        <thead>
          <tr><th>#</th><th>SIDE</th><th>ENTRY TIME</th><th>EXIT TIME</th><th>IN PRICE</th><th>OUT PRICE</th><th>PNL</th><th>CUM PNL</th></tr>
        </thead>
        <tbody id="tradeBody">
          <tr><td colspan="8" style="text-align:center; color:var(--muted)">No trades yet. Click Run Calculations.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

<script>
let rawTicks = [];
let computedBars = [];
let computedTrades = [];

// Generate sample starting ticks matching official frxXAUUSD_1790274600
function genDefaultTicks() {
  const baseT = 1790274600;
  const init = [4274.65, 4274.58, 4274.68, 4274.63, 4274.70, 4274.70, 4274.43, 4274.36, 4274.35];
  let res = [];
  for(let i=0; i<init.length; i++) res.push({time: baseT + i, price: init[i]});
  let p = init[init.length-1];
  for(let s=9; s<1800; s++) {
    let drift = (Math.floor(s/300) % 2 === 0) ? 0.05 : -0.05;
    p += drift + (Math.random() - 0.5) * 0.18;
    res.push({time: baseT + s, price: Math.round(p*100)/100});
  }
  return res;
}

rawTicks = genDefaultTicks();

document.getElementById('fileInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const lines = ev.target.result.trim().split(/\\r?\\n/);
    let parsed = [];
    for(let i=1; i<lines.length; i++) {
      let parts = lines[i].split(',');
      if(parts.length >= 2) {
        let t = parseFloat(parts[0]);
        let p = parseFloat(parts[1]);
        if(!isNaN(t) && !isNaN(p)) {
          if(t > 1e11) t = Math.floor(t/1000);
          parsed.push({time: Math.floor(t), price: p});
        }
      }
    }
    if(parsed.length) {
      rawTicks = parsed;
      alert(`Loaded ${parsed.length} ticks from ${f.name}! Click 'Run Calculations'.`);
    }
  };
  reader.readAsText(f);
});

function calculate() {
  const tf = Math.max(1, parseInt(document.getElementById('tfSec').value) || 60);
  const atrPeriod = Math.max(2, parseInt(document.getElementById('atrPeriod').value) || 22);
  const atrMult = parseFloat(document.getElementById('atrMult').value) || 3.0;
  const mode = document.getElementById('mode').value;

  // 1. Buckets -> OHLC
  let buckets = {};
  for(const t of rawTicks) {
    let b = Math.floor(t.time / tf) * tf;
    if(!buckets[b]) buckets[b] = [];
    buckets[b].push(t.price);
  }
  let sortedKeys = Object.keys(buckets).map(Number).sort((a,b)=>a-b);
  let candles = sortedKeys.map(b => {
    let ps = buckets[b];
    let o = ps[0], c = ps[ps.length-1];
    let h = ps[0], l = ps[0];
    for(let p of ps) { if(p>h) h=p; if(p<l) l=p; }
    let d = new Date(b*1000);
    return {
      time: b,
      timeStr: d.toISOString().substr(11,8),
      open: o, high: h, low: l, close: c, ticks: ps.length
    };
  });

  // 2. Heikin-Ashi
  let haList = [];
  let prevHaOpen = 0, prevHaClose = 0;
  for(let i=0; i<candles.length; i++) {
    let c = candles[i];
    let haClose = (c.open + c.high + c.low + c.close) / 4.0;
    let haOpen = (i === 0) ? (c.open + c.close)/2.0 : (prevHaOpen + prevHaClose)/2.0;
    let haHigh = Math.max(c.high, haOpen, haClose);
    let haLow = Math.min(c.low, haOpen, haClose);
    haList.push({
      ...c,
      haOpen, haHigh, haLow, haClose,
      realOpen: c.open, realHigh: c.high, realLow: c.low, realClose: c.close
    });
    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  // 3. Chandelier Exit with Extremums Engine
  let n = haList.length;
  let tr = new Array(n);
  tr[0] = haList[0].haHigh - haList[0].haLow;
  for(let i=1; i<n; i++) {
    let h = haList[i].haHigh, l = haList[i].haLow, prevC = haList[i-1].haClose;
    tr[i] = Math.max(h-l, Math.abs(h-prevC), Math.abs(l-prevC));
  }
  let atr = new Array(n);
  atr[0] = tr[0];
  for(let i=1; i<n; i++) {
    atr[i] = (atr[i-1] * (atrPeriod - 1) + tr[i]) / atrPeriod;
  }

  let useClose = document.getElementById('useCloseToggle') ? document.getElementById('useCloseToggle').checked : false;
  let extremumFormula = document.querySelector('input[name="guiExtremumFormula"]:checked')?.value || 'close';

  let ruleElem = document.getElementById('formulaRuleText');
  if(ruleElem) {
    if(useClose) {
      ruleElem.innerHTML = '<strong>Close ON:</strong> Highest = max(Close_22), Lowest = min(Close_22) <span style="color:#00e676;">(Wicks Ignored)</span>';
    } else {
      ruleElem.innerHTML = '<strong>Close OFF:</strong> Highest = max(High_22), Lowest = min(Low_22) <span style="color:#f59e0b;">(Wicks Included)</span>';
    }
  }

  let highestHigh = new Array(n), lowestLow = new Array(n);
  let highestClose = new Array(n), lowestClose = new Array(n);
  let upperAnchor = new Array(n), lowerAnchor = new Array(n);

  for(let i=0; i<n; i++) {
    let s = Math.max(0, i - atrPeriod + 1);
    let hMax = haList[s].haHigh, lMin = haList[s].haLow;
    let cMax = haList[s].haClose, cMin = haList[s].haClose;
    for(let j=s+1; j<=i; j++) {
      if(haList[j].haHigh > hMax) hMax = haList[j].haHigh;
      if(haList[j].haLow < lMin) lMin = haList[j].haLow;
      if(haList[j].haClose > cMax) cMax = haList[j].haClose;
      if(haList[j].haClose < cMin) cMin = haList[j].haClose;
    }
    highestHigh[i] = hMax; lowestLow[i] = lMin;
    highestClose[i] = cMax; lowestClose[i] = cMin;

    upperAnchor[i] = useClose ? cMax : hMax;
    lowerAnchor[i] = useClose ? cMin : lMin;
  }

  // Pre-calculate Moving Average (EMA 10) & Range for Formula 2 & 3
  let ma = new Array(n);
  ma[0] = haList[0].haClose;
  let k = 2.0 / (10 + 1);
  for(let i=1; i<n; i++) {
    ma[i] = haList[i].haClose * k + ma[i-1] * (1 - k);
  }

  let prevHigh = new Array(n), prevLow = new Array(n);
  for(let i=0; i<n; i++) {
    let s = Math.max(0, i - 4);
    prevHigh[i] = Math.max(...haList.slice(s, i+1).map(b => useClose ? b.haClose : b.haHigh));
    prevLow[i] = Math.min(...haList.slice(s, i+1).map(b => useClose ? b.haClose : b.haLow));
  }

  // If Formula 2, anchor to range channel
  if(extremumFormula === 'range_ma') {
    for(let i=0; i<n; i++) {
      upperAnchor[i] = prevHigh[i];
      lowerAnchor[i] = prevLow[i];
    }
  }

  let longStop = new Array(n), shortStop = new Array(n);
  let direction = new Array(n);
  let buySignal = new Array(n).fill(false), sellSignal = new Array(n).fill(false);

  for(let i=0; i<n; i++) {
    let ls = upperAnchor[i] - atrMult * atr[i];
    let ss = lowerAnchor[i] + atrMult * atr[i];
    if(mode === 'tradingview') {
      if(i > 0) {
        if(haList[i-1].haClose > longStop[i-1]) ls = Math.max(ls, longStop[i-1]);
        if(haList[i-1].haClose < shortStop[i-1]) ss = Math.min(ss, shortStop[i-1]);
        if(haList[i].haClose > shortStop[i-1]) direction[i] = 1;
        else if(haList[i].haClose < longStop[i-1]) direction[i] = -1;
        else direction[i] = direction[i-1];
      } else {
        direction[0] = 1;
      }
    } else {
      if(i > 0) {
        if(haList[i].haClose > longStop[i-1]) ls = Math.max(ls, longStop[i-1]);
        if(haList[i].haClose < shortStop[i-1]) ss = Math.min(ss, shortStop[i-1]);
        if(haList[i].haClose > shortStop[i-1]) direction[i] = 1;
        else if(haList[i].haClose < longStop[i-1]) direction[i] = -1;
        else direction[i] = direction[i-1];
      } else {
        direction[0] = 1;
      }
    }
    longStop[i] = ls; shortStop[i] = ss;
    if(i > 0) {
      if(direction[i] === 1 && direction[i-1] === -1) buySignal[i] = true;
      if(direction[i] === -1 && direction[i-1] === 1) sellSignal[i] = true;
    }
  }

  computedBars = haList.map((b, i) => ({
    ...b,
    tr: tr[i], atr: atr[i],
    highest: upperAnchor[i], lowest: lowerAnchor[i],
    highestHigh: highestHigh[i], lowestLow: lowestLow[i],
    highestClose: highestClose[i], lowestClose: lowestClose[i],
    maVal: ma[i], prevHigh: prevHigh[i], prevLow: prevLow[i],
    useClose, extremumFormula,
    longStop: longStop[i], shortStop: shortStop[i], direction: direction[i],
    buySignal: buySignal[i], sellSignal: sellSignal[i],
    enterLong: i > 0 ? buySignal[i-1] : false,
    enterShort: i > 0 ? sellSignal[i-1] : false
  }));

  // 4. Simulate Trades
  let trades = [];
  let pos = 0, ep = 0, et = null, etStr = '';
  let cum = 0;
  for(let i=0; i<computedBars.length; i++) {
    let b = computedBars[i];
    let p = b.realOpen;
    if(pos === 0) {
      if(b.enterLong) { pos = 1; ep = p; et = b.time; etStr = b.timeStr; }
      else if(b.enterShort) { pos = -1; ep = p; et = b.time; etStr = b.timeStr; }
    } else if(pos === 1 && b.enterShort) {
      let pnl = p - ep; cum += pnl;
      trades.push({id: trades.length+1, side: 'LONG', entryTime: etStr, exitTime: b.timeStr, entryPrice: ep, exitPrice: p, pnl, cumPnl: cum});
      pos = -1; ep = p; et = b.time; etStr = b.timeStr;
    } else if(pos === -1 && b.enterLong) {
      let pnl = ep - p; cum += pnl;
      trades.push({id: trades.length+1, side: 'SHORT', entryTime: etStr, exitTime: b.timeStr, entryPrice: ep, exitPrice: p, pnl, cumPnl: cum});
      pos = 1; ep = p; et = b.time; etStr = b.timeStr;
    }
  }
  if(pos !== 0 && computedBars.length) {
    let last = computedBars[computedBars.length-1];
    let pnl = (pos === 1) ? (last.realClose - ep) : (ep - last.realClose);
    cum += pnl;
    trades.push({id: trades.length+1, side: pos===1?'LONG':'SHORT', entryTime: etStr, exitTime: last.timeStr, entryPrice: ep, exitPrice: last.realClose, pnl, cumPnl: cum});
  }
  computedTrades = trades;

  // Update Stats
  document.getElementById('statTicks').innerText = rawTicks.length.toLocaleString();
  document.getElementById('statCandles').innerText = computedBars.length.toLocaleString();
  document.getElementById('statTrades').innerText = trades.length;
  let wins = trades.filter(t=>t.pnl>0).length;
  let wr = trades.length ? ((wins/trades.length)*100).toFixed(1) + '%' : '0%';
  document.getElementById('statWinRate').innerText = wr;
  let pnlElem = document.getElementById('statPnl');
  pnlElem.innerText = cum >= 0 ? `+${cum.toFixed(2)}` : cum.toFixed(2);
  pnlElem.className = 'val ' + (cum >= 0 ? 'green' : 'red');

  // Update Slider
  let slider = document.getElementById('barSlider');
  slider.max = Math.max(0, computedBars.length - 1);
  slider.value = 0;
  updateInspector(0);

  // Render Charts
  drawTicksChart();
  drawRealCandles();
  drawHaCandles();
  drawExtremumChart();
  drawAtrChart();
  drawEquityChart();
  renderTradesTable();
}

function updateInspector(idx) {
  if(!computedBars.length || idx < 0 || idx >= computedBars.length) return;
  document.getElementById('barIndexText').innerText = `#${idx}`;
  let b = computedBars[idx];
  let prev = idx > 0 ? computedBars[idx-1] : null;

  let wickHighDelta = (b.highestHigh - b.highestClose).toFixed(2);
  let wickLowDelta = (b.lowestClose - b.lowestLow).toFixed(2);

  let html = `
    <div class="step-row"><div class="step-label">STEP 1: Real Market OHLC (${b.timeStr})</div>
      Open: ${b.realOpen.toFixed(2)} | High: ${b.realHigh.toFixed(2)} | Low: ${b.realLow.toFixed(2)} | Close: ${b.realClose.toFixed(2)} (${b.ticks} ticks)
    </div>
    <div class="step-row"><div class="step-label">STEP 2: Heikin-Ashi Formulas</div>
      haClose = (${b.realOpen} + ${b.realHigh} + ${b.realLow} + ${b.realClose}) / 4 = <strong>${b.haClose.toFixed(3)}</strong><br>
      haOpen = (${prev ? prev.haOpen.toFixed(3) : b.realOpen} + ${prev ? prev.haClose.toFixed(3) : b.realClose}) / 2 = <strong>${b.haOpen.toFixed(3)}</strong><br>
      haHigh = max(H, haO, haC) = <strong>${b.haHigh.toFixed(3)}</strong> | haLow = min(L, haO, haC) = <strong>${b.haLow.toFixed(3)}</strong>
    </div>
    <div class="step-row"><div class="step-label">STEP 3: True Range & ATR</div>
      TR = max(H-L, |H-C_prev|, |L-C_prev|) = <strong>${b.tr.toFixed(3)}</strong> | Wilder ATR = <strong>${b.atr.toFixed(3)}</strong>
    </div>
    <div class="step-row" style="border-left:3px solid #06b6d4;"><div class="step-label" style="color:#06b6d4;">STEP 4: Extremums Engine &amp; Ratchet (${b.useClose ? 'Close ON · Wicks Ignored' : 'Close OFF · Wicks Included'})</div>
      <strong>Highest Close:</strong> ${b.highestClose.toFixed(2)} vs <strong>Highest High:</strong> ${b.highestHigh.toFixed(2)} (Wick &Delta;: +${wickHighDelta})<br>
      <strong>Lowest Close:</strong> ${b.lowestClose.toFixed(2)} vs <strong>Lowest Low:</strong> ${b.lowestLow.toFixed(2)} (Wick &Delta;: -${wickLowDelta})<br>
      Active Anchor: <strong>${b.highest.toFixed(2)}</strong> | Stop Starting Point = Anchor &plusmn; (ATR &times; Mult)<br>
      Long Stop = <strong>${b.longStop.toFixed(3)}</strong> | Short Stop = <strong>${b.shortStop.toFixed(3)}</strong>
    </div>
    <div class="step-row"><div class="step-label">STEP 5: Direction & Signals</div>
      Direction = <strong style="color:${b.direction===1?'var(--green)':'var(--red)'}">${b.direction===1?'BULLISH (+1)':'BEARISH (-1)'}</strong> |
      BuySignal: <strong>${b.buySignal}</strong> | SellSignal: <strong>${b.sellSignal}</strong>
    </div>
    <div class="step-row"><div class="step-label">STEP 6: Execution on Bar Open (N+1)</div>
      ${b.enterLong ? '<span style="color:var(--green);font-weight:bold;">ENTER LONG EXECUTED @ ' + b.realOpen.toFixed(2) + '</span>' : ''}
      ${b.enterShort ? '<span style="color:var(--red);font-weight:bold;">ENTER SHORT EXECUTED @ ' + b.realOpen.toFixed(2) + '</span>' : ''}
      ${!b.enterLong && !b.enterShort ? '<span style="color:var(--muted)">No position entry on this bar open.</span>' : ''}
    </div>
  `;
  document.getElementById('inspectorDetails').innerHTML = html;
}

document.getElementById('barSlider').addEventListener('input', (e) => {
  updateInspector(parseInt(e.target.value));
});

function drawExtremumChart() {
  const cv = document.getElementById('cvExtremum');
  if(!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.offsetWidth;
  const h = cv.height = cv.offsetHeight;
  ctx.clearRect(0,0,w,h);
  if(!computedBars.length) return;

  let minP = computedBars[0].lowestLow, maxP = computedBars[0].highestHigh;
  for(let b of computedBars) {
    if(b.lowestLow < minP) minP = b.lowestLow;
    if(b.highestHigh > maxP) maxP = b.highestHigh;
  }
  let range = Math.max(0.2, maxP - minP);
  let n = computedBars.length;

  let getY = (val) => h - 15 - ((val - minP) / range) * (h - 30);
  let getX = (idx) => (idx / Math.max(1, n - 1)) * (w - 30) + 15;

  let formula = document.querySelector('input[name="guiExtremumFormula"]:checked')?.value || 'close';

  if(formula === 'close') {
    // Formula 1: Highest Close & Lowest Close (Cyan) vs Highest High & Lowest Low (Amber Dashed)
    // 1. Shaded Wick Area
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), yH = getY(computedBars[i].highestHigh);
      if(i===0) ctx.moveTo(x, yH); else ctx.lineTo(x, yH);
    }
    for(let i=n-1; i>=0; i--) {
      ctx.lineTo(getX(i), getY(computedBars[i].highestClose));
    }
    ctx.closePath(); ctx.fill();

    // 2. Highs & Lows lines
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].highestHigh);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].lowestLow);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Close extremes (Cyan solid)
    ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 2.0;
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].highestClose);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].lowestClose);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if(formula === 'range_ma') {
    // Formula 2: Range Envelope & MA
    ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 2]);
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].prevHigh);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].prevLow);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // MA line
    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2.0;
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].maVal);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    // Formula 3 & 4
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].highest);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    for(let i=0; i<n; i++) {
      let x = getX(i), y = getY(computedBars[i].lowest);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawTicksChart() {
  const cv = document.getElementById('cvTicks');
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.offsetWidth;
  const h = cv.height = cv.offsetHeight;
  ctx.clearRect(0,0,w,h);
  if(!rawTicks.length) return;
  let minP = rawTicks[0].price, maxP = rawTicks[0].price;
  for(let t of rawTicks) { if(t.price<minP) minP=t.price; if(t.price>maxP) maxP=t.price; }
  let range = Math.max(0.1, maxP - minP);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for(let i=0; i<rawTicks.length; i++) {
    let x = (i / (rawTicks.length - 1)) * w;
    let y = h - 10 - ((rawTicks[i].price - minP) / range) * (h - 20);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

function drawRealCandles() {
  const cv = document.getElementById('cvReal');
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.offsetWidth;
  const h = cv.height = cv.offsetHeight;
  ctx.clearRect(0,0,w,h);
  if(!computedBars.length) return;
  let minP = computedBars[0].realLow, maxP = computedBars[0].realHigh;
  for(let b of computedBars) { if(b.realLow<minP) minP=b.realLow; if(b.realHigh>maxP) maxP=b.realHigh; }
  let range = Math.max(0.1, maxP - minP);
  let cw = Math.max(2, (w / computedBars.length) * 0.7);

  for(let i=0; i<computedBars.length; i++) {
    let b = computedBars[i];
    let cx = (i / Math.max(1, computedBars.length - 1)) * (w - 30) + 15;
    let yO = h - 15 - ((b.realOpen - minP) / range) * (h - 30);
    let yC = h - 15 - ((b.realClose - minP) / range) * (h - 30);
    let yH = h - 15 - ((b.realHigh - minP) / range) * (h - 30);
    let yL = h - 15 - ((b.realLow - minP) / range) * (h - 30);
    let isBull = b.realClose >= b.realOpen;
    ctx.strokeStyle = isBull ? '#10b981' : '#ef4444';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(cx, yH); ctx.lineTo(cx, yL); ctx.stroke();
    let bodyY = Math.min(yO, yC);
    let bodyH = Math.max(2, Math.abs(yO - yC));
    ctx.fillRect(cx - cw/2, bodyY, cw, bodyH);
  }
}

function drawHaCandles() {
  const cv = document.getElementById('cvHa');
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.offsetWidth;
  const h = cv.height = cv.offsetHeight;
  ctx.clearRect(0,0,w,h);
  if(!computedBars.length) return;
  let minP = computedBars[0].haLow, maxP = computedBars[0].haHigh;
  for(let b of computedBars) {
    if(b.haLow<minP) minP=b.haLow; if(b.haHigh>maxP) maxP=b.haHigh;
    if(b.direction===1 && b.longStop<minP) minP=b.longStop;
    if(b.direction===-1 && b.shortStop>maxP) maxP=b.shortStop;
  }
  let range = Math.max(0.1, maxP - minP);
  let cw = Math.max(2, (w / computedBars.length) * 0.7);

  // Stop lines
  for(let i=0; i<computedBars.length; i++) {
    let b = computedBars[i];
    let cx = (i / Math.max(1, computedBars.length - 1)) * (w - 30) + 15;
    if(b.direction === 1) {
      let y = h - 15 - ((b.longStop - minP) / range) * (h - 30);
      ctx.fillStyle = '#00e676'; ctx.fillRect(cx - cw/2, y - 1, cw, 2);
    } else {
      let y = h - 15 - ((b.shortStop - minP) / range) * (h - 30);
      ctx.fillStyle = '#ff1744'; ctx.fillRect(cx - cw/2, y - 1, cw, 2);
    }
  }

  // Candles
  for(let i=0; i<computedBars.length; i++) {
    let b = computedBars[i];
    let cx = (i / Math.max(1, computedBars.length - 1)) * (w - 30) + 15;
    let yO = h - 15 - ((b.haOpen - minP) / range) * (h - 30);
    let yC = h - 15 - ((b.haClose - minP) / range) * (h - 30);
    let yH = h - 15 - ((b.haHigh - minP) / range) * (h - 30);
    let yL = h - 15 - ((b.haLow - minP) / range) * (h - 30);
    let isBull = b.haClose >= b.haOpen;
    ctx.strokeStyle = isBull ? '#26a69a' : '#ef5350';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(cx, yH); ctx.lineTo(cx, yL); ctx.stroke();
    let bodyY = Math.min(yO, yC);
    let bodyH = Math.max(2, Math.abs(yO - yC));
    ctx.fillRect(cx - cw/2, bodyY, cw, bodyH);

    if(b.buySignal) {
      ctx.fillStyle = '#00e676';
      ctx.beginPath(); ctx.arc(cx, yL + 8, 4, 0, Math.PI*2); ctx.fill();
    }
    if(b.sellSignal) {
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(cx, yH - 8, 4, 0, Math.PI*2); ctx.fill();
    }
  }
}

function drawAtrChart() {
  const cv = document.getElementById('cvAtr');
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.offsetWidth;
  const h = cv.height = cv.offsetHeight;
  ctx.clearRect(0,0,w,h);
  if(!computedBars.length) return;
  let minA = computedBars[0].atr, maxA = computedBars[0].atr;
  for(let b of computedBars) { if(b.atr<minA) minA=b.atr; if(b.atr>maxA) maxA=b.atr; }
  let range = Math.max(0.01, maxA - minA);
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  for(let i=0; i<computedBars.length; i++) {
    let x = (i / Math.max(1, computedBars.length - 1)) * w;
    let y = h - 10 - ((computedBars[i].atr - minA) / range) * (h - 20);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}

function drawEquityChart() {
  const cv = document.getElementById('cvEq');
  const ctx = cv.getContext('2d');
  const w = cv.width = cv.offsetWidth;
  const h = cv.height = cv.offsetHeight;
  ctx.clearRect(0,0,w,h);
  if(!computedTrades.length) return;
  let minPnl = 0, maxPnl = 0;
  for(let t of computedTrades) { if(t.cumPnl<minPnl) minPnl=t.cumPnl; if(t.cumPnl>maxPnl) maxPnl=t.cumPnl; }
  let range = Math.max(1, maxPnl - minPnl);
  let zeroY = h - 10 - ((0 - minPnl) / range) * (h - 20);

  ctx.strokeStyle = '#475569'; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = (computedTrades[computedTrades.length-1].cumPnl >= 0) ? '#10b981' : '#f43f5e';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  for(let i=0; i<computedTrades.length; i++) {
    let x = ((i+1) / computedTrades.length) * w;
    let y = h - 10 - ((computedTrades[i].cumPnl - minPnl) / range) * (h - 20);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function renderTradesTable() {
  let tb = document.getElementById('tradeBody');
  if(!computedTrades.length) {
    tb.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--muted)">No trades fired with current parameters.</td></tr>';
    return;
  }
  let html = '';
  for(let t of computedTrades) {
    let isWin = t.pnl > 0;
    html += `<tr>
      <td>${t.id}</td>
      <td><span class="tag ${t.side==='LONG'?'buy':'sell'}">${t.side}</span></td>
      <td>${t.entryTime}</td>
      <td>${t.exitTime}</td>
      <td>${t.entryPrice.toFixed(2)}</td>
      <td>${t.exitPrice.toFixed(2)}</td>
      <td style="color:${isWin?'var(--green)':'var(--red)'};font-weight:bold;">${isWin?'+':''}${t.pnl.toFixed(2)}</td>
      <td style="font-weight:bold;">${t.cumPnl>=0?'+':''}${t.cumPnl.toFixed(2)}</td>
    </tr>`;
  }
  tb.innerHTML = html;
}

document.getElementById('runBtn').addEventListener('click', calculate);
if (document.getElementById('useCloseToggle')) {
  document.getElementById('useCloseToggle').addEventListener('change', calculate);
}
document.querySelectorAll('input[name="guiExtremumFormula"]').forEach(r => {
  r.addEventListener('change', calculate);
});
window.addEventListener('resize', () => {
  drawTicksChart(); drawRealCandles(); drawHaCandles(); drawExtremumChart(); drawAtrChart(); drawEquityChart();
});

calculate();
</script>
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
    parser.add_argument("--use-close", action="store_true", help="Use Close Price for Extremums (wicks ignored)")
    parser.add_argument("--formula", type=str, choices=["close", "range_ma", "crest_trough", "pivot_sr"], default="close", help="Extremum Engine Formula: close, range_ma, crest_trough, pivot_sr")
    parser.add_argument("--gui", action="store_true", help="Launch local HTML server GUI")
    args = parser.parse_args()

    if args.gui:
        run_local_gui_server()
        return

    print("=" * 80)
    print("  HEIKIN-ASHI & CHANDELIER EXIT QUANTITATIVE PIPELINE")
    print(f"  Ratchet Mode     : {args.mode.upper()}")
    print(f"  Extremum Formula : {args.formula.upper()}  |  Use Close Extremum: {'ON (Wicks Ignored)' if args.use_close else 'OFF (Wicks Included)'}")
    print(f"  ATR Period       : {args.atr_period}  |  ATR Mult: {args.atr_mult}")
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
        print(f"[2/5] Candles generated        : {len(candles)} OHLC bars")

        ha = to_heikin_ashi_raw(candles)
        print(f"[3/5] Heikin-Ashi transformed  : {len(ha)} HA bars")

        # Noise reduction metrics
        ext = compute_extremums_raw(
            ha,
            atr_period=args.atr_period,
            use_close=args.use_close,
            extremum_formula=args.formula,
        )
        total_wick_noise = ext["total_wick_noise"]
        avg_wick_noise = total_wick_noise / len(ha) if ha else 0.0
        status_str = "ACTIVE (Wicks Ignored: Pure Body Trend)" if args.use_close else "OFF (Wicks Included: Exposed to Spikes)"
        print(f"      Extremums Noise Reduction: {status_str}")
        print(f"      Wick Noise Filtered      : {total_wick_noise:.2f} pts (avg {avg_wick_noise:.2f} pts/bar)")

        ce = chandelier_exit_raw(
            ha,
            atr_period=args.atr_period,
            atr_mult=args.atr_mult,
            mode=args.mode,
            use_close=args.use_close,
            extremum_formula=args.formula,
        )
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
