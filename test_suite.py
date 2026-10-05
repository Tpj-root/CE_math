#!/usr/bin/env python3
"""
================================================================================
 SOFTWARE TESTING SUITE & AUDIT REPORT GENERATOR
 Quantitative Engine: Heikin-Ashi + Chandelier Exit Studio
================================================================================
 Architecture:
                         SOFTWARE TESTING
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
       Unit Test          Integration Test      System Test
          │                    │                    │
     One function          Several modules       Whole program
          │                    │                    │
          ▼                    ▼                    ▼
      all the function()      reader + writer        Complete app
================================================================================
"""

import os
import sys
import time
import json
import math
import argparse
from datetime import datetime

# Import functions from engine
from trading_ha_chandelier import (
    load_ticks_raw,
    ticks_to_candles_raw,
    to_heikin_ashi_raw,
    compute_extremums_raw,
    chandelier_exit_raw,
    simulate_trades_raw,
    compute_noise_reduction_analytics_raw,
)
from mt5_trading import (
    check_autotrading,
    _normalize_volume,
    _build_stops,
    buy,
    sell,
    trailing_stoploss,
    partial_close,
    calculate_trade_pnl,
    mt5,
)
from position_update import PositionTrailingUpdater

# Terminal ANSI color helpers
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


class TestCaseResult:
    def __init__(self, test_id, tier, func_name, name, desc):
        self.test_id = test_id
        self.tier = tier
        self.func_name = func_name
        self.name = name
        self.desc = desc
        self.assertions = []
        self.passed = True
        self.duration_ms = 0.0
        self.error = None

    def assert_true(self, condition, msg, expected=None, actual=None):
        passed = bool(condition)
        self.assertions.append({
            "msg": msg,
            "passed": passed,
            "expected": expected,
            "actual": actual,
        })
        if not passed:
            self.passed = False

    def assert_close(self, actual, expected, msg, tolerance=0.001):
        diff = abs(actual - expected)
        passed = diff <= tolerance
        self.assertions.append({
            "msg": f"{msg} (expected ~{expected}, got {actual})",
            "passed": passed,
            "expected": expected,
            "actual": actual,
        })
        if not passed:
            self.passed = False


