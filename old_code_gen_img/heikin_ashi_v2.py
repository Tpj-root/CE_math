#!/usr/bin/env python3
"""
================================================================================
 HEIKIN-ASHI  →  CHANDELIER EXIT  →  NEXT-CANDLE EXECUTION  →  BACKTEST PLOTS
================================================================================
 Every Chandelier Exit value is computed from Heikin-Ashi candles ONLY.
 All charts are rendered as independent figures (no subplots stacked together).
================================================================================
"""

import os
import sys
import numpy as np
import pandas as pd
import matplotlib

if not os.environ.get("DISPLAY"):
    matplotlib.use("Agg")

import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.patches import Rectangle


# ============================================================================
#  CONFIG
# ============================================================================
CSV_FILE        = "frxXAUUSD_1790274600.csv"
TIMEFRAMES      = [60, 300]        # 1 min, 5 min
ATR_PERIOD      = 22
ATR_MULTIPLIER  = 3.0
SYMBOL          = "frxXAUUSD"

PLOT_TICKS      = "plot_1_ticks.png"
PLOT_EQUITY     = "plot_4_equity.png"
PLOT_TF_PATTERN = "plot_2_{tf}_HA_Chandelier.png"
MAX_TICKS_PLOT  = 30000


# ============================================================================
#  STEP 1 — LOAD TICKS
# ============================================================================
def load_ticks(csv_path: str) -> pd.DataFrame:
    if not os.path.exists(csv_path):
        sys.exit(f"ERROR: CSV not found → {csv_path}")

    df = pd.read_csv(csv_path)
    df.columns = [c.strip().lower() for c in df.columns]
    if not {"times", "prices"}.issubset(df.columns):
        sys.exit("ERROR: CSV must contain columns: times,prices")

    df = df[["times", "prices"]].copy()
    df["times"]  = pd.to_numeric(df["times"],  errors="coerce")
    df["prices"] = pd.to_numeric(df["prices"], errors="coerce")
    df = df.dropna().astype({"times": np.int64, "prices": float})
    df = df.drop_duplicates("times").sort_values("times").reset_index(drop=True)
    return df


