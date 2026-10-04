#!/usr/bin/env python3

# ============================================================
# FRX XAUUSD TICK HISTORY ANALYZER
# ============================================================
#
# Input:
#     frxXAUUSD_1790274600.csv
#
# CSV format:
#
#     times,prices
#     1790274600,4274.65
#     1790274601,4274.58
#     ...
#
# The program analyzes:
#
#   1. Total number of ticks
#   2. Expected 86,400 seconds in one day
#   3. Missing timestamps
#   4. Duplicate timestamps
#   5. Out-of-order timestamps
#   6. Every timestamp-to-timestamp gap
#   7. Price frequency
#   8. Repeated prices
#   9. Target price: 4274.65
#  10. Time gap between repeated target prices
#  11. Consecutive same-price runs
#  12. Price change mathematics
#  13. Percentage change
#  14. Mean / median / standard deviation
#  15. Min / max / range
#  16. Hourly tick distribution
#  17. Missing-time visualization
#  18. Price chart
#  19. Price-frequency chart
#  20. Full text report
#
# ============================================================

import csv
import math
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from statistics import mean, median, stdev


# ============================================================
# USER SETTINGS
# ============================================================

CSV_FILE = Path("frxXAUUSD_1790274600.csv")

# One complete day contains:
#
#     24 hours
#     * 60 minutes
#     * 60 seconds
#
# Therefore:
#
#     24 * 60 * 60 = 86,400 seconds
#
EXPECTED_SECONDS_PER_DAY = 24 * 60 * 60

# Your expected first timestamp.
EXPECTED_START = 1790274600

# Your expected final timestamp.
EXPECTED_END = 1790360999

# Price that you specifically want to investigate.
TARGET_PRICE = 4274.65

# Number of top repeated prices displayed.
TOP_PRICE_COUNT = 50

# Number of target-price occurrences displayed.
MAX_TARGET_OCCURRENCES_DISPLAY = 100

# ============================================================
# TIMEZONE
# ============================================================

UTC = timezone.utc

IST = timezone(
    timedelta(hours=5, minutes=30)
)


# ============================================================
# TIME CONVERSION FUNCTIONS
# ============================================================

def epoch_to_utc(epoch):
    """
    Convert Unix epoch seconds into readable UTC time.

    Example:

        1790274601
        ->
        2026-09-25 00:00:01
    """

    return datetime.fromtimestamp(
        epoch,
        UTC
    ).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def epoch_to_ist(epoch):
    """
    Convert Unix epoch seconds into India Standard Time.
    """

    return datetime.fromtimestamp(
        epoch,
        IST
    ).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def duration_text(seconds):
    """
    Convert seconds into readable duration.

    Example:

        3661
        ->
        1h 1m 1s
    """

    seconds = int(seconds)

    hours = seconds // 3600

    remaining = seconds % 3600

    minutes = remaining // 60

    seconds = remaining % 60

    result = []

    if hours:
        result.append(f"{hours}h")

    if minutes:
        result.append(f"{minutes}m")

    if seconds or not result:
        result.append(f"{seconds}s")

    return " ".join(result)


# ============================================================
# SAFE FLOAT COMPARISON
# ============================================================

def same_price(a, b):
    """
    Compare two floating-point prices safely.

    We use a very small tolerance because prices are stored
    as floating-point numbers.
    """

    return math.isclose(
        a,
        b,
        rel_tol=0.0,
        abs_tol=0.0000001
    )


# ============================================================
# READ CSV
# ============================================================

if not CSV_FILE.exists():

    raise FileNotFoundError(
        f"\nCSV file not found:\n"
        f"{CSV_FILE.resolve()}\n\n"
        f"Run the program from the directory containing the CSV "
        f"or change CSV_FILE at the top of this program.\n"
    )


timestamps = []

prices = []

invalid_rows = []

with CSV_FILE.open(
    "r",
    newline="",
    encoding="utf-8"
) as file:

    reader = csv.DictReader(file)

    if reader.fieldnames is None:

        raise ValueError(
            "CSV has no header."
        )

    required_columns = {
        "times",
        "prices"
    }

    missing_columns = (
        required_columns
        - set(reader.fieldnames)
    )

    if missing_columns:

        raise ValueError(
            f"Missing CSV columns: {missing_columns}\n"
            f"Found columns: {reader.fieldnames}"
        )

    for csv_line, row in enumerate(
        reader,
        start=2
    ):

        try:

            timestamp = int(
                row["times"]
            )

            price = float(
                row["prices"]
            )

            timestamps.append(
                timestamp
            )

            prices.append(
                price
            )

        except (
            ValueError,
            TypeError
        ):

            invalid_rows.append(
                csv_line
            )


