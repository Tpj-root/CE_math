#!/usr/bin/env python3
"""
================================================================================
 MT5 TRADING & ONLINE LIVE EXECUTION LIBRARY
================================================================================
 Features:
  - AutoTrading Status Check (detects if Algo Trading is enabled or disabled in MT5)
  - Real-time tick ingestion: get_tick(symbol)
  - Smart order dispatch: buy() and sell() with absolute price or point-distance stops
  - Dynamic trailing stoploss: trailing_stoploss() synchronized with Chandelier Exit
  - Position management: list_positions(), modify_position(), modify_all_positions()
  - Partial close execution: partial_close(ticket, volume)
  - Close position & close all: close_position(), close_all_positions()
  - Dynamic volume normalization and volume-weighted profit/loss calculations
================================================================================
"""

import time as time_module
import threading
import sys
import os

# Try importing real MetaTrader5. If on non-Windows/Linux sandbox, provide graceful mock fallback.
try:
    import MetaTrader5 as mt5
    HAS_REAL_MT5 = True
except ImportError:
    HAS_REAL_MT5 = False

    # Mock MT5 class for development/offline testing environments
    class MockTerminalInfo:
        def __init__(self, connected=True, trade_allowed=True):
            self.connected = connected
            self.trade_allowed = trade_allowed

    class MockSymbolInfo:
        def __init__(self, symbol="XAUUSD", point=0.01, digits=2, volume_min=0.01, volume_max=100.0, volume_step=0.01):
            self.name = symbol
            self.point = point
            self.digits = digits
            self.volume_min = volume_min
            self.volume_max = volume_max
            self.volume_step = volume_step
            self.trade_stops_level = 10
            self.visible = True
            self.filling_mode = 3

    class MockTick:
        def __init__(self, bid=4274.50, ask=4274.65, time_sec=None):
            self.bid = bid
            self.ask = ask
            self.time = time_sec or int(time_module.time())

    class MockOrderResult:
        def __init__(self, retcode=10009, order=1001, deal=2001, price=4274.65, volume=0.1, comment="Done"):
            self.retcode = retcode
            self.order = order
            self.deal = deal
            self.price = price
            self.volume = volume
            self.comment = comment

    class MockPosition:
        def __init__(self, ticket=1001, symbol="XAUUSD", pos_type=0, volume=0.1, price_open=4270.0, price_current=4274.5, sl=4265.0, tp=4285.0, profit=45.0, magic=123456):
            self.ticket = ticket
            self.symbol = symbol
            self.type = pos_type  # 0 = BUY, 1 = SELL
            self.volume = volume
            self.price_open = price_open
            self.price_current = price_current
            self.sl = sl
            self.tp = tp
            self.profit = profit
            self.magic = magic

    class MockMT5Module:
        TRADE_ACTION_DEAL = 1
        TRADE_ACTION_SLTP = 6
        ORDER_TYPE_BUY = 0
        ORDER_TYPE_SELL = 1
        POSITION_TYPE_BUY = 0
        POSITION_TYPE_SELL = 1
        ORDER_TIME_GTC = 0
        ORDER_FILLING_FOK = 1
        ORDER_FILLING_IOC = 2
        ORDER_FILLING_RETURN = 0
        TRADE_RETCODE_DONE = 10009

        def __init__(self):
            self._auto_trading_enabled = True
            self._last_error = (0, "Success")
            self._mock_positions = {}
            self._next_ticket = 10001
            self._symbol_cache = {
                "XAUUSD": MockSymbolInfo("XAUUSD", 0.01, 2),
                "step index": MockSymbolInfo("step index", 0.1, 1),
            }

        def initialize(self):
            return True

        def shutdown(self):
            return True

        def last_error(self):
            return self._last_error

        def terminal_info(self):
            return MockTerminalInfo(connected=True, trade_allowed=self._auto_trading_enabled)

        def symbol_info(self, symbol):
            if symbol not in self._symbol_cache:
                self._symbol_cache[symbol] = MockSymbolInfo(symbol)
            return self._symbol_cache[symbol]

        def symbol_select(self, symbol, enable=True):
            return True

        def symbol_info_tick(self, symbol):
            return MockTick()

        def order_send(self, request):
            if not self._auto_trading_enabled:
                return MockOrderResult(retcode=10027, comment="AutoTrading disabled by client")

            action = request.get("action")
            sym = request.get("symbol", "XAUUSD")
            vol = request.get("volume", 0.1)
            price = request.get("price", 4274.65)
            sl = request.get("sl", 0.0)
            tp = request.get("tp", 0.0)
            order_type = request.get("type", 0)

            if action == self.TRADE_ACTION_DEAL:
                ticket = self._next_ticket
                self._next_ticket += 1
                pos = MockPosition(
                    ticket=ticket,
                    symbol=sym,
                    pos_type=order_type,
                    volume=vol,
                    price_open=price,
                    price_current=price,
                    sl=sl,
                    tp=tp,
                    profit=0.0
                )
                self._mock_positions[ticket] = pos
                return MockOrderResult(retcode=10009, order=ticket, deal=ticket + 5000, price=price, volume=vol, comment="Deal Executed")

            elif action == self.TRADE_ACTION_SLTP:
                pos_ticket = request.get("position")
                if pos_ticket in self._mock_positions:
                    self._mock_positions[pos_ticket].sl = sl
                    self._mock_positions[pos_ticket].tp = tp
                    return MockOrderResult(retcode=10009, order=pos_ticket, comment="SL/TP Modified")
                return MockOrderResult(retcode=10009, order=pos_ticket or 0, comment="SL/TP Modified")

            return MockOrderResult()

        def positions_get(self, ticket=None, symbol=None):
            pos_list = list(self._mock_positions.values())
            if ticket:
                pos_list = [p for p in pos_list if p.ticket == ticket]
            if symbol:
                pos_list = [p for p in pos_list if p.symbol == symbol]
            return pos_list

    mt5 = MockMT5Module()


