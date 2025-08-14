import React from 'react';
import { cn } from '@/lib/utils/class-utils';
import { useTheme } from '../themes/utils';

export interface LegendItem {
  label: string;
  color: string;
  value?: string | number;
  show?: boolean;
}

export interface LegendProps {
  items: LegendItem[];
  className?: string;
  onItemClick?: (index: number) => void;
  onItemHover?: (index: number | null) => void;
  hoveredIndex?: number | null;
}

export function Legend({
  items,
  className,
  onItemClick,
  onItemHover,
  hoveredIndex,
}: LegendProps) {
  const { theme } = useTheme();

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-2 px-2", className)}>
      <div 
        className="flex flex-wrap gap-3 justify-center p-2 rounded"
        style={{
          backgroundColor: theme.legend.background,
          border: `1px solid ${theme.legend.borderColor}`,
        }}
      >
        {items.map((item, index) => {
          const isHovered = hoveredIndex === index;
          const othersHovered = hoveredIndex !== null && hoveredIndex !== index;
          
          return (
            <div
              key={index}
              className={cn(
                "flex items-center gap-2 text-xs cursor-pointer transition-all",
                othersHovered && "opacity-50",
                !item.show && "opacity-40"
              )}
              onClick={() => onItemClick?.(index)}
              onMouseEnter={() => onItemHover?.(index)}
              onMouseLeave={() => onItemHover?.(null)}
              style={{
                color: item.show ? theme.legend.textColor : theme.axis.labelColor,
              }}
            >
              <div
                className="w-3 h-3 rounded-sm border"
                style={{ 
                  backgroundColor: item.show ? item.color : 'transparent',
                  borderColor: item.color,
                  opacity: isHovered ? 1 : 0.9,
                }}
              />
              <span className={cn("font-medium", !item.show && "line-through")}>
                {item.label}
              </span>
              {item.value !== undefined && (
                <span style={{ color: theme.axis.labelColor }}>
                  {item.value}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}