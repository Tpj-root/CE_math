import { Tick } from '../types/trading';

// The user's official tick snippet
export const INITIAL_USER_SNIPPET = `times,prices
1790274600,4274.65
1790274601,4274.58
1790274602,4274.68
1790274603,4274.63
1790274604,4274.70
1790274605,4274.70
1790274606,4274.43
1790274607,4274.36
1790274608,4274.35`;

/**
 * Generate a realistic micro-tick series starting from the user's exact timestamp
 * and price, creating realistic market dynamics for testing 1m, 5m, and custom seconds.
 */
export function generateRealisticTicks(
  baseTime: number = 1790274600,
  startPrice: number = 4274.65,
  tickCount: number = 2400, // ~40 minutes of 1-second ticks
  regime: 'balanced' | 'trending_up' | 'high_volatility' | 'choppy' = 'balanced'
): Tick[] {
  const ticks: Tick[] = [];
  
  // Seed with the user's exact official ticks first
  const initialPrices = [
    4274.65, 4274.58, 4274.68, 4274.63, 4274.70,
    4274.70, 4274.43, 4274.36, 4274.35
  ];

  for (let i = 0; i < initialPrices.length; i++) {
    ticks.push({
      time: baseTime + i,
      price: initialPrices[i],
    });
  }

  let curPrice = initialPrices[initialPrices.length - 1];
  let curTime = baseTime + initialPrices.length;
  let momentum = -0.02;

  // Pseudo-random deterministic generator with seed for reproducible graphs
  let seed = 42;
  const pseudoRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const remaining = tickCount - initialPrices.length;

  for (let i = 0; i < remaining; i++) {
    curTime += 1;

    // Regime dynamics
    let drift = 0;
    let vol = 0.08;

    if (regime === 'trending_up') {
      drift = 0.025;
      vol = 0.12;
    } else if (regime === 'high_volatility') {
      drift = Math.sin(i / 150) * 0.08;
      vol = 0.28;
    } else if (regime === 'choppy') {
      drift = -0.05 * (curPrice - startPrice); // strong mean reversion
      vol = 0.09;
    } else {
      // Balanced regime with distinct waves for Chandelier exit testing
      // Creates 3 to 4 distinct trend flips over the session
      drift = Math.sin(i / 220) * 0.045 + Math.cos(i / 60) * 0.015;
      vol = 0.11;
    }

    // Micro-structure random walk
    const noise = (pseudoRand() - 0.5) * vol * 2;
    momentum = momentum * 0.92 + (noise + drift) * 0.08;
    curPrice += momentum;

    // Prevent negative or absurd values
    curPrice = Math.max(100, Math.round(curPrice * 100) / 100);

    ticks.push({
      time: curTime,
      price: curPrice,
    });
  }

  return ticks;
}

export function ticksToCsvString(ticks: Tick[]): string {
  const header = 'times,prices\n';
  const rows = ticks.map(t => `${t.time},${t.price.toFixed(2)}`).join('\n');
  return header + rows;
}