# ============================================================================
#  STEP 2 — TICKS → OHLC CANDLES
# ============================================================================
def ticks_to_candles(ticks: pd.DataFrame, seconds: int) -> pd.DataFrame:
    t = ticks.copy()
    t["bucket"] = (t["times"] // seconds) * seconds

    g = t.groupby("bucket")["prices"]
    candles = pd.DataFrame({
        "open":  g.first(),
        "high":  g.max(),
        "low":   g.min(),
        "close": g.last(),
        "ticks": g.size(),
    })
    candles.index = pd.to_datetime(candles.index, unit="s", utc=True)
    candles.index.name = "time"
    return candles


# ============================================================================
#  STEP 3 — OHLC CANDLES → HEIKIN-ASHI CANDLES
# ----------------------------------------------------------------------------
#   ha_close = (open + high + low + close) / 4
#   ha_open[0] = (open[0] + close[0]) / 2
#   ha_open[i] = (ha_open[i-1] + ha_close[i-1]) / 2
#   ha_high = max(high, ha_open, ha_close)
#   ha_low  = min(low,  ha_open, ha_close)
# ============================================================================
def candles_to_heikin_ashi(candles: pd.DataFrame) -> pd.DataFrame:
    n = len(candles)
    if n == 0:
        return pd.DataFrame(columns=[
            "ha_open", "ha_high", "ha_low", "ha_close",
            "real_open", "real_high", "real_low", "real_close", "ticks",
        ])

    o = candles["open"].to_numpy(dtype=float)
    h = candles["high"].to_numpy(dtype=float)
    l = candles["low"].to_numpy(dtype=float)
    c = candles["close"].to_numpy(dtype=float)

    ha_close = (o + h + l + c) / 4.0

    ha_open = np.empty(n, dtype=float)
    ha_open[0] = (o[0] + c[0]) / 2.0
    for i in range(1, n):
        ha_open[i] = (ha_open[i - 1] + ha_close[i - 1]) / 2.0

    ha_high = np.maximum.reduce([h, ha_open, ha_close])
    ha_low  = np.minimum.reduce([l, ha_open, ha_close])

    return pd.DataFrame(
        {
            "ha_open":    ha_open,
            "ha_high":    ha_high,
            "ha_low":     ha_low,
            "ha_close":   ha_close,
            "real_open":  o,
            "real_high":  h,
            "real_low":   l,
            "real_close": c,
            "ticks":      candles["ticks"].to_numpy(),
        },
        index=candles.index,
    )


# ============================================================================
#  STEP 4 — CHANDELIER EXIT  (computed from HEIKIN-ASHI candles ONLY)
# ----------------------------------------------------------------------------
#   TR  = max(ha_high - ha_low,
#             |ha_high - ha_close_prev|,
#             |ha_low  - ha_close_prev|)
#
#   ATR = Wilder's smoothing of TR
#
#   LongStop  = HighestHAHigh(period)  - ATR_mult * ATR
#   ShortStop = LowestHALow(period)    + ATR_mult * ATR
#
#   Ratcheting:  LongStop only moves up while price stays above it
#                ShortStop only moves down while price stays below it
#
#   Direction = +1 when ha_close > previous ShortStop
#             = -1 when ha_close < previous LongStop
#             = carry previous direction otherwise
# ============================================================================
def heikin_ashi_chandelier_exit(ha: pd.DataFrame,
                                atr_period: int = 22,
                                atr_multiplier: float = 3.0) -> pd.DataFrame:
    df = ha.copy()
    n  = len(df)
    if n == 0:
        for col in ("HA_TR", "HA_ATR", "HA_HighestHigh", "HA_LowestLow",
                    "LongStop", "ShortStop", "Direction",
                    "BuySignal", "SellSignal"):
            df[col] = []
        return df

    ha_high  = df["ha_high"].to_numpy(dtype=float)
    ha_low   = df["ha_low"].to_numpy(dtype=float)
    ha_close = df["ha_close"].to_numpy(dtype=float)

    # --- True Range from HA prices -----------------------------------------
    tr = np.empty(n, dtype=float)
    tr[0] = ha_high[0] - ha_low[0]
    for i in range(1, n):
        tr[i] = max(
            ha_high[i] - ha_low[i],
            abs(ha_high[i] - ha_close[i - 1]),
            abs(ha_low[i]  - ha_close[i - 1]),
        )

    # --- Wilder's ATR -------------------------------------------------------
    atr = np.full(n, np.nan)
    if n >= atr_period:
        atr[atr_period - 1] = tr[:atr_period].mean()
        for i in range(atr_period, n):
            atr[i] = (atr[i - 1] * (atr_period - 1) + tr[i]) / atr_period

    # --- Rolling HA extremes -----------------------------------------------
    highest = np.full(n, np.nan)
    lowest  = np.full(n, np.nan)
    for i in range(atr_period - 1, n):
        highest[i] = ha_high[i - atr_period + 1: i + 1].max()
        lowest[i]  = ha_low[i  - atr_period + 1: i + 1].min()

    # --- Ratcheting stops ---------------------------------------------------
    long_stop  = np.full(n, np.nan)
    short_stop = np.full(n, np.nan)
    direction  = np.zeros(n, dtype=int)

    for i in range(n):
        if np.isnan(atr[i]):
            continue

        ls = highest[i] - atr_multiplier * atr[i]
        ss = lowest[i]  + atr_multiplier * atr[i]

        if i > 0 and not np.isnan(long_stop[i - 1]) and ha_close[i] > long_stop[i - 1]:
            ls = max(ls, long_stop[i - 1])
        if i > 0 and not np.isnan(short_stop[i - 1]) and ha_close[i] < short_stop[i - 1]:
            ss = min(ss, short_stop[i - 1])

        long_stop[i]  = ls
        short_stop[i] = ss

        if i == 0 or np.isnan(long_stop[i - 1]) or np.isnan(short_stop[i - 1]):
            direction[i] = 1
        elif ha_close[i] > short_stop[i - 1]:
            direction[i] = 1
        elif ha_close[i] < long_stop[i - 1]:
            direction[i] = -1
        else:
            direction[i] = direction[i - 1]

    # --- Signal detection ---------------------------------------------------
    buy  = np.zeros(n, dtype=bool)
    sell = np.zeros(n, dtype=bool)
    for i in range(1, n):
        if direction[i] == 1 and direction[i - 1] == -1:
            buy[i] = True
        elif direction[i] == -1 and direction[i - 1] == 1:
            sell[i] = True

    df["HA_TR"]         = tr
    df["HA_ATR"]        = atr
    df["HA_HighestHigh"] = highest
    df["HA_LowestLow"]   = lowest
    df["LongStop"]      = long_stop
    df["ShortStop"]     = short_stop
    df["Direction"]     = direction
    df["BuySignal"]     = buy
    df["SellSignal"]    = sell
    return df


# ============================================================================
#  STEP 5 — NEXT-CANDLE EXECUTION RULE
# ----------------------------------------------------------------------------
#   Signal fires on close of candle N → we enter at OPEN of candle N+1.
# ============================================================================
def apply_next_candle_rule(ce: pd.DataFrame) -> pd.DataFrame:
    df = ce.copy()
    df["EnterLong"]  = df["BuySignal"].shift(1).fillna(False).astype(bool)
    df["EnterShort"] = df["SellSignal"].shift(1).fillna(False).astype(bool)
    return df


# ============================================================================
#  STEP 6 — TRADE SIMULATION
# ============================================================================
def simulate_trades(df: pd.DataFrame) -> pd.DataFrame:
    trades = []
    position, entry_price, entry_time = 0, np.nan, None

    opens  = df["real_open"].to_numpy(dtype=float)
    closes = df["real_close"].to_numpy(dtype=float)
    times  = df.index
    el     = df["EnterLong"].to_numpy()
    es     = df["EnterShort"].to_numpy()

    for i in range(len(df)):
        t, p = times[i], opens[i]
        if position == 0:
            if el[i]:
                position, entry_price, entry_time = 1, p, t
            elif es[i]:
                position, entry_price, entry_time = -1, p, t
        elif position == 1 and es[i]:
            trades.append(_mk_trade(times, entry_time, t, "LONG",
                                    entry_price, p, p - entry_price))
            position, entry_price, entry_time = -1, p, t
        elif position == -1 and el[i]:
            trades.append(_mk_trade(times, entry_time, t, "SHORT",
                                    entry_price, p, entry_price - p))
            position, entry_price, entry_time = 1, p, t

    if position != 0 and len(df):
        t, p = times[-1], closes[-1]
        pnl = (p - entry_price) if position == 1 else (entry_price - p)
        trades.append(_mk_trade(times, entry_time, t,
                                "LONG" if position == 1 else "SHORT",
                                entry_price, p, pnl))

    td = pd.DataFrame(trades)
    if not td.empty:
        td["cum_pnl"] = td["pnl"].cumsum()
    return td


def _mk_trade(times, t_entry, t_exit, side, ep, xp, pnl):
    return {
        "entry_time":  t_entry,
        "exit_time":   t_exit,
        "side":        side,
        "entry_price": round(ep, 5),
        "exit_price":  round(xp, 5),
        "pnl":         round(pnl, 5),
    }


# ============================================================================
#  STEP 7 — TERMINAL REPORT
# ============================================================================
def report_trades(label, trades, candles):
    print("\n" + "=" * 100)
    print(f"  TRADE LOG — Timeframe {label}")
    print("=" * 100)

    if trades.empty:
        print("  No trades generated.")
        return

    wins   = trades[trades["pnl"] > 0]
    losses = trades[trades["pnl"] < 0]
    flats  = trades[trades["pnl"] == 0]

    print(f"{'#':>4} {'SIDE':<6} {'ENTRY':<21} {'EXIT':<21} "
          f"{'IN':>9} {'OUT':>9} {'PnL':>10} {'CUM':>10}")
    print("-" * 100)
    for i, r in trades.reset_index(drop=True).iterrows():
        print(f"{i+1:>4} {r['side']:<6} "
              f"{r['entry_time'].strftime('%Y-%m-%d %H:%M:%S'):<21} "
              f"{r['exit_time'].strftime('%Y-%m-%d %H:%M:%S'):<21} "
              f"{r['entry_price']:>9.3f} {r['exit_price']:>9.3f} "
              f"{r['pnl']:>+10.3f} {r['cum_pnl']:>+10.3f}")

    print("-" * 100)
    print(f"  Candles       : {len(candles):,}")
    print(f"  Trades        : {len(trades):,}")
    print(f"  Wins          : {len(wins):,}")
    print(f"  Losses        : {len(losses):,}")
    print(f"  Flats         : {len(flats):,}")
    if len(trades):
        print(f"  Win rate      : {len(wins)/len(trades)*100:.2f}%")
    print(f"  Total PnL     : {trades['pnl'].sum():+.5f}")
    print(f"  Avg PnL/trade : {trades['pnl'].mean():+.5f}")
    print(f"  Best trade    : {trades['pnl'].max():+.5f}")
    print(f"  Worst trade   : {trades['pnl'].min():+.5f}")
    peak = trades['cum_pnl'].cummax()
    print(f"  Max drawdown  : {(trades['cum_pnl'] - peak).min():+.5f}")


# ============================================================================
#  PLOT HELPERS
# ============================================================================
def _candle_patch(ax, x, w, o, h, l, c, up_color="#26a69a", dn_color="#ef5350"):
    color = up_color if c >= o else dn_color
    ax.plot([x, x], [l, h], color=color, linewidth=0.7,
            solid_capstyle="butt", zorder=3)
    bottom = min(o, c)
    height = max(abs(c - o), 1e-6)
    ax.add_patch(Rectangle((x - w / 2, bottom), w, height,
                           facecolor=color, edgecolor=color,
                           linewidth=0.4, zorder=4))


def _draw_ha_candles(ax, ha, seconds):
    w_days = seconds / 86400.0
    for ts, row in ha.iterrows():
        x = mdates.date2num(ts)
        _candle_patch(ax, x, w_days,
                      row["ha_open"], row["ha_high"],
                      row["ha_low"],  row["ha_close"])


def _style_axis(ax, title, ylabel="Price"):
    ax.set_facecolor("#0f172a")
    ax.set_title(title, color="#f8fafc", fontsize=13, fontweight="bold", pad=12)
    ax.set_ylabel(ylabel, color="#94a3b8")
    ax.set_xlabel("Time (UTC)", color="#94a3b8")
    ax.grid(True, color="#334155", alpha=0.35, linestyle="--", linewidth=0.6)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))


