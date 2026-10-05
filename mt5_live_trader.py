#!/usr/bin/env python3
"""
================================================================================
 MT5 LIVE AUTOMATED QUANTITATIVE TRADER
================================================================================
 Pipeline:
   MT5 LIVE TICK ➔ Candle Aggregator ➔ Heikin-Ashi ➔ Extremums (Noise Filter)
   ➔ Chandelier Exit Trailing Ratchet ➔ BUY & SELL Order Dispatch ➔ Dynamic SL Update
================================================================================
"""

import os
import sys
import time
import math
import argparse
import datetime
import json
import threading
import http.server
import socketserver
import webbrowser

# Import trading library
from mt5_trading import (
    check_autotrading,
    get_tick,
    buy,
    sell,
    trailing_stoploss,
    list_positions,
    close_position,
    close_all_positions,
    partial_close,
    calculate_trade_pnl,
    mt5,
)

# Import quant calculations
from trading_ha_chandelier import (
    ticks_to_candles_raw,
    to_heikin_ashi_raw,
    compute_extremums_raw,
    chandelier_exit_raw,
)

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


class LiveChandelierTrader:
    def __init__(
        self,
        symbol: str = "XAUUSD",
        timeframe_sec: int = 60,
        atr_period: int = 22,
        atr_mult: float = 3.0,
        volume: float = 0.1,
        use_close: bool = True,
        extremum_formula: str = "close",
        contract_size: float = 100.0,
        auto_trade: bool = True,
    ):
        self.symbol = symbol
        self.timeframe_sec = timeframe_sec
        self.atr_period = atr_period
        self.atr_mult = atr_mult
        self.volume = volume
        self.use_close = use_close
        self.extremum_formula = extremum_formula
        self.contract_size = contract_size
        self.auto_trade = auto_trade

        self.ticks_buffer = []  # list of (time, price)
        self.candles = []
        self.ha_candles = []
        self.ce_bars = []
        self.active_direction = 0  # 1 = Long, -1 = Short
        self.last_trade_ticket = None
        self.running = False
        self.total_pnl = 0.0

    def check_status(self):
        """Validates if AutoTrading is enabled in MT5."""
        is_allowed = check_autotrading(verbose=False)
        return is_allowed

    def process_tick(self, current_time: int, bid: float, ask: float):
        """Processes one live tick through the quantitative pipeline."""
        mid_price = round((bid + ask) / 2.0, 4)
        self.ticks_buffer.append((current_time, mid_price))

        # Keep buffer bounded to recent 5000 ticks
        if len(self.ticks_buffer) > 5000:
            self.ticks_buffer = self.ticks_buffer[-5000:]

        # Step 1: Aggregate to timeframe candles
        self.candles = ticks_to_candles_raw(self.ticks_buffer, self.timeframe_sec)
        if len(self.candles) < 2:
            return None

        # Step 2: Heikin-Ashi transformation
        self.ha_candles = to_heikin_ashi_raw(self.candles)

        # Step 3 & 4: Chandelier Exit with Extremums Noise Filter
        self.ce_bars = chandelier_exit_raw(
            self.ha_candles,
            atr_period=self.atr_period,
            atr_mult=self.atr_mult,
            mode="tradingview",
            use_close=self.use_close,
            extremum_formula=self.extremum_formula,
        )

        if not self.ce_bars:
            return None

        current_bar = self.ce_bars[-1]
        prev_bar = self.ce_bars[-2] if len(self.ce_bars) >= 2 else current_bar
        direction = current_bar["direction"]
        long_stop = current_bar["long_stop"]
        short_stop = current_bar["short_stop"]

        # Check for Signal Flips
        trade_action = None
        if direction == 1 and self.active_direction != 1:
            trade_action = "BUY"
            self.active_direction = 1
        elif direction == -1 and self.active_direction != -1:
            trade_action = "SELL"
            self.active_direction = -1

        # Execute Auto-Trading if allowed
        if trade_action and self.auto_trade:
            if not self.check_status():
                print(f" {RED}[!] AutoTrading DISABLED in MT5! Signal {trade_action} ignored. Press (CTRL + E){RESET}")
            else:
                # Close any opposing position first
                open_positions = mt5.positions_get(symbol=self.symbol) or []
                for p in open_positions:
                    close_position(p.ticket, comment="REVERSE_SIGNAL")

                # Dispatch new position
                if trade_action == "BUY":
                    res = buy(self.symbol, volume=self.volume, stoploss=long_stop, comment="CE_BUY_SIGNAL")
                    if res and hasattr(res, "order"):
                        self.last_trade_ticket = res.order
                elif trade_action == "SELL":
                    res = sell(self.symbol, volume=self.volume, stoploss=short_stop, comment="CE_SELL_SIGNAL")
                    if res and hasattr(res, "order"):
                        self.last_trade_ticket = res.order

        # Dynamic Trailing Stoploss Maintenance for all open positions
        open_positions = mt5.positions_get(symbol=self.symbol) or []
        for p in open_positions:
            if p.type == mt5.POSITION_TYPE_BUY:
                trailing_stoploss(self.symbol, p.ticket, long_stop)
            elif p.type == mt5.POSITION_TYPE_SELL:
                trailing_stoploss(self.symbol, p.ticket, short_stop)

        return {
            "time": current_time,
            "bid": bid,
            "ask": ask,
            "mid": mid_price,
            "direction": direction,
            "long_stop": long_stop,
            "short_stop": short_stop,
            "trade_action": trade_action,
            "candles_count": len(self.candles),
            "open_positions": len(open_positions),
        }

    def start_console_loop(self):
        """Runs the continuous live terminal trading bot."""
        print("=" * 80)
        print(f" {BOLD}QUANTITATIVE MT5 LIVE TRADING BOT{RESET}")
        print("=" * 80)
        print(f" Symbol         : {BOLD}{self.symbol}{RESET}")
        print(f" Timeframe      : {self.timeframe_sec}s")
        print(f" ATR Parameters : Length={self.atr_period}, Multiplier={self.atr_mult}")
        print(f" Volume Size    : {self.volume} lots")
        print(f" Extremum Noise : Use Close Price = {'ON (Wicks Ignored)' if self.use_close else 'OFF (Wicks Included)'}")
        print("-" * 80)

        is_allowed = self.check_status()
        if not is_allowed:
            print(f" {RED}{BOLD}[WARNING] MT5 AutoTrading is currently DISABLED! (Toolbar button is RED){RESET}")
            print(f" {RED}Please enable Algo Trading or press (CTRL + E) in your MT5 terminal.{RESET}")
        else:
            print(f" {GREEN}{BOLD}[OK] MT5 AutoTrading is ENABLED! (Toolbar button is GREEN){RESET}")

        print("=" * 80)
        print(" Streaming live ticks from MetaTrader 5... Press Ctrl+C to terminate.\n")

        self.running = True
        tick_count = 0

        try:
            while self.running:
                tick = get_tick(self.symbol)
                now_sec = int(time.time())

                if tick:
                    bid = getattr(tick, "bid", 4274.50)
                    ask = getattr(tick, "ask", 4274.65)
                    status = self.process_tick(now_sec, bid, ask)

                    tick_count += 1
                    if status and tick_count % 5 == 0:
                        dir_str = f"{GREEN}▲ LONG{RESET}" if status["direction"] == 1 else f"{RED}▼ SHORT{RESET}"
                        active_stop = status["long_stop"] if status["direction"] == 1 else status["short_stop"]
                        print(
                            f"\r [TICK #{tick_count:05d}] Ask={ask:<8.2f} Bid={bid:<8.2f} | "
                            f"Trend={dir_str} | CE Stop={active_stop:<8.2f} | "
                            f"Open Positions: {status['open_positions']}",
                            end="",
                            flush=True
                        )

                time.sleep(1.0)
        except KeyboardInterrupt:
            print("\n\n[i] Shutting down Live Trader cleanly.")
            self.running = False


