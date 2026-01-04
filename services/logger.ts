export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEvent {
  event: string;
  timestamp: string;
  userId?: string;
  data: Record<string, any>;
  level: LogLevel;
}

// In-memory buffer for the Diagnostics Panel
const LOG_BUFFER_SIZE = 50;
const logBuffer: LogEvent[] = [];

export const logEvent = (event: string, data: Record<string, any>, userId?: string, level: LogLevel = 'info') => {
  const logEntry: LogEvent = {
    event,
    timestamp: new Date().toISOString(),
    userId,
    data,
    level
  };

  // 1. Console Output
  console[level](`[${event}]`, data);

  // 2. Buffer Logic
  logBuffer.unshift(logEntry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.pop();
  }
};

export const getRecentLogs = () => [...logBuffer];

export const clearLogs = () => {
  logBuffer.length = 0;
};