# ============================================================
# BASIC VALIDATION
# ============================================================

if not timestamps:

    raise ValueError(
        "No valid tick records found."
    )


tick_count = len(timestamps)

first_timestamp = timestamps[0]

last_timestamp = timestamps[-1]

first_price = prices[0]

last_price = prices[-1]


# ============================================================
# IMPORTANT MATHEMATICAL CONCEPT
# ============================================================
#
# If timestamps are:
#
#     100
#     101
#     102
#     103
#
# then:
#
#     101 - 100 = 1
#     102 - 101 = 1
#     103 - 102 = 1
#
# Perfect one-second data therefore has:
#
#     gap = 1
#
# If we see:
#
#     100
#     101
#     105
#
# then:
#
#     105 - 101 = 4
#
# Missing timestamps are:
#
#     102
#     103
#     104
#
# Number missing:
#
#     gap - 1
#
#     4 - 1 = 3
#
# This is the main algorithm used below.
# ============================================================


# ============================================================
# TIMESTAMP GAP ANALYSIS
# ============================================================

gap_records = []

gap_counter = Counter()

duplicate_timestamp_count = 0

out_of_order_count = 0

missing_timestamp_count = 0

for index in range(
    1,
    tick_count
):

    previous_time = timestamps[index - 1]

    current_time = timestamps[index]

    gap = current_time - previous_time

    gap_counter[gap] += 1

    # CSV line number:
    #
    # line 1 = header
    # first data line = line 2
    #
    csv_line = index + 2

    if gap == 0:

        duplicate_timestamp_count += 1

    elif gap < 0:

        out_of_order_count += 1

    elif gap > 1:

        missing = gap - 1

        missing_timestamp_count += missing

        gap_records.append(
            {
                "csv_line": csv_line,
                "previous": previous_time,
                "current": current_time,
                "gap": gap,
                "missing": missing
            }
        )


# ============================================================
# ACTUAL MISSING TIMESTAMPS
# ============================================================

missing_timestamps = []

for record in gap_records:

    start = record["previous"] + 1

    end = record["current"]

    for timestamp in range(
        start,
        end
    ):

        missing_timestamps.append(
            timestamp
        )


# ============================================================
# FULL EXPECTED DAY CHECK
# ============================================================

expected_timestamps = set(
    range(
        EXPECTED_START,
        EXPECTED_END + 1
    )
)

actual_timestamp_set = set(
    timestamps
)

missing_from_expected_day = sorted(
    expected_timestamps
    - actual_timestamp_set
)

outside_expected_day = sorted(
    actual_timestamp_set
    - expected_timestamps
)


# ============================================================
# PRICE FREQUENCY
# ============================================================

price_counter = Counter(
    prices
)

unique_price_count = len(
    price_counter
)

repeated_prices = {
    price: count
    for price, count
    in price_counter.items()
    if count > 1
}


# ============================================================
# PRICE MATHEMATICS
# ============================================================

price_changes = []

percentage_changes = []

for index in range(
    1,
    tick_count
):

    old_price = prices[index - 1]

    new_price = prices[index]

    change = new_price - old_price

    price_changes.append(
        change
    )

    if old_price != 0:

        percentage_change = (
            change
            / old_price
            * 100
        )

    else:

        percentage_change = 0.0

    percentage_changes.append(
        percentage_change
    )


# ============================================================
# PRICE MOVEMENT COUNTERS
# ============================================================

up_count = sum(
    1
    for change in price_changes
    if change > 0
)

down_count = sum(
    1
    for change in price_changes
    if change < 0
)

flat_count = sum(
    1
    for change in price_changes
    if change == 0
)


# ============================================================
# PRICE STATISTICS
# ============================================================

highest_price = max(
    prices
)

lowest_price = min(
    prices
)

price_range = (
    highest_price
    - lowest_price
)

net_change = (
    last_price
    - first_price
)

