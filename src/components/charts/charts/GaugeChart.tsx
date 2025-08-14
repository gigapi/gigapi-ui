import { useMemo } from 'react';
import { useTheme } from '../themes/utils';
import type { GaugeChartProps } from '../core/types';

/**
 * Gauge Chart Component
 * SVG-based gauge visualization
 */
export function GaugeChart({
  value,
  min = 0,
  max = 100,
  thresholds = [],
  config,
}: GaugeChartProps) {
  const { theme } = useTheme();
  
  // Calculate percentage (0 to 1)
  const percentage = (value - min) / (max - min);
  const clampedPercentage = Math.max(0, Math.min(1, percentage));
  
  // Arc configuration - 240 degree horseshoe arc
  const startAngle = 150; // Start at 150 degrees (bottom-left)
  const endAngle = 390;   // End at 390 degrees (30 degrees, bottom-right)
  const arcSpan = endAngle - startAngle;
  
  // Calculate needle rotation
  const needleAngle = startAngle + (clampedPercentage * arcSpan);
  
  // Get field config
  const fieldConfig = config.fieldConfig?.defaults || {};
  const unit = fieldConfig.unit || '';
  const decimals = fieldConfig.decimals ?? 2;
  
  // Determine color based on thresholds
  const gaugeColor = useMemo(() => {
    if (thresholds.length === 0) {
      // Default color gradient
      const percentValue = clampedPercentage * 100;
      if (percentValue < 33) return '#10b981'; // green
      if (percentValue < 66) return '#f59e0b'; // yellow
      return '#ef4444'; // red
    }
    
    // Use custom thresholds
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (value >= thresholds[i].value) {
        return thresholds[i].color;
      }
    }
    
    return thresholds[0]?.color || '#10b981';
  }, [value, clampedPercentage, thresholds]);
  
  // Format display value
  const formattedValue = useMemo(() => {
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
  }, [value, decimals, unit]);
  
  // Create arc path
  const createArcPath = (
    centerX: number,
    centerY: number,
    radius: number,
    startAngleDeg: number,
    endAngleDeg: number
  ): string => {
    const startRad = (startAngleDeg * Math.PI) / 180;
    const endRad = (endAngleDeg * Math.PI) / 180;
    
    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);
    
    const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
    
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };
  
  // Calculate positions for min/max labels - fixed positions at bottom
  const minLabelX = 40;  // Bottom-left
  const minLabelY = 130; // Near bottom of viewBox
  const maxLabelX = 160; // Bottom-right
  const maxLabelY = 130; // Near bottom of viewBox
  
  // Create threshold markers
  const thresholdMarkers = useMemo(() => {
    if (thresholds.length === 0) return null;
    
    return thresholds.map((threshold, index) => {
      const thresholdPercentage = (threshold.value - min) / (max - min);
      const thresholdAngle = startAngle + (thresholdPercentage * arcSpan);
      const rad = (thresholdAngle * Math.PI) / 180;
      
      const innerRadius = 75;
      const outerRadius = 85;
      
      const x1 = 100 + innerRadius * Math.cos(rad);
      const y1 = 100 + innerRadius * Math.sin(rad);
      const x2 = 100 + outerRadius * Math.cos(rad);
      const y2 = 100 + outerRadius * Math.sin(rad);
      
      return (
        <line
          key={index}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={threshold.color}
          strokeWidth="2"
        />
      );
    });
  }, [thresholds, min, max, startAngle, arcSpan]);
  
  // Calculate needle path
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleLength = 70;
  const needleTipX = 100 + needleLength * Math.cos(needleRad);
  const needleTipY = 100 + needleLength * Math.sin(needleRad);
  
  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-1">
      <div className="relative w-full h-full">
        <svg
          viewBox="0 0 200 140"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background arc */}
          <path
            d={createArcPath(100, 100, 80, startAngle, endAngle)}
            fill="none"
            stroke={theme.grid.stroke}
            strokeWidth="12"
            strokeLinecap="round"
          />
          
          {/* Progress arc */}
          <path
            d={createArcPath(100, 100, 80, startAngle, needleAngle)}
            fill="none"
            stroke={gaugeColor}
            strokeWidth="12"
            strokeLinecap="round"
          />
          
          {/* Threshold markers */}
          {thresholdMarkers}
          
          {/* Needle */}
          <line
            x1="100"
            y1="100"
            x2={needleTipX}
            y2={needleTipY}
            stroke={theme.axis.titleColor}
            strokeWidth="2"
            strokeLinecap="round"
          />
          
          {/* Center dot */}
          <circle
            cx="100"
            cy="100"
            r="4"
            fill={theme.axis.titleColor}
          />
          
          {/* Min label */}
          <text
            x={minLabelX}
            y={minLabelY}
            fill={theme.axis.labelColor}
            fontSize="9"
            textAnchor="middle"
          >
            {min}
          </text>
          
          {/* Max label */}
          <text
            x={maxLabelX}
            y={maxLabelY}
            fill={theme.axis.labelColor}
            fontSize="9"
            textAnchor="middle"
          >
            {max}
          </text>
          
          {/* Center value */}
          <text
            x="100"
            y="85"
            fill={theme.axis.titleColor}
            fontSize="24"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {formattedValue}
          </text>
          
          {/* Title */}
          {config.title && (
            <text
              x="100"
              y="105"
              fill={theme.axis.labelColor}
              fontSize="10"
              textAnchor="middle"
            >
              {config.title}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}