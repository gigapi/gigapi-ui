import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Database, BarChart3, Table, FileText } from "lucide-react";

interface LazyArtifactProps {
  children: React.ReactNode;
  artifactId: string;
  artifactType: string;
  artifactContent?: string;
  estimatedHeight?: number;
  onVisible?: () => void;
  onHidden?: () => void;
}

export default function LazyArtifact({
  children,
  artifactId,
  artifactType,
  estimatedHeight = 400,
}: LazyArtifactProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Simple loading - once mounted, always show
  useEffect(() => {
    // Small delay to show loading state
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const getArtifactIcon = () => {
    switch (artifactType) {
      case "query":
        return <Database className="w-4 h-4" />;
      case "chart":
        return <BarChart3 className="w-4 h-4" />;
      case "table":
        return <Table className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  // Show skeleton on initial load
  if (!isLoaded) {
    return (
      <div style={{ minHeight: `${estimatedHeight}px` }}>
        <Card className="w-full">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="w-4 h-4" />
              <Skeleton className="h-5 w-32" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-64 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Always show content once loaded
  return <div>{children}</div>;
}

// Removed the cache clearing function as we no longer use caching