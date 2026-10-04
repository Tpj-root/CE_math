#!/usr/bin/env python3
"""
================================================================================
 FORMULA 3 & 4: MA+ CREST/TROUGH INFLECTION & STRUCTURAL SWING PIVOTS
================================================================================
Mathematical Definitions:

Formula 3 (MA+ Crest / Trough Extremums):
1. Smooths price with a moving average MA_t.
2. Evaluates the discrete first derivative (slope):
       ΔMA_t     = MA_t - MA_{t-1}
       ΔMA_{t-1} = MA_{t-1} - MA_{t-2}
3. Peak (Crest Resistance):
       ΔMA_{t-1} > 0 and ΔMA_t <= 0 (Upward slope flattens/turns down)
       CrestPrice = MA_{t-1}
4. Valley (Trough Support):
       ΔMA_{t-1} < 0 and ΔMA_t >= 0 (Downward slope flattens/turns up)
       TroughPrice = MA_{t-1}

Formula 4 (Structural Swing Pivot S/R):
1. Evaluates 3-bar structural fractals:
       Pivot High (Resistance): High_{t-1} > High_t and High_{t-1} > High_{t-2}
       Pivot Low  (Support):    Low_{t-1} < Low_t  and Low_{t-1} < Low_{t-2}
2. Projects stepped horizontal price levels forward until broken.
3. Anchors Chandelier Exit stops to the active structural swing pivot levels!
"""

def compute_ema(src, length):
    n = len(src)
    if n == 0:
        return []
    res = [0.0] * n
    res[0] = src[0]
    k = 2.0 / (length + 1)
    for i in range(1, n):
        res[i] = src[i] * k + res[i - 1] * (1.0 - k)
    return res

def compute_crest_trough_extremums(closes, ma_len=5):
    """Computes Formula 3: MA+ Crest / Trough inflection points."""
    n = len(closes)
    ma = compute_ema(closes, ma_len)
    crests = [False] * n
    troughs = [False] * n
    crest_prices = [None] * n
    trough_prices = [None] * n

    for i in range(2, n):
        slope_cur = ma[i] - ma[i - 1]
        slope_prev = ma[i - 1] - ma[i - 2]

        if slope_prev > 0 and slope_cur <= 0:
            crests[i] = True
            crest_prices[i] = ma[i - 1]
        if slope_prev < 0 and slope_cur >= 0:
            troughs[i] = True
            trough_prices[i] = ma[i - 1]

    return ma, crests, troughs, crest_prices, trough_prices

def compute_structural_pivots(highs, lows):
    """Computes Formula 4: 3-bar Fractal Structural Swing Pivots."""
    n = len(highs)
    pivot_highs = [False] * n
    pivot_lows = [False] * n
    active_resistance = [highs[0]] * n
    active_support = [lows[0]] * n

    cur_res = highs[0]
    cur_sup = lows[0]

    for i in range(2, n):
        if highs[i - 1] > highs[i] and highs[i - 1] > highs[i - 2]:
            pivot_highs[i - 1] = True
            cur_res = highs[i - 1]
        if lows[i - 1] < lows[i] and lows[i - 1] < lows[i - 2]:
            pivot_lows[i - 1] = True
            cur_sup = lows[i - 1]

        active_resistance[i] = cur_res
        active_support[i] = cur_sup

    return pivot_highs, pivot_lows, active_resistance, active_support

def run_formula3_and_4_demo():
    print("=" * 80)
    print(" FORMULA 3 & 4: MA+ CREST/TROUGH & STRUCTURAL PIVOT S/R (DEMONSTRATION)")
    print("=" * 80)

    # Wave session
    prices = [
        4270.0, 4272.0, 4274.5, 4276.0, 4275.5, 4273.0, 4271.0, 4270.5, 4272.0, 4275.0,
        4278.0, 4280.0, 4279.0, 4276.0, 4274.0, 4272.0, 4273.5, 4276.0, 4278.5, 4281.0
    ]
    highs = [p + 0.4 for p in prices]
    lows = [p - 0.4 for p in prices]

    ma, crests, troughs, c_prices, t_prices = compute_crest_trough_extremums(prices, ma_len=3)
    p_highs, p_lows, res_levels, sup_levels = compute_structural_pivots(highs, lows)

    print(f"{'Bar':<5} | {'Price':<8} | {'MA(3)':<8} | {'F3 Inflection':<16} | {'F4 Active S/R Zone':<22}")
    print("-" * 75)
    for i in range(len(prices)):
        f3_str = ""
        if crests[i]:
            f3_str = f"★ CREST ({c_prices[i]:.2f})"
        elif troughs[i]:
            f3_str = f"★ TROUGH ({t_prices[i]:.2f})"

        sr_str = f"Res: {res_levels[i]:.2f} / Sup: {sup_levels[i]:.2f}"
        print(f"{i+1:<5} | {prices[i]:<8.2f} | {ma[i]:<8.2f} | {f3_str:<16} | {sr_str:<22}")
    print("=" * 80)

if __name__ == "__main__":
    run_formula3_and_4_demo()
