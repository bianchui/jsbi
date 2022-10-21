declare class JSBI extends Array {
    private sign;
    private constructor();
    static BigInt(arg: number | string | boolean | object): JSBI;
    static toNumber(x: JSBI): number;
    static unaryMinus(x: JSBI): JSBI;
    static divide(x: JSBI, y: JSBI): JSBI;
    static remainder(x: JSBI, y: JSBI): JSBI;
    static equal(x: JSBI, y: JSBI): boolean;
}
export default JSBI;
