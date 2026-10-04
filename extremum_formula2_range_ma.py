#!/usr/bin/env python3
"""
================================================================================
 FORMULA 2: RANGE MOVING AVERAGE CROSSOVER EXTREMUMS ENGINE
================================================================================
Mathematical Definition:
1. Calculates a dynamic Moving Average (EMA, SMA, etc.) of length L.
2. Calculates a rolling price range envelope [PrevLow, PrevHigh] over lookback K:
       PrevHigh_t = max(Price_{t-K+1} ... Price_t)
       PrevLow_t  = min(Price_{t-K+1} ... Price_t)
   (Where Price can be Close when Use Close Price = ON, or High/Low when OFF).
3. Evaluates Range Crossover Expansion:
       Bullish Crossover: PrevLow_t > MA_t and PrevLow_{t-1} <= MA_{t-1}
                          (The entire lower boundary breaks clear above the MA)
       Bearish Breakdown: PrevHigh_t < MA_t and PrevHigh_{t-1} >= MA_{t-1}
                          (The entire upper boundary collapses below the MA)
4. Chandelier Trailing Stop Basis:
       Anchored to the moving envelope upper/lower extremes with ATR buffer.
"""

def compute_ema(src, length):
    """Computes Exponential Moving Average."""
    n = len(src)
    if n == 0:
        return []
    res = [0.0] * n
    res[0] = src[0]
    k = 2.0 / (length + 1)
    for i in range(1, n):
        res[i] = src[i] * k + res[i - 1] * (1.0 - k)
    return res

def compute_range_ma_crossover(highs, lows, closes, ma_len=20, lookback=5, use_close=False):
    """
    Computes Formula 2: Range MA Crossover Extremums.
    """
    n = len(closes)
    src_high = closes if use_close else highs
    src_low = closes if use_close else lows

    # Moving Average baseline
    ma = compute_ema(closes, ma_len)

    # Rolling range envelope
    prev_high = [0.0] * n
    prev_low = [0.0] * n
    cross_long = [False] * n
    cross_short = [False] * n

    for i in range(n):
        start = max(0, i - lookback + 1)
        prev_high[i] = max(src_high[j] for j in range(start, i + 1))
        prev_low[i] = min(src_low[j] for j in range(start, i + 1))

        if i > 0:
            if prev_low[i] > ma[i] and prev_low[i - 1] <= ma[i - 1]:
                cross_long[i] = True
            if prev_high[i] < ma[i] and prev_high[i - 1] >= ma[i - 1]:
                cross_short[i] = True

    return {
        "ma": ma,
        "prev_high": prev_high,
        "prev_low": prev_low,
        "cross_long": cross_long,
        "cross_short": cross_short,
    }

def run_formula2_demo():
    print("=" * 80)
    print(" FORMULA 2: RANGE MA CROSSOVER EXTREMUMS ENGINE (DEMONSTRATION)")
    print("=" * 80)

    # Simulated ascending expansion trend
    closes = [
        4270.0, 4270.5, 4271.0, 4271.8, 4272.5, 4273.0, 4274.0, 4275.5, 4277.0, 4278.5,
        4279.0, 4278.0, 4276.5, 4274.0, 4272.0, 4270.0, 4268.0, 4266.5, 4265.0, 4264.0
    ]
    highs = [c + 0.3 for c in closes]
    lows = [c - 0.3 for c in closes]

    res = compute_range_ma_crossover(highs, lows, closes, ma_len=5, lookback=3, use_close=False)

    print(f"{'Bar':<5} | {'Close':<8} | {'EMA(5)':<8} | {'PrevLow':<8} | {'PrevHigh':<8} | {'Range Event':<16}")
    print("-" * 70)
    for i in range(len(closes)):
        event = ""
        if res["cross_long"][i]:
            event = "▲ BULL EXPANSION"
        elif res["cross_short"][i]:
            event = "▼ BEAR BREAKDOWN"
        print(f"{i+1:<5} | {closes[i]:<8.2f} | {res['ma'][i]:<8.2f} | {res['prev_low'][i]:<8.2f} | {res['prev_high'][i]:<8.2f} | {event:<16}")
    print("=" * 80)

if __name__ == "__main__":
    run_formula2_demo()
