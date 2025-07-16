import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ArtifactLog {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  context: string;
  data?: any;
  error?: Error;
  duration?: number;
}

export interface ArtifactOperation {
  artifactId: string;
  operationId: string;
  type: 'query' | 'transform' | 'render' | 'save' | 'error';
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'success' | 'error';
  logs: ArtifactLog[];
  input?: any;
  output?: any;
  error?: Error;
}

export interface ArtifactMetrics {
  queryExecutionTime?: number;
  dataTransformTime?: number;
  renderTime?: number;
  totalTime?: number;
  rowCount?: number;
  errorCount: number;
}

interface ArtifactContextValue {
  // Logging
  log: (artifactId: string, level: LogLevel, message: string, data?: any) => void;
  startOperation: (artifactId: string, type: ArtifactOperation['type'], input?: any) => string;
  endOperation: (operationId: string, output?: any, error?: Error) => void;
  
  // Debug state
  operations: Record<string, ArtifactOperation[]>;
  metrics: Record<string, ArtifactMetrics>;
  
  // Debug UI
  showDebugPanel: boolean;
  setShowDebugPanel: (show: boolean) => void;
  selectedArtifactId: string | null;
  setSelectedArtifactId: (id: string | null) => void;
  
  // Utilities
  clearLogs: (artifactId?: string) => void;
  exportDebugReport: (artifactId: string) => string;
  getArtifactLogs: (artifactId: string) => ArtifactLog[];
  getArtifactOperations: (artifactId: string) => ArtifactOperation[];
}

const ArtifactContext = createContext<ArtifactContextValue | null>(null);

export const useArtifact = () => {
  const context = useContext(ArtifactContext);
  if (!context) {
    throw new Error('useArtifact must be used within ArtifactProvider');
  }
  return context;
};

export const ArtifactProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [operations, setOperations] = useState<Record<string, ArtifactOperation[]>>({});
  const [metrics, setMetrics] = useState<Record<string, ArtifactMetrics>>({});
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const operationCounter = useRef(0);

  const log = useCallback((artifactId: string, level: LogLevel, message: string, data?: any) => {
    const logEntry: ArtifactLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      level,
      message,
      context: artifactId,
      data,
    };

    setOperations(prev => {
      const artifactOps = prev[artifactId] || [];
      if (artifactOps.length === 0) return prev;
      
      const lastOp = artifactOps[artifactOps.length - 1];
      if (lastOp.status === 'pending') {
        lastOp.logs.push(logEntry);
      }
      
      return { ...prev, [artifactId]: [...artifactOps] };
    });

    // Update error count in metrics
    if (level === 'error') {
      setMetrics(prev => ({
        ...prev,
        [artifactId]: {
          ...(prev[artifactId] || { errorCount: 0 }),
          errorCount: (prev[artifactId]?.errorCount || 0) + 1,
        },
      }));
    }

    // Console output in development
    if (process.env.NODE_ENV === 'development') {
      const style = {
        debug: 'color: #999',
        info: 'color: #2196F3',
        warn: 'color: #FF9800',
        error: 'color: #F44336',
      };
      console.log(`%c[Artifact ${artifactId}] ${message}`, style[level], data);
    }
  }, []);

  const startOperation = useCallback((artifactId: string, type: ArtifactOperation['type'], input?: any): string => {
    const operationId = `op-${artifactId}-${++operationCounter.current}`;
    const operation: ArtifactOperation = {
      artifactId,
      operationId,
      type,
      startTime: new Date(),
      status: 'pending',
      logs: [],
      input,
    };

    setOperations(prev => ({
      ...prev,
      [artifactId]: [...(prev[artifactId] || []), operation],
    }));

    log(artifactId, 'info', `Started ${type} operation`, { operationId, input });
    return operationId;
  }, [log]);

  const endOperation = useCallback((operationId: string, output?: any, error?: Error) => {
    const endTime = new Date();
    
    setOperations(prev => {
      const updated = { ...prev };
      
      for (const artifactId in updated) {
        const ops = updated[artifactId];
        const opIndex = ops.findIndex(op => op.operationId === operationId);
        
        if (opIndex !== -1) {
          const op = ops[opIndex];
          op.endTime = endTime;
          op.status = error ? 'error' : 'success';
          op.output = output;
          op.error = error;
          
          const duration = endTime.getTime() - op.startTime.getTime();
          
          // Update metrics
          setMetrics(prev => {
            const artifactMetrics = prev[artifactId] || { errorCount: 0 };
            
            switch (op.type) {
              case 'query':
                artifactMetrics.queryExecutionTime = duration;
                if (output?.rowCount !== undefined) {
                  artifactMetrics.rowCount = output.rowCount;
                }
                break;
              case 'transform':
                artifactMetrics.dataTransformTime = duration;
                break;
              case 'render':
                artifactMetrics.renderTime = duration;
                break;
            }
            
            // Calculate total time
            artifactMetrics.totalTime = (artifactMetrics.queryExecutionTime || 0) +
                                       (artifactMetrics.dataTransformTime || 0) +
                                       (artifactMetrics.renderTime || 0);
            
            return { ...prev, [artifactId]: artifactMetrics };
          });
          
          log(
            artifactId,
            error ? 'error' : 'info',
            `Completed ${op.type} operation in ${duration}ms`,
            { operationId, duration, output, error }
          );
          
          break;
        }
      }
      
      return updated;
    });
  }, [log]);

  const clearLogs = useCallback((artifactId?: string) => {
    if (artifactId) {
      setOperations(prev => {
        const updated = { ...prev };
        delete updated[artifactId];
        return updated;
      });
      setMetrics(prev => {
        const updated = { ...prev };
        delete updated[artifactId];
        return updated;
      });
    } else {
      setOperations({});
      setMetrics({});
    }
  }, []);

  const exportDebugReport = useCallback((artifactId: string) => {
    const artifactOps = operations[artifactId] || [];
    const artifactMetrics = metrics[artifactId];
    
    const report = {
      artifactId,
      exportedAt: new Date().toISOString(),
      metrics: artifactMetrics,
      operations: artifactOps.map(op => ({
        ...op,
        duration: op.endTime ? op.endTime.getTime() - op.startTime.getTime() : null,
      })),
      logs: artifactOps.flatMap(op => op.logs),
    };
    
    return JSON.stringify(report, null, 2);
  }, [operations, metrics]);

  const getArtifactLogs = useCallback((artifactId: string): ArtifactLog[] => {
    const artifactOps = operations[artifactId] || [];
    return artifactOps.flatMap(op => op.logs);
  }, [operations]);

  const getArtifactOperations = useCallback((artifactId: string): ArtifactOperation[] => {
    return operations[artifactId] || [];
  }, [operations]);

  const value: ArtifactContextValue = {
    log,
    startOperation,
    endOperation,
    operations,
    metrics,
    showDebugPanel,
    setShowDebugPanel,
    selectedArtifactId,
    setSelectedArtifactId,
    clearLogs,
    exportDebugReport,
    getArtifactLogs,
    getArtifactOperations,
  };

  return <ArtifactContext.Provider value={value}>{children}</ArtifactContext.Provider>;
};