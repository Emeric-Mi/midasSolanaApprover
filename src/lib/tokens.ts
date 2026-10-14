/**
 * Payment tokens offered in the mint selector, per cluster.
 *
 * Add entries here as more tokens are supported - the selector is driven entirely
 * by this map, nothing else needs to change.
 */
export type TokenOption = {
  symbol: string;
  mint: string;
};

export const TOKENS: Record<string, TokenOption[]> = {
  mainnet: [{ symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
  devnet: [{ symbol: 'USDC', mint: 'HLLPLxkSJoWmHMtzXWtJHYY87eGybWxSLX5jxatEC1CM' }],
};

/** Sentinel for the "paste any mint" option in the selector. */
export const CUSTOM_MINT = '__custom__';
