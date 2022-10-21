declare class JSBI extends Array {
    private sign;
    private constructor();
    static BigInt(arg: string): JSBI;
    static div(x: JSBI, y: number): JSBI;
    static mod(x: JSBI, y: number): number;
    static is(x: JSBI): boolean;
}
export default JSBI;