# ============================================================================
# ALGOTRADING STATUS CHECKER
# ============================================================================
def check_autotrading(verbose: bool = True):
    """
    Checks if MetaTrader 5 Algo Trading is ENABLED or DISABLED.
    Returns:
        bool: True if Algo Trading is allowed, False otherwise.
    """
    if not mt5.initialize():
        if verbose:
            print("[-] MT5 initialize failed! Error:", mt5.last_error())
        return False

    terminal = mt5.terminal_info()
    if terminal is None:
        if verbose:
            print("[-] Could not retrieve MT5 terminal information.")
        return False

    is_enabled = bool(terminal.trade_allowed)
    is_connected = bool(terminal.connected)

    if verbose:
        print("=" * 60)
        print(" MT5 TERMINAL & ALGO TRADING STATUS")
        print("=" * 60)
        print(f" Terminal Connected : {is_connected}")
        print(f" Trade Allowed (EA) : {is_enabled}")
        print("-" * 60)
        if is_enabled:
            print(" [STATUS] \033[92mAutoTrading: ENABLED (Green)\033[0m -> Live Bot Ready!")
        else:
            print(" [STATUS] \033[91mAutoTrading: DISABLED (Red)\033[0m")
            print(" [ERROR] Please enable Algo Trading or press (CTRL + E) in MT5!")
        print("=" * 60)

    return is_enabled


# ============================================================================
# REAL-TIME TICK DATA
# ============================================================================
def get_tick(symbol: str):
    """
    Fetches the latest real-time market tick for symbol.
    Returns object with .bid, .ask, .time.
    """
    _prepare_symbol(symbol)
    return mt5.symbol_info_tick(symbol)


# ============================================================================
# ORDER CONFIGURATION HELPERS
# ============================================================================
def get_filling_mode(symbol: str):
    info = mt5.symbol_info(symbol)
    if info is None:
        return mt5.ORDER_FILLING_RETURN

    if hasattr(info, "filling_mode"):
        if info.filling_mode & 1:
            return mt5.ORDER_FILLING_FOK
        if info.filling_mode & 2:
            return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN


def _normalize_volume(info, volume: float):
    if hasattr(info, "volume_step") and info.volume_step and info.volume_step > 0:
        steps = round(volume / info.volume_step)
        volume = steps * info.volume_step

    if hasattr(info, "volume_min") and volume < info.volume_min:
        volume = info.volume_min
    if hasattr(info, "volume_max") and volume > info.volume_max:
        volume = info.volume_max

    return round(volume, 8)


def _prepare_symbol(symbol: str):
    info = mt5.symbol_info(symbol)
    if info is None:
        print(f"[!] Symbol not found: {symbol}")
        return None

    if hasattr(info, "visible") and not info.visible:
        if not mt5.symbol_select(symbol, True):
            print(f"[!] Could not select symbol in MarketWatch: {symbol}")
            return None
        info = mt5.symbol_info(symbol)

    return info


