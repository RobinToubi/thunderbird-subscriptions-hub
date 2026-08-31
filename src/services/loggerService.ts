export interface LogMessage {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: any;
}

export type LogListener = (log: LogMessage) => void;

export class LoggerService {
  private static logs: LogMessage[] = [];
  private static listeners: Set<LogListener> = new Set();
  private static maxLogs = 200;

  static log(level: 'info' | 'warn' | 'error' | 'success', message: string, details?: any) {
    const time = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });

    const entry: LogMessage = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: time,
      level,
      message,
      details: details ? (typeof details === 'object' ? JSON.parse(JSON.stringify(details)) : details) : undefined
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // Classic console output
    const prefix = `[Subscriptions Hub ${level.toUpperCase()} ${time}]`;
    if (level === 'error') {
      console.error(prefix, message, details || '');
    } else if (level === 'warn') {
      console.warn(prefix, message, details || '');
    } else {
      console.log(prefix, message, details || '');
    }

    // Transmission to local listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {}
    }

    // Transmission via the WebExtension API to open tabs
    if (typeof browser !== 'undefined' && browser?.runtime?.sendMessage) {
      try {
        browser.runtime.sendMessage({
          action: 'DEBUG_LOG',
          payload: entry
        }).catch(() => {});
      } catch {}
    }
  }

  static info(message: string, details?: any) {
    this.log('info', message, details);
  }

  static success(message: string, details?: any) {
    this.log('success', message, details);
  }

  static warn(message: string, details?: any) {
    this.log('warn', message, details);
  }

  static error(message: string, details?: any) {
    this.log('error', message, details);
  }

  static getLogs(): LogMessage[] {
    return [...this.logs];
  }

  static clearLogs() {
    this.logs = [];
  }

  static subscribe(listener: LogListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
