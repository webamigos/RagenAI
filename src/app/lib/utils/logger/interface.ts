export interface AppLogger {
  info: (message: string | object, ...args: any[]) => void;
  error: (message: string | object, ...args: any[]) => void;
  warn: (message: string | object, ...args: any[]) => void;
  debug: (message: string | object, ...args: any[]) => void;
}
