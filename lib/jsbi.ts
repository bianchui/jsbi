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
    if (length > JSBI.__kMaxLength) {
      throw new RangeError('Maximum BigInt size exceeded');
    }
  }

  static BigInt(arg: number | string | boolean | object): JSBI {
    if (typeof arg === 'number') {
      if (arg === 0) return JSBI.__zero();
      if (JSBI.__isOneDigitInt(arg)) {
        if (arg < 0) {
          return JSBI.__oneDigit(-arg, true);
        }
        return JSBI.__oneDigit(arg, false);
      }
    } else if (typeof arg === 'string') {
      const result = JSBI.__fromString(arg);
      if (result === null) {
        throw new SyntaxError('Cannot convert ' + arg + ' to a BigInt');
      }
      return result;
    }
    throw new TypeError('Cannot convert ' + arg + ' to a BigInt');
  }

  // Equivalent of "Number(my_bigint)" in the native implementation.
  // TODO: add more tests
  static toNumber(x: JSBI): number {
    const xLength = x.length;
    if (xLength === 0) return 0;
    if (xLength === 1) {
      const value = x.__unsignedDigit(0);
      return x.sign ? -value : value;
    }
    throw new TypeError('Cannot convert ' + x + ' to a Number');
  }

  // Operations.

  static unaryMinus(x: JSBI): JSBI {
    if (x.length === 0) return x;
    const result = x.__copy();
    result.sign = !x.sign;
    return result;
  }

  static divide(x: JSBI, y: JSBI): JSBI {
    if (y.length === 0) throw new RangeError('Division by zero');
    if (JSBI.__absoluteCompare(x, y) < 0) return JSBI.__zero();
    const resultSign = x.sign !== y.sign;
    const divisor = y.__unsignedDigit(0);
    let quotient;
    /*if (y.length === 1 && divisor <= 0x7fff)*/ {
      if (divisor === 1) {
        return resultSign === x.sign ? x : JSBI.unaryMinus(x);
      }
      quotient = JSBI.__absoluteDivSmall(x, divisor, null);
    } //else {
    //  quotient = JSBI.__absoluteDivLarge(x, y, true, false);
    //}
    quotient.sign = resultSign;
    return quotient.__trim();
  }

  static remainder(x: JSBI, y: JSBI): JSBI {
    if (y.length === 0) throw new RangeError('Division by zero');
    if (JSBI.__absoluteCompare(x, y) < 0) return x;
    const divisor = y.__unsignedDigit(0);
    /*if (y.length === 1 && divisor <= 0x7fff)*/ {
      if (divisor === 1) return JSBI.__zero();
      const remainderDigit = JSBI.__absoluteModSmall(x, divisor);
      if (remainderDigit === 0) return JSBI.__zero();
      return JSBI.__oneDigit(remainderDigit, x.sign);
    }
    //const remainder = JSBI.__absoluteDivLarge(x, y, false, true);
    //remainder.sign = x.sign;
    //return remainder.__trim();
  }

  static equal(x: JSBI, y: JSBI): boolean {
    if (x.sign !== y.sign) return false;
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (x.__digit(i) !== y.__digit(i)) return false;
    }
    return true;
  }

  // Helpers.

  static __zero(): JSBI {
    return new JSBI(0, false);
  }

  static __oneDigit(value: number, sign: boolean): JSBI {
    const result = new JSBI(1, sign);
    result.__setDigit(0, value);
    return result;
  }

  __copy(): JSBI {
    const result = new JSBI(this.length, this.sign);
    for (let i = 0; i < this.length; i++) {
      result[i] = this[i];
    }
    return result;
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

  __initializeDigits(): void {
    for (let i = 0; i < this.length; i++) {
      this[i] = 0;
    }
  }

  static __decideRounding(x: JSBI, mantissaBitsUnset: number, digitIndex: number, currentDigit: number): 1 | 0 | -1 {
    if (mantissaBitsUnset > 0) return -1;
    let topUnconsumedBit;
    if (mantissaBitsUnset < 0) {
      topUnconsumedBit = -mantissaBitsUnset - 1;
    } else {
      // {currentDigit} fit the mantissa exactly; look at the next digit.
      if (digitIndex === 0) return -1;
      digitIndex--;
      currentDigit = x.__digit(digitIndex);
      topUnconsumedBit = 29;
    }
    // If the most significant remaining bit is 0, round down.
    let mask = 1 << topUnconsumedBit;
    if ((currentDigit & mask) === 0) return -1;
    // If any other remaining bit is set, round up.
    mask -= 1;
    if ((currentDigit & mask) !== 0) return 1;
    while (digitIndex > 0) {
      digitIndex--;
      if (x.__digit(digitIndex) !== 0) return 1;
    }
    return 0;
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
      result.__initializeDigits();
      let done = false;
      let charsSoFar = 0;
      do {
        let part = 0;
        let multiplier = 1;
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

          const m = multiplier * radix;
          if (m > 0x3fffffff) break;
          multiplier = m;
          part = part * radix + d;
          charsSoFar++;
          if (++cursor === length) {
            done = true;
            break;
          }
          current = string.charCodeAt(cursor);
        }
        roundup = JSBI.__kBitsPerCharTableMultiplier * 30 - 1;
        const digitsSoFar = (((bitsPerChar * charsSoFar + roundup) >>> JSBI.__kBitsPerCharTableShift) / 30) | 0;
        result.__inplaceMultiplyAdd(multiplier, part, digitsSoFar);
      } while (!done);
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

  static __absoluteCompare(x: JSBI, y: JSBI) {
    const diff = x.length - y.length;
    if (diff !== 0) return diff;
    let i = x.length - 1;
    while (i >= 0 && x.__digit(i) === y.__digit(i)) i--;
    if (i < 0) return 0;
    return x.__unsignedDigit(i) > y.__unsignedDigit(i) ? 1 : -1;
  }

  __inplaceMultiplyAdd(multiplier: number, summand: number, length: number): void {
    if (length > this.length) length = this.length;
    const mLow = multiplier & 0x7fff;
    const mHigh = multiplier >>> 15;
    let carry = 0;
    let high = summand;
    for (let i = 0; i < length; i++) {
      const d = this.__digit(i);
      const dLow = d & 0x7fff;
      const dHigh = d >>> 15;
      const pLow = JSBI.__imul(dLow, mLow);
      const pMid1 = JSBI.__imul(dLow, mHigh);
      const pMid2 = JSBI.__imul(dHigh, mLow);
      const pHigh = JSBI.__imul(dHigh, mHigh);
      let result = high + pLow + carry;
      carry = result >>> 30;
      result &= 0x3fffffff;
      result += ((pMid1 & 0x7fff) << 15) + ((pMid2 & 0x7fff) << 15);
      carry += result >>> 30;
      high = pHigh + (pMid1 >>> 15) + (pMid2 >>> 15);
      this.__setDigit(i, result & 0x3fffffff);
    }
    if (carry !== 0 || high !== 0) {
      throw new Error('implementation bug');
    }
  }

  static __absoluteDivSmall(x: JSBI, divisor: number, quotient: JSBI | null = null): JSBI {
    if (quotient === null) quotient = new JSBI(x.length, false);
    let remainder = 0;
    for (let i = x.length * 2 - 1; i >= 0; i -= 2) {
      let input = ((remainder << 15) | x.__halfDigit(i)) >>> 0;
      const upperHalf = (input / divisor) | 0;
      remainder = input % divisor | 0;
      input = ((remainder << 15) | x.__halfDigit(i - 1)) >>> 0;
      const lowerHalf = (input / divisor) | 0;
      remainder = input % divisor | 0;
      quotient.__setDigit(i >>> 1, (upperHalf << 15) | lowerHalf);
    }
    return quotient;
  }

  static __absoluteModSmall(x: JSBI, divisor: number): number {
    let remainder = 0;
    for (let i = x.length * 2 - 1; i >= 0; i--) {
      const input = ((remainder << 15) | x.__halfDigit(i)) >>> 0;
      remainder = input % divisor | 0;
    }
    return remainder;
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

  static __kMaxLength = 1 << 25;
  static __kMaxLengthBits = JSBI.__kMaxLength << 5;
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
  static __kConversionChars = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
  static __kBitConversionBuffer = new ArrayBuffer(8);
  static __kBitConversionDouble = new Float64Array(JSBI.__kBitConversionBuffer);
  static __kBitConversionInts = new Int32Array(JSBI.__kBitConversionBuffer);

  // For IE11 compatibility.
  // Note that the custom replacements are tailored for JSBI's needs, and as
  // such are not reusable as general-purpose polyfills.
  static __clz30 = Math.clz32
    ? function (x: number): number {
        return Math.clz32(x) - 2;
      }
    : function (x: number) {
        if (x === 0) return 30;
        return (29 - ((Math.log(x >>> 0) / Math.LN2) | 0)) | 0;
      };
  static __imul =
    Math.imul ||
    function (a: number, b: number) {
      return (a * b) | 0;
    };
  static __isOneDigitInt(x: number) {
    return (x & 0x3fffffff) === x;
  }
}

export default JSBI;