# ============================================================================
#  PLOT 1 — RAW TICKS  (standalone figure)
# ============================================================================
def plot_ticks(ticks: pd.DataFrame, save_path: str):
    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(16, 7), facecolor="#0b0f17")

    tt = ticks if len(ticks) <= MAX_TICKS_PLOT else \
        ticks.iloc[:: max(1, len(ticks) // MAX_TICKS_PLOT)]
    ts = pd.to_datetime(tt["times"], unit="s", utc=True)

    ax.plot(ts, tt["prices"], color="#38bdf8", linewidth=0.6, alpha=0.95)
    _style_axis(ax, f"{SYMBOL}  —  Raw Tick Price  ({len(ticks):,} ticks)")

    info = (
        f"TICKS        : {len(ticks):,}\n"
        f"FIRST PRICE  : {ticks['prices'].iloc[0]:.3f}\n"
        f"LAST PRICE   : {ticks['prices'].iloc[-1]:.3f}\n"
        f"HIGH         : {ticks['prices'].max():.3f}\n"
        f"LOW          : {ticks['prices'].min():.3f}\n"
        f"RANGE        : {ticks['prices'].max() - ticks['prices'].min():.3f}"
    )
    ax.text(0.012, 0.96, info, transform=ax.transAxes,
            va="top", ha="left", fontsize=9.5, family="monospace",
            color="#38bdf8",
            bbox=dict(boxstyle="round,pad=0.5", facecolor="#0b0f17",
                      edgecolor="#38bdf8", alpha=0.9))

    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(save_path, dpi=170, facecolor=fig.get_facecolor(),
                edgecolor="none")
    print(f"  → saved {os.path.abspath(save_path)}")
    if os.environ.get("DISPLAY"):
        try: plt.show()
        except Exception: pass
    plt.close(fig)


# ============================================================================
#  PLOT 2 / 3 — HA + Chandelier Exit per timeframe (each its own figure)
# ============================================================================
def plot_timeframe(ce: pd.DataFrame, seconds: int, trades: pd.DataFrame,
                   save_path: str):
    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(16, 8), facecolor="#0b0f17")

    label = f"{seconds // 60}m ({seconds}s)" if seconds >= 60 else f"{seconds}s"

    # HA candlesticks
    _draw_ha_candles(ax, ce, seconds)

    # Chandelier stops, split by direction
    long_stop  = ce["LongStop"].where(ce["Direction"] == 1)
    short_stop = ce["ShortStop"].where(ce["Direction"] == -1)
    ax.plot(ce.index, long_stop,  color="#00e676", linewidth=1.8,
            label="Long Stop (Bullish)", zorder=6)
    ax.plot(ce.index, short_stop, color="#ff1744", linewidth=1.8,
            label="Short Stop (Bearish)", zorder=6)

    # Raw signal markers (at close of signal candle)
    buys  = ce[ce["BuySignal"]]
    sells = ce[ce["SellSignal"]]
    if not buys.empty:
        ax.scatter(buys.index, buys["ha_low"] * 0.9995,
                   marker="^", s=170, color="#00e676",
                   edgecolors="white", linewidths=0.8, zorder=11,
                   label=f"Buy Signal ({len(buys)})")
    if not sells.empty:
        ax.scatter(sells.index, sells["ha_high"] * 1.0005,
                   marker="v", s=170, color="#ff1744",
                   edgecolors="white", linewidths=0.8, zorder=11,
                   label=f"Sell Signal ({len(sells)})")

    # Executed entries (open of candle N+1)
    ent = ce[ce["EnterLong"] | ce["EnterShort"]]
    if not ent.empty:
        ax.scatter(ent.index, ent["real_open"],
                   marker="o", s=28, color="#ffd54f",
                   edgecolors="black", linewidths=0.5, zorder=12,
                   label=f"Executed Entry ({len(ent)})")

    _style_axis(
        ax,
        f"{SYMBOL}  —  {label}  Heikin-Ashi + Chandelier Exit "
        f"(ATR={ATR_PERIOD}, Mult={ATR_MULTIPLIER})",
    )

    # Info box (top-left)
    last = ce.iloc[-1]
    dir_str = "LONG / BULLISH" if last["Direction"] == 1 else "SHORT / BEARISH"
    dir_col = "#00e676" if last["Direction"] == 1 else "#ff1744"
    info = (
        f"TIMEFRAME   : {label}\n"
        f"CANDLES     : {len(ce):,}\n"
        f"DIRECTION   : {dir_str}\n"
        f"ATR({ATR_PERIOD})    : {last['HA_ATR']:.3f}\n"
        f"ACTIVE STOP : "
        f"{(last['LongStop'] if last['Direction'] == 1 else last['ShortStop']):.3f}\n"
        f"BUY SIGS    : {int(ce['BuySignal'].sum())}\n"
        f"SELL SIGS   : {int(ce['SellSignal'].sum())}"
    )
    ax.text(0.012, 0.96, info, transform=ax.transAxes,
            va="top", ha="left", fontsize=9.5, family="monospace",
            color=dir_col,
            bbox=dict(boxstyle="round,pad=0.5", facecolor="#0b0f17",
                      edgecolor=dir_col, alpha=0.9))

    # Trade stats box (top-right)
    if trades is not None and not trades.empty:
        wins = trades[trades["pnl"] > 0]
        wr   = len(wins) / len(trades) * 100
        stats = (
            f"TRADES      : {len(trades)}\n"
            f"WIN RATE    : {wr:.1f}%\n"
            f"TOTAL PnL   : {trades['pnl'].sum():+.4f}\n"
            f"AVG PnL     : {trades['pnl'].mean():+.4f}\n"
            f"BEST        : {trades['pnl'].max():+.4f}\n"
            f"WORST       : {trades['pnl'].min():+.4f}"
        )
        ax.text(0.988, 0.96, stats, transform=ax.transAxes,
                va="top", ha="right", fontsize=9, family="monospace",
                color="#ffd54f",
                bbox=dict(boxstyle="round,pad=0.5", facecolor="#0b0f17",
                          edgecolor="#ffd54f", alpha=0.9))

    ax.legend(loc="lower right", fontsize=8.5, framealpha=0.35, ncol=2)

    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(save_path, dpi=170, facecolor=fig.get_facecolor(),
                edgecolor="none")
    print(f"  → saved {os.path.abspath(save_path)}")
    if os.environ.get("DISPLAY"):
        try: plt.show()
        except Exception: pass
    plt.close(fig)


# ============================================================================
#  PLOT 4 — EQUITY CURVES (standalone figure)
# ============================================================================
def plot_equity(trades_by_tf: dict, save_path: str):
    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(16, 7), facecolor="#0b0f17")
    ax.set_facecolor("#0f172a")

    palette = ["#00e676", "#38bdf8", "#ffd54f", "#ff1744", "#a78bfa"]
    has_any = False

    for i, (tf, td) in enumerate(sorted(trades_by_tf.items())):
        label = f"{tf // 60}m ({tf}s)" if tf >= 60 else f"{tf}s"
        color = palette[i % len(palette)]
        if td is None or td.empty:
            ax.plot([], [], label=f"{label}  (no trades)", color=color)
            continue
        xs = [td["entry_time"].iloc[0]] + list(td["exit_time"])
        ys = [0.0] + list(td["cum_pnl"])
        ax.step(xs, ys, where="post", linewidth=2.0,
                color=color, label=f"{label}  PnL = {td['pnl'].sum():+.3f}")
        has_any = True

    ax.axhline(0, color="#64748b", linestyle="--", linewidth=1)
    _style_axis(ax, "Cumulative PnL per Timeframe  "
                    "(entry on candle N+1 open)",
                ylabel="PnL (price units)")
    ax.legend(loc="upper left", fontsize=9.5, framealpha=0.35)

    if not has_any:
        ax.text(0.5, 0.5, "No trades generated.",
                transform=ax.transAxes, ha="center", va="center",
                color="yellow", fontsize=14)

    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(save_path, dpi=170, facecolor=fig.get_facecolor(),
                edgecolor="none")
    print(f"  → saved {os.path.abspath(save_path)}")
    if os.environ.get("DISPLAY"):
        try: plt.show()
        except Exception: pass
    plt.close(fig)