net_percentage = (
    net_change
    / first_price
    * 100
    if first_price != 0
    else 0
)

absolute_changes = [
    abs(change)
    for change in price_changes
]

if price_changes:

    average_change = mean(
        price_changes
    )

    average_absolute_change = mean(
        absolute_changes
    )

    median_change = median(
        price_changes
    )

else:

    average_change = 0

    average_absolute_change = 0

    median_change = 0


if len(price_changes) > 1:

    change_stddev = stdev(
        price_changes
    )

else:

    change_stddev = 0


# ============================================================
# TARGET PRICE ANALYSIS
# ============================================================

target_indexes = []

for index, price in enumerate(
    prices
):

    if same_price(
        price,
        TARGET_PRICE
    ):

        target_indexes.append(
            index
        )


target_count = len(
    target_indexes
)


target_timestamps = [
    timestamps[index]
    for index in target_indexes
]


target_gaps = []

for index in range(
    1,
    len(target_timestamps)
):

    gap = (
        target_timestamps[index]
        - target_timestamps[index - 1]
    )

    target_gaps.append(
        gap
    )


# ============================================================
# CONSECUTIVE SAME-PRICE RUNS
# ============================================================
#
# Example:
#
#     4274.65
#     4274.65
#     4274.65
#     4274.70
#
# The first price has a run length of 3.
#
# This is different from total frequency.
#
# Frequency:
#
#     4274.65 happened 3 times.
#
# Consecutive run:
#
#     It stayed at 4274.65 for 3 consecutive records.
# ============================================================

same_price_runs = []

run_start = 0

for index in range(
    1,
    tick_count + 1
):

    end_of_file = (
        index == tick_count
    )

    price_changed = (
        not end_of_file
        and prices[index] != prices[run_start]
    )

    if end_of_file or price_changed:

        run_length = (
            index
            - run_start
        )

        if run_length > 1:

            start_time = timestamps[
                run_start
            ]

            end_time = timestamps[
                index - 1
            ]

            same_price_runs.append(
                {
                    "price": prices[run_start],
                    "count": run_length,
                    "start": start_time,
                    "end": end_time,
                    "duration": (
                        end_time
                        - start_time
                        + 1
                    )
                }
            )

        run_start = index


same_price_runs.sort(
    key=lambda item: item["count"],
    reverse=True
)


# ============================================================
# HOURLY DISTRIBUTION
# ============================================================

hour_counter = Counter()

for timestamp in timestamps:

    hour = datetime.fromtimestamp(
        timestamp,
        UTC
    ).hour

    hour_counter[hour] += 1


# ============================================================
# REPORT FILE
# ============================================================

REPORT_FILE = CSV_FILE.with_name(
    CSV_FILE.stem
    + "_FULL_REPORT.txt"
)


# ============================================================
# TERMINAL REPORT HELPER
# ============================================================

report_lines = []


def report(text=""):
    """
    Print text to terminal and simultaneously
    store it for the full text report.
    """

    print(text)

    report_lines.append(
        text
    )


# ============================================================
# HEADER
# ============================================================

report()
report("=" * 100)
report("                 FRX XAUUSD TICK HISTORY ANALYZER")
report("=" * 100)

report()

report(
    f"CSV FILE              : "
    f"{CSV_FILE.resolve()}"
)

report(
    f"VALID TICKS           : "
    f"{tick_count:,}"
)

report(
    f"INVALID CSV ROWS      : "
    f"{len(invalid_rows):,}"
)


# ============================================================
# BASIC TIME REPORT
# ============================================================

report()
report("=" * 100)
report("                         TIME RANGE")
report("=" * 100)

report()

report(
    f"FIRST TIMESTAMP       : "
    f"{first_timestamp}"
)

report(
    f"FIRST UTC             : "
    f"{epoch_to_utc(first_timestamp)}"
)

report(
    f"FIRST IST             : "
    f"{epoch_to_ist(first_timestamp)}"
)

report()

report(
    f"LAST TIMESTAMP        : "
    f"{last_timestamp}"
)

report(
    f"LAST UTC              : "
    f"{epoch_to_utc(last_timestamp)}"
)

report(
    f"LAST IST              : "
    f"{epoch_to_ist(last_timestamp)}"
)

report()

timestamp_span = (
    last_timestamp
    - first_timestamp
)