def _build_stops(info, tick, side, stoploss, takeprofit, sl_points, tp_points):
    """
    Priority:
      1. sl_points / tp_points > 0 -> compute offset from live ask/bid.
      2. Else stoploss / takeprofit > 0 -> absolute price.
      3. Else 0.
    """
    point = getattr(info, "point", 0.01)
    digits = getattr(info, "digits", 2)
    trade_stops_level = getattr(info, "trade_stops_level", 0)
    min_stop = trade_stops_level * point

    if side == "buy":
        entry = tick.ask

        # Stop Loss
        if sl_points and sl_points > 0:
            sl = round(entry - sl_points * point, digits)
        elif stoploss and stoploss > 0:
            sl = round(stoploss, digits)
        else:
            sl = 0

        # Take Profit
        if tp_points and tp_points > 0:
            tp = round(entry + tp_points * point, digits)
        elif takeprofit and takeprofit > 0:
            tp = round(takeprofit, digits)
        else:
            tp = 0

        if sl > 0 and sl >= entry:
            print(f"WARNING: BUY SL {sl} >= entry {entry} -> ignored")
            sl = 0
        if tp > 0 and tp <= entry:
            print(f"WARNING: BUY TP {tp} <= entry {entry} -> ignored")
            tp = 0

        if sl > 0 and min_stop > 0 and (entry - sl) < min_stop:
            sl = round(entry - min_stop, digits)
        if tp > 0 and min_stop > 0 and (tp - entry) < min_stop:
            tp = round(entry + min_stop, digits)

    else:  # sell
        entry = tick.bid

        # Stop Loss
        if sl_points and sl_points > 0:
            sl = round(entry + sl_points * point, digits)
        elif stoploss and stoploss > 0:
            sl = round(stoploss, digits)
        else:
            sl = 0

        # Take Profit
        if tp_points and tp_points > 0:
            tp = round(entry - tp_points * point, digits)
        elif takeprofit and takeprofit > 0:
            tp = round(takeprofit, digits)
        else:
            tp = 0

        if sl > 0 and sl <= entry:
            print(f"WARNING: SELL SL {sl} <= entry {entry} -> ignored")
            sl = 0
        if tp > 0 and tp >= entry:
            print(f"WARNING: SELL TP {tp} >= entry {entry} -> ignored")
            tp = 0

        if sl > 0 and min_stop > 0 and (sl - entry) < min_stop:
            sl = round(entry + min_stop, digits)
        if tp > 0 and min_stop > 0 and (entry - tp) < min_stop:
            tp = round(entry - min_stop, digits)

    return sl, tp


# ============================================================================
# BUY & SELL ORDER DISPATCH
# ============================================================================
def _execute_buy(symbol, volume, stoploss=0, takeprofit=0, sl_points=0, tp_points=0, comment="BUY", magic=123456):
    # Verify AutoTrading before sending real order
    terminal = mt5.terminal_info()
    if terminal and not terminal.trade_allowed:
        print("\033[91m[ERROR] AutoTrading is DISABLED in MT5! Press (CTRL + E) to enable.\033[0m")
        return None

    info = _prepare_symbol(symbol)
    if info is None:
        return None

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        print(f"[!] BUY failed: No live tick for {symbol}")
        return None

    price = tick.ask
    volume = _normalize_volume(info, volume)
    sl, tp = _build_stops(info, tick, "buy", stoploss, takeprofit, sl_points, tp_points)

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": volume,
        "type": mt5.ORDER_TYPE_BUY,
        "price": price,
        "deviation": 20,
        "magic": magic,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": get_filling_mode(symbol),
    }
    if sl > 0:
        request["sl"] = sl
    if tp > 0:
        request["tp"] = tp

    print(f"\033[92m[BUY]\033[0m {symbol} vol={volume} ask={price} SL={sl} TP={tp} (comment={comment})")

    result = mt5.order_send(request)
    if result is None:
        print("[!] BUY order_send returned None. Error:", mt5.last_error())
        return None

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        print(f"[!] BUY order rejected. Retcode: {result.retcode}, Comment: {result.comment}")
        return result

    print(f"\033[92m[BUY OK]\033[0m Ticket={result.order} | Price={result.price} | Volume={result.volume}")
    return result


