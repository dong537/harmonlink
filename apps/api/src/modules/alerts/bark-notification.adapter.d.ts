import { ConfigService } from '../../common/config/config.service';
type FetchLike = typeof fetch;
export declare const BARK_NOTIFICATION_FETCH = "BARK_NOTIFICATION_FETCH";
export type BarkNotification = {
    title: string;
    body: string;
    group: string;
    dedupeKey: string;
};
export type BarkDeliveryResult = {
    attempted: number;
    delivered: number;
};
export declare class BarkNotificationAdapter {
    private readonly config;
    private readonly fetchImpl;
    constructor(config: ConfigService, fetchImpl?: FetchLike);
    deviceKeyCount(): number;
    send(notification: BarkNotification): Promise<BarkDeliveryResult>;
    private push;
    private deviceKeys;
}
export {};
