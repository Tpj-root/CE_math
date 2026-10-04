#!/usr/bin/env python3
"""
Offline Multi-Timeframe Chandelier Exit Runner
==============================================
Reads pure tick CSV data (times, prices), aggregates ticks into user-defined
candle timeframes (e.g. {15, 30, 60} or {15, 30, 60, 120}), and dynamically
generates synchronized visual charts with Chandelier Exit stops & Buy/Sell signals.

Uses Chandelier_exit.py as an immutable library.
Zero internet or API connections required.
"""

import os
import sys
import argparse
from datetime import datetime, timezone
import matplotlib
# Use Agg backend if running in headless server without DISPLAY
if not os.environ.get("DISPLAY"):
    matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import pandas as pd

# Import pristine Chandelier Exit library
from Chandelier_exit import (
    load_ticks_from_csv,
    ticks_to_candles,
    calculate_chandelier,
    process_ticks_for_timeframes,
)


# ============================================================
# TOP CONFIGURATION VARIABLES
# ============================================================

# CSV input file with columns: times, prices
CSV_FILE_PATH = "/home/when/Desktop/MY_GIT/ChandelierExit_Decode/Data_gathering/tick_history/frxXAUUSD_1790274600.csv"
# CSV_FILE = Path("/home/when/Desktop/MY_GIT/ChandelierExit_Decode/Data_gathering/tick_history/frxXAUUSD_1790274600.csv")


# Seconds per candle. Put ANY values here!
# Example: [15, 30, 60] or [15, 30, 60, 120] or [10, 30, 60, 300]
# SECONDS_CANDLES = [15, 30, 60]
#SECONDS_CANDLES = [300]
#SECONDS_CANDLES = [60,300,600]
SECONDS_CANDLES = [60,120,180,240,300,360,420,480,540,600]



# Chandelier Exit Parameters
ATR_PERIOD = 22
ATR_MULTIPLIER = 3.0
USE_CLOSE = True

# Chart view settings
MAX_CANDLES_ON_GRAPH = 1000
SAVE_PLOT_IMAGE = "chandelier_multi_timeframe.png"
SYMBOL_NAME = "frxXAUUSD (Offline Data)"


# ============================================================
# HELPER: FORMAT SECONDS LABEL
# ============================================================

def format_timeframe_label(seconds: int) -> str:
    """Returns human-readable label, e.g. 15s, 30s, 1m (60s), 2m (120s)."""
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    elif seconds % 60 == 0:
        mins = seconds // 60
        return f"{mins}m ({seconds}s)"
    else:
        return f"{seconds}s"


# ============================================================
# DYNAMIC MULTI-TIMEFRAME PLOTTER
# ============================================================

