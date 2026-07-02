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

// [lon, lat] economic-center / capital points for the 42 mapped countries,
// used to place portfolio exposure bubbles. Hardcoded (no d3-geo dependency).
export const COUNTRY_CENTROID: Record<string, [number, number]> = {
  US: [-98, 39], CA: [-106, 56], BR: [-51, -12], MX: [-102, 23], AR: [-64, -34], CL: [-71, -33],
  GB: [-2, 54], DE: [10, 51], FR: [2, 47], ES: [-4, 40], IT: [12, 42], CH: [8, 47], NL: [5, 52],
  SE: [15, 62], NO: [9, 61], DK: [10, 56], FI: [26, 64], AT: [14, 47.5], BE: [4.5, 50.6], PT: [-8, 39.5],
  GR: [22, 39], IE: [-8, 53], PL: [19, 52], TR: [35, 39], ZA: [25, -29], IL: [35, 31.5], SA: [45, 24],
  EG: [30, 27], RU: [37, 55],
  JP: [138, 36], CN: [104, 35], HK: [114, 22.3], IN: [79, 22], KR: [128, 36.5], TW: [121, 23.7],
  AU: [134, -25], NZ: [172, -41], SG: [104, 1.3], ID: [113, -2], TH: [101, 15], MY: [102, 4], PH: [122, 12],
}
