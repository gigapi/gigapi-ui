import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Database, BarChart3, Table, FileText } from "lucide-react";

interface LazyArtifactProps {
  children: React.ReactNode;
  artifactId: string;
  artifactType: string;
  estimatedHeight?: number;
  onVisible?: () => void;
  onHidden?: () => void;
}

// Global cache for rendered artifacts to prevent re-execution
const artifactCache = new Map<string, React.ReactNode>();
const artifactHeights = new Map<string, number>();

export default function LazyArtifact({
  children,
  artifactId,
  artifactType,
  estimatedHeight = 400,
  onVisible,
  onHidden,
}: LazyArtifactProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [renderedContent, setRenderedContent] = useState<React.ReactNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibilityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize callbacks to prevent unnecessary re-renders
  const handleVisible = useCallback(() => {
    if (onVisible) {
      onVisible();
    }
  }, [onVisible]);

  const handleHidden = useCallback(() => {
    if (onHidden) {
      onHidden();
    }
  }, [onHidden]);

  // Get cached height for this artifact
  const cachedHeight = useMemo(() => {
    return artifactHeights.get(artifactId) || estimatedHeight;
  }, [artifactId, estimatedHeight]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const nowVisible = entry.isIntersecting;
          
          // Debounce visibility changes to prevent excessive re-renders
          if (visibilityTimeoutRef.current) {
            clearTimeout(visibilityTimeoutRef.current);
          }
          
          visibilityTimeoutRef.current = setTimeout(() => {
            setIsVisible(nowVisible);

            if (nowVisible && !hasBeenVisible) {
              setHasBeenVisible(true);
            }

            // Use memoized callbacks
            if (nowVisible) {
              handleVisible();
            } else {
              handleHidden();
            }
          }, 100); // 100ms debounce
        });
      },
      {
        // Trigger when artifact is within 200px of viewport
        rootMargin: "200px",
        threshold: 0,
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
      }
    };
  }, [hasBeenVisible, handleVisible, handleHidden]);

  // Cache rendered content when it becomes visible
  useEffect(() => {
    if (hasBeenVisible && !renderedContent) {
      // Check if we have cached content for this artifact
      const cachedContent = artifactCache.get(artifactId);
      if (cachedContent) {
        setRenderedContent(cachedContent);
      } else {
        // Cache the children for future use
        artifactCache.set(artifactId, children);
        setRenderedContent(children);
      }
    }
  }, [hasBeenVisible, renderedContent, artifactId, children]);

  // Update cached height when container changes
  useEffect(() => {
    if (containerRef.current && hasBeenVisible) {
      const height = containerRef.current.getBoundingClientRect().height;
      if (height > 0) {
        artifactHeights.set(artifactId, height);
      }
    }
  }, [artifactId, hasBeenVisible, renderedContent]);

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

  // Show skeleton while not visible and hasn't been loaded yet
  if (!isVisible && !hasBeenVisible) {
    return (
      <div ref={containerRef} style={{ minHeight: `${cachedHeight}px` }}>
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

  // Show placeholder when scrolled out of view but use cached content
  if (!isVisible && hasBeenVisible) {
    return (
      <div ref={containerRef} style={{ minHeight: `${cachedHeight}px` }}>
        <Card className="w-full">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              {getArtifactIcon()}
              <span className="text-sm">Artifact #{artifactId}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">Scroll to view artifact</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render cached content when visible (prevents re-execution)
  return (
    <div ref={containerRef} style={{ minHeight: `${cachedHeight}px` }}>
      {renderedContent || children}
    </div>
  );
}
