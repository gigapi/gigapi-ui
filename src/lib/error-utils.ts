import { toast } from "sonner";

/**
 * Error handling utilities for consistent error management across the application
 */

export interface AppError {
  message: string;
  code?: string;
  detail?: string;
  statusCode?: number;
  context?: Record<string, any>;
}

export interface QueryError extends AppError {
  query?: string;
  queryType?: 'syntax' | 'runtime' | 'network' | 'timeout' | 'permission' | 'unknown';
}

export interface ConnectionError extends AppError {
  endpoint?: string;
  retryable?: boolean;
}

/**
 * Create a standardized error object
 */
export function createError(
  message: string,
  options: Partial<AppError> = {}
): AppError {
  return {
    message,
    code: options.code || 'UNKNOWN_ERROR',
    detail: options.detail,
    statusCode: options.statusCode,
    context: options.context,
  };
}

/**
 * Extract error information from various error sources
 */
export function extractErrorInfo(error: any): AppError {
  // Handle Axios errors
  if (error.response) {
    const response = error.response;
    const statusCode = response.status;
    
    let message = `Request failed with status ${statusCode}`;
    let detail = null;
    let code = `HTTP_${statusCode}`;
    
    // Extract detailed error message
    if (response.data) {
      if (typeof response.data === 'string') {
        detail = response.data;
      } else if (response.data.error) {
        detail = response.data.error;
      } else if (response.data.message) {
        detail = response.data.message;
        message = response.data.message;
      }
    }
    
    return createError(message, {
      code,
      detail,
      statusCode,
      context: { url: response.config?.url }
    });
  }
  
  // Handle network errors
  if (error.request) {
    return createError('Network error - unable to reach server', {
      code: 'NETWORK_ERROR',
      detail: 'Please check your internet connection and try again',
      context: { url: error.config?.url }
    });
  }
  
  // Handle abort errors
  if (error.name === 'AbortError' || error.name === 'CanceledError') {
    return createError('Request was cancelled', {
      code: 'REQUEST_CANCELLED',
      detail: 'The request was cancelled before completion'
    });
  }
  
  // Handle timeout errors
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return createError('Request timed out', {
      code: 'TIMEOUT_ERROR',
      detail: 'The request took too long to complete. Please try again.'
    });
  }
  
  // Handle generic errors
  return createError(error.message || 'An unexpected error occurred', {
    code: error.code || 'UNKNOWN_ERROR',
    detail: error.detail,
    context: { originalError: error }
  });
}

/**
 * Classify query errors based on content
 */
export function classifyQueryError(errorMessage: string, statusCode?: number): QueryError {
  const lowerMessage = errorMessage.toLowerCase();
  
  let queryType: QueryError['queryType'] = 'unknown';
  let userFriendlyMessage = errorMessage;
  
  // Syntax errors
  if (lowerMessage.includes('syntax error') || 
      lowerMessage.includes('parse error') ||
      lowerMessage.includes('unexpected token') ||
      statusCode === 400) {
    queryType = 'syntax';
    userFriendlyMessage = 'SQL syntax error in your query';
  }
  // Permission errors
  else if (lowerMessage.includes('permission') || 
           lowerMessage.includes('access denied') ||
           lowerMessage.includes('unauthorized') ||
           statusCode === 401 || statusCode === 403) {
    queryType = 'permission';
    userFriendlyMessage = 'Permission denied - check your access rights';
  }
  // Runtime errors
  else if (lowerMessage.includes('memory limit') ||
           lowerMessage.includes('timeout') ||
           lowerMessage.includes('execution') ||
           statusCode === 500) {
    queryType = 'runtime';
    userFriendlyMessage = 'Query execution error';
  }
  // Network errors
  else if (lowerMessage.includes('network') ||
           lowerMessage.includes('connection') ||
           !statusCode) {
    queryType = 'network';
    userFriendlyMessage = 'Network connection error';
  }
  
  return {
    message: userFriendlyMessage,
    detail: errorMessage,
    queryType,
    statusCode,
    code: `QUERY_${queryType.toUpperCase()}_ERROR`
  };
}

/**
 * Show error toast with consistent styling
 */
export function showErrorToast(error: AppError, options: {
  title?: string;
  duration?: number;
  action?: () => void;
  actionLabel?: string;
} = {}) {
  const title = options.title || 'Error';
  const description = error.detail || error.message;
  
  toast.error(title, {
    description,
    duration: options.duration || 5000,
    action: options.action ? {
      label: options.actionLabel || 'Retry',
      onClick: options.action,
    } : undefined,
  });
}

/**
 * Show success toast with consistent styling
 */
export function showSuccessToast(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 3000,
  });
}

/**
 * Show warning toast with consistent styling
 */
export function showWarningToast(message: string, description?: string) {
  toast.warning(message, {
    description,
    duration: 4000,
  });
}

/**
 * Handle query execution errors with appropriate user feedback
 */
export function handleQueryError(error: any, query?: string): QueryError {
  const baseError = extractErrorInfo(error);
  const queryError = classifyQueryError(baseError.message, baseError.statusCode);
  
  // Add query context if available
  if (query) {
    queryError.query = query;
    queryError.context = { ...queryError.context, query };
  }
  
  // Show appropriate user feedback
  switch (queryError.queryType) {
    case 'syntax':
      showErrorToast(queryError, {
        title: 'SQL Syntax Error',
        actionLabel: 'Check Query'
      });
      break;
    case 'permission':
      showErrorToast(queryError, {
        title: 'Access Denied',
        actionLabel: 'Check Permissions'
      });
      break;
    case 'runtime':
      showErrorToast(queryError, {
        title: 'Query Execution Failed',
        actionLabel: 'Modify Query'
      });
      break;
    case 'network':
      showErrorToast(queryError, {
        title: 'Connection Error',
        actionLabel: 'Retry'
      });
      break;
    default:
      showErrorToast(queryError, {
        title: 'Query Failed'
      });
  }
  
  return queryError;
}

/**
 * Handle connection errors with appropriate user feedback
 */
export function handleConnectionError(error: any, endpoint?: string): ConnectionError {
  const baseError = extractErrorInfo(error);
  
  const connectionError: ConnectionError = {
    ...baseError,
    endpoint,
    retryable: !error.response || error.response.status >= 500,
  };
  
  // Show appropriate user feedback
  if (connectionError.retryable) {
    showErrorToast(connectionError, {
      title: 'Connection Failed',
      actionLabel: 'Retry Connection'
    });
  } else {
    showErrorToast(connectionError, {
      title: 'Connection Error',
      actionLabel: 'Check Settings'
    });
  }
  
  return connectionError;
}

/**
 * Validate input with error feedback
 */
export function validateInput(
  value: any,
  rules: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    custom?: (value: any) => string | null;
  },
  fieldName: string = 'Input'
): string | null {
  if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    return `${fieldName} is required`;
  }
  
  if (value && typeof value === 'string') {
    if (rules.minLength && value.length < rules.minLength) {
      return `${fieldName} must be at least ${rules.minLength} characters`;
    }
    
    if (rules.maxLength && value.length > rules.maxLength) {
      return `${fieldName} must be no more than ${rules.maxLength} characters`;
    }
    
    if (rules.pattern && !rules.pattern.test(value)) {
      return `${fieldName} format is invalid`;
    }
  }
  
  if (rules.custom) {
    return rules.custom(value);
  }
  
  return null;
}