# ============================================================================
# LOCAL WEB GUI WITH REAL-TIME AUTOTRADING TOOLBAR
# ============================================================================
def run_live_gui_server(trader: LiveChandelierTrader, port: int = 8085):
    """Launches local web GUI with real-time MT5 status and order dashboard."""

    class LiveTraderHandler(http.server.SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/api/status":
                autotrading_ok = check_autotrading(verbose=False)
                tick = get_tick(trader.symbol)
                positions = mt5.positions_get(symbol=trader.symbol) or []
                pos_data = [
                    {
                        "ticket": p.ticket,
                        "symbol": p.symbol,
                        "side": "BUY" if p.type == 0 else "SELL",
                        "volume": p.volume,
                        "price_open": p.price_open,
                        "price_current": getattr(p, "price_current", p.price_open),
                        "sl": p.sl,
                        "tp": p.tp,
                        "profit": getattr(p, "profit", 0.0),
                    }
                    for p in positions
                ]

                last_bar = trader.ce_bars[-1] if trader.ce_bars else {}
                resp = {
                    "autotrading_enabled": autotrading_ok,
                    "symbol": trader.symbol,
                    "volume": trader.volume,
                    "use_close": trader.use_close,
                    "bid": getattr(tick, "bid", 4274.50) if tick else 0,
                    "ask": getattr(tick, "ask", 4274.65) if tick else 0,
                    "direction": last_bar.get("direction", 1),
                    "long_stop": last_bar.get("long_stop", 0),
                    "short_stop": last_bar.get("short_stop", 0),
                    "positions": pos_data,
                    "candles_count": len(trader.candles),
                }

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(resp).encode("utf-8"))
                return

            elif self.path.startswith("/api/buy"):
                vol = trader.volume
                res = buy(trader.symbol, volume=vol, comment="GUI_BUY")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": res is not None}).encode("utf-8"))
                return

            elif self.path.startswith("/api/sell"):
                vol = trader.volume
                res = sell(trader.symbol, volume=vol, comment="GUI_SELL")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": res is not None}).encode("utf-8"))
                return

            elif self.path.startswith("/api/close_all"):
                close_all_positions(trader.symbol)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
                return

            # Main HTML Dashboard
            html_page = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MT5 Live Online Trading Terminal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: #0b0f17; color: #cbd5e1; margin: 0; padding: 20px; }
    .header { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
    .badge { font-family: monospace; font-size: 12px; font-weight: bold; padding: 6px 14px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px; }
    .badge.enabled { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981; }
    .badge.disabled { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444; }
    .warning-banner { background: #450a0a; border: 1px solid #ef4444; color: #fca5a5; padding: 12px 18px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; font-weight: 500; display: none; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .card { background: #131d2e; border: 1px solid #1e293b; border-radius: 10px; padding: 18px; }
    .card h3 { margin: 0 0 10px 0; font-size: 12px; color: #94a3b8; text-transform: uppercase; font-family: monospace; }
    .val { font-size: 26px; font-weight: bold; color: #f8fafc; font-family: monospace; }
    .val.green { color: #34d399; }
    .val.red { color: #f87171; }
    .val.cyan { color: #38bdf8; }
    .btn { padding: 10px 18px; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; border: none; font-family: monospace; }
    .btn-buy { background: #10b981; color: #022c22; }
    .btn-buy:hover { background: #34d399; }
    .btn-sell { background: #ef4444; color: #ffffff; }
    .btn-sell:hover { background: #f87171; }
    .btn-close { background: #334155; color: #cbd5e1; }
    .btn-close:hover { background: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; font-family: monospace; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #1e293b; }
    th { color: #94a3b8; text-transform: uppercase; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 style="margin: 0; font-size: 20px; color: #f8fafc;">MT5 LIVE AUTOMATED QUANTITATIVE TERMINAL</h1>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Online Live Tick ➔ Heikin-Ashi ➔ Extremums (Noise Filter) ➔ Chandelier Trailing Stop</p>
    </div>
    <div id="algo-status-badge" class="badge disabled">
      <span id="dot">●</span> <span id="status-text">Algo Trading: Checking...</span>
    </div>
  </div>

  <div id="algo-warning" class="warning-banner">
    ⚠️ <strong>AutoTrading is DISABLED!</strong> Please enable Algo Trading or press <strong>(CTRL + E)</strong> in your MetaTrader 5 terminal to allow automated buy/sell order dispatch.
  </div>

  <div class="grid">
    <div class="card">
      <h3>Live Market Price (MT5 Tick)</h3>
      <div id="live-prices" class="val cyan">Bid: --- | Ask: ---</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 8px;">Active Symbol: <strong>XAUUSD</strong></div>
    </div>

    <div class="card">
      <h3>Chandelier Trend State</h3>
      <div id="trend-state" class="val green">LONG (Direction: +1)</div>
      <div id="ce-stops" style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Trailing Stop: ---</div>
    </div>

    <div class="card">
      <h3>Extremums Noise Reduction</h3>
      <div class="val cyan">Formula 1: CLOSE ON</div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Wicks completely ignored for noise reduction</div>
    </div>

    <div class="card">
      <h3>Quick Order Terminal</h3>
      <div style="display: flex; gap: 8px; margin-top: 5px;">
        <button class="btn btn-buy" onclick="fetch('/api/buy')">⚡ BUY (Ask)</button>
        <button class="btn btn-sell" onclick="fetch('/api/sell')">⚡ SELL (Bid)</button>
        <button class="btn btn-close" onclick="fetch('/api/close_all')">✕ Close All</button>
      </div>
    </div>
  </div>

  <div class="card">
    <h3 style="display: flex; justify-content: space-between; align-items: center;">
      <span>Active MT5 Open Positions</span>
      <span style="font-weight: normal; color: #64748b;">Dynamic Chandelier Trailing SL Active</span>
    </h3>
    <table>
      <thead>
        <tr><th>Ticket</th><th>Symbol</th><th>Side</th><th>Volume</th><th>Open Price</th><th>Current Price</th><th>Trailing SL</th><th>TP</th><th>Live PnL</th></tr>
      </thead>
      <tbody id="positions-body">
        <tr><td colspan="9" style="text-align: center; color: #64748b;">No open positions in MT5.</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    async function updateDashboard() {
      try {
        const res = await fetch('/api/status');
        const d = await res.json();

        const badge = document.getElementById('algo-status-badge');
        const statusText = document.getElementById('status-text');
        const warn = document.getElementById('algo-warning');

        if (d.autotrading_enabled) {
          badge.className = 'badge enabled';
          statusText.innerText = 'Algo Trading: ENABLED (Ready)';
          warn.style.display = 'none';
        } else {
          badge.className = 'badge disabled';
          statusText.innerText = 'Algo Trading: DISABLED (Press CTRL+E)';
          warn.style.display = 'block';
        }

        document.getElementById('live-prices').innerText = `Bid: ${d.bid.toFixed(2)} | Ask: ${d.ask.toFixed(2)}`;

        const trendDiv = document.getElementById('trend-state');
        if (d.direction === 1) {
          trendDiv.className = 'val green';
          trendDiv.innerText = '▲ LONG (Direction: +1)';
          document.getElementById('ce-stops').innerText = `Long Stop Ratchet: ${d.long_stop.toFixed(2)}`;
        } else {
          trendDiv.className = 'val red';
          trendDiv.innerText = '▼ SHORT (Direction: -1)';
          document.getElementById('ce-stops').innerText = `Short Stop Ratchet: ${d.short_stop.toFixed(2)}`;
        }

        const tbody = document.getElementById('positions-body');
        if (d.positions && d.positions.length > 0) {
          tbody.innerHTML = d.positions.map(p => `
            <tr>
              <td><code>#${p.ticket}</code></td>
              <td><strong>${p.symbol}</strong></td>
              <td style="color:${p.side === 'BUY' ? '#34d399' : '#f87171'}">${p.side}</td>
              <td>${p.volume}</td>
              <td>${p.price_open.toFixed(2)}</td>
              <td>${p.price_current.toFixed(2)}</td>
              <td style="color:#38bdf8; font-weight:bold;">${p.sl > 0 ? p.sl.toFixed(2) : 'None'}</td>
              <td>${p.tp > 0 ? p.tp.toFixed(2) : 'None'}</td>
              <td style="color:${p.profit >= 0 ? '#34d399' : '#f87171'}; font-weight:bold;">$${p.profit.toFixed(2)}</td>
            </tr>
          `).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #64748b;">No open positions in MT5.</td></tr>';
        }
      } catch (e) {
        console.error("Dashboard poll error:", e);
      }
    }

    setInterval(updateDashboard, 1000);
    updateDashboard();
  </script>
</body>
</html>"""
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html_page.encode("utf-8"))

    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(("", port), LiveTraderHandler)
    url = f"http://localhost:{port}"
    print(f"\n {GREEN}{BOLD}✓ MT5 Live Online Dashboard running at: {url}{RESET}")

    # Start tick worker thread
    def worker():
        trader.start_console_loop()

    t = threading.Thread(target=worker, daemon=True)
    t.start()

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


def main():
    parser = argparse.ArgumentParser(description="MT5 Live Automated Quantitative Trading Engine")
    parser.add_argument("--symbol", type=str, default="XAUUSD", help="Trading Symbol (e.g., XAUUSD, step index)")
    parser.add_argument("--tf", type=int, default=60, help="Candle timeframe in seconds (default: 60)")
    parser.add_argument("--volume", type=float, default=0.1, help="Trade order volume in lots (default: 0.1)")
    parser.add_argument("--atr-period", type=int, default=22, help="Chandelier Exit ATR period (default: 22)")
    parser.add_argument("--atr-mult", type=float, default=3.0, help="Chandelier Exit ATR multiplier (default: 3.0)")
    parser.add_argument("--use-close", action="store_true", default=True, help="Use Close Price for Extremums (Noise Filter ON)")
    parser.add_argument("--formula", type=str, default="close", choices=["close", "range_ma", "crest_trough", "pivot_sr"], help="Extremum formula")
    parser.add_argument("--gui", action="store_true", help="Launch live interactive browser trading terminal")
    parser.add_argument("--port", type=int, default=8085, help="Port for GUI server (default: 8085)")
    args = parser.parse_args()

    trader = LiveChandelierTrader(
        symbol=args.symbol,
        timeframe_sec=args.tf,
        atr_period=args.atr_period,
        atr_mult=args.atr_mult,
        volume=args.volume,
        use_close=args.use_close,
        extremum_formula=args.formula,
    )

    if args.gui:
        run_live_gui_server(trader, port=args.port)
    else:
        trader.start_console_loop()


if __name__ == "__main__":
    main()