# ============================================================================
#  RULE 1 — N-BAR BREAKOUT                 input: lookback (bars)
# ----------------------------------------------------------------------------
#  BUY  when ha_close > highest ha_high of the previous N candles
#  SELL when ha_close < lowest  ha_low  of the previous N candles
# ============================================================================
def _apply_custom_rule(df: pd.DataFrame,
                       upper: pd.Series,
                       lower: pd.Series,
                       upper_label: str,
                       lower_label: str,
                       cross_only: bool = False) -> pd.DataFrame:
    out = df.copy()
    close = out["ha_close"]

    if cross_only:
        prev_close = close.shift(1)
        buy  = ((prev_close <= upper) & (close > upper)).fillna(False).to_numpy()
        sell = ((prev_close >= lower) & (close < lower)).fillna(False).to_numpy()
    else:
        buy  = (close > upper).fillna(False).to_numpy()
        sell = (close < lower).fillna(False).to_numpy()

    conflict = buy & sell
    if conflict.any():
        buy[conflict]  = False
        sell[conflict] = False

    out["CustomBuy"]  = buy
    out["CustomSell"] = sell
    out["BuySignal"]  = buy
    out["SellSignal"] = sell

    out["EnterLong"]  = out["CustomBuy"].shift(1).fillna(False).astype(bool)
    out["EnterShort"] = out["CustomSell"].shift(1).fillna(False).astype(bool)

    # -------- Direction state machine (needed by plot_timeframe) ----------
    n = len(out)
    direction = np.zeros(n, dtype=int)
    cur = 0
    for i in range(n):
        if buy[i]:
            cur = 1
        elif sell[i]:
            cur = -1
        direction[i] = cur
    if (direction == 0).all():
        direction[:] = 1                     # nothing fired → draw as bullish
    else:
        first = int(np.argmax(direction != 0))
        direction[:first] = direction[first] # back-fill leading zeros
    out["Direction"] = direction

    # -------- Ensure HA_ATR exists (needed by plot_timeframe info box) ----
    if "HA_ATR" not in out.columns:
        out["HA_ATR"] = _quick_atr(out["ha_high"], out["ha_low"],
                                   out["ha_close"], 22)

    out["LongStop"]  = lower.astype(float)
    out["ShortStop"] = upper.astype(float)
    out.attrs["upper_label"] = upper_label
    out.attrs["lower_label"] = lower_label
    return out

# ============================================================================
#  RULE 2 — FIXED PRICE LEVEL              input: threshold (price)
# ----------------------------------------------------------------------------
#  BUY  when ha_close crosses ABOVE the threshold
#  SELL when ha_close crosses BELOW the threshold
# ============================================================================
def custom_rule_price_level(df: pd.DataFrame, threshold: float) -> pd.DataFrame:
    thr = float(threshold)
    t = pd.Series(thr, index=df.index, dtype=float)
    return _apply_custom_rule(
        df, upper=t, lower=t,
        upper_label=f"Level {thr:.3f}",
        lower_label=f"Level {thr:.3f}",
        cross_only=True,
    )


