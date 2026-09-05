export declare function parseAllowlist(value: string): Set<string>;
export declare function allows(value: string | undefined, allowlistValue: string): boolean;
export declare function allowsAny(candidates: Array<{
    value: string | undefined;
    allowlist: string;
}>): boolean;
