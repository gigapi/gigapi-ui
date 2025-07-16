import { Lightbulb, TrendingUp, AlertCircle, Info } from "lucide-react";
import type { SummaryArtifact as SummaryArtifactType } from "@/types/artifact.types";

interface SummaryArtifactProps {
  artifact: SummaryArtifactType;
}

export default function SummaryArtifact({ artifact }: SummaryArtifactProps) {
  const { summary, insights, metadata } = artifact.data;
  
  return (
    <div className="space-y-4">
      {/* Summary section */}
      <div className="p-4 bg-neutral-800/50 rounded-lg border border-neutral-700">
        <h3 className="text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Summary
        </h3>
        <p className="text-sm text-neutral-200 leading-relaxed">
          {summary}
        </p>
        
        {metadata && (
          <div className="flex items-center gap-3 mt-3 text-xs text-neutral-500">
            {metadata.rowCount && (
              <span>Based on {metadata.rowCount.toLocaleString()} rows</span>
            )}
            {metadata.timeRange && (
              <span>• Time range: {metadata.timeRange}</span>
            )}
            {metadata.generatedAt && (
              <span>• Generated at {new Date(metadata.generatedAt).toLocaleTimeString()}</span>
            )}
          </div>
        )}
      </div>
      
      {/* Insights section */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Key Insights
          </h3>
          <div className="space-y-2">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className="p-3 bg-neutral-800/30 rounded-lg border border-neutral-700/50 flex items-start gap-3"
              >
                <div className="mt-0.5">
                  {idx % 3 === 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : idx % 3 === 1 ? (
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                  ) : (
                    <Info className="w-4 h-4 text-blue-500" />
                  )}
                </div>
                <p className="text-sm text-neutral-200 flex-1">
                  {insight}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}