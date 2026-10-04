I checked the TradingView org and did not find a Heikin-Ashi implementation there, so this is not a special TradingView-only formula. It is the standard Heikin-Ashi calculation.

The math is:

- HA_close = (Open + High + Low + Close) / 4
- HA_open = (Previous HA_open + Previous HA_close) / 2
- HA_high = max(High, HA_open, HA_close)
- HA_low = min(Low, HA_open, HA_close)

In plain words:
- It uses ordinary arithmetic averages and max/min selection.
- It smooths the candle by averaging OHLC values and carrying forward the previous HA candle state.
- So it is not exotic math; it is simple linear arithmetic + max/min.

Why it looks different:
- The “open” is not the raw candle open.
- It is recalculated from the previous HA candle average.
- The “high/low” are the highest/lowest of the current bar and the HA open/close.

Example:
For a candle:
- Open = 100
- High = 110
- Low = 95
- Close = 105

Then:
- HA_close = (100 + 110 + 95 + 105) / 4 = 102.5
- HA_open = (prev_open + prev_close) / 2
- HA_high = max(110, HA_open, 102.5)
- HA_low = min(95, HA_open, 102.5)

So the math is basically:
- average of OHLC
- recursive average for open
- envelope using max/min

If you want, I can also give you a tiny Python/JavaScript function that computes HA candles.