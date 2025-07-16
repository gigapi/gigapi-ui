/**
 * Panel Factory - Creates new panels with structure
 */

import { v4 as uuidv4 } from "uuid";
import {
  type PanelConfig,
  type PanelType,
  type FieldConfig,
  type PanelOptions,
  type GridPosition,
} from "@/types/dashboard.types";

export interface CreatePanelOptions {
  type: PanelType;
  title: string;
  description?: string;
  database: string;
  table?: string;
  timeField?: string;
  query?: string;
  gridPos?: Partial<GridPosition>;
  dashboardId?: string;
}

/**
 * Panel Factory class for creating properly structured panels
 */
class PanelFactory {
  /**
   * Create a new panel with structure
   */
  static createPanel(options: CreatePanelOptions): PanelConfig {
    const {
      type,
      title,
      description,
      database,
      table,
      timeField,
      query,
      gridPos = {},
      dashboardId,
    } = options;

    // Generate default query if not provided
    const defaultQuery = query || this.generateDefaultQuery(type, table);

    // Create field configuration based on panel type
    const fieldConfig = this.createFieldConfigForType(type);

    // Create panel options based on type
    const panelOptions = this.createOptionsForType(type);

    // Create grid position with defaults
    const position: GridPosition = {
      x: 0,
      y: 0,
      w: 6,
      h: 8,
      ...gridPos,
    };

    const panel: PanelConfig = {
      id: uuidv4(),
      type,
      title,
      query: defaultQuery,
      database,
      table,
      timeField,
      fieldMapping: {},
      fieldConfig,
      options: panelOptions,
      gridPos: position,
      maxDataPoints: 1000,
      useParentTimeFilter: true,
    };

    // Add optional fields only if they have meaningful values
    if (description) {
      (panel as any).description = description;
    }

    // Add dashboard ID if provided
    if (dashboardId) {
      (panel as any).dashboardId = dashboardId;
    }

    return panel;
  }

  /**
   * Create field configuration for different panel types
   */
  private static createFieldConfigForType(type: PanelType): FieldConfig {
    const baseConfig: FieldConfig = {
      defaults: {
        color: {
          mode: "palette-classic",
        },
        custom: {
          drawStyle: "line",
          lineInterpolation: "smooth",
          lineWidth: 1,
          fillOpacity: 0,
          gradientMode: "none",
          showPoints: "auto",
          pointSize: 5,
          axisPlacement: "auto",
          axisColorMode: "text",
          axisBorderShow: false,
          axisCenteredZero: false,
          stacking: {
            mode: "none",
            group: "A",
          },
          thresholdsStyle: {
            mode: "off",
          },
          hideFrom: {
            legend: false,
            tooltip: false,
            viz: false,
          },
        },
        mappings: [],
        thresholds: {
          mode: "absolute",
          steps: [
            {
              color: "green",
              value: null,
            },
            {
              color: "red",
              value: 80,
            },
          ],
        },
      },
      overrides: [],
    };

    // Customize based on panel type
    switch (type) {
      case "timeseries":
      case "line":
        baseConfig.defaults.custom!.drawStyle = "line";
        break;

      case "area":
        baseConfig.defaults.custom!.drawStyle = "line";
        baseConfig.defaults.custom!.fillOpacity = 0.1;
        break;

      case "bar":
        baseConfig.defaults.custom!.drawStyle = "bars";
        break;

      case "scatter":
        baseConfig.defaults.custom!.drawStyle = "points";
        baseConfig.defaults.custom!.showPoints = "always";
        break;

      case "stat":
        baseConfig.defaults.custom = {
          ...baseConfig.defaults.custom,
          axisPlacement: "hidden",
        };
        break;

      case "gauge":
        baseConfig.defaults.min = 0;
        baseConfig.defaults.max = 100;
        break;
    }

    return baseConfig;
  }

  /**
   * Create panel options for different panel types
   */
  private static createOptionsForType(type: PanelType): PanelOptions {
    const baseOptions: PanelOptions = {
      legend: {
        showLegend: true,
        displayMode: "list",
        placement: "bottom",
        calcs: [],
      },
      tooltip: {
        mode: "single",
        sort: "none",
        hideZeros: false,
      },
    };

    // Customize based on panel type
    switch (type) {
      case "stat":
      case "gauge":
        baseOptions.legend!.showLegend = false;
        break;

      case "table":
        baseOptions.tooltip!.mode = "none";
        break;
    }

    return baseOptions;
  }

  /**
   * Generate default query for panel type - use actual table if available
   */
  private static generateDefaultQuery(type: PanelType, table?: string): string {
    const tableName = table || "your_table";
    switch (type) {
      case "timeseries":
      case "line":
      case "area":
      case "scatter":
        // Generic time series query - let user select fields via field mapping
        return `SELECT * FROM ${tableName} WHERE $__timeFilter`;

      case "bar":
        // Generic bar chart query - user selects X and Y fields
        return `SELECT * FROM ${tableName} WHERE $__timeFilter`;

      case "stat":
        // Generic stat query - user selects value field
        return `SELECT * FROM ${tableName} WHERE $__timeFilter`;

      case "gauge":
        // Generic gauge query - user selects value field
        return `SELECT * FROM ${tableName} WHERE $__timeFilter`;

      case "table":
        // Generic table query - shows all data
        return `SELECT * FROM ${tableName} WHERE $__timeFilter`;

      default:
        return `SELECT * FROM ${tableName} WHERE $__timeFilter`;
    }
  }
}

export default PanelFactory;
