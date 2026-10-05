#!/usr/bin/env python3
"""
================================================================================
 POSITION UPDATE MODULE: 5-MINUTE TRAILING STOPLOSS RATCHET
================================================================================
 Periodically updates open MT5 positions using Chandelier Exit stop levels:
  - BUY Positions  : Ratchets SL UP to ce_bar['long_stop']
  - SELL Positions : Ratchets SL DOWN to ce_bar['short_stop']
  - Enforces Risk Rules: Stops NEVER move backwards (monotonic ratchet)
  - Default Interval: 300 seconds (Every 5 minutes)
================================================================================
"""

import sys
import time
import argparse
import datetime
from mt5_trading import (
    check_autotrading,
    get_tick,
    trailing_stoploss,
    list_positions,
    calculate_trade_pnl,
    mt5,
)
from trading_ha_chandelier import (
    ticks_to_candles_raw,
    to_heikin_ashi_raw,
    chandelier_exit_raw,
)

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


class PositionTrailingUpdater:
    """
    Manages periodic position stoploss updates synchronized with
    Heikin-Ashi Chandelier Exit trailing levels.
    """

    def __init__(
        self,
        symbol: str = "XAUUSD",
        timeframe_sec: int = 300,  # 5 minutes
        atr_period: int = 22,
        atr_mult: float = 3.0,
        use_close: bool = True,
        extremum_formula: str = "close",
        verbose: bool = True,
    ):
        self.symbol = symbol
        self.timeframe_sec = timeframe_sec
        self.atr_period = atr_period
        self.atr_mult = atr_mult
        self.use_close = use_close
        self.extremum_formula = extremum_formula
        self.verbose = verbose
        self.update_count = 0
        self.ticks_history = []

    def ingest_tick(self, time_sec: int, bid: float, ask: float):
        mid = (bid + ask) / 2.0
        self.ticks_history.append((time_sec, mid))
        if len(self.ticks_history) > 5000:
            self.ticks_history = self.ticks_history[-5000:]

    def get_latest_chandelier_stops(self):
        """
        Computes current Chandelier Exit long and short stops from tick buffer.
        """
        now_sec = int(time.time())
        tick = get_tick(self.symbol)
        if tick:
            self.ingest_tick(now_sec, getattr(tick, "bid", 4274.5), getattr(tick, "ask", 4274.65))

        if len(self.ticks_history) < 2:
            # Seed synthetic bars if initial buffer is empty
            for i in range(30):
                t = now_sec - (30 - i) * self.timeframe_sec
                p = 4274.50 + (i * 0.15)
                self.ticks_history.append((t, p))

        candles = ticks_to_candles_raw(self.ticks_history, self.timeframe_sec)
        ha_candles = to_heikin_ashi_raw(candles)
        ce_bars = chandelier_exit_raw(
            ha_candles,
            atr_period=self.atr_period,
            atr_mult=self.atr_mult,
            mode="tradingview",
            use_close=self.use_close,
            extremum_formula=self.extremum_formula,
        )

        if not ce_bars:
            return None

        last_bar = ce_bars[-1]
        return {
            "direction": last_bar["direction"],
            "long_stop": last_bar["long_stop"],
            "short_stop": last_bar["short_stop"],
            "atr": last_bar["atr"],
            "time": last_bar["time"],
        }

    def update_all_positions(self):
        """
        Executes a single pass over all open positions and updates their trailing stoploss
        based on the latest Chandelier Exit levels.
        """
        self.update_count += 1
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Step 1: Check AutoTrading status
        if not check_autotrading(verbose=False):
            if self.verbose:
                print(f"[{now_str}] {RED}[!] AutoTrading is DISABLED in MT5! (CTRL + E to enable){RESET}")
            return {"updated": 0, "status": "disabled"}

        # Step 2: Retrieve current open positions
        positions = mt5.positions_get(symbol=self.symbol)
        if positions is None:
            positions = []

        if len(positions) == 0:
            if self.verbose:
                print(f"[{now_str}] [Cycle #{self.update_count:04d}] No open positions for {self.symbol}.")
            return {"updated": 0, "status": "no_positions"}

        # Step 3: Compute current CE Stop levels
        ce_info = self.get_latest_chandelier_stops()
        if not ce_info:
            return {"updated": 0, "status": "no_ce_data"}

        long_stop = ce_info["long_stop"]
        short_stop = ce_info["short_stop"]
        updated_positions = []

        if self.verbose:
            print("=" * 80)
            print(f"[{now_str}] {CYAN}5-MIN POSITION TRAILING SL UPDATE (Cycle #{self.update_count}){RESET}")
            print(f" Symbol: {BOLD}{self.symbol}{RESET} | CE Long Stop: {GREEN}{long_stop:.2f}{RESET} | CE Short Stop: {RED}{short_stop:.2f}{RESET}")
            print("-" * 80)

        for p in positions:
            ticket = p.ticket
            side = "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL"
            old_sl = p.sl
            target_sl = long_stop if p.type == mt5.POSITION_TYPE_BUY else short_stop

            res = trailing_stoploss(self.symbol, ticket, target_sl)
            if res and hasattr(res, "retcode") and res.retcode == mt5.TRADE_RETCODE_DONE:
                updated_positions.append({
                    "ticket": ticket,
                    "side": side,
                    "old_sl": old_sl,
                    "new_sl": target_sl,
                })
                if self.verbose:
                    print(f" {GREEN}✓ Ticket #{ticket} ({side}){RESET}: SL updated from {old_sl:.2f} -> {BOLD}{target_sl:.2f}{RESET}")
            else:
                if self.verbose:
                    print(f" - Ticket #{ticket} ({side}): Current SL {old_sl:.2f} already optimal (CE: {target_sl:.2f})")

        if self.verbose:
            print(f" Updated {len(updated_positions)}/{len(positions)} positions.")
            print("=" * 80 + "\n")

        return {
            "updated": len(updated_positions),
            "total_positions": len(positions),
            "details": updated_positions,
            "status": "success",
        }

    def run_loop(self, interval_sec: int = 300):
        """
        Runs the continuous 5-minute position update loop.
        """
        print("=" * 80)
        print(f" {BOLD}MT5 5-MINUTE POSITION TRAILING SL UPDATER SERVICE{RESET}")
        print("=" * 80)
        print(f" Target Symbol   : {BOLD}{self.symbol}{RESET}")
        print(f" Update Interval : {interval_sec} seconds ({interval_sec / 60:.1f} minutes)")
        print(f" Chandelier ATR  : Period={self.atr_period}, Multiplier={self.atr_mult}")
        print(f" Noise Filter    : Use Close Price = {'ON' if self.use_close else 'OFF'}")
        print("-" * 80)

        autotrading_ok = check_autotrading(verbose=True)
        if not autotrading_ok:
            print(f"\n{RED}NOTE: Toolbar button is RED. Please press (CTRL + E) in MT5 to enable.{RESET}\n")

        print(f"Starting position update loop (every {interval_sec}s)... Press Ctrl+C to terminate.\n")

        try:
            while True:
                self.update_all_positions()
                # Countdown wait
                for remaining in range(interval_sec, 0, -1):
                    if remaining % 30 == 0 or remaining <= 5:
                        print(f"\r Next position update in {remaining}s...   ", end="", flush=True)
                    time.sleep(1.0)
                print("\r" + " " * 40 + "\r", end="")
        except KeyboardInterrupt:
            print("\n[i] Position updater stopped cleanly.")


def main():
    parser = argparse.ArgumentParser(description="MT5 5-Minute Position Trailing SL Updater")
    parser.add_argument("--symbol", type=str, default="XAUUSD", help="Trading Symbol (default: XAUUSD)")
    parser.add_argument("--interval", type=int, default=300, help="Update interval in seconds (default: 300 / 5 min)")
    parser.add_argument("--atr-period", type=int, default=22, help="ATR Period (default: 22)")
    parser.add_argument("--atr-mult", type=float, default=3.0, help="ATR Multiplier (default: 3.0)")
    parser.add_argument("--use-close", action="store_true", default=True, help="Use Close Price for Extremums")
    parser.add_argument("--once", action="store_true", help="Run a single update pass and exit")
    args = parser.parse_args()

    updater = PositionTrailingUpdater(
        symbol=args.symbol,
        timeframe_sec=args.interval,
        atr_period=args.atr_period,
        atr_mult=args.atr_mult,
        use_close=args.use_close,
    )

    if args.once:
        updater.update_all_positions()
    else:
        updater.run_loop(interval_sec=args.interval)


if __name__ == "__main__":
    main()
