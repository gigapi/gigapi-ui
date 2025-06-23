/**
 * Standardized Error Handling Utilities
 * Provides consistent error handling patterns across the application
 */

export interface AppError {
  message: string;
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  originalError?: Error;
}

export class AppErrorHandler {
  /**
   * Create standardized error object
   */
  static createError(
    message: string,
    code: string,
    severity: AppError['severity'] = 'medium',
    context?: Record<string, any>,
    originalError?: Error
  ): AppError {
    return {
      message,
      code,
      severity,
      context,
      originalError
    };
  }

  /**
   * Handle connection errors with standardized categorization
   */
  static handleConnectionError(error: any, context?: Record<string, any>): AppError {
    const message = error?.message || 'Connection failed';
    const status = error?.response?.status || error?.status;

    if (status === 401) {
      return this.createError(
        'Authentication failed. Please check your credentials.',
        'AUTH_FAILED',
        'high',
        { ...context, status },
        error
      );
    }

    if (status === 403) {
      return this.createError(
        'Access denied. You do not have permission to access this resource.',
        'ACCESS_DENIED',
        'high',
        { ...context, status },
        error
      );
    }

    if (status === 404) {
      return this.createError(
        'Resource not found. Please check the URL or endpoint.',
        'NOT_FOUND',
        'medium',
        { ...context, status },
        error
      );
    }

    if (status >= 500) {
      return this.createError(
        'Server error. Please try again later.',
        'SERVER_ERROR',
        'critical',
        { ...context, status },
        error
      );
    }

    if (error?.code === 'ECONNREFUSED' || message.includes('refused')) {
      return this.createError(
        'Connection refused. Please check if the server is running.',
        'CONNECTION_REFUSED',
        'high',
        { ...context, originalMessage: message },
        error
      );
    }

    if (error?.code === 'ETIMEDOUT' || message.includes('timeout')) {
      return this.createError(
        'Connection timeout. Please check your network connection.',
        'CONNECTION_TIMEOUT',
        'medium',
        { ...context, originalMessage: message },
        error
      );
    }

    return this.createError(
      `Connection error: ${message}`,
      'CONNECTION_ERROR',
      'medium',
      { ...context, originalMessage: message },
      error
    );
  }

  /**
   * Handle query execution errors
   */
  static handleQueryError(error: any, query?: string, context?: Record<string, any>): AppError {
    const message = error?.message || 'Query execution failed';

    if (message.includes('syntax error') || message.includes('SQL syntax')) {
      return this.createError(
        'SQL syntax error. Please check your query syntax.',
        'SQL_SYNTAX_ERROR',
        'medium',
        { ...context, query, originalMessage: message },
        error
      );
    }

    if (message.includes('permission denied') || message.includes('access denied')) {
      return this.createError(
        'Permission denied. You do not have access to execute this query.',
        'QUERY_PERMISSION_DENIED',
        'high',
        { ...context, query, originalMessage: message },
        error
      );
    }

    if (message.includes('timeout') || message.includes('cancelled')) {
      return this.createError(
        'Query timeout. The query took too long to execute.',
        'QUERY_TIMEOUT',
        'medium',
        { ...context, query, originalMessage: message },
        error
      );
    }

    if (message.includes('table') && message.includes('does not exist')) {
      return this.createError(
        'Table or view does not exist. Please check the table name.',
        'TABLE_NOT_FOUND',
        'medium',
        { ...context, query, originalMessage: message },
        error
      );
    }

    return this.createError(
      `Query error: ${message}`,
      'QUERY_ERROR',
      'medium',
      { ...context, query, originalMessage: message },
      error
    );
  }

  /**
   * Handle storage errors
   */
  static handleStorageError(error: any, operation?: string, context?: Record<string, any>): AppError {
    const message = error?.message || 'Storage operation failed';

    if (message.includes('quota') || message.includes('storage')) {
      return this.createError(
        'Storage quota exceeded. Please clear some data and try again.',
        'STORAGE_QUOTA_EXCEEDED',
        'high',
        { ...context, operation, originalMessage: message },
        error
      );
    }

    return this.createError(
      `Storage error: ${message}`,
      'STORAGE_ERROR',
      'medium',
      { ...context, operation, originalMessage: message },
      error
    );
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(field: string, value: any, rules: string[]): AppError {
    return this.createError(
      `Validation failed for field '${field}': ${rules.join(', ')}`,
      'VALIDATION_ERROR',
      'medium',
      { field, value, rules }
    );
  }

  /**
   * Log error with appropriate level
   */
  static logError(error: AppError): void {
    const logData = {
      message: error.message,
      code: error.code,
      severity: error.severity,
      context: error.context,
      stack: error.originalError?.stack
    };

    switch (error.severity) {
      case 'critical':
        console.error('[CRITICAL]', logData);
        break;
      case 'high':
        console.error('[HIGH]', logData);
        break;
      case 'medium':
        console.warn('[MEDIUM]', logData);
        break;
      case 'low':
        console.info('[LOW]', logData);
        break;
    }
  }
}

/**
 * Legacy compatibility functions for existing imports
 */
export function handleConnectionError(error: any, context?: any) {
  const appError = AppErrorHandler.handleConnectionError(error, context);
  return {
    message: appError.message,
    detail: appError.context?.originalMessage || '',
    type: 'connection' as const
  };
}

export function handleQueryError(error: any, query?: string) {
  const appError = AppErrorHandler.handleQueryError(error, query);
  return {
    message: appError.message,
    detail: appError.context?.originalMessage || '',
    type: 'query' as const,
    query: query
  };
}