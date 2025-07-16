import { TrendingUp, TrendingDown, AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { InsightArtifact as InsightArtifactType } from "@/types/artifact.types";
import { cn } from "@/lib/utils/class-utils";

interface InsightArtifactProps {
  artifact: InsightArtifactType;
}

export default function InsightArtifact({ artifact }: InsightArtifactProps) {
  const { insights } = artifact.data;
  
  const getSeverityIcon = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };
  
  const getSeverityStyles = (severity?: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500/10 border-red-500/30';
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/30';
      default:
        return 'bg-blue-500/10 border-blue-500/30';
    }
  };
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {insights.map((insight, idx) => (
        <div
          key={idx}
          className={cn(
            "p-4 rounded-lg border transition-all hover:shadow-lg",
            getSeverityStyles(insight.severity)
          )}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {getSeverityIcon(insight.severity)}
              <h3 className="font-medium text-neutral-200">
                {insight.title}
              </h3>
            </div>
            {insight.change && (
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                insight.change.type === 'increase' && insight.change.value > 0 ? "text-green-500" : "text-red-500"
              )}>
                {insight.change.type === 'increase' ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                {Math.abs(insight.change.value)}%
              </div>
            )}
          </div>
          
          <div className="text-2xl font-bold text-neutral-100 mb-2">
            {insight.value}
          </div>
          
          {insight.description && (
            <p className="text-sm text-neutral-400">
              {insight.description}
            </p>
          )}
          
          {insight.change && (
            <div className="text-xs text-neutral-500 mt-2">
              {insight.change.type === 'increase' ? '↑' : '↓'} {insight.change.period}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}