report(
    f"TIMESTAMP SPAN        : "
    f"{timestamp_span:,} seconds"
)

report(
    f"TIMESTAMP SPAN        : "
    f"{duration_text(timestamp_span)}"
)

report(
    f"EXPECTED DAILY RANGE  : "
    f"{EXPECTED_SECONDS_PER_DAY:,} seconds"
)


# ============================================================
# COVERAGE MATHEMATICS
# ============================================================
#
# Coverage formula:
#
#     actual ticks
#     -------------
#     expected ticks
#     × 100
#
# Example:
#
#     82,422 / 86,400 × 100
#
# ============================================================

coverage = (
    tick_count
    / EXPECTED_SECONDS_PER_DAY
    * 100
)

report()
report("=" * 100)
report("                       DAILY COVERAGE")
report("=" * 100)

report()

report(
    f"EXPECTED TICKS       : "
    f"{EXPECTED_SECONDS_PER_DAY:,}"
)

report(
    f"ACTUAL TICKS         : "
    f"{tick_count:,}"
)

report(
    f"MISSING TICKS        : "
    f"{missing_timestamp_count:,}"
)

report(
    f"COVERAGE             : "
    f"{coverage:.6f}%"
)


# ============================================================
# TIMESTAMP QUALITY
# ============================================================

report()
report("=" * 100)
report("                    TIMESTAMP QUALITY")
report("=" * 100)

report()

report(
    f"TOTAL TRANSITIONS    : "
    f"{tick_count - 1:,}"
)

report(
    f"PERFECT 1-SECOND     : "
    f"{gap_counter[1]:,}"
)

report(
    f"DUPLICATE TIMESTAMPS : "
    f"{duplicate_timestamp_count:,}"
)

report(
    f"OUT-OF-ORDER         : "
    f"{out_of_order_count:,}"
)

report(
    f"MISSING GAP EVENTS   : "
    f"{len(gap_records):,}"
)


# ============================================================
# GAP DISTRIBUTION
# ============================================================

report()
report("=" * 100)
report("                    TIMESTAMP GAP DISTRIBUTION")
report("=" * 100)

report()

report(
    f"{'GAP':>12} "
    f"{'OCCURRENCES':>15}"
)

report("-" * 40)

for gap, count in sorted(
    gap_counter.items()
):

    report(
        f"{gap:>12} "
        f"{count:>15,}"
    )


# ============================================================
# MISSING TIMESTAMP REPORT
# ============================================================

report()
report("=" * 100)
report("                     MISSING TIME EVENTS")
report("=" * 100)

if not gap_records:

    report()
    report("NO MISSING TIMESTAMP GAPS FOUND.")

else:

    report()

    report(
        f"{'CSV LINE':>10} "
        f"{'PREVIOUS':>15} "
        f"{'CURRENT':>15} "
        f"{'GAP':>10} "
        f"{'MISSING':>10} "
        f"{'CURRENT UTC'}"
    )

    report("-" * 100)

    for record in gap_records:

        report(
            f"{record['csv_line']:>10} "
            f"{record['previous']:>15} "
            f"{record['current']:>15} "
            f"{record['gap']:>10} "
            f"{record['missing']:>10} "
            f"{epoch_to_utc(record['current'])}"
        )


# ============================================================
# ACTUAL MISSING TIMESTAMPS
# ============================================================

report()
report("=" * 100)
report("                 ACTUAL MISSING TIMESTAMP VALUES")
report("=" * 100)

report()

report(
    f"TOTAL MISSING VALUES : "
    f"{len(missing_timestamps):,}"
)

if missing_timestamps:

    report()

    for timestamp in missing_timestamps:

        report(
            f"{timestamp}  |  "
            f"{epoch_to_utc(timestamp)} UTC  |  "
            f"{epoch_to_ist(timestamp)} IST"
        )


# ============================================================
# FULL-DAY RANGE CHECK
# ============================================================

report()
report("=" * 100)
report("                   FULL-DAY RANGE CHECK")
report("=" * 100)

report()

report(
    f"EXPECTED START       : "
    f"{EXPECTED_START}"
)

report(
    f"EXPECTED END         : "
    f"{EXPECTED_END}"
)

report(
    f"EXPECTED TIMESTAMPS  : "
    f"{len(expected_timestamps):,}"
)

