declare class JSBI extends Array {
    private sign;
    private constructor();
    static BigInt(arg: number | string | boolean | object): JSBI;
    static toNumber(x: JSBI): number;
    static unaryMinus(x: JSBI): JSBI;
    static divide(x: JSBI, y: JSBI): JSBI;
    static remainder(x: JSBI, y: JSBI): JSBI;
    static greaterThan(x: JSBI, y: JSBI): boolean;
    static greaterThanOrEqual(x: JSBI, y: JSBI): boolean;
    static equal(x: JSBI, y: JSBI): boolean;
    static asIntN(n: number, x: JSBI): JSBI;
    static asUintN(n: number, x: JSBI): JSBI;
    static LT(x: any, y: any): boolean;
    static LE(x: any, y: any): boolean;
    static GT(x: any, y: any): boolean;
    static GE(x: any, y: any): boolean;
    static EQ(x: any, y: any): boolean;
    static NE(x: any, y: any): boolean;
}
export default JSBI;
