import { useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  RefreshCw,
  Database,
  Clock,
  Settings,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { 
  schemaCacheAtom, 
  refreshSchemaCacheAtom,
  isCacheValidAtom,
  cacheRefreshLoadingAtom
} from "@/atoms/database-atoms";
import { useDynamicChatSchema } from "@/hooks/useDynamicChatSchema";

interface ChatCacheManagementProps {
  className?: string;
}

export default function ChatCacheManagement({ className }: ChatCacheManagementProps) {
  const [schemaCache] = useAtom(schemaCacheAtom);
  const [isCacheValid] = useAtom(isCacheValidAtom);
  const [isRefreshing] = useAtom(cacheRefreshLoadingAtom);
  const refreshSchemaCache = useSetAtom(refreshSchemaCacheAtom);
  const [isOpen, setIsOpen] = useState(false);
  
  const dynamicSchema = useDynamicChatSchema();
  
  // Calculate cache stats
  const cacheStats = {
    databases: schemaCache ? Object.keys(schemaCache.databases).length : 0,
    tables: schemaCache 
      ? Object.values(schemaCache.databases).reduce((sum, db) => sum + db.tables.length, 0) 
      : 0,
    schemas: schemaCache 
      ? Object.values(schemaCache.databases).reduce((sum, db) => 
          sum + Object.keys(db.schemas || {}).length, 0
        ) 
      : 0,
    age: schemaCache ? Math.round((Date.now() - schemaCache.timestamp) / (1000 * 60)) : 0,
  };
  
  const handleRefreshCache = async () => {
    try {
      await refreshSchemaCache();
    } catch (error) {
      console.error("Cache refresh error:", error);
    }
  };
  
  const handleClearChatCache = () => {
    dynamicSchema.clearCache();
    toast.success("Chat schema cache cleared");
  };
  
  const getCacheStatusColor = () => {
    if (!isCacheValid) return "text-red-500";
    if (cacheStats.age > 12 * 60) return "text-yellow-500"; // > 12 hours
    return "text-green-500";
  };
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 gap-2 ${className || ''}`}
          title="Schema cache management"
        >
          <Database className="w-4 h-4" />
          <Badge variant="secondary" className="text-xs px-2 py-0.5">
            <Clock className={`w-3 h-3 mr-1 ${getCacheStatusColor()}`} />
            {cacheStats.age < 60 ? `${cacheStats.age}m` : `${Math.round(cacheStats.age / 60)}h`}
          </Badge>
          <Settings className="w-4 h-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Database className="w-4 h-4" />
              Schema Cache Status
            </h4>
            
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-center p-2 bg-muted rounded">
                <div className="font-medium">{cacheStats.databases}</div>
                <div className="text-xs text-muted-foreground">Databases</div>
              </div>
              <div className="text-center p-2 bg-muted rounded">
                <div className="font-medium">{cacheStats.tables}</div>
                <div className="text-xs text-muted-foreground">Tables</div>
              </div>
              <div className="text-center p-2 bg-muted rounded">
                <div className="font-medium">{cacheStats.schemas}</div>
                <div className="text-xs text-muted-foreground">Schemas</div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <Clock className={`w-4 h-4 ${getCacheStatusColor()}`} />
              <span>
                Cache age: <strong>{cacheStats.age < 60 ? `${cacheStats.age} minutes` : `${Math.round(cacheStats.age / 60)} hours`}</strong>
              </span>
              {!isCacheValid && (
                <Badge variant="destructive" className="text-xs">
                  Expired
                </Badge>
              )}
            </div>
            
            {!isCacheValid && (
              <div className="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                <AlertCircle className="w-4 h-4" />
                <span>Cache is older than 24 hours. Consider refreshing for latest data.</span>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <h5 className="font-medium text-sm">Cache Management</h5>
            
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshCache}
                disabled={isRefreshing}
                className="justify-start"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Schema Cache'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearChatCache}
                className="justify-start"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Chat Cache
              </Button>
            </div>
          </div>
          
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• <strong>Schema Cache:</strong> Long-term storage (24h TTL)</p>
              <p>• <strong>Chat Cache:</strong> Short-term storage (5min TTL)</p>
              <p>• Use <strong>Live mode</strong> in @mentions for real-time data</p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}