report(
    f"UNIQUE CSV TIMESTAMPS: "
    f"{len(actual_timestamp_set):,}"
)

report(
    f"MISSING FROM RANGE   : "
    f"{len(missing_from_expected_day):,}"
)

report(
    f"OUTSIDE RANGE        : "
    f"{len(outside_expected_day):,}"
)


# ============================================================
# PRICE STATISTICS
# ============================================================

report()
report("=" * 100)
report("                     PRICE STATISTICS")
report("=" * 100)

report()

report(
    f"FIRST PRICE          : "
    f"{first_price:.3f}"
)

report(
    f"LAST PRICE           : "
    f"{last_price:.3f}"
)

report(
    f"HIGHEST PRICE        : "
    f"{highest_price:.3f}"
)

report(
    f"LOWEST PRICE         : "
    f"{lowest_price:.3f}"
)

report(
    f"PRICE RANGE          : "
    f"{price_range:.3f}"
)

report(
    f"NET CHANGE           : "
    f"{net_change:+.3f}"
)

report(
    f"NET PERCENTAGE       : "
    f"{net_percentage:+.6f}%"
)


# ============================================================
# PRICE CHANGE MATH
# ============================================================
#
# Price change:
#
#     ΔP = Current Price - Previous Price
#
# Percentage:
#
#     ΔP%
#       =
#     (Current - Previous)
#     -------------------
#       Previous
#       × 100
#
# ============================================================

report()
report("=" * 100)
report("                     PRICE MOVEMENT MATH")
report("=" * 100)

report()

report(
    f"UP MOVEMENTS        : "
    f"{up_count:,}"
)

report(
    f"DOWN MOVEMENTS      : "
    f"{down_count:,}"
)

report(
    f"FLAT MOVEMENTS      : "
    f"{flat_count:,}"
)

report()

report(
    f"AVERAGE CHANGE      : "
    f"{average_change:+.8f}"
)

report(
    f"AVERAGE ABS CHANGE  : "
    f"{average_absolute_change:.8f}"
)

report(
    f"MEDIAN CHANGE       : "
    f"{median_change:+.8f}"
)

report(
    f"CHANGE STD DEV      : "
    f"{change_stddev:.8f}"
)

if absolute_changes:

    report(
        f"LARGEST TICK CHANGE : "
        f"{max(absolute_changes):.6f}"
    )


# ============================================================
# PRICE FREQUENCY
# ============================================================

report()
report("=" * 100)
report("              PRICE FREQUENCY — BIGGEST TO SMALLEST")
report("=" * 100)

report()

report(
    f"TOTAL PRICE RECORDS : "
    f"{tick_count:,}"
)

report(
    f"UNIQUE PRICES       : "
    f"{unique_price_count:,}"
)

report(
    f"REPEATED PRICES     : "
    f"{len(repeated_prices):,}"
)

report()

report(
    f"{'RANK':>6} "
    f"{'PRICE':>14} "
    f"{'COUNT':>12} "
    f"{'PERCENT':>12}"
)

report("-" * 55)

for rank, (price, count) in enumerate(
    price_counter.most_common(
        TOP_PRICE_COUNT
    ),
    start=1
):

    percentage = (
        count
        / tick_count
        * 100
    )

    report(
        f"{rank:>6} "
        f"{price:>14.3f} "
        f"{count:>12,} "
        f"{percentage:>11.6f}%"
    )


# ============================================================
# TARGET PRICE REPORT
# ============================================================

report()
report("=" * 100)
report(
    f"                TARGET PRICE = {TARGET_PRICE:.3f}"
)
report("=" * 100)

report()

report(
    f"OCCURRENCES         : "
    f"{target_count:,}"
)

target_percentage = (
    target_count
    / tick_count
    * 100
)

report(
    f"PERCENTAGE OF TICKS : "
    f"{target_percentage:.6f}%"
)


