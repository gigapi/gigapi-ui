import { useCallback, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Info,
  Database,
  Columns,
  Clock,
  BarChart3,
  Tag,
} from "lucide-react";
import { type PanelConfig, type DataMapping, type NDJSONRecord } from "@/types/dashboard.types";

interface DataMappingEditorProps {
  config: PanelConfig;
  sampleData?: NDJSONRecord[];
  onConfigChange: (updates: Partial<PanelConfig>) => void;
  className?: string;
}

export default function DataMappingEditor({
  config,
  sampleData = [],
  onConfigChange,
  className = "",
}: DataMappingEditorProps) {
  const { dataMapping } = config;

  // Extract available columns from sample data
  const availableColumns = useMemo(() => {
    if (!sampleData || sampleData.length === 0) return [];
    
    const columnsSet = new Set<string>();
    sampleData.slice(0, 5).forEach(record => {
      Object.keys(record).forEach(key => columnsSet.add(key));
    });
    
    return Array.from(columnsSet).sort();
  }, [sampleData]);

  // Suggest time columns based on common patterns
  const timeColumns = useMemo(() => {
    return availableColumns.filter(col => 
      /time|date|timestamp|created_at|updated_at|__timestamp/i.test(col)
    );
  }, [availableColumns]);

  // Suggest numeric columns for values
  const numericColumns = useMemo(() => {
    if (!sampleData || sampleData.length === 0) return [];
    
    return availableColumns.filter(col => {
      // Check if column contains numeric values
      const samples = sampleData.slice(0, 5).map(record => record[col]);
      return samples.some(value => typeof value === 'number' || !isNaN(Number(value)));
    });
  }, [availableColumns, sampleData]);

  const handleMappingChange = useCallback((field: keyof DataMapping, value: any) => {
    const updatedMapping = {
      ...dataMapping,
      [field]: value,
    };
    
    onConfigChange({ dataMapping: updatedMapping });
  }, [dataMapping, onConfigChange]);

  const handleDisplayColumnsChange = useCallback((value: string) => {
    const columns = value.split(',').map(s => s.trim()).filter(Boolean);
    handleMappingChange('displayColumns', columns);
  }, [handleMappingChange]);

  const isTimeBasedPanel = ['timeseries', 'line', 'area'].includes(config.type);
  const isTablePanel = config.type === 'table';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <Columns className="w-4 h-4" />
        <span className="font-medium">Data Mapping</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Info className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Map your data columns to chart elements</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Available Columns Preview */}
      {availableColumns.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Available Columns</Label>
          <div className="flex flex-wrap gap-1">
            {availableColumns.slice(0, 10).map(col => (
              <Badge key={col} variant="outline" className="text-xs">
                {col}
              </Badge>
            ))}
            {availableColumns.length > 10 && (
              <Badge variant="secondary" className="text-xs">
                +{availableColumns.length - 10} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Value Column (Required for all panel types) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          <Label htmlFor="value-column">Value Column *</Label>
        </div>
        <Select
          value={dataMapping.valueColumn}
          onValueChange={(value) => handleMappingChange('valueColumn', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select value column" />
          </SelectTrigger>
          <SelectContent>
            {numericColumns.length > 0 && (
              <>
                <SelectItem value="__suggested_numeric__" disabled className="font-medium">
                  Suggested (Numeric)
                </SelectItem>
                {numericColumns.map(col => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
                {availableColumns.length > numericColumns.length && (
                  <SelectItem value="__all_columns__" disabled className="font-medium mt-2">
                    All Columns
                  </SelectItem>
                )}
              </>
            )}
            {availableColumns.map(col => 
              !numericColumns.includes(col) ? (
                <SelectItem key={col} value={col}>
                  {col}
                </SelectItem>
              ) : null
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Time Column (for time-based panels) */}
      {isTimeBasedPanel && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <Label htmlFor="time-column">Time Column</Label>
          </div>
          <Select
            value={dataMapping.timeColumn || '__auto_detect__'}
            onValueChange={(value) => handleMappingChange('timeColumn', value === '__auto_detect__' ? undefined : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Auto-detect or select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto_detect__">Auto-detect</SelectItem>
              {timeColumns.length > 0 && (
                <>
                  <SelectItem value="__suggested_time__" disabled className="font-medium">
                    Suggested (Time-like)
                  </SelectItem>
                  {timeColumns.map(col => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))}
                </>
              )}
              {availableColumns.length > timeColumns.length && (
                <SelectItem value="__all_columns_time__" disabled className="font-medium mt-2">
                  All Columns
                </SelectItem>
              )}
              {availableColumns.map(col => 
                !timeColumns.includes(col) ? (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ) : null
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Leave empty to auto-detect timestamp columns
          </p>
        </div>
      )}

      {/* Series Column (for multi-series charts) */}
      {!isTablePanel && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            <Label htmlFor="series-column">Series Column</Label>
          </div>
          <Select
            value={dataMapping.seriesColumn || '__none_series__'}
            onValueChange={(value) => handleMappingChange('seriesColumn', value === '__none_series__' ? undefined : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Single series (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none_series__">None (single series)</SelectItem>
              {availableColumns.map(col => (
                <SelectItem key={col} value={col}>
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Column to group data into multiple series
          </p>
        </div>
      )}

      {/* Display Columns (for table panels) */}
      {isTablePanel && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            <Label htmlFor="display-columns">Display Columns</Label>
          </div>
          <Input
            id="display-columns"
            value={dataMapping.displayColumns?.join(', ') || ''}
            onChange={(e) => handleDisplayColumnsChange(e.target.value)}
            placeholder="column1, column2, column3 (empty = all)"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated list of columns to display. Leave empty to show all columns.
          </p>
        </div>
      )}

      {/* Label Columns (for categorical data) */}
      {['bar', 'scatter'].includes(config.type) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            <Label htmlFor="label-columns">Label Columns</Label>
          </div>
          <Input
            value={dataMapping.labelColumns?.join(', ') || ''}
            onChange={(e) => {
              const columns = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
              handleMappingChange('labelColumns', columns);
            }}
            placeholder="category, label (comma-separated)"
          />
          <p className="text-xs text-muted-foreground">
            Columns to use for category labels on X-axis
          </p>
        </div>
      )}

      {/* Min/Max Columns (for range visualizations) */}
      {['gauge', 'stat'].includes(config.type) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="min-column">Min Column</Label>
            <Select
              value={dataMapping.minColumn || '__none_min__'}
              onValueChange={(value) => handleMappingChange('minColumn', value === '__none_min__' ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none_min__">None</SelectItem>
                {availableColumns.map(col => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="max-column">Max Column</Label>
            <Select
              value={dataMapping.maxColumn || '__none_max__'}
              onValueChange={(value) => handleMappingChange('maxColumn', value === '__none_max__' ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none_max__">None</SelectItem>
                {availableColumns.map(col => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Sample Data Preview */}
      {sampleData.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Sample Data</Label>
          <div className="bg-muted rounded p-3 text-xs overflow-auto max-h-32">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(sampleData[0], null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}