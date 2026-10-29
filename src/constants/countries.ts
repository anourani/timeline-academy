/**
 * ISO 3166-1 alpha-2 codes offered by the World Events country picker.
 *
 * Codes only: display names come from `Intl.DisplayNames`, which every
 * supported browser ships, so there is no name table to maintain or
 * translate. Sovereign states only — territories make poor "national
 * history" subjects.
 */
const COUNTRY_CODES = [
  'AF', 'AL', 'DZ', 'AD', 'AO', 'AG', 'AR', 'AM', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY',
  'BE', 'BZ', 'BJ', 'BT', 'BO', 'BA', 'BW', 'BR', 'BN', 'BG', 'BF', 'BI', 'CV', 'KH', 'CM', 'CA',
  'CF', 'TD', 'CL', 'CN', 'CO', 'KM', 'CG', 'CD', 'CR', 'CI', 'HR', 'CU', 'CY', 'CZ', 'DK', 'DJ',
  'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FJ', 'FI', 'FR', 'GA', 'GM', 'GE',
  'DE', 'GH', 'GR', 'GD', 'GT', 'GN', 'GW', 'GY', 'HT', 'HN', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ',
  'IE', 'IL', 'IT', 'JM', 'JP', 'JO', 'KZ', 'KE', 'KI', 'KP', 'KR', 'XK', 'KW', 'KG', 'LA', 'LV',
  'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MR', 'MU',
  'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NZ', 'NI', 'NE',
  'NG', 'MK', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH', 'PL', 'PT', 'QA', 'RO',
  'RU', 'RW', 'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK', 'SI',
  'SB', 'SO', 'ZA', 'SS', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TZ', 'TH', 'TL',
  'TG', 'TO', 'TT', 'TN', 'TR', 'TM', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UY', 'UZ', 'VU', 'VA',
  'VE', 'VN', 'YE', 'ZM', 'ZW',
] as const

let displayNames: Intl.DisplayNames | null | undefined

/** English display name for an ISO alpha-2 code, falling back to the code. */
export function countryName(code: string): string {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {
      displayNames = null
    }
  }
  try {
    return displayNames?.of(code) ?? code
  } catch {
    return code
  }
}

export interface CountryOption {
  code: string
  name: string
}

let sorted: CountryOption[] | null = null

/** Every offered country, sorted by display name. Built once, on first use. */
export function getCountryOptions(): CountryOption[] {
  if (!sorted) {
    sorted = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }
  return sorted
}