def plot_multi_timeframe_chandelier(
    results_by_timeframe: dict,
    symbol: str = SYMBOL_NAME,
    max_candles: int = MAX_CANDLES_ON_GRAPH,
    save_path: str = SAVE_PLOT_IMAGE,
):
    """
    Dynamically generates stacked multi-row charts based on the input timeframes.
    Works whether input has 1, 2, 3, 4, or more timeframes.
    """
    timeframes = sorted(results_by_timeframe.keys())
    n = len(timeframes)

    if n == 0:
        print("No timeframe results to plot.")
        return

    # Modern dark trading terminal style
    plt.style.use("dark_background")
    fig_height = max(5.0, 3.8 * n)
    fig, axes = plt.subplots(
        nrows=n,
        ncols=1,
        figsize=(15, fig_height),
        sharex=False,
    )

    if n == 1:
        axes = [axes]

    fig.patch.set_facecolor("#0b0f17")

    print("\n" + "=" * 78)
    print(f"MULTI-TIMEFRAME CHANDELIER EXIT ANALYSIS ({n} Timeframes)")
    print("=" * 78)
    print(f"{'Timeframe':<14} | {'Candles':<8} | {'Buys':<6} | {'Sells':<6} | {'Direction':<12} | {'Close':<10} | {'Stop':<10}")
    print("-" * 78)

    for i, tf in enumerate(timeframes):
        ax = axes[i]
        ax.set_facecolor("#0f172a")

        df = results_by_timeframe[tf]
        tf_label = format_timeframe_label(tf)

        if df.empty:
            ax.text(
                0.5, 0.5, f"No candle data for timeframe {tf_label}",
                color="yellow", ha="center", va="center", transform=ax.transAxes
            )
            continue

        # Trim to recent candles for crisp visualization
        plot_df = df.tail(max_candles).copy()

        # 1. Price Line
        ax.plot(
            plot_df.index,
            plot_df["close"],
            color="#e2e8f0",
            linewidth=1.4,
            label="Close Price",
            alpha=0.95,
        )

        # 2. Long Stop (when Direction == 1)
        long_stop = plot_df["LongStop"].where(plot_df["Direction"] == 1)
        ax.plot(
            plot_df.index,
            long_stop,
            color="#00ff66",
            linewidth=2.2,
            label="Long Stop (Bullish)",
        )

        # 3. Short Stop (when Direction == -1)
        short_stop = plot_df["ShortStop"].where(plot_df["Direction"] == -1)
        ax.plot(
            plot_df.index,
            short_stop,
            color="#ff3355",
            linewidth=2.2,
            label="Short Stop (Bearish)",
        )

        # 4. BUY Signals
        buys = plot_df[plot_df["BuySignal"]]
        if not buys.empty:
            ax.scatter(
                buys.index,
                buys["LongStop"],
                color="#00ff66",
                marker="^",
                s=130,
                zorder=12,
                edgecolors="#ffffff",
                linewidths=0.7,
                label=f"BUY ({len(buys)})",
            )

        # 5. SELL Signals
        sells = plot_df[plot_df["SellSignal"]]
        if not sells.empty:
            ax.scatter(
                sells.index,
                sells["ShortStop"],
                color="#ff3355",
                marker="v",
                s=130,
                zorder=12,
                edgecolors="#ffffff",
                linewidths=0.7,
                label=f"SELL ({len(sells)})",
            )

        # Latest row stats
        latest = df.iloc[-1]
        direction = latest.get("Direction", 1)
        dir_str = "LONG / BULLISH" if direction == 1 else ("SHORT / BEARISH" if direction == -1 else "NEUTRAL")
        dir_color = "#00ff66" if direction == 1 else "#ff3355"
        latest_atr = latest.get("ATR", float("nan"))
        latest_close = latest.get("close", float("nan"))
        active_stop = latest.get("LongStop" if direction == 1 else "ShortStop", float("nan"))

        # Print summary row
        all_buys_count = int(df["BuySignal"].sum())
        all_sells_count = int(df["SellSignal"].sum())
        print(f"{tf_label:<14} | {len(df):<8} | {all_buys_count:<6} | {all_sells_count:<6} | {dir_str:<12} | {latest_close:<10.3f} | {active_stop:<10.3f}")

        # Subplot Header & Info Box
        info_text = (
            f"TIMEFRAME: {tf_label}\n"
            f"DIRECTION: {dir_str}\n"
            f"ATR({ATR_PERIOD}): {latest_atr:.3f} | STOP: {active_stop:.3f}\n"
            f"BUYS: {all_buys_count} | SELLS: {all_sells_count}"
        )
        ax.text(
            0.015, 0.94, info_text,
            transform=ax.transAxes,
            ha="left", va="top",
            fontsize=9.5,
            family="monospace",
            color=dir_color,
            bbox=dict(
                boxstyle="round,pad=0.5",
                facecolor="#0b0f17",
                edgecolor=dir_color,
                alpha=0.88,
            )
        )

        ax.set_ylabel("Price", fontsize=10, color="#94a3b8")
        ax.grid(True, color="#334155", alpha=0.3, linestyle="--", linewidth=0.7)
        ax.legend(loc="upper right", framealpha=0.35, fontsize=8.5)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M:%S"))

    axes[-1].set_xlabel("Candle Timestamp (UTC)", fontsize=11, color="#94a3b8")
    fig.suptitle(
        f"{symbol} — Chandelier Exit (Period={ATR_PERIOD}, Mult={ATR_MULTIPLIER}, UseClose={USE_CLOSE})",
        fontsize=14,
        fontweight="bold",
        color="#f8fafc",
        y=0.995,
    )

    fig.autofmt_xdate()
    plt.tight_layout()

    # Save output plot
    try:
        fig.savefig(save_path, dpi=180, facecolor=fig.get_facecolor(), edgecolor="none")
        print("-" * 78)
        print(f"Chart saved successfully to: {os.path.abspath(save_path)}")
    except Exception as e:
        print(f"Error saving figure: {e}")

    # Display plot if GUI is active
    if os.environ.get("DISPLAY"):
        try:
            plt.show()
        except Exception:
            pass


# ============================================================
# MAIN EXECUTION
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Offline Multi-Timeframe Chandelier Exit from Tick CSV"
    )
    parser.add_argument(
        "--csv",
        type=str,
        default=CSV_FILE_PATH,
        help="Path to CSV file with times,prices",
    )
    parser.add_argument(
        "--timeframes",
        nargs="+",
        type=int,
        default=SECONDS_CANDLES,
        help="List of timeframe seconds, e.g. --timeframes 15 30 60 120",
    )
    parser.add_argument(
        "--atr-period",
        type=int,
        default=ATR_PERIOD,
        help="ATR calculation period (default: 22)",
    )
    parser.add_argument(
        "--atr-multiplier",
        type=float,
        default=ATR_MULTIPLIER,
        help="ATR multiplier (default: 3.0)",
    )
    parser.add_argument(
        "--save",
        type=str,
        default=SAVE_PLOT_IMAGE,
        help="File path to save the output plot PNG",
    )
    parser.add_argument(
        "--max-candles",
        type=int,
        default=MAX_CANDLES_ON_GRAPH,
        help="Maximum candles to show per timeframe graph",
    )

    args = parser.parse_args()

    # Validate CSV file
    if not os.path.exists(args.csv):
        print(f"\nERROR: CSV file not found: {args.csv}")
        print("Please place your tick CSV with columns: times,prices")
        sys.exit(1)

    print(f"\nLoading tick data from: {args.csv}")
    ticks_df = load_ticks_from_csv(args.csv)
    print(f"Loaded {len(ticks_df)} ticks.")
    print(f"Time Range: {datetime.fromtimestamp(ticks_df['times'].iloc[0], tz=timezone.utc)} to {datetime.fromtimestamp(ticks_df['times'].iloc[-1], tz=timezone.utc)}")

    # Timeframe list (works for any sequence: {15, 30, 60}, {15, 30, 60, 120}, etc.)
    timeframes = list(dict.fromkeys(args.timeframes))
    print(f"Generating candles and Chandelier Exit for timeframes: {timeframes} seconds...")

    # Process all timeframes using Chandelier_exit library
    results = process_ticks_for_timeframes(
        ticks_df=ticks_df,
        timeframes=timeframes,
        atr_period=args.atr_period,
        atr_multiplier=args.atr_multiplier,
        use_close=USE_CLOSE,
    )

    # Plot results
    plot_multi_timeframe_chandelier(
        results_by_timeframe=results,
        symbol=SYMBOL_NAME,
        max_candles=args.max_candles,
        save_path=args.save,
    )

    print("=" * 78 + "\n")


if __name__ == "__main__":
    main()
