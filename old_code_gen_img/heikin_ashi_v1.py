#!/usr/bin/env python3
"""
================================================================================
 HEIKIN-ASHI + CHANDELIER EXIT — OFFLINE MULTI-TIMEFRAME BACKTESTER
================================================================================
 Tick CSV  →  Candles (1m / 5m)  →  Heikin-Ashi  →  Chandelier Exit
           →  Next-Candle Execution  →  Per-Trade PnL  →  Wow Plot
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
from matplotlib.gridspec import GridSpec


# ============================================================================
# CONFIG
# ============================================================================
CSV_FILE        = "frxXAUUSD_1790274600.csv"
TIMEFRAMES_SEC  = [60, 300]          # 1 min, 5 min
ATR_PERIOD      = 22
ATR_MULTIPLIER  = 3.0
SYMBOL          = "frxXAUUSD"
SAVE_PLOT       = "ha_chandelier_pipeline.png"
MAX_TICKS_PLOT  = 40000              # downsample ticks above this for plotting


# ============================================================================
# STEP 1 — LOAD TICKS
# ============================================================================
def load_ticks(csv_path: str) -> pd.DataFrame:
    """Read (times, prices) tick CSV → clean, sorted, de-duplicated DataFrame."""
    if not os.path.exists(csv_path):
        sys.exit(f"\nERROR: CSV not found: {csv_path}\n")

    df = pd.read_csv(csv_path)
    df.columns = [c.strip().lower() for c in df.columns]

    if "times" not in df.columns or "prices" not in df.columns:
        sys.exit("ERROR: CSV must contain columns: times,prices")

    df = df[["times", "prices"]].copy()
    df["times"]  = pd.to_numeric(df["times"],  errors="coerce")
    df["prices"] = pd.to_numeric(df["prices"], errors="coerce")
    df = df.dropna().astype({"times": np.int64, "prices": float})
    df = (df.drop_duplicates("times")
            .sort_values("times")
            .reset_index(drop=True))
    return df


# ============================================================================
# STEP 2 — AGGREGATE TICKS INTO OHLC CANDLES
# ============================================================================
def ticks_to_candles(ticks: pd.DataFrame, seconds: int) -> pd.DataFrame:
    """Bucket ticks into N-second OHLC candles."""
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
# STEP 3 — HEIKIN-ASHI TRANSFORMATION
# ============================================================================
def to_heikin_ashi(candles: pd.DataFrame) -> pd.DataFrame:
    """Convert OHLC candles to Heikin-Ashi."""
    o = candles["open"].values
    h = candles["high"].values
    l = candles["low"].values
    c = candles["close"].values
    n = len(candles)

    ha_close = (o + h + l + c) / 4.0

    ha_open = np.empty(n)
    if n:
        ha_open[0] = (o[0] + c[0]) / 2.0
        for i in range(1, n):
            ha_open[i] = (ha_open[i - 1] + ha_close[i - 1]) / 2.0

    ha_high = np.maximum.reduce([h, ha_open, ha_close])
    ha_low  = np.minimum.reduce([l, ha_open, ha_close])

    ha = pd.DataFrame(
        {
            "ha_open":    ha_open,
            "ha_high":    ha_high,
            "ha_low":     ha_low,
            "ha_close":   ha_close,
            "real_open":  o,      # needed for execution on candle N+1
            "real_close": c,      # needed for forced final exit
            "ticks":      candles["ticks"].values,
        },
        index=candles.index,
    )
    return ha


# ============================================================================
# STEP 4 — CHANDELIER EXIT (on Heikin-Ashi prices)
# ============================================================================
def chandelier_exit(ha: pd.DataFrame,
                    atr_period: int = 22,
                    atr_mult: float = 3.0) -> pd.DataFrame:
    """
    Classic Chandelier Exit applied to Heikin-Ashi OHLC.
    Produces: ATR, LongStop, ShortStop, Direction, BuySignal, SellSignal.
    """
    df = ha.copy()
    n = len(df)
    if n == 0:
        for col in ("ATR", "LongStop", "ShortStop",
                    "Direction", "BuySignal", "SellSignal"):
            df[col] = []
        return df

    high  = df["ha_high"].values
    low   = df["ha_low"].values
    close = df["ha_close"].values

    # --- True Range ---------------------------------------------------------
    tr = np.empty(n)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        tr[i] = max(high[i] - low[i],
                    abs(high[i] - close[i - 1]),
                    abs(low[i]  - close[i - 1]))

    # --- Wilder's ATR -------------------------------------------------------
    atr = np.full(n, np.nan)
    if n >= atr_period:
        atr[atr_period - 1] = tr[:atr_period].mean()
        for i in range(atr_period, n):
            atr[i] = (atr[i - 1] * (atr_period - 1) + tr[i]) / atr_period

    # --- Rolling extremes ---------------------------------------------------
    highest = np.full(n, np.nan)
    lowest  = np.full(n, np.nan)
    for i in range(atr_period - 1, n):
        highest[i] = high[i - atr_period + 1: i + 1].max()
        lowest[i]  = low[i  - atr_period + 1: i + 1].min()

    # --- Iterative ratcheting stops ----------------------------------------
    long_stop  = np.full(n, np.nan)
    short_stop = np.full(n, np.nan)
    direction  = np.ones(n, dtype=int)

    for i in range(n):
        if np.isnan(atr[i]):
            continue

        ls = highest[i] - atr_mult * atr[i]
        ss = lowest[i]  + atr_mult * atr[i]

        if i > 0 and not np.isnan(long_stop[i - 1]) and close[i] > long_stop[i - 1]:
            ls = max(ls, long_stop[i - 1])
        if i > 0 and not np.isnan(short_stop[i - 1]) and close[i] < short_stop[i - 1]:
            ss = min(ss, short_stop[i - 1])

        long_stop[i]  = ls
        short_stop[i] = ss

        if i > 0:
            ls_prev, ss_prev = long_stop[i - 1], short_stop[i - 1]
            if np.isnan(ls_prev) or np.isnan(ss_prev):
                direction[i] = 1
            elif close[i] > ss_prev:
                direction[i] = 1
            elif close[i] < ls_prev:
                direction[i] = -1
            else:
                direction[i] = direction[i - 1]

    # --- Raw Buy/Sell flips -------------------------------------------------
    buy  = np.zeros(n, dtype=bool)
    sell = np.zeros(n, dtype=bool)
    for i in range(1, n):
        if direction[i] == 1 and direction[i - 1] == -1:
            buy[i] = True
        elif direction[i] == -1 and direction[i - 1] == 1:
            sell[i] = True

    df["ATR"]        = atr
    df["LongStop"]   = long_stop
    df["ShortStop"]  = short_stop
    df["Direction"]  = direction
    df["BuySignal"]  = buy
    df["SellSignal"] = sell
    return df


# ============================================================================
# STEP 5 — NEXT-CANDLE EXECUTION RULE
# ----------------------------------------------------------------------------
#   Signal fires at close of candle N  →  we act at OPEN of candle N+1.
#   So:  EnterLong[i]  = BuySignal[i-1]
#        EnterShort[i] = SellSignal[i-1]
# ============================================================================
def next_candle_rule(ce: pd.DataFrame) -> pd.DataFrame:
    df = ce.copy()
    df["EnterLong"]  = df["BuySignal"].shift(1).fillna(False).astype(bool)
    df["EnterShort"] = df["SellSignal"].shift(1).fillna(False).astype(bool)
    return df


# ============================================================================
# STEP 6 — WALK-FORWARD TRADE SIMULATION
# ============================================================================
def simulate_trades(df: pd.DataFrame) -> pd.DataFrame:
    """Flip position on every entry flag, close at next opposite flag."""
    trades = []
    position    = 0
    entry_price = np.nan
    entry_time  = None

    opens  = df["real_open"].values
    closes = df["real_close"].values
    times  = df.index
    el     = df["EnterLong"].values
    es     = df["EnterShort"].values

    for i in range(len(df)):
        t, p = times[i], opens[i]
        want_long, want_short = el[i], es[i]

        if position == 0:
            if want_long:
                position, entry_price, entry_time = 1, p, t
            elif want_short:
                position, entry_price, entry_time = -1, p, t

        elif position == 1 and want_short:
            trades.append(_trade(times, entry_time, t,
                                 "LONG", entry_price, p, p - entry_price))
            position, entry_price, entry_time = -1, p, t

        elif position == -1 and want_long:
            trades.append(_trade(times, entry_time, t,
                                 "SHORT", entry_price, p, entry_price - p))
            position, entry_price, entry_time = 1, p, t

    # Force-close open position on last close
    if position != 0 and len(df):
        t, p = times[-1], closes[-1]
        pnl = (p - entry_price) if position == 1 else (entry_price - p)
        trades.append(_trade(times, entry_time, t,
                             "LONG" if position == 1 else "SHORT",
                             entry_price, p, pnl))

    td = pd.DataFrame(trades)
    if not td.empty:
        td["cum_pnl"] = td["pnl"].cumsum()
    return td


def _trade(times, t_entry, t_exit, side, ep, xp, pnl):
    return {
        "entry_time":  t_entry,
        "exit_time":   t_exit,
        "side":        side,
        "entry_price": round(ep, 5),
        "exit_price":  round(xp, 5),
        "pnl":         round(pnl, 5),
    }


# ============================================================================
# STEP 7 — TERMINAL REPORT
# ============================================================================
def report_trades(label: str, trades: pd.DataFrame, ohlc: pd.DataFrame):
    print("\n" + "=" * 96)
    print(f"  TRADE LOG — {label}")
    print("=" * 96)

    if trades.empty:
        print("  No trades generated (not enough data or no signal).")
        return

    wins   = trades[trades["pnl"] > 0]
    losses = trades[trades["pnl"] < 0]
    flats  = trades[trades["pnl"] == 0]

    print(f"{'#':>4} {'SIDE':<6} {'ENTRY TIME':<21} {'EXIT TIME':<21} "
          f"{'ENTRY':>10} {'EXIT':>10} {'PnL':>10} {'CUM':>10}")
    print("-" * 96)
    for i, r in trades.reset_index(drop=True).iterrows():
        ts_in  = r["entry_time"].strftime("%Y-%m-%d %H:%M:%S")
        ts_out = r["exit_time"].strftime("%Y-%m-%d %H:%M:%S")
        print(f"{i+1:>4} {r['side']:<6} {ts_in:<21} {ts_out:<21} "
              f"{r['entry_price']:>10.3f} {r['exit_price']:>10.3f} "
              f"{r['pnl']:>+10.3f} {r['cum_pnl']:>+10.3f}")

    print("-" * 96)
    print(f"  Candles          : {len(ohlc):,}")
    print(f"  Trades           : {len(trades):,}")
    print(f"  Wins             : {len(wins):,}")
    print(f"  Losses           : {len(losses):,}")
    print(f"  Flats            : {len(flats):,}")
    if len(trades):
        wr = len(wins) / len(trades) * 100
        print(f"  Win rate         : {wr:.2f}%")
    print(f"  Total PnL        : {trades['pnl'].sum():+.5f}")
    print(f"  Avg PnL / trade  : {trades['pnl'].mean():+.5f}")
    print(f"  Best trade       : {trades['pnl'].max():+.5f}")
    print(f"  Worst trade      : {trades['pnl'].min():+.5f}")
    print(f"  Max drawdown     : {_max_dd(trades['cum_pnl']):+.5f}")


def _max_dd(cum: pd.Series) -> float:
    if cum.empty:
        return 0.0
    peak = cum.cummax()
    return float((cum - peak).min())


# ============================================================================
# STEP 8 — WOW PLOT
# ============================================================================
def _draw_ha_candles(ax, ha: pd.DataFrame, width_seconds: int):
    w_days = width_seconds / 86400.0
    half   = w_days / 2.0
    for ts, row in ha.iterrows():
        o, h, l, c = row["ha_open"], row["ha_high"], row["ha_low"], row["ha_close"]
        color = "#26a69a" if c >= o else "#ef5350"
        x = mdates.date2num(ts)
        # wick
        ax.plot([x, x], [l, h], color=color, linewidth=0.7,
                solid_capstyle="butt", zorder=3)
        # body
        bottom = min(o, c)
        height = max(abs(c - o), 1e-6)
        ax.add_patch(Rectangle(
            (x - half, bottom), w_days, height,
            facecolor=color, edgecolor=color, linewidth=0.4, zorder=4))


def _draw_ce_panel(ax, ce: pd.DataFrame, tf_label: str,
                   width_seconds: int, trades: pd.DataFrame):
    # HA candles
    _draw_ha_candles(ax, ce, width_seconds)

    # Chandelier stops
    long_stop  = ce["LongStop"].where(ce["Direction"] == 1)
    short_stop = ce["ShortStop"].where(ce["Direction"] == -1)
    ax.plot(ce.index, long_stop,  color="#00e676", linewidth=1.7,
            label="Long Stop (Bullish)", zorder=5)
    ax.plot(ce.index, short_stop, color="#ff1744", linewidth=1.7,
            label="Short Stop (Bearish)", zorder=5)

    # Raw signal markers (at close of signal candle)
    buys  = ce[ce["BuySignal"]]
    sells = ce[ce["SellSignal"]]
    if not buys.empty:
        ax.scatter(buys.index, buys["ha_low"]  * 0.9995,
                   marker="^", s=130, color="#00e676",
                   edgecolors="white", linewidths=0.7, zorder=11,
                   label=f"Buy Signal ({len(buys)})")
    if not sells.empty:
        ax.scatter(sells.index, sells["ha_high"] * 1.0005,
                   marker="v", s=130, color="#ff1744",
                   edgecolors="white", linewidths=0.7, zorder=11,
                   label=f"Sell Signal ({len(sells)})")

    # Execution entries (open of candle N+1) — small white dots
    entries = ce[ce["EnterLong"] | ce["EnterShort"]]
    if not entries.empty:
        ax.scatter(entries.index, entries["real_open"],
                   marker="o", s=24, color="#ffd54f",
                   edgecolors="black", linewidths=0.5, zorder=12,
                   label="Executed Entry")

    # Info box
    if len(ce):
        last = ce.iloc[-1]
        dir_str = "LONG / BULLISH" if last["Direction"] == 1 else "SHORT / BEARISH"
        dir_col = "#00e676" if last["Direction"] == 1 else "#ff1744"
        info = (
            f"TF: {tf_label}\n"
            f"DIR: {dir_str}\n"
            f"ATR({ATR_PERIOD}): {last['ATR']:.3f}\n"
            f"Buys: {int(ce['BuySignal'].sum())}  "
            f"Sells: {int(ce['SellSignal'].sum())}"
        )
        ax.text(0.012, 0.96, info, transform=ax.transAxes,
                va="top", ha="left", fontsize=9, family="monospace",
                color=dir_col,
                bbox=dict(boxstyle="round,pad=0.45",
                          facecolor="#0b0f17", edgecolor=dir_col, alpha=0.9))

    ax.set_ylabel("Price", color="#94a3b8")
    ax.grid(True, color="#334155", alpha=0.35, linestyle="--", linewidth=0.6)
    ax.legend(loc="upper right", fontsize=8, framealpha=0.35)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))


def plot_everything(ticks: pd.DataFrame,
                    ce_by_tf: dict,
                    trades_by_tf: dict,
                    save_path: str):

    plt.style.use("dark_background")
    tfs = sorted(ce_by_tf.keys())
    n_tf = len(tfs)

    fig = plt.figure(figsize=(17, 4 + 3.4 * n_tf + 3), facecolor="#0b0f17")
    gs  = GridSpec(2 + n_tf, 1, figure=fig,
                   height_ratios=[2.0] + [2.6] * n_tf + [1.6],
                   hspace=0.32)

    # ------------------------------------------------------------------ ticks
    ax_ticks = fig.add_subplot(gs[0])
    ax_ticks.set_facecolor("#0f172a")
    plot_ticks = ticks if len(ticks) <= MAX_TICKS_PLOT \
        else ticks.iloc[:: max(1, len(ticks) // MAX_TICKS_PLOT)]
    tt = pd.to_datetime(plot_ticks["times"], unit="s", utc=True)
    ax_ticks.plot(tt, plot_ticks["prices"], color="#38bdf8",
                  linewidth=0.6, alpha=0.9)
    ax_ticks.set_title(f"{SYMBOL} — Raw Tick Price  ({len(ticks):,} ticks)",
                       color="#f8fafc", fontsize=12, fontweight="bold")
    ax_ticks.set_ylabel("Price", color="#94a3b8")
    ax_ticks.grid(True, color="#334155", alpha=0.35,
                  linestyle="--", linewidth=0.6)
    ax_ticks.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))

    # -------------------------------------------------------- HA + CE panels
    for k, tf in enumerate(tfs):
        ax = fig.add_subplot(gs[1 + k])
        ax.set_facecolor("#0f172a")
        label = f"{tf//60}m ({tf}s)" if tf >= 60 else f"{tf}s"
        _draw_ce_panel(ax, ce_by_tf[tf], label, tf,
                       trades_by_tf.get(tf, pd.DataFrame()))

    # ------------------------------------------------------- equity curves
    ax_eq = fig.add_subplot(gs[-1])
    ax_eq.set_facecolor("#0f172a")
    for tf in tfs:
        td = trades_by_tf.get(tf)
        label = f"{tf//60}m ({tf}s)" if tf >= 60 else f"{tf}s"
        if td is None or td.empty:
            ax_eq.plot([], [], label=f"{label} — no trades")
            continue
        xs = [td["entry_time"].iloc[0]] + list(td["exit_time"])
        ys = [0.0] + list(td["cum_pnl"])
        ax_eq.step(xs, ys, where="post", linewidth=1.8, label=f"{label} PnL")

    ax_eq.axhline(0, color="#64748b", linestyle="--", linewidth=1)
    ax_eq.set_title("Cumulative PnL by Timeframe  (executed on candle N+1 open)",
                    color="#f8fafc", fontsize=11, fontweight="bold")
    ax_eq.set_ylabel("PnL (price units)", color="#94a3b8")
    ax_eq.grid(True, color="#334155", alpha=0.35,
               linestyle="--", linewidth=0.6)
    ax_eq.legend(loc="upper left", fontsize=9, framealpha=0.35)
    ax_eq.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))

    fig.suptitle(
        f"{SYMBOL} — Heikin-Ashi + Chandelier Exit "
        f"(ATR={ATR_PERIOD}, Mult={ATR_MULTIPLIER})",
        fontsize=15, fontweight="bold", color="#f8fafc", y=0.995)

    fig.autofmt_xdate()
    fig.tight_layout(rect=[0, 0, 1, 0.985])

    try:
        fig.savefig(save_path, dpi=170,
                    facecolor=fig.get_facecolor(), edgecolor="none")
        print(f"\nChart saved → {os.path.abspath(save_path)}")
    except Exception as e:
        print(f"WARNING: could not save figure: {e}")

    if os.environ.get("DISPLAY"):
        try:
            plt.show()
        except Exception:
            pass


# ============================================================================
# MAIN PIPELINE
# ============================================================================
def main():
    print("=" * 96)
    print(f"  {SYMBOL} — Heikin-Ashi + Chandelier Exit  |  Timeframes: {TIMEFRAMES_SEC}")
    print("=" * 96)

    # 1 — Load ticks
    print(f"\n[1/7] Loading ticks from: {CSV_FILE}")
    ticks = load_ticks(CSV_FILE)
    print(f"      Ticks         : {len(ticks):,}")
    t0 = pd.to_datetime(ticks['times'].iloc[0],  unit='s', utc=True)
    t1 = pd.to_datetime(ticks['times'].iloc[-1], unit='s', utc=True)
    print(f"      Time span     : {t0}  →  {t1}")

    ce_by_tf     = {}
    trades_by_tf = {}

    for tf in TIMEFRAMES_SEC:
        label = f"{tf//60}m ({tf}s)" if tf >= 60 else f"{tf}s"
        print("\n" + "-" * 96)
        print(f"  PIPELINE for timeframe = {label}")
        print("-" * 96)

        # 2 — Candles
        candles = ticks_to_candles(ticks, tf)
        print(f"[2/7] Candles built            : {len(candles):,}")

        # 3 — Heikin-Ashi
        ha = to_heikin_ashi(candles)
        print(f"[3/7] Heikin-Ashi candles      : {len(ha):,}")

        # 4 — Chandelier Exit
        ce = chandelier_exit(ha, ATR_PERIOD, ATR_MULTIPLIER)
        n_buy  = int(ce["BuySignal"].sum())
        n_sell = int(ce["SellSignal"].sum())
        print(f"[4/7] Chandelier Exit signals  : Buy={n_buy}  Sell={n_sell}")

        # 5 — Next-candle rule
        ce = next_candle_rule(ce)
        n_el = int(ce["EnterLong"].sum())
        n_es = int(ce["EnterShort"].sum())
        print(f"[5/7] Executed entries (N+1)   : Long={n_el}  Short={n_es}")

        # 6 — Simulate trades
        trades = simulate_trades(ce)
        print(f"[6/7] Trades simulated         : {len(trades):,}")
        if not trades.empty:
            print(f"      Total PnL               : {trades['pnl'].sum():+.5f}")

        ce_by_tf[tf]     = ce
        trades_by_tf[tf] = trades

        # 7 — Report
        report_trades(label, trades, candles)

    # Final multi-panel plot
    print("\n[7/7] Rendering charts ...")
    plot_everything(ticks, ce_by_tf, trades_by_tf, SAVE_PLOT)

    print("\n" + "=" * 96)
    print("  DONE")
    print("=" * 96)


if __name__ == "__main__":
    main()