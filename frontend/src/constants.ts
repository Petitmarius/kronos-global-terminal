export const CATEGORIES = ['ALL', 'FX', 'CRYPTO', 'INDEX', 'EQ', 'CMD'] as const
export const CAT_LABELS: Record<string, string> = {
  ALL: 'ALL', FX: 'FX', CRYPTO: 'CRY', INDEX: 'IDX', EQ: 'EQ', CMD: 'CMD',
}
export const TIMEFRAMES = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as const
export const STUDIES = ['MA', 'RSI', 'MACD', 'VOL', 'BB'] as const

export const BALANCE = 50_000
export const LEVERAGE = 10

export const COLORS = {
  green: '#00E676',
  red: '#FF1744',
  amber: '#FF9100',
  blue: '#42A5F5',
  gray: '#607D8B',
}