# ============================================================================
#  RULE 3 — ATR-DISTANCE MOMENTUM          input: atr_mult
# ----------------------------------------------------------------------------
#  BUY  when ha_close > prev_ha_close + atr_mult * ATR
#  SELL when ha_close < prev_ha_close - atr_mult * ATR
# ============================================================================
def custom_rule_atr_distance(df: pd.DataFrame, atr_mult: float) -> pd.DataFrame:
    m = float(atr_mult)
    prev_close = df["ha_close"].shift(1)
    atr = df["HA_ATR"] if "HA_ATR" in df.columns else _quick_atr(df["ha_high"], df["ha_low"], df["ha_close"], 22)
    return _apply_custom_rule(
        df,
        upper=prev_close + m * atr,
        lower=prev_close - m * atr,
        upper_label=f"Upper +{m}·ATR",
        lower_label=f"Lower −{m}·ATR",
        cross_only=True,
    )


# ============================================================================
#  RULE 4 — PERCENT MOVE                   input: pct (%)
# ----------------------------------------------------------------------------
#  BUY  when ha_close > prev_ha_close * (1 + pct/100)
#  SELL when ha_close < prev_ha_close * (1 - pct/100)
# ============================================================================
def custom_rule_percent_move(df: pd.DataFrame, pct: float) -> pd.DataFrame:
    p = float(pct)
    prev = df["ha_close"].shift(1)
    return _apply_custom_rule(
        df,
        upper=prev * (1.0 + p / 100.0),
        lower=prev * (1.0 - p / 100.0),
        upper_label=f"+{p}%",
        lower_label=f"−{p}%",
        cross_only=True,
    )


# ============================================================================
#  RULE 5 — EMA CROSS ON HA CLOSE          input: ema_span
# ----------------------------------------------------------------------------
#  BUY  when ha_close crosses ABOVE the EMA of ha_close
#  SELL when ha_close crosses BELOW the EMA of ha_close
# ============================================================================
def custom_rule_ema_cross(df: pd.DataFrame, ema_span: int) -> pd.DataFrame:
    n = max(2, int(ema_span))
    ema = df["ha_close"].ewm(span=n, adjust=False).mean()
    return _apply_custom_rule(
        df, upper=ema, lower=ema,
        upper_label=f"EMA-{n}",
        lower_label=f"EMA-{n}",
        cross_only=True,
    )


# ============================================================================
#  SHARED ENGINE — every rule above funnels through here
# ============================================================================
def _apply_custom_rule(df: pd.DataFrame,
                       upper: pd.Series,
                       lower: pd.Series,
                       upper_label: str,
                       lower_label: str,
                       cross_only: bool = False) -> pd.DataFrame:
    """
    Given upper / lower threshold series, produce:
        CustomBuy, CustomSell  →  raw signals at candle N
        EnterLong, EnterShort  →  executed at candle N+1 open
        LongStop, ShortStop    →  mirror levels so plot_timeframe draws them
    """
    out = df.copy()
    close = out["ha_close"]

    if cross_only:
        prev_close = close.shift(1)
        buy  = ((prev_close <= upper) & (close > upper)).fillna(False).to_numpy()
        sell = ((prev_close >= lower) & (close < lower)).fillna(False).to_numpy()
    else:
        buy  = (close > upper).fillna(False).to_numpy()
        sell = (close < lower).fillna(False).to_numpy()

    conflict = buy & sell
    if conflict.any():
        buy[conflict]  = False
        sell[conflict] = False

    out["CustomBuy"]  = buy
    out["CustomSell"] = sell
    out["BuySignal"]  = buy
    out["SellSignal"] = sell

    out["EnterLong"]  = out["CustomBuy"].shift(1).fillna(False).astype(bool)
    out["EnterShort"] = out["CustomSell"].shift(1).fillna(False).astype(bool)

    out["LongStop"]  = lower.astype(float)
    out["ShortStop"] = upper.astype(float)
    out.attrs["upper_label"] = upper_label
    out.attrs["lower_label"] = lower_label
    return out


# ============================================================================
#  Helper — Wilder ATR when input HA frame has no ATR column
# ============================================================================
def _quick_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> pd.Series:
    h, l, c = high.to_numpy(float), low.to_numpy(float), close.to_numpy(float)
    n = len(c)
    tr = np.empty(n)
    tr[0] = h[0] - l[0]
    for i in range(1, n):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i-1]), abs(l[i] - c[i-1]))
    atr = np.full(n, np.nan)
    if n >= period:
        atr[period-1] = tr[:period].mean()
        for i in range(period, n):
            atr[i] = (atr[i-1] * (period-1) + tr[i]) / period
    return pd.Series(atr, index=high.index)