if target_count:

    report()
    report(
        f"{'NO.':>6} "
        f"{'CSV LINE':>10} "
        f"{'TIMESTAMP':>15} "
        f"{'UTC':>20} "
        f"{'IST':>20} "
        f"{'GAP':>12}"
    )

    report("-" * 100)

    previous_target = None

    for occurrence, index in enumerate(
        target_indexes[
            :MAX_TARGET_OCCURRENCES_DISPLAY
        ],
        start=1
    ):

        timestamp = timestamps[index]

        if previous_target is None:

            gap_text = "FIRST"

        else:

            gap_text = duration_text(
                timestamp
                - previous_target
            )

        report(
            f"{occurrence:>6} "
            f"{index + 2:>10} "
            f"{timestamp:>15} "
            f"{epoch_to_utc(timestamp):>20} "
            f"{epoch_to_ist(timestamp):>20} "
            f"{gap_text:>12}"
        )

        previous_target = timestamp

    if target_count > 1:

        report()
        report("TARGET PRICE GAP MATH")
        report("-" * 50)

        report(
            f"MINIMUM GAP         : "
            f"{duration_text(min(target_gaps))}"
        )

        report(
            f"MAXIMUM GAP         : "
            f"{duration_text(max(target_gaps))}"
        )

        report(
            f"AVERAGE GAP         : "
            f"{mean(target_gaps):.2f} seconds"
        )

        report(
            f"MEDIAN GAP          : "
            f"{median(target_gaps):.2f} seconds"
        )

else:

    report()
    report(
        "TARGET PRICE NOT FOUND."
    )


# ============================================================
# CONSECUTIVE SAME PRICE
# ============================================================

report()
report("=" * 100)
report("                 CONSECUTIVE SAME-PRICE RUNS")
report("=" * 100)

report()

report(
    f"REPEATED PRICE RUNS  : "
    f"{len(same_price_runs):,}"
)

if same_price_runs:

    report()

    report(
        f"{'RANK':>6} "
        f"{'PRICE':>14} "
        f"{'TICKS':>10} "
        f"{'DURATION':>12} "
        f"{'START UTC':>20} "
        f"{'END UTC':>20}"
    )

    report("-" * 100)

    for rank, run in enumerate(
        same_price_runs[:TOP_PRICE_COUNT],
        start=1
    ):

        report(
            f"{rank:>6} "
            f"{run['price']:>14.3f} "
            f"{run['count']:>10,} "
            f"{duration_text(run['duration']):>12} "
            f"{epoch_to_utc(run['start']):>20} "
            f"{epoch_to_utc(run['end']):>20}"
        )


# ============================================================
# HOURLY DISTRIBUTION
# ============================================================

report()
report("=" * 100)
report("                  HOURLY TICK DISTRIBUTION")
report("=" * 100)

report()

report(
    f"{'UTC HOUR':>12} "
    f"{'TICKS':>12} "
    f"{'EXPECTED':>12} "
    f"{'COVERAGE':>12}"
)

report("-" * 55)

for hour in range(24):

    count = hour_counter[hour]

    hour_coverage = (
        count
        / 3600
        * 100
    )

    report(
        f"{hour:02d}:00-{hour:02d}:59 "
        f"{count:>12,} "
        f"{3600:>12,} "
        f"{hour_coverage:>11.4f}%"
    )


# ============================================================
# SAVE FULL TEXT REPORT
# ============================================================

with REPORT_FILE.open(
    "w",
    encoding="utf-8"
) as file:

    file.write(
        "\n".join(
            report_lines
        )
    )

print()
print("=" * 100)
print("                    REPORT SAVED")
print("=" * 100)
print()
print(
    REPORT_FILE.resolve()
)


# ============================================================
# PLOTTING
# ============================================================
#
# matplotlib is imported here so that the text analysis still
# remains understandable separately from the visualization.
#
# Install once if necessary:
#
#     pip install matplotlib
#
# ============================================================

try:

    import matplotlib.pyplot as plt

except ImportError:

    print()
    print(
        "matplotlib is not installed."
    )
    print(
        "Install it with:"
    )
    print()
    print(
        "    pip install matplotlib"
    )
    print()

    raise SystemExit(0)


# ============================================================
# PLOT 1 — PRICE OVER TIME
# ============================================================

plt.figure(
    figsize=(16, 7)
)

plt.plot(
    timestamps,
    prices,
    linewidth=0.7
)

plt.title(
    "FRX XAUUSD Tick Price"
)

plt.xlabel(
    "Unix Timestamp"
)

plt.ylabel(
    "Price"
)

plt.grid(
    True,
    alpha=0.3
)

plt.tight_layout()

plt.show()


# ============================================================
# PLOT 2 — PRICE CHANGE
# ============================================================

