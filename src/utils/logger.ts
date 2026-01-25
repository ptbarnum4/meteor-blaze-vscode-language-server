/**
 * Logger utility for the Meteor Language Server with consistent formatting and additional features.
 */

import { VSCodeServerConnection } from '../types';

class Logger {
  private _disabled = false;
  private connection: VSCodeServerConnection;
  private console: VSCodeServerConnection['console'];
  private _ctx: string | undefined;
  constructor(connection: VSCodeServerConnection, ctx?: string) {
    this.connection = connection;
    this.console = connection.console;
    this._ctx = ctx;
  }

  private static toMsgString(...messages: unknown[]): string {
    const messageStrings = messages
      .map((msg) => {
        if (!msg) {
          return `${msg}`;
        }
        if (typeof msg === 'string') {
          return msg.trim();
        }
        if (typeof msg === 'function') {
          return msg.toString();
        }
        if (typeof msg === 'object') {
          try {
            return JSON.stringify(msg, null, 2);
          } catch {
            return String(msg).trim();
          }
        }
        return String(msg);
      })
      .join(' ')
      .split(/\n\n\n*/)
      .map((part) => part.trim())
      .filter((part) => !!part.length)
      .join('\n');
    return messageStrings;
  }
  private static get now(): string {
    return new Date().toISOString();
  }

  private logWithContext(
    level: 'log' | 'error' | 'warn' | 'info',
    ...messages: unknown[]
  ): Logger {
    if (this._disabled) {
      return this;
    }

    const logFnMap = {
      log: this.console.log,
      error: this.console.error,
      warn: this.console.warn,
      info: this.console.info,
    };
    const logFn = logFnMap[level];

    const message = Logger.toMsgString(...messages);
    const ctx = `[${Logger.now}] [${this._ctx || level}]`;

    logFn.call(this.console, `${ctx} ${message}`);
    return this;
  }

  public ctx(str: string): Logger {
    return new Logger(this.connection, str);
  }

  public log(...messages: unknown[]): Logger {
    return this.logWithContext('log', ...messages);
  }
  public info(...messages: unknown[]): Logger {
    return this.logWithContext('info', ...messages);
  }
  public warn(...messages: unknown[]): Logger {
    return this.logWithContext('warn', ...messages);
  }
  public error(...messages: unknown[]): Logger {
    return this.logWithContext('error', ...messages);
  }

  public disable(): Logger {
    this._disabled = true;
    return this;
  }
  public enable(): Logger {
    this._disabled = false;
    return this;
  }
}

export default Logger;