# ============================================================================
#  FUNCTION A — PROFIT / LOSS SUMMARY PLOT  (one timeframe, one figure)
# ----------------------------------------------------------------------------
#  Input  : trades DataFrame from simulate_trades(), a label, save path
#  Output : PNG with per-trade PnL bars + cumulative equity overlay
#
#  Use it like:
#      plot_profit_per_trade(trades_by_tf[60], "1m (60s)", "profit_60s.png")
#      plot_profit_per_trade(trades_by_tf[300], "5m (300s)", "profit_300s.png")
# ============================================================================
def plot_profit_per_trade(trades: pd.DataFrame, tf_label: str, save_path: str):
    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(16, 7.5), facecolor="#0b0f17")
    ax.set_facecolor("#0f172a")

    if trades is None or trades.empty:
        ax.text(0.5, 0.5, f"No trades for {tf_label}",
                transform=ax.transAxes, ha="center", va="center",
                color="yellow", fontsize=15)
        ax.set_title(f"{SYMBOL} — Profit View  |  {tf_label}",
                     color="#f8fafc", fontsize=13, fontweight="bold")
        fig.tight_layout()
        fig.savefig(save_path, dpi=170, facecolor=fig.get_facecolor(),
                    edgecolor="none")
        print(f"  → saved {os.path.abspath(save_path)}")
        plt.close(fig)
        return

    td = trades.reset_index(drop=True)
    x  = np.arange(1, len(td) + 1)

    # --- per-trade PnL bars -------------------------------------------------
    colors = ["#00e676" if v > 0 else ("#ff1744" if v < 0 else "#9e9e9e")
              for v in td["pnl"]]
    ax.bar(x, td["pnl"], color=colors, edgecolor="#0b0f17",
           linewidth=0.6, width=0.72, zorder=3, label="Trade PnL")
    ax.axhline(0, color="#64748b", linestyle="--", linewidth=1, zorder=2)

    # --- cumulative PnL on secondary axis ----------------------------------
    ax2 = ax.twinx()
    ax2.plot(x, td["cum_pnl"], color="#ffd54f", linewidth=2.2,
             marker="o", markersize=3.5, zorder=5, label="Cumulative PnL")
    ax2.set_ylabel("Cumulative PnL", color="#ffd54f")
    ax2.tick_params(axis="y", colors="#ffd54f")
    ax2.spines["right"].set_color("#ffd54f")
    ax2.spines["top"].set_visible(False)

    # --- long/short entry markers along top & bottom -----------------------
    longs  = td[td["side"] == "LONG"]
    shorts = td[td["side"] == "SHORT"]
    y_top = td["pnl"].max() * 1.10 if td["pnl"].max() > 0 else 0.1
    y_bot = td["pnl"].min() * 1.10 if td["pnl"].min() < 0 else -0.1
    if not longs.empty:
        ax.scatter(longs.index + 1, [y_top] * len(longs),
                   marker="^", s=90, color="#00e676",
                   edgecolors="white", linewidths=0.6, zorder=8,
                   label=f"LONG entry ({len(longs)})")
    if not shorts.empty:
        ax.scatter(shorts.index + 1, [y_bot] * len(shorts),
                   marker="v", s=90, color="#ff1744",
                   edgecolors="white", linewidths=0.6, zorder=8,
                   label=f"SHORT entry ({len(shorts)})")

    # --- stats box ----------------------------------------------------------
    wins   = td[td["pnl"] > 0]
    losses = td[td["pnl"] < 0]
    flats  = td[td["pnl"] == 0]
    wr     = len(wins) / len(td) * 100 if len(td) else 0
    avg_w  = wins["pnl"].mean()   if len(wins)   else 0
    avg_l  = losses["pnl"].mean() if len(losses) else 0
    pf     = (wins["pnl"].sum() / abs(losses["pnl"].sum())
              if len(losses) and losses["pnl"].sum() != 0 else float("inf"))
    peak   = td["cum_pnl"].cummax()
    dd     = (td["cum_pnl"] - peak).min()

    info = (
        f"TIMEFRAME      : {tf_label}\n"
        f"TRADES         : {len(td)}\n"
        f"WINS / LOSSES  : {len(wins)} / {len(losses)} / {len(flats)} flat\n"
        f"WIN RATE       : {wr:.2f}%\n"
        f"TOTAL PnL      : {td['pnl'].sum():+.5f}\n"
        f"AVG WIN        : {avg_w:+.5f}\n"
        f"AVG LOSS       : {avg_l:+.5f}\n"
        f"PROFIT FACTOR  : {pf:.3f}\n"
        f"BEST TRADE     : {td['pnl'].max():+.5f}\n"
        f"WORST TRADE    : {td['pnl'].min():+.5f}\n"
        f"MAX DRAWDOWN   : {dd:+.5f}"
    )
    box_color = "#00e676" if td["pnl"].sum() > 0 else "#ff1744"
    ax.text(0.012, 0.97, info, transform=ax.transAxes,
            va="top", ha="left", fontsize=9.5, family="monospace",
            color=box_color,
            bbox=dict(boxstyle="round,pad=0.55", facecolor="#0b0f17",
                      edgecolor=box_color, alpha=0.92))

    ax.set_title(f"{SYMBOL}  —  Profit / Loss per Trade  |  {tf_label}",
                 color="#f8fafc", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Trade #", color="#94a3b8")
    ax.set_ylabel("Trade PnL (price units)", color="#94a3b8")
    ax.grid(True, color="#334155", alpha=0.35, linestyle="--",
            linewidth=0.6, axis="y")

    h1, l1 = ax.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, loc="lower right",
              fontsize=9, framealpha=0.35)

    fig.tight_layout()
    fig.savefig(save_path, dpi=170, facecolor=fig.get_facecolor(),
                edgecolor="none")
    print(f"  → saved {os.path.abspath(save_path)}")
    if os.environ.get("DISPLAY"):
        try: plt.show()
        except Exception: pass
    plt.close(fig)



# ============================================================================
#  FUNCTION B — CUSTOM BUY/SELL RULE FROM ONE INPUT VALUE
# ----------------------------------------------------------------------------
#  Input  : Heikin-Ashi DataFrame (output of candles_to_heikin_ashi)
#           ONE value — `lookback` (integer)
#
#  Rule   : Classic breakout, one knob only.
#              BUY  when ha_close > highest(ha_high) of previous `lookback`
#              SELL when ha_close < lowest (ha_low)  of previous `lookback`
#
#  Then   : applies the same next-candle rule — signal on candle N → entry on
#           candle N+1 open — so the output plugs straight into simulate_trades().
#
#  Return : copy of df with these extra columns
#              CustomBuy         — raw buy signal at candle N
#              CustomSell        — raw sell signal at candle N
#              EnterLong         — executed long entry at candle N+1
#              EnterShort        — executed short entry at candle N+1
#              (BuySignal/SellSignal mirror Custom for plot compatibility)
# ============================================================================
def custom_rule_from_single_input(df: pd.DataFrame, lookback: int) -> pd.DataFrame:
    """
    Build your own Buy/Sell rule using ONE parameter.

    Parameters
    ----------
    df       : HA DataFrame from candles_to_heikin_ashi()
    lookback : how many previous HA candles to scan for the breakout.

    To make a DIFFERENT rule that still uses one input, replace the two
    `roll_max` / `roll_min` lines with any expression you like, e.g.:

        # single price-level threshold
        # BUY  if ha_close > threshold
        # SELL if ha_close < threshold

        # single ATR-multiple threshold
        # BUY  if ha_close > ha_close.shift(1) + threshold * HA_ATR
        # SELL if ha_close < ha_close.shift(1) - threshold * HA_ATR

        # single percent move
        # BUY  if pct_change > threshold
        # SELL if pct_change < -threshold
    """
    if df is None or df.empty:
        out = df.copy() if df is not None else pd.DataFrame()
        for col in ("CustomBuy", "CustomSell",
                    "EnterLong", "EnterShort",
                    "BuySignal", "SellSignal"):
            out[col] = pd.Series(dtype=bool)
        return out

    lookback = max(2, int(lookback))
    out = df.copy()

    # ---- rolling extremes of HA prices, shifted so candle N sees N-1 history
    roll_max = out["ha_high"].rolling(lookback).max().shift(1)
    roll_min = out["ha_low"].rolling(lookback).min().shift(1)

    # ---- raw signals -------------------------------------------------------
    buy  = (out["ha_close"] > roll_max).fillna(False).to_numpy()
    sell = (out["ha_close"] < roll_min).fillna(False).to_numpy()

    # if both fire on the same candle (rare, wide range), let direction win
    conflict = buy & sell
    if conflict.any():
        buy[conflict]  = False
        sell[conflict] = False

    out["CustomBuy"]     = buy
    out["CustomSell"]    = sell
    out["BuySignal"]     = buy          # mirror names so plot_timeframe works
    out["SellSignal"]    = sell

    # ---- next-candle rule --------------------------------------------------
    out["EnterLong"]  = out["CustomBuy"].shift(1).fillna(False).astype(bool)
    out["EnterShort"] = out["CustomSell"].shift(1).fillna(False).astype(bool)

    # ---- fill Chandelier-stop columns so plot_timeframe has something to show
    #      (this custom rule has no stops, so we draw dotted lines at the
    #       rolling breakout levels instead)
    out["LongStop"]  = roll_min
    out["ShortStop"] = roll_max

    return out



