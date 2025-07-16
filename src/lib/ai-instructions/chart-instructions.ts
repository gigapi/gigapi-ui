/**
 * Chart and visualization instructions
 */

export const CHART_INSTRUCTIONS = `
# Chart and Visualization Instructions

## Chart Types
- **timeseries**: Time-based line charts (default for time data)
- **bar**: Bar charts for categorical data
- **pie**: Pie charts for proportional data
- **stat**: Single value metrics and KPIs
- **table**: Tabular data display
- **heatmap**: Heat map visualizations
- **scatter**: Scatter plot charts

## Chart Selection Logic
- Use **timeseries** for time-based data with continuous values
- Use **bar** for categorical comparisons
- Use **pie** for part-to-whole relationships (limit to 5-7 categories)
- Use **stat** for single metrics, KPIs, or summary values
- Use **table** for detailed data inspection
- Use **heatmap** for correlation or density data
- Use **scatter** for relationship analysis between two variables

## Field Mapping
- **xField**: X-axis field (typically time for timeseries)
- **yField**: Y-axis field (typically the metric being measured)
- **colorField**: Field used for series/legend grouping
- **sizeField**: Field used for bubble size (scatter plots)

## Chart Configuration
- Set appropriate titles and labels
- Configure legends based on data complexity
- Choose appropriate color schemes
- Set axis ranges and formatting
- Configure tooltips for interactivity

## Time Series Specific
- Always use time fields for x-axis
- Group data by appropriate time intervals
- Handle time zone considerations
- Use proper time formatting for display
- Support multiple metrics on same chart

## Visualization Best Practices
- Choose chart types that best represent the data
- Limit data points for performance (use aggregation)
- Use consistent color schemes across related charts
- Provide meaningful titles and axis labels
- Ensure charts are responsive and mobile-friendly

## Data Preparation
- Ensure data is properly formatted for visualization
- Handle missing values appropriately
- Use appropriate aggregation functions
- Sort data for optimal display
- Limit result sets to reasonable sizes for performance

## Chart Artifact Format

When creating charts, use the following artifact format:

\`\`\`chart
{
  "type": "timeseries",  // or "bar", "pie", "scatter", etc.
  "title": "Chart Title",
  "query": "SELECT ... FROM ...",
  "database": "database_name",
  "fieldMapping": {
    "xField": "time_column",
    "yField": "value_column",
    "colorField": "series_column"  // optional
  },
  "fieldConfig": {
    "defaults": {
      "unit": "short",
      "decimals": 2
    }
  },
  "options": {
    "legend": {
      "showLegend": true,
      "placement": "bottom"
    }
  }
}
\`\`\`

## Example Chart Artifacts

### Time Series Chart
\`\`\`chart
{
  "type": "timeseries",
  "title": "Temperature Over Time",
  "query": "SELECT __timestamp AS time, AVG(temperature) AS avg_temp FROM weather WHERE $__timeFilter GROUP BY time ORDER BY time",
  "database": "mydb",
  "fieldMapping": {
    "xField": "time",
    "yField": "avg_temp"
  }
}
\`\`\`

### Bar Chart
\`\`\`chart
{
  "type": "bar",
  "title": "Sales by Category",
  "query": "SELECT category, SUM(sales) AS total_sales FROM sales_data GROUP BY category ORDER BY total_sales DESC",
  "database": "mydb",
  "fieldMapping": {
    "xField": "category",
    "yField": "total_sales"
  }
}
\`\`\`

### Query-Only Artifact
For simple data exploration, use:
\`\`\`query
{
  "title": "Query Title",
  "query": "SELECT * FROM table LIMIT 10",
  "database": "database_name"
}
\`\`\`
`;