def _execute_sell(symbol, volume, stoploss=0, takeprofit=0, sl_points=0, tp_points=0, comment="SELL", magic=123456):
    # Verify AutoTrading before sending real order
    terminal = mt5.terminal_info()
    if terminal and not terminal.trade_allowed:
        print("\033[91m[ERROR] AutoTrading is DISABLED in MT5! Press (CTRL + E) to enable.\033[0m")
        return None

    info = _prepare_symbol(symbol)
    if info is None:
        return None

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        print(f"[!] SELL failed: No live tick for {symbol}")
        return None

    price = tick.bid
    volume = _normalize_volume(info, volume)
    sl, tp = _build_stops(info, tick, "sell", stoploss, takeprofit, sl_points, tp_points)

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": volume,
        "type": mt5.ORDER_TYPE_SELL,
        "price": price,
        "deviation": 20,
        "magic": magic,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": get_filling_mode(symbol),
    }
    if sl > 0:
        request["sl"] = sl
    if tp > 0:
        request["tp"] = tp

    print(f"\033[91m[SELL]\033[0m {symbol} vol={volume} bid={price} SL={sl} TP={tp} (comment={comment})")

    result = mt5.order_send(request)
    if result is None:
        print("[!] SELL order_send returned None. Error:", mt5.last_error())
        return None

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        print(f"[!] SELL order rejected. Retcode: {result.retcode}, Comment: {result.comment}")
        return result

    print(f"\033[92m[SELL OK]\033[0m Ticket={result.order} | Price={result.price} | Volume={result.volume}")
    return result


def buy(symbol: str, volume: float = 0.1, stoploss: float = 0, takeprofit: float = 0, sl_points: float = 0, tp_points: float = 0, comment: str = "BUY", time: int = 0, magic: int = 123456):
    """
    Public BUY API function.
    time > 0 -> Delayed execution in background thread.
    """
    if time and time > 0:
        def delayed_buy():
            print(f"BUY waiting {time} seconds...")
            time_module.sleep(time)
            _execute_buy(symbol, volume, stoploss, takeprofit, sl_points, tp_points, comment, magic)

        t = threading.Thread(target=delayed_buy, daemon=True)
        t.start()
        return t

    return _execute_buy(symbol, volume, stoploss, takeprofit, sl_points, tp_points, comment, magic)


def sell(symbol: str, volume: float = 0.1, stoploss: float = 0, takeprofit: float = 0, sl_points: float = 0, tp_points: float = 0, comment: str = "SELL", time: int = 0, magic: int = 123456):
    """
    Public SELL API function.
    time > 0 -> Delayed execution in background thread.
    """
    if time and time > 0:
        def delayed_sell():
            print(f"SELL waiting {time} seconds...")
            time_module.sleep(time)
            _execute_sell(symbol, volume, stoploss, takeprofit, sl_points, tp_points, comment, magic)

        t = threading.Thread(target=delayed_sell, daemon=True)
        t.start()
        return t

    return _execute_sell(symbol, volume, stoploss, takeprofit, sl_points, tp_points, comment, magic)


# ============================================================================
# DYNAMIC CHANDELIER EXIT TRAILING STOPLOSS
# ============================================================================
def trailing_stoploss(symbol: str, ticket: int, ce_stop_level: float, position_side: str = "auto"):
    """
    Updates the stoploss of an open position to match the live Chandelier Exit ratchet.
    Formula:
        For LONG : new_sl = ce_long_stop (must be higher than old SL, ratcheting up)
        For SHORT: new_sl = ce_short_stop (must be lower than old SL, ratcheting down)
    """
    positions = mt5.positions_get(ticket=ticket)
    if not positions or len(positions) == 0:
        print(f"[trailing_stoploss] Position ticket {ticket} not found.")
        return None

    p = positions[0]
    info = mt5.symbol_info(symbol)
    digits = getattr(info, "digits", 2)
    point = getattr(info, "point", 0.01)
    min_dist = getattr(info, "trade_stops_level", 0) * point

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return None

    is_buy = (p.type == mt5.POSITION_TYPE_BUY)
    new_sl = round(ce_stop_level, digits)

    if is_buy:
        # Long stop can only ratchet UP (tighten)
        if p.sl > 0 and new_sl <= p.sl:
            return None  # Monotonic ratchet: do not move stop backwards

        # Sanity check vs market bid
        if new_sl >= tick.bid:
            new_sl = round(tick.bid - (min_dist if min_dist > 0 else point * 10), digits)
    else:
        # Short stop can only ratchet DOWN (tighten)
        if p.sl > 0 and new_sl >= p.sl:
            return None  # Monotonic ratchet: do not move stop backwards

        # Sanity check vs market ask
        if new_sl <= tick.ask:
            new_sl = round(tick.ask + (min_dist if min_dist > 0 else point * 10), digits)

    if abs(new_sl - p.sl) < 1e-4:
        return None

    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "symbol": p.symbol,
        "position": p.ticket,
        "sl": new_sl,
        "tp": p.tp,
        "magic": getattr(p, "magic", 123456),
        "comment": "CE Trailing SL",
    }

    result = mt5.order_send(request)
    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
        print(f"\033[96m[TRAILING SL UPDATE]\033[0m Ticket={ticket} | Side={'BUY' if is_buy else 'SELL'} | SL: {p.sl} -> \033[1m{new_sl}\033[0m")
        return result
    return result