# ============================================================================
#  RULE 1 — N-BAR BREAKOUT                 input: lookback (bars)
# ============================================================================
def custom_rule_breakout(df: pd.DataFrame, lookback: int) -> pd.DataFrame:
    return _apply_custom_rule(
        df,
        upper=df["ha_high"].rolling(max(2, int(lookback))).max().shift(1),
        lower=df["ha_low"].rolling(max(2, int(lookback))).min().shift(1),
        upper_label=f"Breakout-{lookback}H",
        lower_label=f"Breakout-{lookback}L",
    )


# ============================================================================
#  RULE 2 — FIXED PRICE LEVEL              input: threshold (price)
# ============================================================================
def custom_rule_price_level(df: pd.DataFrame, threshold: float) -> pd.DataFrame:
    thr = float(threshold)
    t = pd.Series(thr, index=df.index, dtype=float)
    return _apply_custom_rule(
        df, upper=t, lower=t,
        upper_label=f"Level {thr:.3f}",
        lower_label=f"Level {thr:.3f}",
        cross_only=True,
    )


# ============================================================================
#  RULE 3 — ATR-DISTANCE MOMENTUM          input: atr_mult
# ============================================================================
def custom_rule_atr_distance(df: pd.DataFrame, atr_mult: float) -> pd.DataFrame:
    m = float(atr_mult)
    prev_close = df["ha_close"].shift(1)
    atr = df["HA_ATR"] if "HA_ATR" in df.columns else _quick_atr(
        df["ha_high"], df["ha_low"], df["ha_close"], 22)
    return _apply_custom_rule(
        df,
        upper=prev_close + m * atr,
        lower=prev_close - m * atr,
        upper_label=f"Upper +{m}·ATR",
        lower_label=f"Lower −{m}·ATR",
        cross_only=True,
    )


# ============================================================================
#  RULE 4 — PERCENT MOVE                   input: pct (%)
# ============================================================================
def custom_rule_percent_move(df: pd.DataFrame, pct: float) -> pd.DataFrame:
    p = float(pct)
    prev = df["ha_close"].shift(1)
    return _apply_custom_rule(
        df,
        upper=prev * (1.0 + p / 100.0),
        lower=prev * (1.0 - p / 100.0),
        upper_label=f"+{p}%",
        lower_label=f"−{p}%",
        cross_only=True,
    )


# ============================================================================
#  RULE 5 — EMA CROSS ON HA CLOSE          input: ema_span
# ============================================================================
def custom_rule_ema_cross(df: pd.DataFrame, ema_span: int) -> pd.DataFrame:
    n = max(2, int(ema_span))
    ema = df["ha_close"].ewm(span=n, adjust=False).mean()
    return _apply_custom_rule(
        df, upper=ema, lower=ema,
        upper_label=f"EMA-{n}",
        lower_label=f"EMA-{n}",
        cross_only=True,
    )


# ============================================================================
#  SHARED ENGINE — every rule above funnels through here
# ============================================================================
def _apply_custom_rule(df: pd.DataFrame,
                       upper: pd.Series,
                       lower: pd.Series,
                       upper_label: str,
                       lower_label: str,
                       cross_only: bool = False) -> pd.DataFrame:
    out   = df.copy()
    close = out["ha_close"]

    if cross_only:
        prev_close = close.shift(1)
        buy  = ((prev_close <= upper) & (close > upper)).fillna(False).to_numpy()
        sell = ((prev_close >= lower) & (close < lower)).fillna(False).to_numpy()
    else:
        buy  = (close > upper).fillna(False).to_numpy()
        sell = (close < lower).fillna(False).to_numpy()

    conflict = buy & sell
    if conflict.any():
        buy[conflict]  = False
        sell[conflict] = False

    out["CustomBuy"]  = buy
    out["CustomSell"] = sell
    out["BuySignal"]  = buy
    out["SellSignal"] = sell

    out["EnterLong"]  = out["CustomBuy"].shift(1).fillna(False).astype(bool)
    out["EnterShort"] = out["CustomSell"].shift(1).fillna(False).astype(bool)

    # ---- Direction state machine (required by plot_timeframe) ------------
    n = len(out)
    direction = np.zeros(n, dtype=int)
    cur = 0
    for i in range(n):
        if buy[i]:
            cur = 1
        elif sell[i]:
            cur = -1
        direction[i] = cur
    if (direction == 0).all():
        direction[:] = 1
    else:
        first = int(np.argmax(direction != 0))
        direction[:first] = direction[first]
    out["Direction"] = direction

    # ---- Ensure HA_ATR exists (required by plot_timeframe info box) ------
    if "HA_ATR" not in out.columns:
        out["HA_ATR"] = _quick_atr(out["ha_high"], out["ha_low"],
                                   out["ha_close"], 22)

    out["LongStop"]  = lower.astype(float)
    out["ShortStop"] = upper.astype(float)
    out.attrs["upper_label"] = upper_label
    out.attrs["lower_label"] = lower_label
    return out


# ============================================================================
#  Helper — Wilder ATR when input HA frame has no ATR column
# ============================================================================
def _quick_atr(high: pd.Series, low: pd.Series,
               close: pd.Series, period: int) -> pd.Series:
    h, l, c = high.to_numpy(float), low.to_numpy(float), close.to_numpy(float)
    n  = len(c)
    tr = np.empty(n)
    tr[0] = h[0] - l[0]
    for i in range(1, n):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i-1]), abs(l[i] - c[i-1]))
    atr = np.full(n, np.nan)
    if n >= period:
        atr[period-1] = tr[:period].mean()
        for i in range(period, n):
            atr[i] = (atr[i-1] * (period-1) + tr[i]) / period
    return pd.Series(atr, index=high.index)




# # ============================================================================
# #  MAIN PIPELINE
# # ============================================================================
# def main():
#     print("=" * 100)
#     print(f"  {SYMBOL}   Heikin-Ashi → Chandelier Exit → Next-Candle Backtest")
#     print(f"  Timeframes : {TIMEFRAMES}")
#     print("=" * 100)

