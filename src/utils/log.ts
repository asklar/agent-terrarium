const isDev = import.meta.env.DEV;

const prefix = (level: string) => `[${level}] [${new Date().toISOString()}]`;

export const log = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(prefix("DEBUG"), ...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(prefix("INFO"), ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(prefix("WARN"), ...args);
  },
  error: (...args: unknown[]) => {
    console.error(prefix("ERROR"), ...args);
  },
};