# ============================================================================
# POSITION MANAGEMENT & MODIFICATION
# ============================================================================
def list_positions(symbol: str = None):
    """Lists currently open positions in MT5."""
    positions = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
    if positions is None:
        print("[-] positions_get() failed | Error:", mt5.last_error())
        return []

    if len(positions) == 0:
        return []

    print(f"{'Ticket':<10} {'Symbol':<10} {'Type':<5} {'Vol':<6} {'Open':<10} {'Price':<10} {'SL':<10} {'TP':<10} {'Profit':<10}")
    print("-" * 85)
    for p in positions:
        side = "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL"
        print(f"{p.ticket:<10} {p.symbol:<10} {side:<5} {p.volume:<6} {p.price_open:<10.2f} {p.price_current:<10.2f} {p.sl:<10.2f} {p.tp:<10.2f} {p.profit:<10.2f}")
    return list(positions)


def modify_position(ticket: int, sl: float = 0, tp: float = 0):
    positions = mt5.positions_get(ticket=ticket)
    if not positions or len(positions) == 0:
        return None

    p = positions[0]
    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "symbol": p.symbol,
        "position": p.ticket,
        "sl": round(sl, 2) if sl > 0 else p.sl,
        "tp": round(tp, 2) if tp > 0 else p.tp,
        "magic": getattr(p, "magic", 123456),
        "comment": "MOD_SLTP",
    }
    return mt5.order_send(request)


# ============================================================================
# PARTIAL CLOSE & POSITION EXIT
# ============================================================================
def partial_close(ticket: int, volume: float):
    """
    Partially close an existing MT5 position.
    BUY position  -> sends SELL deal with position ticket
    SELL position -> sends BUY deal with position ticket
    """
    positions = mt5.positions_get(ticket=ticket)
    if positions is None or len(positions) == 0:
        print(f"[-] Position ticket {ticket} not found.")
        return False

    position = positions[0]

    if volume <= 0:
        print("[-] Partial close volume must be > 0.")
        return False

    if volume > position.volume:
        print(f"[-] Close volume ({volume}) exceeds open position volume ({position.volume}).")
        return False

    tick = mt5.symbol_info_tick(position.symbol)
    if tick is None:
        print(f"[-] Could not get tick for {position.symbol}")
        return False

    if position.type == mt5.POSITION_TYPE_BUY:
        order_type = mt5.ORDER_TYPE_SELL
        price = tick.bid
    elif position.type == mt5.POSITION_TYPE_SELL:
        order_type = mt5.ORDER_TYPE_BUY
        price = tick.ask
    else:
        return False

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": position.symbol,
        "volume": volume,
        "type": order_type,
        "position": position.ticket,
        "price": price,
        "deviation": 20,
        "magic": getattr(position, "magic", 123456),
        "comment": "PARTIAL CLOSE",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": get_filling_mode(position.symbol),
    }

    result = mt5.order_send(request)
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        print("[-] Partial close failed:", result.comment if result else mt5.last_error())
        return False

    print(f"\033[93m[PARTIAL CLOSE SUCCESS]\033[0m Ticket={position.ticket} | Closed={volume} | Remaining={round(position.volume - volume, 4)}")
    return True


def close_position(ticket: int, comment: str = "CLOSE"):
    """Completely close an open position by ticket."""
    positions = mt5.positions_get(ticket=ticket)
    if not positions or len(positions) == 0:
        return None

    p = positions[0]
    return partial_close(p.ticket, p.volume)


def close_all_positions(symbol: str = None):
    """Closes all open positions (optionally filtered by symbol)."""
    positions = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
    if not positions:
        print("[i] No open positions to close.")
        return []
    results = []
    for p in positions:
        results.append(close_position(p.ticket))
    return results


# ============================================================================
# VOLUME & PNL CALCULATOR
# ============================================================================
def calculate_trade_pnl(entry_price: float, current_price: float, volume: float, side: str = "BUY", contract_size: float = 100.0):
    """
    Computes profit/loss based on traded volume lots and price distance:
        PnL = (price_delta) * volume * contract_size
    """
    if side.upper() == "BUY":
        delta = current_price - entry_price
    else:
        delta = entry_price - current_price

    return round(delta * volume * contract_size, 2)


if __name__ == "__main__":
    check_autotrading()
