type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

class Logger {
  private isTest = process.env.NODE_ENV === 'test'

  private formatMessage(level: LogLevel, context: string, message: string, metadata?: unknown): string {
    const timestamp = new Date().toISOString()
    const metaStr = metadata ? ` | Meta: ${JSON.stringify(metadata)}` : ''
    return `[${timestamp}] [${level}] [${context}] ${message}${metaStr}`
  }

  public info(context: string, message: string, metadata?: unknown) {
    if (this.isTest) return
    console.log(this.formatMessage('INFO', context, message, metadata))
  }

  public warn(context: string, message: string, metadata?: unknown) {
    if (this.isTest) return
    console.warn(this.formatMessage('WARN', context, message, metadata))
  }

  public error(context: string, message: string, metadata?: unknown) {
    console.error(this.formatMessage('ERROR', context, message, metadata))
  }

  public debug(context: string, message: string, metadata?: unknown) {
    if (this.isTest || process.env.NODE_ENV === 'production') return
    console.log(this.formatMessage('DEBUG', context, message, metadata))
  }

  /**
   * Masks a sensitive value for safe logging.
   * Shows first 4 and last 4 characters, masks the middle with asterisks.
   * Returns '[empty]' for falsy values.
   */
  public sensitive(value: string | undefined | null): string {
    if (!value) return '[empty]'
    if (value.length <= 10) return '****'
    return `${value.substring(0, 4)}${'*'.repeat(Math.min(value.length - 8, 16))}${value.substring(value.length - 4)}`
  }
}

export const logger = new Logger()
