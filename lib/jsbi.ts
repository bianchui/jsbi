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
  private constructor(length: number) {
    super(length);
    // Explicitly set the prototype as per
    // https://github.com/Microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    Object.setPrototypeOf(this, JSBI.prototype);
  }

  static BigInt(arg: string): JSBI {
    if (typeof arg === 'string') {
      const result = JSBI.__fromStringHex(arg);
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
    let quotient = new JSBI(x.length);
    let remainder = 0;
    for (let i = x.length * 2 - 1; i >= 0; i -= 2) {
      let input = ((remainder << 15) | x.__halfDigit(i)) >>> 0;
      const upperHalf = (input / y) | 0;
      remainder = input % y | 0;
      input = ((remainder << 15) | x.__halfDigit(i - 1)) >>> 0;
      const lowerHalf = (input / y) | 0;
      remainder = input % y | 0;
      quotient[i >>> 1] = (upperHalf << 15) | lowerHalf;
    }
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
    return new JSBI(0);
  }

  __trim(): this {
    let newLength = this.length;
    let last = this[newLength - 1];
    while (last === 0) {
      newLength--;
      last = this[newLength - 1];
      this.pop();
    }
    return this;
  }

  static __fromStringHex(string: string): JSBI | null {
    const length = string.length;
    let cursor = 0;
    if (cursor === length) return JSBI.__zero();
    let current = string.charCodeAt(cursor);
    // not support whitespace.
    if (current === 0x30) {
      // '0'
      // Allow "0x" prefix.
      if (++cursor === length) return JSBI.__zero();
      current = string.charCodeAt(cursor);
      if (current === 0x58 || current === 0x78) {
        // 'X' or 'x'
        if (++cursor === length) return null;
        current = string.charCodeAt(cursor);
      }
    }
    // Skip leading zeros.
    while (current === 0x30) {
      if (++cursor === length) return JSBI.__zero();
      current = string.charCodeAt(cursor);
    }

    // Allocate result.
    const chars = length - cursor;
    let bitsPerChar = 4;
    const bitsMin = bitsPerChar * chars;
    const resultLength = ((bitsMin + 29) / 30) | 0;
    const result = new JSBI(resultLength);

    // Parse.
    const parts = [];
    const partsBits = [];
    let done = false;
    do {
      let part = 0;
      let bits = 0;
      while (true) {
        let d;
        if ((current - 48) >>> 0 < 10) {
          d = current - 48;
        } else if (((current | 32) - 97) >>> 0 < 6) {
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

    let digitIndex = 0;
    let digit = 0;
    let bitsInDigit = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const partBits = partsBits[i];
      digit |= part << bitsInDigit;
      bitsInDigit += partBits;
      if (bitsInDigit === 30) {
        result[digitIndex++] = digit | 0;
        bitsInDigit = 0;
        digit = 0;
      } else if (bitsInDigit > 30) {
        result[digitIndex++] = digit & 0x3fffffff;
        bitsInDigit -= 30;
        digit = part >>> (partBits - bitsInDigit);
      }
    }
    if (digit !== 0) {
      if (digitIndex >= result.length) throw new Error('implementation bug');
      result[digitIndex++] = digit | 0;
    }
    for (; digitIndex < result.length; digitIndex++) {
      result[digitIndex] = 0;
    }
    // Get result.
    return result.__trim();
  }

  // Digit helpers.
  __halfDigit(i: number): number {
    return (this[i >>> 1] >>> ((i & 1) * 15)) & 0x7fff;
  }
}

export default JSBI;
