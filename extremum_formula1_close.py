#!/usr/bin/env python3
"""
================================================================================
 FORMULA 1: "USE CLOSE PRICE FOR EXTREMUMS" (CHANDELIER EXIT ENGINE)
================================================================================
Mathematical Definition:
When calculating the highest high and lowest low used by the Chandelier Exit,
use the candle's Close price instead of its High/Low wick.

Without "Use Close Price" (OFF):
    For the last 22 candles:
    Highest = max(High_1, High_2, ..., High_22)
    Lowest  = min(Low_1,  Low_2,  ..., Low_22)
    So the candle wicks are included.

With "Use Close Price" (ON):
    Highest = max(Close_1, Close_2, ..., Close_22)
    Lowest  = min(Close_1, Close_2, ..., Close_22)
    So wicks are completely ignored for finding the extreme.

Concrete Example:
    Suppose one candle has:
    High  = 105
    Close = 101
    Low   = 98

    If Use Close Price = OFF: Highest = 105
    If Use Close Price = ON:  Highest = 101

For Chandelier Exit Starting Point:
    Close ON:
        LongStop  = HighestClose_22 - ATR_22 * Multiplier
        ShortStop = LowestClose_22  + ATR_22 * Multiplier
    Close OFF:
        LongStop  = HighestHigh_22  - ATR_22 * Multiplier
        ShortStop = LowestLow_22   + ATR_22 * Multiplier
"""

import math
import sys
import csv

def compute_atr_wilder(highs, lows, closes, period=22):
    """Computes Wilder's RMA ATR (matching TradingView ta.rma(tr, period))."""
    n = len(closes)
    if n == 0:
        return []
    tr = [0.0] * n
    tr[0] = highs[0] - lows[0]
    for i in range(1, n):
        h, l, prev_c = highs[i], lows[i], closes[i - 1]
        tr[i] = max(h - l, abs(h - prev_c), abs(l - prev_c))

    atr = [0.0] * n
    atr[0] = tr[0]
    for i in range(1, n):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    return atr

def compute_formula1_extremums(highs, lows, closes, period=22, use_close=True):
    """
    Computes rolling extremums for Formula 1.
    If use_close=True, ignores wicks and finds extremes using Close prices only.
    If use_close=False, considers full High/Low wicks.
    """
    n = len(closes)
    highest = [0.0] * n
    lowest = [0.0] * n
    wick_diff_high = [0.0] * n
    wick_diff_low = [0.0] * n

    for i in range(n):
        start = max(0, i - period + 1)
        h_max = max(highs[j] for j in range(start, i + 1))
        l_min = min(lows[j] for j in range(start, i + 1))
        c_max = max(closes[j] for j in range(start, i + 1))
        c_min = min(closes[j] for j in range(start, i + 1))

        if use_close:
            highest[i] = c_max
            lowest[i] = c_min
        else:
            highest[i] = h_max
            lowest[i] = l_min

        wick_diff_high[i] = h_max - c_max
        wick_diff_low[i] = c_min - l_min

    return highest, lowest, wick_diff_high, wick_diff_low

def run_formula1_demo():
    print("=" * 80)
    print(" FORMULA 1: USE CLOSE PRICE FOR EXTREMUMS (DEMONSTRATION)")
    print("=" * 80)
    
    # 1. The user's exact simple example
    print("\n--- TEST CASE: USER GIVEN CANDLE EXAMPLE ---")
    c_example = {"High": 105.0, "Close": 101.0, "Low": 98.0}
    atr_val = 2.5
    mult = 3.0

    highest_off = c_example["High"]
    highest_on = c_example["Close"]

    long_stop_off = highest_off - mult * atr_val
    long_stop_on = highest_on - mult * atr_val

    print(f"Candle: High={c_example['High']}, Close={c_example['Close']}, Low={c_example['Low']}")
    print(f"ATR = {atr_val}, Multiplier = {mult}")
    print(f"Use Close Price = OFF: Highest = {highest_off:.2f} -> LongStop = {highest_off} - ({mult} * {atr_val}) = {long_stop_off:.2f}")
    print(f"Use Close Price = ON:  Highest = {highest_on:.2f} -> LongStop = {highest_on} - ({mult} * {atr_val}) = {long_stop_on:.2f}")
    print(f"Difference in Stop Level due to Wick: {long_stop_off - long_stop_on:.2f} points\n")

    # 2. Sequential bar test
    sample_bars = [
        {"time": 1, "open": 4274.65, "high": 4274.80, "low": 4274.50, "close": 4274.60},
        {"time": 2, "open": 4274.60, "high": 4275.20, "low": 4274.40, "close": 4274.75}, # Wick high overshoot
        {"time": 3, "open": 4274.75, "high": 4274.90, "low": 4273.80, "close": 4274.50}, # Wick low undershoot
        {"time": 4, "open": 4274.50, "high": 4275.10, "low": 4274.45, "close": 4275.05},
        {"time": 5, "open": 4275.05, "high": 4275.35, "low": 4274.90, "close": 4275.20},
    ]

    highs = [b["high"] for b in sample_bars]
    lows = [b["low"] for b in sample_bars]
    closes = [b["close"] for b in sample_bars]

    atrs = compute_atr_wilder(highs, lows, closes, period=3)
    h_on, l_on, wd_h_on, wd_l_on = compute_formula1_extremums(highs, lows, closes, period=3, use_close=True)
    h_off, l_off, _, _ = compute_formula1_extremums(highs, lows, closes, period=3, use_close=False)

    print("--- 5-BAR SIMULATION (Period = 3, Mult = 3.0) ---")
    print(f"{'Bar':<5} | {'High':<8} | {'Close':<8} | {'Low':<8} | {'H(Close ON)':<12} | {'H(Close OFF)':<12} | {'Wick Δ':<8}")
    print("-" * 75)
    for i in range(len(sample_bars)):
        print(f"{i+1:<5} | {highs[i]:<8.2f} | {closes[i]:<8.2f} | {lows[i]:<8.2f} | {h_on[i]:<12.2f} | {h_off[i]:<12.2f} | +{wd_h_on[i]:<7.2f}")
    print("=" * 80)
    print("Conclusion: 'Use Close Price for Extremums = ON' filters out violent wicks,")
    print("preventing premature trailing stop distortion from temporary liquidity sweeps.")

if __name__ == "__main__":
    run_formula1_demo()