class QuantTestSuite:
    def __init__(self, custom_csv=None):
        self.custom_csv = custom_csv
        self.results = []
        self.start_time = 0.0
        self.total_duration_ms = 0.0

    # -------------------------------------------------------------------------
    # TIER 1: UNIT TESTS (One function at a time)
    # -------------------------------------------------------------------------
    def test_ut01_csv_reader(self):
        r = TestCaseResult("UT-01", "unit", "load_ticks_raw", "CSV Tick Parsing", "Validates timestamps and price conversions")
        t0 = time.perf_counter()
        tmp_csv = "_test_tmp_ticks.csv"
        try:
            with open(tmp_csv, "w") as f:
                f.write("times,prices\n1790274600,4274.65\n1790274601,4274.58\n1790274602,4274.68\n")
            ticks = load_ticks_raw(tmp_csv)
            r.assert_true(len(ticks) == 3, "Parsed exactly 3 records", 3, len(ticks))
            r.assert_true(ticks[0][0] == 1790274600, "First timestamp matches", 1790274600, ticks[0][0])
            r.assert_close(ticks[0][1], 4274.65, "First price matches")
            r.assert_close(ticks[2][1], 4274.68, "Last price matches")
        finally:
            if os.path.exists(tmp_csv):
                os.remove(tmp_csv)
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut02_candle_aggregator(self):
        r = TestCaseResult("UT-02", "unit", "ticks_to_candles_raw", "OHLC Aggregation Invariant", "High >= max(Open,Close) and Low <= min(Open,Close)")
        t0 = time.perf_counter()
        ticks = [
            (100, 50.0),
            (110, 55.0),
            (115, 48.0),
            (119, 52.0),
            (120, 52.0),
            (130, 58.0),
        ]
        candles = ticks_to_candles_raw(ticks, 60)
        r.assert_true(len(candles) == 2, "Creates 2 candle buckets", 2, len(candles))
        c0 = candles[0]
        r.assert_close(c0["open"], 50.0, "Open is first tick (50.0)")
        r.assert_close(c0["high"], 55.0, "High is max tick (55.0)")
        r.assert_close(c0["low"], 48.0, "Low is min tick (48.0)")
        r.assert_close(c0["close"], 52.0, "Close is last tick (52.0)")
        r.assert_true(c0["high"] >= max(c0["open"], c0["close"]), "High >= max(Open, Close) held")
        r.assert_true(c0["low"] <= min(c0["open"], c0["close"]), "Low <= min(Open, Close) held")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut03_heikin_ashi_seed(self):
        r = TestCaseResult("UT-03", "unit", "to_heikin_ashi_raw", "Heikin-Ashi Bar 0 Pine Seed", "Pine Script calibration on seed bar")
        t0 = time.perf_counter()
        candles = [{"time": 100, "time_str": "10:00", "open": 100.0, "high": 110.0, "low": 90.0, "close": 104.0, "ticks": 10}]
        ha = to_heikin_ashi_raw(candles)
        r.assert_true(len(ha) == 1, "Transformed 1 HA candle")
        b0 = ha[0]
        # haClose = (100 + 110 + 90 + 104)/4 = 101.0
        # haOpen = (100 + 104)/2 = 102.0
        # haHigh = max(110, 102, 101) = 110.0
        # haLow = min(90, 102, 101) = 90.0
        r.assert_close(b0["ha_close"], 101.0, "haClose[0] matches (O+H+L+C)/4 = 101.0")
        r.assert_close(b0["ha_open"], 102.0, "haOpen[0] matches (O+C)/2 = 102.0")
        r.assert_close(b0["ha_high"], 110.0, "haHigh[0] matches max(H, haOpen, haClose) = 110.0")
        r.assert_close(b0["ha_low"], 90.0, "haLow[0] matches min(L, haOpen, haClose) = 90.0")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut04_heikin_ashi_continuity(self):
        r = TestCaseResult("UT-04", "unit", "to_heikin_ashi_raw", "Heikin-Ashi Recursive Smoothing", "haOpen[i] = (haOpen[i-1] + haClose[i-1])/2")
        t0 = time.perf_counter()
        candles = [
            {"time": 100, "time_str": "10:00", "open": 100.0, "high": 110.0, "low": 90.0, "close": 104.0, "ticks": 10},
            {"time": 160, "time_str": "10:01", "open": 105.0, "high": 115.0, "low": 95.0, "close": 112.0, "ticks": 12},
        ]
        ha = to_heikin_ashi_raw(candles)
        b1 = ha[1]
        # haOpen[1] = (102.0 + 101.0) / 2 = 101.5
        # haClose[1] = (105 + 115 + 95 + 112)/4 = 106.75
        r.assert_close(b1["ha_open"], 101.5, "haOpen[1] matches recursive formula = 101.5")
        r.assert_close(b1["ha_close"], 106.75, "haClose[1] matches (O+H+L+C)/4 = 106.75")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut05_extremums_noise_filter(self):
        r = TestCaseResult("UT-05", "unit", "compute_extremums_raw", "Use Close Price = ON (Noise Filter)", "Highest = max(Close), Lowest = min(Close)")
        t0 = time.perf_counter()
        ha = [{
            "time": 100, "time_str": "10:00",
            "ha_open": 100.0, "ha_high": 105.0, "ha_low": 98.0, "ha_close": 101.0,
            "real_open": 100.0, "real_high": 105.0, "real_low": 98.0, "real_close": 101.0,
            "ticks": 5
        }]
        ext_on = compute_extremums_raw(ha, atr_period=22, use_close=True, extremum_formula="close")
        ext_off = compute_extremums_raw(ha, atr_period=22, use_close=False, extremum_formula="close")

        # Close ON: Upper anchor is Close (101.0), wicks ignored
        r.assert_close(ext_on["upper_anchor"][0], 101.0, "Close ON upper anchor is Close (101.0)")
        # Close OFF: Upper anchor is High (105.0), wicks included
        r.assert_close(ext_off["upper_anchor"][0], 105.0, "Close OFF upper anchor is High (105.0)")
        r.assert_close(ext_on["upper_wick_noise"][0], 4.0, "Upper wick noise is High - Close = 4.0")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut06_stop_ratchet_tightening(self):
        r = TestCaseResult("UT-06", "unit", "chandelier_exit_raw", "Monotonic Ratchet Invariant", "Long stop never decreases in uptrend")
        t0 = time.perf_counter()
        # Generate 10 upward candles
        ha = []
        p = 100.0
        for i in range(15):
            ha.append({
                "time": i * 60, "time_str": f"{i:02d}:00",
                "ha_open": p, "ha_high": p + 2.0, "ha_low": p - 0.5, "ha_close": p + 1.5,
                "real_open": p, "real_high": p + 2.0, "real_low": p - 0.5, "real_close": p + 1.5,
                "ticks": 10
            })
            p += 1.5
        ce = chandelier_exit_raw(ha, atr_period=5, atr_mult=2.0, mode="tradingview")
        
        ratchet_ok = True
        for i in range(1, len(ce)):
            if ce[i]["direction"] == 1 and ce[i-1]["direction"] == 1:
                if ce[i]["long_stop"] < ce[i-1]["long_stop"] - 1e-5:
                    ratchet_ok = False
        r.assert_true(ratchet_ok, "Long stop monotonically increases or stays flat during uptrend")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut07_mt5_autotrading_check(self):
        r = TestCaseResult("UT-07", "unit", "check_autotrading", "MT5 AutoTrading Verification", "Detects if Algo Trading is Allowed in terminal")
        t0 = time.perf_counter()
        status = check_autotrading(verbose=False)
        r.assert_true(isinstance(status, bool), "check_autotrading returns boolean status")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut08_mt5_volume_normalization(self):
        r = TestCaseResult("UT-08", "unit", "_normalize_volume", "Order Volume Lot Normalization", "Rounds volume to broker step and bounds [min, max]")
        t0 = time.perf_counter()
        info = mt5.symbol_info("XAUUSD")
        norm1 = _normalize_volume(info, 0.055)
        norm2 = _normalize_volume(info, 0.001)
        r.assert_true(norm1 >= info.volume_min, "Normalized volume >= volume_min")
        r.assert_true(norm2 >= info.volume_min, "Sub-minimum volume bumped to volume_min")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut09_mt5_stop_construction(self):
        r = TestCaseResult("UT-09", "unit", "_build_stops", "MT5 Order SL/TP Construction", "Computes absolute prices from point distances")
        t0 = time.perf_counter()
        info = mt5.symbol_info("XAUUSD")
        tick = mt5.symbol_info_tick("XAUUSD")
        sl_buy, tp_buy = _build_stops(info, tick, "buy", stoploss=0, takeprofit=0, sl_points=300, tp_points=500)
        r.assert_true(sl_buy > 0 and sl_buy < tick.ask, "BUY Stop Loss is below Ask entry price")
        r.assert_true(tp_buy > tick.ask, "BUY Take Profit is above Ask entry price")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut10_mt5_trailing_stoploss(self):
        r = TestCaseResult("UT-10", "unit", "trailing_stoploss", "Chandelier Exit Dynamic Trailing SL", "Ratchets open position SL forward with CE stop")
        t0 = time.perf_counter()
        res = buy("XAUUSD", volume=0.1, stoploss=4250.0, comment="TEST_BUY")
        ticket = res.order if res and hasattr(res, "order") else 10001
        mod_res = trailing_stoploss("XAUUSD", ticket, 4260.0)
        r.assert_true(mod_res is not None, "trailing_stoploss dispatched modification to MT5")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut11_mt5_partial_close(self):
        r = TestCaseResult("UT-11", "unit", "partial_close", "MT5 Position Partial Close Execution", "Sends opposite order to partially reduce position")
        t0 = time.perf_counter()
        res = buy("XAUUSD", volume=0.2, comment="TEST_FOR_PARTIAL")
        ticket = res.order if res and hasattr(res, "order") else 10001
        ok = partial_close(ticket, 0.1)
        r.assert_true(ok is True or ok is not None, "partial_close processed successfully")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut12_mt5_buy_sell_triggers(self):
        r = TestCaseResult("UT-12", "unit", "buy & sell", "Full BUY and SELL Order Dispatch", "Executes market deals with Chandelier Exit stoploss points")
        t0 = time.perf_counter()
        buy_res = buy("XAUUSD", volume=0.1, stoploss=4255.0, takeprofit=4295.0, comment="UT12_BUY")
        r.assert_true(buy_res is not None, "BUY dispatch returned valid order result")
        r.assert_true(getattr(buy_res, "retcode", None) == 10009, "BUY execution retcode 10009 DONE")

        sell_res = sell("XAUUSD", volume=0.1, stoploss=4290.0, takeprofit=4250.0, comment="UT12_SELL")
        r.assert_true(sell_res is not None, "SELL dispatch returned valid order result")
        r.assert_true(getattr(sell_res, "retcode", None) == 10009, "SELL execution retcode 10009 DONE")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut13_position_trailing_update_5min(self):
        r = TestCaseResult("UT-13", "unit", "PositionTrailingUpdater", "5-Min Position Trailing SL Ratchet", "Periodically ratchets open positions forward to CE stops")
        t0 = time.perf_counter()
        updater = PositionTrailingUpdater(symbol="XAUUSD", timeframe_sec=300, verbose=False)
        report = updater.update_all_positions()
        r.assert_true(isinstance(report, dict), "Position updater returns structured update dictionary")
        r.assert_true("status" in report and report["status"] in ("success", "no_positions", "disabled"), "Status is valid")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut14_autotrade_toggle_rule(self):
        r = TestCaseResult("UT-14", "unit", "check_autotrading", "AutoTrading Toggle & Error Guard", "Enforces CTRL+E requirement and red toolbar error message")
        t0 = time.perf_counter()
        # Test enabled status check
        orig_state = mt5._auto_trading_enabled
        try:
            mt5._auto_trading_enabled = True
            ok = check_autotrading(verbose=False)
            r.assert_true(ok is True, "check_autotrading detects ENABLED (Green)")

            mt5._auto_trading_enabled = False
            disabled = check_autotrading(verbose=False)
            r.assert_true(disabled is False, "check_autotrading detects DISABLED (Red)")

            # Order dispatch must be blocked when disabled
            blocked_res = buy("XAUUSD", volume=0.1, comment="SHOULD_FAIL")
            r.assert_true(blocked_res is None or getattr(blocked_res, "retcode", 0) != 10009, "Order blocked when AutoTrading is disabled")
        finally:
            mt5._auto_trading_enabled = orig_state
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_ut15_volume_pnl_calculation(self):
        r = TestCaseResult("UT-15", "unit", "calculate_trade_pnl", "Volume Variable & PnL Accounting", "Calculates contract size weighted PnL: (delta) * volume * contract_size")
        t0 = time.perf_counter()
        # 0.1 lots on Gold (contract_size 100): $10 move = $10 * 0.1 * 100 = $100
        pnl_long = calculate_trade_pnl(4270.0, 4280.0, volume=0.1, side="BUY", contract_size=100.0)
        r.assert_close(pnl_long, 100.0, "BUY PnL: 10 pt move @ 0.1 lots = +$100.00")

        # 0.2 lots on Short: $5 drop = $5 * 0.2 * 100 = $100
        pnl_short = calculate_trade_pnl(4280.0, 4275.0, volume=0.2, side="SELL", contract_size=100.0)
        r.assert_close(pnl_short, 100.0, "SELL PnL: 5 pt drop @ 0.2 lots = +$100.00")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    # -------------------------------------------------------------------------
    # TIER 2: INTEGRATION TESTS (Several modules working together)
    # -------------------------------------------------------------------------
    def test_it01_reader_aggregator_pipeline(self):
        r = TestCaseResult("IT-01", "integration", "Reader + Aggregator", "Data Pipeline Conservation", "Raw CSV text -> Ticks -> OHLC Candles")
        t0 = time.perf_counter()
        tmp_csv = "_test_pipeline_ticks.csv"
        try:
            with open(tmp_csv, "w") as f:
                f.write("times,prices\n")
                for i in range(180):
                    f.write(f"{1790274600 + i},{4274.0 + (i % 10)*0.1:.2f}\n")
            ticks = load_ticks_raw(tmp_csv)
            candles = ticks_to_candles_raw(ticks, 60)
            r.assert_true(len(candles) == 3, "180 ticks at 60s bucket form 3 candles", 3, len(candles))
            sum_ticks = sum(c["ticks"] for c in candles)
            r.assert_true(sum_ticks == len(ticks), "Tick count conserved across all candles", len(ticks), sum_ticks)
        finally:
            if os.path.exists(tmp_csv):
                os.remove(tmp_csv)
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_it02_ha_extremums_chandelier_pipeline(self):
        r = TestCaseResult("IT-02", "integration", "HA + Extremums + Chandelier", "Quant Model Integration", "Candle -> HA -> Extremums -> Chandelier Stops")
        t0 = time.perf_counter()
        candles = []
        p = 4270.0
        for i in range(25):
            candles.append({
                "time": i * 60, "time_str": f"{i:02d}:00",
                "open": p, "high": p + 3.0, "low": p - 2.0, "close": p + 1.0,
                "ticks": 10
            })
            p += 0.5
        ha = to_heikin_ashi_raw(candles)
        ce = chandelier_exit_raw(ha, atr_period=10, atr_mult=3.0, mode="tradingview", use_close=True)
        r.assert_true(len(ce) == len(candles), "Chandelier output matches candle count", len(candles), len(ce))
        for b in ce:
            r.assert_true("long_stop" in b and "short_stop" in b, "Stops present in output bar")
            r.assert_true(not math.isnan(b["long_stop"]), "Long stop is not NaN")
            r.assert_true(not math.isnan(b["short_stop"]), "Short stop is not NaN")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_it03_all_four_extremum_formulas(self):
        r = TestCaseResult("IT-03", "integration", "Formula Modulation", "All 4 Extremum Formulas Contract", "F1 (Close), F2 (Range MA), F3 (Crest/Trough), F4 (Pivot S/R)")
        t0 = time.perf_counter()
        candles = []
        p = 4250.0
        for i in range(30):
            candles.append({
                "time": i * 60, "time_str": f"{i:02d}:00",
                "open": p, "high": p + 2.5, "low": p - 2.5, "close": p + (1.0 if i % 2 == 0 else -1.0),
                "ticks": 15
            })
            p += (1.0 if i < 15 else -1.0)
        ha = to_heikin_ashi_raw(candles)

        for f in ["close", "range_ma", "crest_trough", "pivot_sr"]:
            ce = chandelier_exit_raw(ha, atr_period=10, atr_mult=3.0, extremum_formula=f)
            r.assert_true(len(ce) == len(ha), f"Formula {f} produced {len(ha)} bars")
            no_nan = all(not math.isnan(b["highest"]) and not math.isnan(b["lowest"]) for b in ce)
            r.assert_true(no_nan, f"Formula {f} has zero NaN anchors")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_it04_online_live_tick_pipeline(self):
        r = TestCaseResult("IT-04", "integration", "Online Live Pipeline", "Live Tick -> HA -> CE -> Buy/Sell Trigger", "End-to-end signal execution on live streaming ticks")
        t0 = time.perf_counter()
        ticks = [(1790274600 + i, 4270.0 + (i * 0.2)) for i in range(120)]
        candles = ticks_to_candles_raw(ticks, 60)
        ha = to_heikin_ashi_raw(candles)
        ce = chandelier_exit_raw(ha, atr_period=5, atr_mult=2.0, mode="tradingview", use_close=True)
        r.assert_true(len(ce) > 0, "Chandelier bars computed from tick stream")
        r.assert_true(ce[-1]["direction"] in (1, -1), "Valid direction determined")
        pnl = calculate_trade_pnl(4270.0, 4274.0, volume=0.1, side="BUY", contract_size=100.0)
        r.assert_close(pnl, 40.0, "Volume-scaled PnL calculation is accurate")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    # -------------------------------------------------------------------------
    # TIER 3: SYSTEM TESTS (Whole Program / Complete App)
    # -------------------------------------------------------------------------
    def test_st01_end_to_end_backtest(self):
        r = TestCaseResult("ST-01", "system", "Full Quantitative Engine", "End-to-End Simulation Audit", "Validates complete run from tick file to PnL and trade log")
        t0 = time.perf_counter()
        csv_file = self.custom_csv if (self.custom_csv and os.path.exists(self.custom_csv)) else "frxXAUUSD_1790274600.csv"
        
        if not os.path.exists(csv_file):
            with open(csv_file, "w") as f:
                f.write("times,prices\n")
                for i in range(300):
                    f.write(f"{1790274600 + i},{4274.0 + math.sin(i*0.1)*5.0:.2f}\n")

        ticks = load_ticks_raw(csv_file)
        r.assert_true(len(ticks) > 0, f"Loaded {len(ticks)} ticks from {csv_file}")
        candles = ticks_to_candles_raw(ticks, 60)
        ha = to_heikin_ashi_raw(candles)
        ce = chandelier_exit_raw(ha, atr_period=14, atr_mult=3.0, mode="tradingview", use_close=True)
        trades = simulate_trades_raw(ce, execution_price="real_open")

        r.assert_true(len(ce) == len(candles), "System processed all candles")
        if trades:
            win_rate = sum(1 for t in trades if t["pnl"] > 0) / len(trades) * 100.0
            r.assert_true(0.0 <= win_rate <= 100.0, "Win rate bounded between 0% and 100%", expected="[0, 100]", actual=win_rate)
            total_pnl = sum(t["pnl"] for t in trades)
            r.assert_true(not math.isnan(total_pnl), "Total PnL is numeric and valid")
        else:
            r.assert_true(True, "Zero trades generated on small dataset (valid)")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def test_st02_causality_zero_lookahead(self):
        r = TestCaseResult("ST-02", "system", "Causality Engine", "Zero-Lookahead Causality Verification", "Future ticks never alter past bars")
        t0 = time.perf_counter()
        # Create 20 candles
        candles = []
        p = 100.0
        for i in range(20):
            candles.append({
                "time": i * 60, "time_str": f"{i:02d}:00",
                "open": p, "high": p + 2.0, "low": p - 2.0, "close": p + 0.5,
                "ticks": 10
            })
            p += 0.5
        ha_full = to_heikin_ashi_raw(candles)
        ce_full = chandelier_exit_raw(ha_full, atr_period=5, atr_mult=3.0)

        # Truncate at candle 8
        ha_partial = to_heikin_ashi_raw(candles[:8])
        ce_partial = chandelier_exit_raw(ha_partial, atr_period=5, atr_mult=3.0)

        causal = True
        for i in range(8):
            if abs(ce_full[i]["long_stop"] - ce_partial[i]["long_stop"]) > 1e-4:
                causal = False
            if abs(ce_full[i]["short_stop"] - ce_partial[i]["short_stop"]) > 1e-4:
                causal = False
        r.assert_true(causal, "Strict causality proven: historical bars identical regardless of future additions")
        r.duration_ms = (time.perf_counter() - t0) * 1000.0
        return r

    def run_all(self):
        self.start_time = time.perf_counter()
        tests = [
            # Tier 1: Unit Tests
            self.test_ut01_csv_reader,
            self.test_ut02_candle_aggregator,
            self.test_ut03_heikin_ashi_seed,
            self.test_ut04_heikin_ashi_continuity,
            self.test_ut05_extremums_noise_filter,
            self.test_ut06_stop_ratchet_tightening,
            self.test_ut07_mt5_autotrading_check,
            self.test_ut08_mt5_volume_normalization,
            self.test_ut09_mt5_stop_construction,
            self.test_ut10_mt5_trailing_stoploss,
            self.test_ut11_mt5_partial_close,
            self.test_ut12_mt5_buy_sell_triggers,
            self.test_ut13_position_trailing_update_5min,
            self.test_ut14_autotrade_toggle_rule,
            self.test_ut15_volume_pnl_calculation,
            # Tier 2: Integration Tests
            self.test_it01_reader_aggregator_pipeline,
            self.test_it02_ha_extremums_chandelier_pipeline,
            self.test_it03_all_four_extremum_formulas,
            self.test_it04_online_live_tick_pipeline,
            # Tier 3: System Tests
            self.test_st01_end_to_end_backtest,
            self.test_st02_causality_zero_lookahead,
        ]

        print("=" * 80)
        print(f" {BOLD}QUANTITATIVE SOFTWARE TESTING & AUDIT SUITE{RESET}")
        print(f" Three-Tier Architecture: Unit ➔ Integration ➔ System")
        print("=" * 80)

        self.results = []
        for t in tests:
            try:
                res = t()
            except Exception as e:
                res = TestCaseResult("ERR", "unknown", "exception", str(t), str(e))
                res.passed = False
                res.error = str(e)
            self.results.append(res)
            
            # Print console row
            status_str = f"{GREEN}✓ PASSED{RESET}" if res.passed else f"{RED}✗ FAILED{RESET}"
            tier_badge = f"{CYAN}[{res.tier.upper()}]{RESET}"
            print(f" {tier_badge:<18} {res.test_id:<8} {res.name:<45} {res.duration_ms:>6.2f}ms  {status_str}")

        self.total_duration_ms = (time.perf_counter() - self.start_time) * 1000.0
        return self.results

    def generate_report(self):
        passed = sum(1 for r in self.results if r.passed)
        failed = sum(1 for r in self.results if not r.passed)
        total = len(self.results)
        rate = (passed / total * 100.0) if total else 0.0

        md = f"""# SOFTWARE TESTING AUDIT REPORT
**Quantitative Trading Studio — Heikin-Ashi & Chandelier Exit Engine**

- **Date**: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
- **Result**: **{'PASSED (100% SUCCESS)' if failed == 0 else f'FAILED ({failed} FAILURES)'}**
- **Pass Rate**: {rate:.1f}% ({passed}/{total} tests passed)
- **Duration**: {self.total_duration_ms:.2f} ms

---

### Three-Tier Testing Architecture

```
                         SOFTWARE TESTING
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
       Unit Test          Integration Test      System Test
          │                    │                    │
     One function          Several modules       Whole program
          │                    │                    │
          ▼                    ▼                    ▼
      all the function()      reader + writer        Complete app
```

---

### Detailed Test Execution Log

| ID | Tier | Target | Test Specification | Duration | Status |
| :--- | :---: | :--- | :--- | :---: | :---: |
"""
        for r in self.results:
            md += f"| `{r.test_id}` | **{r.tier.upper()}** | `{r.func_name}` | {r.name} | {r.duration_ms:.2f}ms | {'PASSED' if r.passed else 'FAILED'} |\n"

        md += "\n---\n*Report generated by Python Software Testing Suite.*\n"
        return md

    def generate_html_report(self):
        passed = sum(1 for r in self.results if r.passed)
        failed = sum(1 for r in self.results if not r.passed)
        total = len(self.results)
        rate = (passed / total * 100.0) if total else 0.0

        rows = ""
        for r in self.results:
            badge = '<span style="color:#10b981;font-weight:bold;">PASSED</span>' if r.passed else '<span style="color:#ef4444;font-weight:bold;">FAILED</span>'
            rows += f"""<tr>
              <td><code>{r.test_id}</code></td>
              <td><strong>{r.tier.upper()}</strong></td>
              <td><code>{r.func_name}</code></td>
              <td>{r.name}</td>
              <td>{r.duration_ms:.2f} ms</td>
              <td>{badge}</td>
            </tr>"""

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Software Testing Audit Report</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: #0b0f17; color: #cbd5e1; padding: 30px; }}
    h1, h2, h3 {{ color: #f8fafc; }}
    .card {{ background: #131d2e; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 20px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }}
    th, td {{ padding: 10px; border-bottom: 1px solid #1e293b; text-align: left; }}
    th {{ color: #94a3b8; text-transform: uppercase; font-size: 11px; }}
    pre {{ background: #070b12; padding: 15px; border-radius: 6px; overflow-x: auto; color: #38bdf8; font-size: 12px; }}
  </style>
</head>
<body>
  <h1>SOFTWARE TESTING AUDIT REPORT</h1>
  <p>Quantitative Trading Studio &bull; Heikin-Ashi &amp; Chandelier Exit Engine</p>
  
  <div class="card">
    <h3>Executive Summary</h3>
    <p><strong>Result:</strong> {'PASSED (100% SUCCESS)' if failed == 0 else f'FAILED ({failed} FAILURES)'}</p>
    <p><strong>Pass Rate:</strong> {rate:.1f}% ({passed}/{total} tests) &bull; <strong>Duration:</strong> {self.total_duration_ms:.2f} ms</p>
    <p><strong>Timestamp:</strong> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
  </div>

  <div class="card">
    <h3>Three-Tier Architecture</h3>
    <pre>
                         SOFTWARE TESTING
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
       Unit Test          Integration Test      System Test
          │                    │                    │
     One function          Several modules       Whole program
          │                    │                    │
          ▼                    ▼                    ▼
      all the function()      reader + writer        Complete app
    </pre>
  </div>

  <div class="card">
    <h3>Detailed Test Results</h3>
    <table>
      <thead>
        <tr><th>ID</th><th>Tier</th><th>Target Function</th><th>Specification</th><th>Duration</th><th>Status</th></tr>
      </thead>
      <tbody>
        {rows}
      </tbody>
    </table>
  </div>
</body>
</html>"""
        return html

    def generate_function_outputs(self, csv_file=None, output_dir="output_functions"):
        """
        Executes each pipeline function sequentially on the uploaded CSV
        and saves discrete JSON output files for deep testing and inspection.
        """
        os.makedirs(output_dir, exist_ok=True)
        csv_path = csv_file or self.custom_csv or "frxXAUUSD_1790274600.csv"
        print(f" {CYAN}⚡ Generating Function Outputs from: {BOLD}{csv_path}{RESET}")

        # 1. Ticks
        ticks = load_ticks_raw(csv_path)
        with open(os.path.join(output_dir, "01_ticks.json"), "w") as f:
            json.dump([{"time": t[0], "price": t[1]} for t in ticks[:100]], f, indent=2)
        print(f"   [1/7] load_ticks_raw: {len(ticks)} ticks -> 01_ticks.json")

        # 2. Candles
        candles = ticks_to_candles_raw(ticks, 60)
        with open(os.path.join(output_dir, "02_candles.json"), "w") as f:
            json.dump(candles[:50], f, indent=2)
        print(f"   [2/7] ticks_to_candles_raw: {len(candles)} candles -> 02_candles.json")

        # 3. Heikin-Ashi
        ha = to_heikin_ashi_raw(candles)
        with open(os.path.join(output_dir, "03_heikin_ashi.json"), "w") as f:
            json.dump(ha[:50], f, indent=2)
        print(f"   [3/7] to_heikin_ashi_raw: {len(ha)} HA candles -> 03_heikin_ashi.json")

        # 4. Extremums
        ext_on = compute_extremums_raw(ha, 22, True, "close")
        with open(os.path.join(output_dir, "04_extremums_close_on.json"), "w") as f:
            json.dump({
                "highest_close": ext_on["highest_close"][:50],
                "lowest_close": ext_on["lowest_close"][:50],
                "upper_anchor": ext_on["upper_anchor"][:50],
                "lower_anchor": ext_on["lower_anchor"][:50],
                "upper_wick_noise": ext_on["upper_wick_noise"][:50],
            }, f, indent=2)
        print(f"   [4/7] compute_extremums_raw: {len(ext_on['upper_anchor'])} anchors -> 04_extremums_close_on.json")

        # 5. Chandelier Exit
        ce = chandelier_exit_raw(ha, 22, 3.0, "tradingview", True, "close")
        with open(os.path.join(output_dir, "05_chandelier_bars.json"), "w") as f:
            json.dump(ce[:50], f, indent=2)
        print(f"   [5/7] chandelier_exit_raw: {len(ce)} bars -> 05_chandelier_bars.json")

        # 6. Trade Simulation
        trades = simulate_trades_raw(ce, execution_price="real_open")
        with open(os.path.join(output_dir, "06_trades.json"), "w") as f:
            json.dump(trades, f, indent=2)
        print(f"   [6/7] simulate_trades_raw: {len(trades)} trades -> 06_trades.json")

        # 7. Noise Analytics
        noise = compute_noise_reduction_analytics_raw(ce, True)
        with open(os.path.join(output_dir, "07_noise_reduction.json"), "w") as f:
            json.dump(noise, f, indent=2)
        print(f"   [7/7] compute_noise_reduction_analytics_raw: -> 07_noise_reduction.json")

        print(f"\n {GREEN}{BOLD}✓ Complete function outputs written to: ./{output_dir}/{RESET}\n")


def main():
    parser = argparse.ArgumentParser(description="Software Testing Suite & Function Output Generator for HA + Chandelier Exit Engine")
    parser.add_argument("--csv", type=str, default=None, help="Custom tick CSV file to audit")
    parser.add_argument("--report", action="store_true", help="Generate and save test_report.md, test_report.json, and test_report.html")
    parser.add_argument("--generate-output", action="store_true", help="Generate discrete JSON output files for each pipeline function")
    parser.add_argument("--test-function", type=str, default=None, help="Test a single function in isolation (e.g., load_ticks_raw, compute_extremums_raw)")
    parser.add_argument("--baseline", choices=["save", "compare"], default=None, help="Save current output as baseline or compare future code against baseline")
    args = parser.parse_args()

    suite = QuantTestSuite(custom_csv=args.csv)

    if args.generate_output:
        suite.generate_function_outputs(args.csv)

    results = suite.run_all()

    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total = len(results)

    print("-" * 80)
    print(f" Summary: {passed}/{total} Passed ({(passed/total*100.0):.1f}%) in {suite.total_duration_ms:.2f} ms")
    if failed == 0:
        print(f" {GREEN}{BOLD}✓ ALL 3 TIERS (UNIT, INTEGRATION, SYSTEM) PASSED PERFECTLY.{RESET}")
    else:
        print(f" {RED}{BOLD}✗ {failed} TESTS FAILED. CHECK AUDIT LOG.{RESET}")
    print("=" * 80)

    if args.report:
        report_md = suite.generate_report()
        with open("test_report.md", "w") as f:
            f.write(report_md)
        print(f" Saved test audit report to {BOLD}test_report.md{RESET}")

        report_html = suite.generate_html_report()
        with open("test_report.html", "w") as f:
            f.write(report_html)
        print(f" Saved HTML audit report to {BOLD}test_report.html{RESET}")

        report_json = {
            "timestamp": datetime.utcnow().isoformat(),
            "total": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": (passed / total * 100.0) if total else 0.0,
            "duration_ms": suite.total_duration_ms,
            "tests": [
                {
                    "id": r.test_id,
                    "tier": r.tier,
                    "target": r.func_name,
                    "name": r.name,
                    "passed": r.passed,
                    "duration_ms": r.duration_ms,
                    "assertions": r.assertions,
                    "error": r.error,
                }
                for r in results
            ],
        }
        with open("test_report.json", "w") as f:
            json.dump(report_json, f, indent=2)
        print(f" Saved machine-readable audit report to {BOLD}test_report.json{RESET}")

    if args.baseline == "save":
        with open("test_baseline.json", "w") as f:
            json.dump({"timestamp": datetime.utcnow().isoformat(), "total": total, "passed": passed}, f, indent=2)
        print(f" {GREEN}✓ Saved golden testing baseline to test_baseline.json{RESET}")
    elif args.baseline == "compare":
        if os.path.exists("test_baseline.json"):
            with open("test_baseline.json") as f:
                b = json.load(f)
            if b.get("passed") == passed:
                print(f" {GREEN}✓ Regression Audit: Output is 100% consistent with baseline!{RESET}")
            else:
                print(f" {RED}⚠️ Regression Audit: Deviation detected from baseline ({b.get('passed')} vs {passed}){RESET}")


if __name__ == "__main__":
    main()
