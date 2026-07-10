export declare class SocketDropException extends Error {
  readonly safeToRetry: boolean;
  constructor(
    message: string,
    safeToRetry: boolean,
    options?: {
      cause?: unknown;
    },
  );
}
export declare function extractErrorCode(err: unknown): string | undefined;
export declare function readErrorName(err: unknown): string;
export declare function collectErrorGraphCandidates(
  err: unknown,
  resolveNested?: (current: Record<string, unknown>) => Iterable<unknown>,
): unknown[];
/**
 * Type guard for NodeJS.ErrnoException (any error with a `code` property).
 */
export declare function isErrno(err: unknown): err is NodeJS.ErrnoException;
/**
 * Check if an error has a specific errno code.
 */
export declare function hasErrnoCode(err: unknown, code: string): boolean;
export declare function formatErrorMessage(err: unknown): string;
export declare function formatUncaughtError(err: unknown): string;
export type ErrorKind =
  | "refusal"
  | "timeout"
  | "rate_limit"
  | "context_length"
  | "socket_drop"
  | "unknown";
export declare function detectErrorKind(err: unknown): ErrorKind | undefined;
