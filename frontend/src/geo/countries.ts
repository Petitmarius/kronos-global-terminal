// ISO 3166 numeric -> alpha-2, for joining world-atlas topojson to our data.
export const NUM_TO_ISO: Record<number, string> = {
  840: 'US', 124: 'CA', 76: 'BR', 484: 'MX', 32: 'AR', 152: 'CL',
  826: 'GB', 276: 'DE', 250: 'FR', 724: 'ES', 380: 'IT', 756: 'CH', 528: 'NL',
  752: 'SE', 578: 'NO', 208: 'DK', 246: 'FI', 40: 'AT', 56: 'BE', 620: 'PT',
  300: 'GR', 372: 'IE', 616: 'PL', 792: 'TR', 710: 'ZA', 376: 'IL', 682: 'SA',
  818: 'EG', 643: 'RU',
  392: 'JP', 156: 'CN', 344: 'HK', 356: 'IN', 410: 'KR', 158: 'TW', 36: 'AU',
  554: 'NZ', 702: 'SG', 360: 'ID', 764: 'TH', 458: 'MY', 608: 'PH',
}
