import React, { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DebouncedInput } from "@/components/ui/debounced-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldSelector } from "./FieldSelector";
import { PANEL_TYPES } from "@/components/dashboard/panels";
import {
  getSmartFieldLabel,
  getAppropriateFields,
} from "@/lib/dashboard/panel-field-utils";
import {
  SchemaAnalyzer,
  type FieldType,
} from "@/lib/dashboard/schema-analyzer";
import PanelFactory from "@/lib/dashboard/panel-factory";
import {
  type PanelConfig,
  type FieldMapping,
  type PanelTypeDefinition,
} from "@/types/dashboard.types";
import { checkForTimeVariables } from "@/lib/query-processor";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Clock, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FieldOption {
  name: string;
  type: FieldType;
  source?: "schema" | "runtime" | "query";
}

interface PanelConfigurationFormProps {
  config: Partial<PanelConfig>;
  onConfigChange: (updates: Partial<PanelConfig>) => void;
  availableFields: string[];
  schemaFields: Record<string, any>;
  previewData?: any[];
  showAdvancedOptions?: boolean;
}

export function PanelConfigurationForm({
  config,
  onConfigChange,
  availableFields,
  schemaFields,
  previewData,
  showAdvancedOptions = true,
}: PanelConfigurationFormProps) {
  // Ensure config always has a valid panel type
  React.useEffect(() => {
    if (!config.type) {
      onConfigChange({ type: "table" });
    }
  }, [config.type, onConfigChange]);

  // Check if query contains time variables
  const hasTimeVariables = useMemo(() => {
    return config.query ? checkForTimeVariables(config.query) : false;
  }, [config.query]);

  // Process fields to get type information
  const { fieldOptions, fieldTypes } = useMemo(() => {
    const types: Record<string, FieldType> = {};
    const options: FieldOption[] = [];
    const processedFieldNames = new Set<string>();

    // Add runtime fields from query results FIRST (prioritize actual query fields)
    availableFields.forEach((field) => {
      const fieldType = SchemaAnalyzer.analyzeFieldType(
        field,
        previewData?.[0]?.[field]
      );
      types[field] = fieldType;
      options.push({
        name: field,
        type: fieldType,
        source: "query",
      });
      processedFieldNames.add(field.toLowerCase());
    });

    // Add schema fields from DESCRIBE (user_query) only if we don't have query results
    // This gives us the exact fields that will be in the query results
    if (availableFields.length === 0 && Array.isArray(schemaFields)) {
      schemaFields.forEach((field: any) => {
        const fieldType = SchemaAnalyzer.analyzeFieldType(
          field.name,
          null,
          field.type
        );
        types[field.name] = fieldType;
        options.push({
          name: field.name,
          type: fieldType,
          source: "schema",
        });
      });
    }
    return { fieldOptions: options, fieldTypes: types };
  }, [availableFields, schemaFields, previewData]);

  // Get appropriate fields for each selector based on panel type
  const xFieldOptions = useMemo(() => {
    if (!config.type) return fieldOptions;
    const appropriateFields = getAppropriateFields(
      config.type,
      true,
      fieldTypes
    );
    return fieldOptions.filter((opt) => appropriateFields.includes(opt.name));
  }, [config.type, fieldOptions, fieldTypes]);

  const yFieldOptions = useMemo(() => {
    if (!config.type) return fieldOptions;
    const appropriateFields = getAppropriateFields(
      config.type,
      false,
      fieldTypes
    );
    return fieldOptions.filter((opt) => appropriateFields.includes(opt.name));
  }, [config.type, fieldOptions, fieldTypes]);

  const handleFieldMappingChange = (
    field: keyof FieldMapping,
    value: string | undefined
  ) => {
    onConfigChange({
      fieldMapping: {
        ...config.fieldMapping,
        [field]: value,
      },
    });
  };

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-6">
      {/* Basic Configuration */}
      <div className="space-y-4">
        {/* Panel Type */}
        <div className="space-y-2">
          <Label htmlFor="panel-type" className="text-sm font-medium">
            Panel Type
          </Label>
          <Select
            value={config.type || "table"}
            onValueChange={(value) => {
              const newPanelType = value as PanelConfig["type"];

              // Only create new fieldConfig if changing type, otherwise just update type
              if (newPanelType !== config.type) {
                const newPanel = PanelFactory.createPanel({
                  type: newPanelType,
                  title: config.title || "New Panel",
                  database: config.database || "",
                  query: config.query || "",
                });

                // Get smart field mappings for the new panel type
                let smartMapping: any = {};

                // Use enhanced analyzer if we have preview data
                if (previewData && previewData.length > 0) {
                  const enhancedAnalysis = SchemaAnalyzer.analyzeDataset(
                    previewData,
                    100
                  );
                  smartMapping = SchemaAnalyzer.getEnhancedSmartDefaults(
                    enhancedAnalysis,
                    newPanelType
                  );
                } else {
                  // Fallback to basic analyzer
                  smartMapping = SchemaAnalyzer.getSmartFieldDefaults(
                    availableFields.length > 0
                      ? availableFields
                      : Array.isArray(schemaFields)
                      ? schemaFields.map((f: any) => f.name)
                      : [],
                    fieldTypes,
                    Array.isArray(schemaFields) ? schemaFields : [],
                    newPanelType
                  );
                }

                // Preserve ALL existing settings, only replace fieldConfig and options for new type
                onConfigChange({
                  ...config, // Keep everything from current config
                  type: newPanelType,
                  fieldConfig: newPanel.fieldConfig, // Only update fieldConfig for new type
                  options: newPanel.options, // Only update options for new type
                  fieldMapping: {
                    // Try to preserve existing mappings if they make sense for new type
                    xField: config.fieldMapping?.xField || smartMapping.xField,
                    yField: config.fieldMapping?.yField || smartMapping.yField,
                    seriesField: config.fieldMapping?.seriesField, // Always preserve series field
                  },
                });
              } else {
                // Same type, just update normally
                onConfigChange({ type: newPanelType });
              }
            }}
          >
            <SelectTrigger id="panel-type" className="h-9">
              <SelectValue placeholder="Select panel type" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(PANEL_TYPES).map((type: PanelTypeDefinition) => (
                <SelectItem key={type.type} value={type.type}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Panel Title */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="panel-title" className="text-sm font-medium">
              Panel Title
            </Label>
            {hasTimeVariables && (
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                <Clock className="w-3 h-3 mr-1" />
                Time-based
              </Badge>
            )}
          </div>
          <Input
            id="panel-title"
            value={config.title || ""}
            onChange={(e) => onConfigChange({ title: e.target.value })}
            placeholder="e.g., CPU Usage Over Time"
            className="h-9"
          />
        </div>
      </div>

      {/* Field Mapping */}
      {config.type && fieldOptions.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-foreground border-b pb-2">
            Field Mapping
          </h4>

          {/* Time Field */}
          <FieldSelector
            label={getSmartFieldLabel(config.type, true)}
            value={config.fieldMapping?.xField}
            onChange={(value) => handleFieldMappingChange("xField", value)}
            fields={xFieldOptions}
            placeholder="Select field"
          />

          {/* Value Field */}
          <FieldSelector
            label={getSmartFieldLabel(config.type, false)}
            value={config.fieldMapping?.yField}
            onChange={(value) => handleFieldMappingChange("yField", value)}
            fields={yFieldOptions}
            placeholder="Select field"
          />

          {/* Group by Field */}
          <FieldSelector
            label="Group by (optional)"
            value={config.fieldMapping?.seriesField}
            onChange={(value) => handleFieldMappingChange("seriesField", value)}
            fields={fieldOptions}
            placeholder="Select field"
            allowNone={true}
          />
        </div>
      )}

      {/* Info messages */}
      {!fieldOptions.length && (
        <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded border border-dashed">
          {config.database && config.query
            ? "Run a query to see available fields"
            : "Select database and write a query to see field suggestions"}
        </div>
      )}

      {/* Advanced Options Toggle */}
      {showAdvancedOptions && config.type && (
        <div className="space-y-4">
          <Button
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 p-0 h-auto text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Advanced Options
          </Button>

          {showAdvanced && (
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              {/* Field Configuration */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">
                  Field Configuration
                </h4>
                <div className="space-y-2">
                  <Label htmlFor="unit" className="text-sm font-medium">
                    Unit
                  </Label>
                  <Input
                    id="unit"
                    value={config.fieldConfig?.defaults?.unit || ""}
                    onChange={(e) =>
                      onConfigChange({
                        fieldConfig: {
                          ...config.fieldConfig,
                          defaults: {
                            ...config.fieldConfig?.defaults,
                            unit: e.target.value,
                          },
                        },
                      })
                    }
                    placeholder="e.g., %, ms, MB"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="decimals" className="text-sm font-medium">
                    Decimals
                  </Label>
                  <DebouncedInput
                    id="decimals"
                    type="number"
                    value={config.fieldConfig?.defaults?.decimals || ""}
                    onValueChange={(value) =>
                      onConfigChange({
                        fieldConfig: {
                          ...config.fieldConfig,
                          defaults: {
                            ...config.fieldConfig?.defaults,
                            decimals: parseInt(value) || 0,
                          },
                        },
                      })
                    }
                    placeholder="2"
                    className="h-9"
                  />
                </div>
              </div>

              {config.type === "stat" && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">
                    Stat Panel Settings
                  </h4>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Display Mode</Label>
                    <Select
                      value={config.options?.stat?.mode || "current"}
                      onValueChange={(value) =>
                        onConfigChange({
                          options: {
                            ...config.options,
                            stat: {
                              ...config.options?.stat,
                              mode: value as any,
                            },
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current">Current Value</SelectItem>
                        <SelectItem value="average">Average</SelectItem>
                        <SelectItem value="sum">Sum</SelectItem>
                        <SelectItem value="min">Minimum</SelectItem>
                        <SelectItem value="max">Maximum</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {(config.type === "timeseries" ||
                config.type === "line" ||
                config.type === "area") && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground">
                    Line Settings
                  </h4>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Line Style</Label>
                    <Select
                      value={
                        config.fieldConfig?.defaults?.custom?.drawStyle ||
                        "line"
                      }
                      onValueChange={(value) =>
                        onConfigChange({
                          fieldConfig: {
                            ...config.fieldConfig,
                            defaults: {
                              ...config.fieldConfig?.defaults,
                              custom: {
                                ...config.fieldConfig?.defaults?.custom,
                                drawStyle: value as any,
                              },
                            },
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="line">Line</SelectItem>
                        <SelectItem value="bars">Bars</SelectItem>
                        <SelectItem value="points">Points</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="line-width" className="text-sm font-medium">
                      Line Width
                    </Label>
                    <DebouncedInput
                      id="line-width"
                      type="number"
                      min="1"
                      max="10"
                      value={
                        config.fieldConfig?.defaults?.custom?.lineWidth || ""
                      }
                      onValueChange={(value) =>
                        onConfigChange({
                          fieldConfig: {
                            ...config.fieldConfig,
                            defaults: {
                              ...config.fieldConfig?.defaults,
                              custom: {
                                ...config.fieldConfig?.defaults?.custom,
                                lineWidth: parseInt(value) || 1,
                              },
                            },
                          },
                        })
                      }
                      placeholder="1"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="fill-opacity"
                      className="text-sm font-medium"
                    >
                      Fill Opacity (0-1)
                    </Label>
                    <DebouncedInput
                      id="fill-opacity"
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={
                        config.fieldConfig?.defaults?.custom?.fillOpacity || ""
                      }
                      onValueChange={(value) =>
                        onConfigChange({
                          fieldConfig: {
                            ...config.fieldConfig,
                            defaults: {
                              ...config.fieldConfig?.defaults,
                              custom: {
                                ...config.fieldConfig?.defaults?.custom,
                                fillOpacity: parseFloat(value) || 0,
                              },
                            },
                          },
                        })
                      }
                      placeholder="0"
                      className="h-9"
                    />
                  </div>
                </div>
              )}

              {/* Panel Options */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">
                  Panel Options
                </h4>
                {/* Legend Toggle */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-legend" className="text-sm font-medium">
                    Show Legend
                  </Label>
                  <Switch
                    id="show-legend"
                    checked={config.options?.legend?.showLegend ?? true}
                    onCheckedChange={(checked) =>
                      onConfigChange({
                        options: {
                          ...config.options,
                          legend: {
                            ...config.options?.legend,
                            showLegend: checked,
                            placement: config.options?.legend?.placement || "bottom",
                            displayMode: config.options?.legend?.displayMode || "list",
                          },
                        },
                      })
                    }
                  />
                </div>
                {/* Legend Placement - only show if legend is enabled */}
                {(config.options?.legend?.showLegend ?? true) && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Legend Placement
                    </Label>
                    <Select
                      value={config.options?.legend?.placement || "bottom"}
                      onValueChange={(value) =>
                        onConfigChange({
                          options: {
                            ...config.options,
                            legend: {
                              ...config.options?.legend,
                              placement: value as any,
                              showLegend:
                                config.options?.legend?.showLegend ?? true,
                              displayMode:
                                config.options?.legend?.displayMode ?? "list",
                            },
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom">Bottom</SelectItem>
                        <SelectItem value="top">Top</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
