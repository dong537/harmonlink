import { EnvConfig } from './env.schema';
export declare class ConfigService {
    get<T extends keyof EnvConfig>(key: T): EnvConfig[T];
}