change_times = timestamps[1:]

plt.figure(
    figsize=(16, 7)
)

plt.plot(
    change_times,
    price_changes,
    linewidth=0.5
)

plt.axhline(
    0,
    linestyle="--",
    linewidth=1
)

plt.title(
    "FRX XAUUSD Tick-to-Tick Price Change"
)

plt.xlabel(
    "Unix Timestamp"
)

plt.ylabel(
    "Price Change"
)

plt.grid(
    True,
    alpha=0.3
)

plt.tight_layout()

plt.show()


# ============================================================
# PLOT 3 — HOURLY TICK COUNT
# ============================================================

hours = list(
    range(24)
)

hour_values = [
    hour_counter[hour]
    for hour in hours
]

plt.figure(
    figsize=(14, 7)
)

plt.bar(
    hours,
    hour_values
)

plt.title(
    "FRX XAUUSD Tick Count Per UTC Hour"
)

plt.xlabel(
    "UTC Hour"
)

plt.ylabel(
    "Tick Count"
)

plt.xticks(
    hours
)

plt.grid(
    True,
    axis="y",
    alpha=0.3
)

plt.tight_layout()

plt.show()


# ============================================================
# PLOT 4 — TOP REPEATED PRICES
# ============================================================

top_prices = price_counter.most_common(
    30
)

if top_prices:

    labels = [
        f"{price:.3f}"
        for price, count
        in top_prices
    ]

    values = [
        count
        for price, count
        in top_prices
    ]

    plt.figure(
        figsize=(16, 8)
    )

    plt.bar(
        labels,
        values
    )

    plt.title(
        "Top 30 Most Repeated Prices"
    )

    plt.xlabel(
        "Price"
    )

    plt.ylabel(
        "Number of Occurrences"
    )

    plt.xticks(
        rotation=75
    )

    plt.grid(
        True,
        axis="y",
        alpha=0.3
    )

    plt.tight_layout()

    plt.show()


# ============================================================
# PLOT 5 — MISSING TIMESTAMP EVENTS
# ============================================================

if gap_records:

    gap_times = [
        record["current"]
        for record in gap_records
    ]

    gap_values = [
        record["gap"]
        for record in gap_records
    ]

    plt.figure(
        figsize=(16, 7)
    )

    plt.scatter(
        gap_times,
        gap_values,
        s=12
    )

    plt.axhline(
        1,
        linestyle="--",
        linewidth=1
    )

    plt.title(
        "Timestamp Gap Events"
    )

    plt.xlabel(
        "Unix Timestamp"
    )

    plt.ylabel(
        "Seconds Between Records"
    )

    plt.grid(
        True,
        alpha=0.3
    )

    plt.tight_layout()

    plt.show()


# ============================================================
# FINAL SUMMARY
# ============================================================

print()
print("=" * 100)
print("                         FINAL SUMMARY")
print("=" * 100)

print()

print(
    f"CSV                  : "
    f"{CSV_FILE.name}"
)

print(
    f"Ticks                : "
    f"{tick_count:,}"
)

print(
    f"Expected/day         : "
    f"{EXPECTED_SECONDS_PER_DAY:,}"
)

print(
    f"Missing timestamps   : "
    f"{missing_timestamp_count:,}"
)

print(
    f"Coverage             : "
    f"{coverage:.4f}%"
)

print(
    f"Unique prices        : "
    f"{unique_price_count:,}"
)

print(
    f"Repeated prices      : "
    f"{len(repeated_prices):,}"
)

print(
    f"Target {TARGET_PRICE:.3f} count : "
    f"{target_count:,}"
)

print(
    f"Highest price        : "
    f"{highest_price:.3f}"
)

print(
    f"Lowest price         : "
    f"{lowest_price:.3f}"
)

print(
    f"Price range          : "
    f"{price_range:.3f}"
)

print(
    f"Net price change     : "
    f"{net_change:+.3f}"
)

print(
    f"Up movements         : "
    f"{up_count:,}"
)

print(
    f"Down movements       : "
    f"{down_count:,}"
)

print(
    f"Flat movements       : "
    f"{flat_count:,}"
)

print()

print(
    f"FULL REPORT:"
)

print(
    f"    {REPORT_FILE.resolve()}"
)

print()

print("=" * 100)
print("                         DONE")
print("=" * 100)