#     # 1 ── ticks
#     print(f"\n[1/7] Loading ticks          → {CSV_FILE}")
#     ticks = load_ticks(CSV_FILE)
#     print(f"      Ticks                  : {len(ticks):,}")
#     t0 = pd.to_datetime(ticks['times'].iloc[0],  unit='s', utc=True)
#     t1 = pd.to_datetime(ticks['times'].iloc[-1], unit='s', utc=True)
#     print(f"      Span                   : {t0}  →  {t1}")

#     ce_by_tf     = {}
#     trades_by_tf = {}

#     for tf in TIMEFRAMES:
#         label = f"{tf // 60}m ({tf}s)" if tf >= 60 else f"{tf}s"
#         print("\n" + "-" * 100)
#         print(f"  PIPELINE — TIMEFRAME {label}")
#         print("-" * 100)

#         # 2 ── candles
#         candles = ticks_to_candles(ticks, tf)
#         print(f"[2/7] OHLC candles           : {len(candles):,}")

#         # 3 ── Heikin-Ashi
#         ha = candles_to_heikin_ashi(candles)
#         print(f"[3/7] Heikin-Ashi candles    : {len(ha):,}")

#         # 4 ── Chandelier Exit on HA
#         ce = heikin_ashi_chandelier_exit(ha, ATR_PERIOD, ATR_MULTIPLIER)
#         print(f"[4/7] HA-Chandelier signals  : "
#               f"Buy={int(ce['BuySignal'].sum())}  "
#               f"Sell={int(ce['SellSignal'].sum())}")

#         # 5 ── N+1 rule
#         ce = apply_next_candle_rule(ce)
#         print(f"[5/7] Entries (N+1)          : "
#               f"Long={int(ce['EnterLong'].sum())}  "
#               f"Short={int(ce['EnterShort'].sum())}")

#         # 6 ── Simulate
#         trades = simulate_trades(ce)
#         print(f"[6/7] Trades                 : {len(trades):,}")
#         if not trades.empty:
#             print(f"      Total PnL              : {trades['pnl'].sum():+.5f}")

#         ce_by_tf[tf]     = ce
#         trades_by_tf[tf] = trades

#         # 7 ── Report + plot
#         report_trades(label, trades, candles)
#         plot_timeframe(
#             ce, tf, trades,
#             PLOT_TF_PATTERN.format(tf=f"{tf}s"),
#         )

#     # Standalone plots
#     plot_ticks(ticks, PLOT_TICKS)
#     plot_equity(trades_by_tf, PLOT_EQUITY)

#     print("\n" + "=" * 100)
#     print("  DONE")
#     print("=" * 100)

#     # ---- inside your main() loop, after:  trades = simulate_trades(ce) ----

#     # A) profit chart for this timeframe
#     plot_profit_per_trade(
#         trades,
#         tf_label=f"{tf // 60}m ({tf}s)" if tf >= 60 else f"{tf}s",
#         save_path=f"profit_{tf}s.png",
#     )

#     # # B) example: build a CUSTOM rule on the SAME HA candles with ONE input
#     # ha_custom = candles_to_heikin_ashi(candles)        # fresh copy
#     # ha_custom = custom_rule_from_single_input(ha_custom, lookback=20)
#     # trades_custom = simulate_trades(ha_custom)
#     # report_trades(f"CUSTOM-lookback20 {tf}s", trades_custom, candles)
#     # plot_timeframe(
#     #     ha_custom, tf, trades_custom,
#     #     save_path=f"plot_custom_{tf}s.png",
#     # )
#     # plot_profit_per_trade(
#     #     trades_custom,
#     #     tf_label=f"CUSTOM lb=20  {tf}s",
#     #     save_path=f"profit_custom_{tf}s.png",
#     # )

def main():
    print("=" * 100)
    print(f"  {SYMBOL}  —  HA + Chandelier Exit  +  5 Custom Rules")
    print(f"  Timeframes : {TIMEFRAMES}")
    print("=" * 100)

    ticks = load_ticks(CSV_FILE)
    print(f"\nLoaded {len(ticks):,} ticks.")

    trades_by_tf = {}          # collected for the multi-tf equity chart

    for tf in TIMEFRAMES:
        label = f"{tf//60}m ({tf}s)" if tf >= 60 else f"{tf}s"
        print("\n" + "-" * 100)
        print(f"  TIMEFRAME {label}")
        print("-" * 100)

        candles = ticks_to_candles(ticks, tf)
        ha      = candles_to_heikin_ashi(candles)

        # ---------- Base pipeline: HA → Chandelier Exit ----------
        ce     = heikin_ashi_chandelier_exit(ha, ATR_PERIOD, ATR_MULTIPLIER)
        ce     = apply_next_candle_rule(ce)
        trades = simulate_trades(ce)

        report_trades(f"CHANDELIER {label}", trades, candles)
        plot_timeframe(ce, tf, trades,
                       save_path=f"plot_chandelier_{tf}s.png")
        plot_profit_per_trade(trades, f"Chandelier {label}",
                              f"profit_chandelier_{tf}s.png")

        trades_by_tf[tf] = trades

        # ---------- 5 custom rules on the SAME HA candles ----------
        rules = [
            ("R1_breakout_lb20",  custom_rule_breakout,     dict(lookback=20)),
            ("R2_level_4280",     custom_rule_price_level,  dict(threshold=4280.0)),
            ("R3_atr_mult1.5",    custom_rule_atr_distance, dict(atr_mult=1.5)),
            ("R4_pct_0.05",       custom_rule_percent_move, dict(pct=0.05)),
            ("R5_ema_21",         custom_rule_ema_cross,    dict(ema_span=21)),
        ]

        for tag, fn, kwargs in rules:
            custom_ha = candles_to_heikin_ashi(candles)   # fresh copy
            custom_ha = fn(custom_ha, **kwargs)           # rule fires here

            trades_c = simulate_trades(custom_ha)
            report_trades(f"{tag}  {label}", trades_c, candles)

            plot_timeframe(
                custom_ha, tf, trades_c,
                save_path=f"plot_{tag}_{tf}s.png",
            )
            plot_profit_per_trade(
                trades_c, f"{tag}  {label}",
                f"profit_{tag}_{tf}s.png",
            )

    # ---------- Standalone charts (were missing) ----------
    plot_ticks(ticks, PLOT_TICKS)
    plot_equity(trades_by_tf, PLOT_EQUITY)

    print("\nDONE — all rule × timeframe combinations rendered.")


if __name__ == "__main__":
    main()