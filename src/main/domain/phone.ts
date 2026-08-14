import { ValidationError } from './errors'

/**
 * Indian mobile number, normalized to its bare 10-digit form (e.g. `9876543210`).
 *
 * Per TRAI/DoT allocation, a valid Indian mobile number is exactly 10 digits whose
 * first digit is 6-9 (the only series allocated to mobile; 0-5 are landline/short
 * codes). Users may enter a country-code prefix (`+91`, `91`, `0091`, `0`) and
 * formatting separators (space, hyphen, parentheses); those are accepted on input
 * and normalized away for storage, so the DB keeps one consistent form.
 */
export class IndianMobileNumber {
  /** The canonical 10-digit value, e.g. `9876543210`. */
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  /**
   * Validates `raw` and returns the normalized value object. Throws
   * `ValidationError` if the input is blank or not a valid Indian mobile number.
   */
  static parse(raw: string): IndianMobileNumber {
    if (!raw || raw.trim().length === 0) {
      throw new ValidationError('Mobile number is required')
    }

    const cleaned = raw.trim().replace(/[\s()-]/g, '')
    const match = cleaned.match(/^(?:\+91|0091|91|0)?([6-9][0-9]{9})$/)

    if (!match) {
      throw new ValidationError('Enter a valid 10-digit Indian mobile number')
    }

    return new IndianMobileNumber(match[1])
  }

  /** Validates `raw`; returns the value object, or `null` if invalid. */
  static tryParse(raw: string): IndianMobileNumber | null {
    try {
      return IndianMobileNumber.parse(raw)
    } catch {
      return null
    }
  }

  toString(): string {
    return this.value
  }
}
