import { extractErrorCode, formatErrorMessage, SocketDropException } from "../errors.js";

type PromiseLikeValue<T> = PromiseLike<T> | Promise<T>;

const SOCKET_DROP_MESSAGE_RE =
  /socket hang up|econnreset|econnaborted|epipe|und_err_socket|network request failed|connection reset|premature close/i;

function isPromiseLike<T>(value: unknown): value is PromiseLikeValue<T> {
  return Boolean(
    value && typeof value === "object" && "then" in (value as Record<string, unknown>),
  );
}

function isLikelySocketDrop(err: unknown): boolean {
  const code = extractErrorCode(err)?.toLowerCase();
  if (code === "econnreset" || code === "econnaborted" || code === "epipe") {
    return true;
  }
  const message = formatErrorMessage(err);
  return SOCKET_DROP_MESSAGE_RE.test(message);
}

export class SocketAdapter {
  static attach<T>(requestOrStream: T, responseStarted: () => boolean): T {
    if (!isPromiseLike(requestOrStream)) {
      return requestOrStream;
    }
    const wrapped = requestOrStream.catch((err) => {
      throw SocketAdapter.normalizeError(err, responseStarted);
    });
    return wrapped as T;
  }

  static normalizeError(err: unknown, responseStarted: () => boolean): unknown {
    if (err instanceof SocketDropException) {
      return err;
    }
    if (!isLikelySocketDrop(err)) {
      return err;
    }
    const phase = responseStarted() ? "mid-stream" : "before response";
    return new SocketDropException(
      `Socket dropped ${phase}: ${formatErrorMessage(err)}`,
      !responseStarted(),
      {
        cause: err,
      },
    );
  }
}
