import { useMemo, useState } from 'react';
import { useTheme } from '../themes/utils';
import { GIGAPI_CHARTS_COLORS } from '../themes/gigapiCharts';
import type { PieChartProps } from '../core/types';
import { cn } from '@/lib/utils/class-utils';

/**
 * Pie/Donut Chart Component
 * SVG-based pie chart as an alternative to ECharts
 */
export function PieChart({
  data,
  config,
  height = 400,
  width = '100%',
}: PieChartProps) {
  const { theme } = useTheme();
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  
  const isDonut = config.type === 'donut';
  const innerRadius = isDonut ? 60 : 0;
  const outerRadius = 90;
  const centerX = 100;
  const centerY = 100;
  
  // Get field config
  const fieldConfig = config.fieldConfig?.defaults || {};
  const unit = fieldConfig.unit || '';
  const decimals = fieldConfig.decimals ?? 2;
  
  // Calculate total
  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + item.value, 0);
  }, [data]);
  
  // Calculate slices with angles
  const slices = useMemo(() => {
    let currentAngle = -90; // Start from top
    
    return data.map((item, index) => {
      const percentage = (item.value / total) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      
      currentAngle = endAngle;
      
      return {
        ...item,
        percentage,
        startAngle,
        endAngle,
        color: GIGAPI_CHARTS_COLORS[index % GIGAPI_CHARTS_COLORS.length],
      };
    });
  }, [data, total]);
  
  // Create path for pie slice
  const createSlicePath = (
    startAngle: number,
    endAngle: number,
    innerR: number,
    outerR: number,
    offset: number = 0
  ): string => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    // Apply offset for hover effect
    const offsetX = offset * Math.cos((startRad + endRad) / 2);
    const offsetY = offset * Math.sin((startRad + endRad) / 2);
    const cx = centerX + offsetX;
    const cy = centerY + offsetY;
    
    const x1 = cx + outerR * Math.cos(startRad);
    const y1 = cy + outerR * Math.sin(startRad);
    const x2 = cx + outerR * Math.cos(endRad);
    const y2 = cy + outerR * Math.sin(endRad);
    
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    if (innerR > 0) {
      // Donut chart
      const x3 = cx + innerR * Math.cos(endRad);
      const y3 = cy + innerR * Math.sin(endRad);
      const x4 = cx + innerR * Math.cos(startRad);
      const y4 = cy + innerR * Math.sin(startRad);
      
      return `
        M ${x1} ${y1}
        A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}
        L ${x3} ${y3}
        A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}
        Z
      `;
    } else {
      // Pie chart
      return `
        M ${cx} ${cy}
        L ${x1} ${y1}
        A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}
        Z
      `;
    }
  };
  
  // Format value for display
  const formatValue = (value: number): string => {
    let formatted: string;
    
    if (Math.abs(value) >= 1e9) {
      formatted = (value / 1e9).toFixed(decimals) + 'B';
    } else if (Math.abs(value) >= 1e6) {
      formatted = (value / 1e6).toFixed(decimals) + 'M';
    } else if (Math.abs(value) >= 1e3) {
      formatted = (value / 1e3).toFixed(decimals) + 'K';
    } else {
      formatted = value.toFixed(decimals);
    }
    
    return unit ? `${formatted} ${unit}` : formatted;
  };
  
  return (
    <div 
      className="flex flex-col h-full w-full"
      style={{ height, width }}
    >
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full"
            style={{ maxWidth: '400px', maxHeight: '400px' }}
          >
            {/* Render slices */}
            {slices.map((slice, index) => (
              <g key={index}>
                <path
                  d={createSlicePath(
                    slice.startAngle,
                    slice.endAngle,
                    innerRadius,
                    outerRadius,
                    hoveredSlice === index ? 5 : 0
                  )}
                  fill={slice.color}
                  stroke={theme.backgroundColor || 'transparent'}
                  strokeWidth="1"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: hoveredSlice !== null && hoveredSlice !== index ? 0.6 : 1,
                  }}
                  onMouseEnter={() => setHoveredSlice(index)}
                  onMouseLeave={() => setHoveredSlice(null)}
                />
                
                {/* Percentage labels */}
                {slice.percentage > 5 && (
                  <text
                    x={centerX + (outerRadius * 0.7) * Math.cos(((slice.startAngle + slice.endAngle) / 2) * Math.PI / 180)}
                    y={centerY + (outerRadius * 0.7) * Math.sin(((slice.startAngle + slice.endAngle) / 2) * Math.PI / 180)}
                    fill="#fff"
                    fontSize="11"
                    fontWeight="500"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    pointerEvents="none"
                  >
                    {slice.percentage.toFixed(1)}%
                  </text>
                )}
              </g>
            ))}
            
            {/* Center text for donut */}
            {isDonut && (
              <text
                x={centerX}
                y={centerY}
                fill={theme.axis.titleColor}
                fontSize="16"
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {formatValue(total)}
              </text>
            )}
          </svg>
          
          {/* Tooltip */}
          {hoveredSlice !== null && (
            <div
              className="absolute pointer-events-none"
              style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
              }}
            >
              <div
                className="px-3 py-2 rounded shadow-lg text-xs"
                style={{
                  backgroundColor: theme.tooltip.background,
                  color: theme.tooltip.textColor,
                  border: `1px solid ${theme.tooltip.borderColor}`,
                }}
              >
                <div className="font-semibold">{slices[hoveredSlice].label}</div>
                <div className="mt-1">
                  Value: {formatValue(slices[hoveredSlice].value)}
                </div>
                <div>
                  Percentage: {slices[hoveredSlice].percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Legend */}
      {config.options?.legend?.showLegend !== false && (
        <div className="mt-4 px-4">
          <div className="flex flex-wrap gap-3 justify-center">
            {slices.map((slice, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-2 text-xs cursor-pointer",
                  hoveredSlice !== null && hoveredSlice !== index && "opacity-60"
                )}
                onMouseEnter={() => setHoveredSlice(index)}
                onMouseLeave={() => setHoveredSlice(null)}
              >
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: slice.color }}
                />
                <span style={{ color: theme.legend.textColor }}>
                  {slice.label}
                </span>
                <span style={{ color: theme.axis.labelColor }}>
                  ({slice.percentage.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}