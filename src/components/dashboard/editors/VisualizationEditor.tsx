import { useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Palette,
  Info,
  Settings,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { type PanelConfig, type VisualizationConfig } from "@/types/dashboard.types";
import { ChartUtils } from "@/lib/charts";

interface VisualizationEditorProps {
  config: PanelConfig;
  onConfigChange: (updates: Partial<PanelConfig>) => void;
  className?: string;
}

export default function VisualizationEditor({
  config,
  onConfigChange,
  className = "",
}: VisualizationEditorProps) {
  const { visualization } = config;

  const handleVisualizationChange = useCallback((field: keyof VisualizationConfig, value: any) => {
    const updatedVisualization = {
      ...visualization,
      [field]: value,
    };
    
    onConfigChange({ visualization: updatedVisualization });
  }, [visualization, onConfigChange]);

  const handleThresholdChange = useCallback((field: string, value: any) => {
    const updatedThreshold = {
      ...visualization.threshold,
      [field]: value,
    };
    
    handleVisualizationChange('threshold', updatedThreshold);
  }, [visualization.threshold, handleVisualizationChange]);

  const handleColorsChange = useCallback((colorString: string) => {
    const colors = colorString.split(',').map(c => c.trim()).filter(Boolean);
    handleVisualizationChange('colors', colors.length > 0 ? colors : undefined);
  }, [handleVisualizationChange]);

  const isChartPanel = ['timeseries', 'line', 'area', 'bar', 'scatter'].includes(config.type);
  const isStatPanel = config.type === 'stat';
  const isGaugePanel = config.type === 'gauge';
  const isTablePanel = config.type === 'table';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <Palette className="w-4 h-4" />
        <span className="font-medium">Visualization</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Info className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Customize the appearance and behavior of your visualization</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Chart-specific settings */}
      {isChartPanel && (
        <>
          {/* Legend settings */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <Label htmlFor="show-legend">Show Legend</Label>
            </div>
            <Switch
              id="show-legend"
              checked={visualization.showLegend !== false}
              onCheckedChange={(checked) => handleVisualizationChange('showLegend', checked)}
            />
          </div>

          {/* Axis labels */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="x-axis-label">X-Axis Label</Label>
              <Input
                id="x-axis-label"
                value={visualization.xAxisLabel || ''}
                onChange={(e) => handleVisualizationChange('xAxisLabel', e.target.value)}
                placeholder="Time, Category, etc."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="y-axis-label">Y-Axis Label</Label>
              <Input
                id="y-axis-label"
                value={visualization.yAxisLabel || ''}
                onChange={(e) => handleVisualizationChange('yAxisLabel', e.target.value)}
                placeholder="Value, Count, etc."
              />
            </div>
          </div>

          {/* Colors */}
          <div className="space-y-2">
            <Label htmlFor="colors">Color Palette</Label>
            <Input
              id="colors"
              value={visualization.colors?.join(', ') || ''}
              onChange={(e) => handleColorsChange(e.target.value)}
              placeholder="Leave empty for default colors"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {(visualization.colors || ChartUtils.getDefaultColors().slice(0, 5)).map((color, index) => (
                <div
                  key={index}
                  className="w-6 h-6 rounded border border-border"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Comma-separated hex colors (e.g., #3b82f6, #10b981)
            </p>
          </div>
        </>
      )}

      {/* Stat and Gauge panel settings */}
      {(isStatPanel || isGaugePanel) && (
        <>
          <Separator />
          
          {/* Unit and formatting */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={visualization.unit || ''}
                onChange={(e) => handleVisualizationChange('unit', e.target.value)}
                placeholder="%, °C, MB/s, etc."
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="decimals">Decimal Places</Label>
              <Select
                value={String(visualization.decimals ?? 2)}
                onValueChange={(value) => handleVisualizationChange('decimals', Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {/* Gauge-specific settings */}
      {isGaugePanel && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gauge-min">Minimum Value</Label>
            <Input
              id="gauge-min"
              type="number"
              value={visualization.min ?? 0}
              onChange={(e) => handleVisualizationChange('min', Number(e.target.value))}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="gauge-max">Maximum Value</Label>
            <Input
              id="gauge-max"
              type="number"
              value={visualization.max ?? 100}
              onChange={(e) => handleVisualizationChange('max', Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* Table-specific settings */}
      {isTablePanel && (
        <>
          <Separator />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="page-size">Page Size</Label>
              <Select
                value={String(visualization.pageSize || 10)}
                onValueChange={(value) => handleVisualizationChange('pageSize', Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 rows</SelectItem>
                  <SelectItem value="10">10 rows</SelectItem>
                  <SelectItem value="25">25 rows</SelectItem>
                  <SelectItem value="50">50 rows</SelectItem>
                  <SelectItem value="100">100 rows</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sort-direction">Default Sort</Label>
              <Select
                value={visualization.sortDirection || 'desc'}
                onValueChange={(value) => handleVisualizationChange('sortDirection', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="sort-column">Default Sort Column</Label>
            <Input
              id="sort-column"
              value={visualization.sortColumn || ''}
              onChange={(e) => handleVisualizationChange('sortColumn', e.target.value)}
              placeholder="Column name (e.g., timestamp)"
            />
          </div>
        </>
      )}

      {/* Thresholds (for stat and gauge panels) */}
      {(isStatPanel || isGaugePanel) && (
        <>
          <Separator />
          
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <Label>Threshold Settings</Label>
              <Badge variant="secondary" className="text-xs">Optional</Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="threshold-value">Threshold Value</Label>
                <Input
                  id="threshold-value"
                  type="number"
                  value={visualization.threshold?.value ?? ''}
                  onChange={(e) => handleThresholdChange('value', Number(e.target.value))}
                  placeholder="e.g., 80"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="threshold-operator">Condition</Label>
                <Select
                  value={visualization.threshold?.operator || 'gt'}
                  onValueChange={(value) => handleThresholdChange('operator', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater than</SelectItem>
                    <SelectItem value="lt">Less than</SelectItem>
                    <SelectItem value="eq">Equal to</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="threshold-color">Threshold Color</Label>
              <Input
                id="threshold-color"
                value={visualization.threshold?.color || '#ef4444'}
                onChange={(e) => handleThresholdChange('color', e.target.value)}
                placeholder="#ef4444"
              />
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded border border-border"
                  style={{ backgroundColor: visualization.threshold?.color || '#ef4444' }}
                />
                <span className="text-xs text-muted-foreground">
                  Color to use when threshold is exceeded
                </span>
              </div>
            </div>
            
            {visualization.threshold?.value && (
              <div className="bg-muted/50 rounded p-3">
                <p className="text-xs">
                  <strong>Preview:</strong> Values{' '}
                  {visualization.threshold.operator === 'gt' ? 'greater than' :
                   visualization.threshold.operator === 'lt' ? 'less than' : 'equal to'}{' '}
                  <span className="font-mono">{visualization.threshold.value}</span>{' '}
                  will be highlighted in{' '}
                  <span 
                    className="px-1 rounded text-white"
                    style={{ backgroundColor: visualization.threshold.color || '#ef4444' }}
                  >
                    this color
                  </span>
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Preview section */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Current Settings
        </Label>
        <div className="bg-muted rounded p-3 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-medium">Panel Type:</span> {config.type}
            </div>
            {visualization.unit && (
              <div>
                <span className="font-medium">Unit:</span> {visualization.unit}
              </div>
            )}
            {visualization.decimals !== undefined && (
              <div>
                <span className="font-medium">Decimals:</span> {visualization.decimals}
              </div>
            )}
            {visualization.colors && (
              <div>
                <span className="font-medium">Colors:</span> {visualization.colors.length} custom
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}