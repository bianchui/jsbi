// Copyright 2018 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the “License”);
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// <https://apache.org/licenses/LICENSE-2.0>.
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an “AS IS” BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

class JSBI extends Array {
  private constructor(length: number, private sign: boolean) {
    super(length);
    // Explicitly set the prototype as per
    // https://github.com/Microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, JSBI.prototype);
  }

  static BigInt(arg: string): JSBI {
    if (typeof arg === 'string') {
      const result = JSBI.__fromString(arg);
      if (result) {
        return result;
      }
    }
    throw new TypeError('Cannot convert ' + arg + ' to a BigInt');
  }

  // Operations.

  static div(x: JSBI, y: number): JSBI {
    y = ~~y;
    if (y <= 0) throw new RangeError('Division by zero');
    let quotient = new JSBI(x.length, false);
    let remainder = 0;
    for (let i = x.length * 2 - 1; i >= 0; i -= 2) {
      let input = ((remainder << 15) | x.__halfDigit(i)) >>> 0;
      const upperHalf = (input / y) | 0;
      remainder = input % y | 0;
      input = ((remainder << 15) | x.__halfDigit(i - 1)) >>> 0;
      const lowerHalf = (input / y) | 0;
      remainder = input % y | 0;
      quotient.__setDigit(i >>> 1, (upperHalf << 15) | lowerHalf);
    }
    quotient.sign = x.sign;
    return quotient.__trim();
  }

  static mod(x: JSBI, y: number): number {
    if (y <= 0) throw new RangeError('Division by zero');
    y = ~~y;
    let remainder = 0;
    for (let i = x.length * 2 - 1; i >= 0; i--) {
      const input = ((remainder << 15) | x.__halfDigit(i)) >>> 0;
      remainder = input % y | 0;
    }
    return remainder;
  }

  static is(x: JSBI): boolean {
    return x.length != 0;
  }

  // Helpers.

  static __zero(): JSBI {
    return new JSBI(0, false);
  }

  __trim(): this {
    let newLength = this.length;
    let last = this[newLength - 1];
    while (last === 0) {
      newLength--;
      last = this[newLength - 1];
      this.pop();
    }
    if (newLength === 0) this.sign = false;
    return this;
  }

  static __isWhitespace(c: number): boolean {
    if (c <= 0x0d && c >= 0x09) return true;
    if (c <= 0x9f) return c === 0x20;
    if (c <= 0x01ffff) {
      return c === 0xa0 || c === 0x1680;
    }
    if (c <= 0x02ffff) {
      c &= 0x01ffff;
      return c <= 0x0a || c === 0x28 || c === 0x29 || c === 0x2f || c === 0x5f || c === 0x1000;
    }
    return c === 0xfeff;
  }

  static __fromString(string: string, radix: number = 0): JSBI | null {
    let sign = 0;
    let leadingZero = false;
    const length = string.length;
    let cursor = 0;
    if (cursor === length) return JSBI.__zero();
    let current = string.charCodeAt(cursor);
    // Skip whitespace.
    while (JSBI.__isWhitespace(current)) {
      if (++cursor === length) return JSBI.__zero();
      current = string.charCodeAt(cursor);
    }

    // Detect radix.
    if (current === 0x2b) {
      // '+'
      if (++cursor === length) return null;
      current = string.charCodeAt(cursor);
      sign = 1;
    } else if (current === 0x2d) {
      // '-'
      if (++cursor === length) return null;
      current = string.charCodeAt(cursor);
      sign = -1;
    }

    if (radix === 0) {
      radix = 10;
      if (current === 0x30) {
        // '0'
        if (++cursor === length) return JSBI.__zero();
        current = string.charCodeAt(cursor);
        if (current === 0x58 || current === 0x78) {
          // 'X' or 'x'
          radix = 16;
          if (++cursor === length) return null;
          current = string.charCodeAt(cursor);
        } else if (current === 0x4f || current === 0x6f) {
          // 'O' or 'o'
          radix = 8;
          if (++cursor === length) return null;
          current = string.charCodeAt(cursor);
        } else if (current === 0x42 || current === 0x62) {
          // 'B' or 'b'
          radix = 2;
          if (++cursor === length) return null;
          current = string.charCodeAt(cursor);
        } else {
          leadingZero = true;
        }
      }
    } else if (radix === 16) {
      if (current === 0x30) {
        // '0'
        // Allow "0x" prefix.
        if (++cursor === length) return JSBI.__zero();
        current = string.charCodeAt(cursor);
        if (current === 0x58 || current === 0x78) {
          // 'X' or 'x'
          if (++cursor === length) return null;
          current = string.charCodeAt(cursor);
        } else {
          leadingZero = true;
        }
      }
    }
    if (sign !== 0 && radix !== 10) return null;
    // Skip leading zeros.
    while (current === 0x30) {
      leadingZero = true;
      if (++cursor === length) return JSBI.__zero();
      current = string.charCodeAt(cursor);
    }

    // Allocate result.
    const chars = length - cursor;
    let bitsPerChar = JSBI.__kMaxBitsPerChar[radix];
    let roundup = JSBI.__kBitsPerCharTableMultiplier - 1;
    if (chars > (1 << 30) / bitsPerChar) return null;
    const bitsMin = (bitsPerChar * chars + roundup) >>> JSBI.__kBitsPerCharTableShift;
    const resultLength = ((bitsMin + 29) / 30) | 0;
    const result = new JSBI(resultLength, false);

    // Parse.
    const limDigit = radix < 10 ? radix : 10;
    const limAlpha = radix > 10 ? radix - 10 : 0;

    if ((radix & (radix - 1)) === 0) {
      // Power-of-two radix.
      bitsPerChar >>= JSBI.__kBitsPerCharTableShift;
      const parts = [];
      const partsBits = [];
      let done = false;
      do {
        let part = 0;
        let bits = 0;
        while (true) {
          let d;
          if ((current - 48) >>> 0 < limDigit) {
            d = current - 48;
          } else if (((current | 32) - 97) >>> 0 < limAlpha) {
            d = (current | 32) - 87;
          } else {
            done = true;
            break;
          }
          bits += bitsPerChar;
          part = (part << bitsPerChar) | d;
          if (++cursor === length) {
            done = true;
            break;
          }
          current = string.charCodeAt(cursor);
          if (bits + bitsPerChar > 30) break;
        }
        parts.push(part);
        partsBits.push(bits);
      } while (!done);
      JSBI.__fillFromParts(result, parts, partsBits);
    } else {
      return null;
    }

    if (cursor !== length) {
      if (!JSBI.__isWhitespace(current)) return null;
      for (cursor++; cursor < length; cursor++) {
        current = string.charCodeAt(cursor);
        if (!JSBI.__isWhitespace(current)) return null;
      }
    }

    // Get result.
    result.sign = sign === -1;
    return result.__trim();
  }

