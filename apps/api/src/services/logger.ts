import { AsyncLocalStorage } from 'async_hooks';
import util from 'util';

export type LogContext = Record<string, unknown>;
type ConsoleMethod = (...args: unknown[]) => void;

export const contextStorage = new AsyncLocalStorage<LogContext>();
let installed = false;

export function setLogContext(context: LogContext) {
  const store = contextStorage.getStore();
  if (store) {
    Object.assign(store, context);
  }
}

function serializeError(error: Error) {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function buildPayload(level: string, args: unknown[]) {
  const context = contextStorage.getStore() || {};
  const payload: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    service: process.env.EXCERPT_SERVICE_NAME || 'excerpt-api',
    ...context,
  };

  const errorArg = args.find((arg): arg is Error => arg instanceof Error);
  if (errorArg) {
    payload.err = serializeError(errorArg);
  }

  payload.msg = util.format(...args);
  return payload;
}

function wrapConsoleMethod(level: string, original: ConsoleMethod): ConsoleMethod {
  return (...args: unknown[]) => {
    try {
      original(JSON.stringify(buildPayload(level, args)));
    } catch {
      original(...args);
    }
  };
}

export function installConsoleLogger() {
  if (installed) return;
  installed = true;

  console.log = wrapConsoleMethod('info', console.log.bind(console));
  console.info = wrapConsoleMethod('info', console.info.bind(console));
  console.warn = wrapConsoleMethod('warn', console.warn.bind(console));
  console.error = wrapConsoleMethod('error', console.error.bind(console));
}

export function withLogContext<T>(context: LogContext, run: () => T): T {
  const current = contextStorage.getStore() || {};
  return contextStorage.run({ ...current, ...context }, run);
}
