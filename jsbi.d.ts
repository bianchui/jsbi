declare class JSBI extends Array {
    constructor(length: number);
    static BigInt(arg: string): JSBI;
    static div(x: JSBI, y: number): JSBI;
    static mod(x: JSBI, y: number): number;
    static is(x: JSBI): boolean;
    static zero(): JSBI;
}
export default JSBI;
