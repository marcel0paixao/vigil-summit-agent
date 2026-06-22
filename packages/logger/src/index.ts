export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

export function createLogger(serviceName: string, level: LogLevel = "info"): Logger {
  const levels: LogLevel[] = ["debug", "info", "warn", "error"];
  const minimumLevel = levels.indexOf(level);

  function write(nextLevel: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (levels.indexOf(nextLevel) < minimumLevel) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: nextLevel,
      service: serviceName,
      message,
      ...(context ? { context } : {})
    };

    console.log(JSON.stringify(entry));
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context)
  };
}