  static __fillFromParts(result: JSBI, parts: number[], partsBits: number[]): void {
    let digitIndex = 0;
    let digit = 0;
    let bitsInDigit = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const partBits = partsBits[i];
      digit |= part << bitsInDigit;
      bitsInDigit += partBits;
      if (bitsInDigit === 30) {
        result.__setDigit(digitIndex++, digit);
        bitsInDigit = 0;
        digit = 0;
      } else if (bitsInDigit > 30) {
        result.__setDigit(digitIndex++, digit & 0x3fffffff);
        bitsInDigit -= 30;
        digit = part >>> (partBits - bitsInDigit);
      }
    }
    if (digit !== 0) {
      if (digitIndex >= result.length) throw new Error('implementation bug');
      result.__setDigit(digitIndex++, digit);
    }
    for (; digitIndex < result.length; digitIndex++) {
      result.__setDigit(digitIndex, 0);
    }
  }

  // Digit helpers.
  __digit(i: number): number {
    return this[i];
  }
  __unsignedDigit(i: number): number {
    return this[i] >>> 0;
  }
  __setDigit(i: number, digit: number): void {
    this[i] = digit | 0;
  }
  __halfDigitLength(): number {
    const len = this.length;
    if (this.__unsignedDigit(len - 1) <= 0x7fff) return len * 2 - 1;
    return len * 2;
  }
  __halfDigit(i: number): number {
    return (this[i >>> 1] >>> ((i & 1) * 15)) & 0x7fff;
  }
  __setHalfDigit(i: number, value: number): void {
    const digitIndex = i >>> 1;
    const previous = this.__digit(digitIndex);
    const updated = i & 1 ? (previous & 0x7fff) | (value << 15) : (previous & 0x3fff8000) | (value & 0x7fff);
    this.__setDigit(digitIndex, updated);
  }

  // Lookup table for the maximum number of bits required per character of a
  // base-N string representation of a number. To increase accuracy, the array
  // value is the actual value multiplied by 32. To generate this table:
  //
  // for (let i = 0; i <= 36; i++) {
  //   console.log(Math.ceil(Math.log2(i) * 32) + ',');
  // }
  static __kMaxBitsPerChar = [
    0,
    0,
    32,
    51,
    64,
    75,
    83,
    90,
    96, // 0..8
    102,
    107,
    111,
    115,
    119,
    122,
    126,
    128, // 9..16
    131,
    134,
    136,
    139,
    141,
    143,
    145,
    147, // 17..24
    149,
    151,
    153,
    154,
    156,
    158,
    159,
    160, // 25..32
    162,
    163,
    165,
    166, // 33..36
  ];

  static __kBitsPerCharTableShift = 5;
  static __kBitsPerCharTableMultiplier = 1 << JSBI.__kBitsPerCharTableShift;

  // For IE11 compatibility.
  // Note that the custom replacements are tailored for JSBI's needs, and as
  // such are not reusable as general-purpose polyfills.
  static __imul =
    Math.imul ||
    function (a: number, b: number) {
      return (a * b) | 0;
    };
}

export default JSBI;
