declare function attach<T>(requestOrStream: T, responseStarted: () => boolean): T;
declare function normalizeError(err: unknown, responseStarted: () => boolean): unknown;
export declare const SocketAdapter: {
  attach: typeof attach;
  normalizeError: typeof normalizeError;
};
export {};
