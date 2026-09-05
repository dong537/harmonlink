import Decimal from 'decimal.js';
export declare function toDecimalString(value: string | number | Decimal): string;
export declare function addMoney(a: string, b: string): string;
export declare function subtractMoney(a: string, b: string): string;
export declare function isPositive(value: string): boolean;
export declare function isNonNegative(value: string): boolean;
export declare function assertCurrency(actual: string, expected: string): void;
