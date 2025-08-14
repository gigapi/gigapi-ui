import React, { useRef, useEffect, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { UPlotChartProps } from './types';

/**
 * Core React wrapper for uPlot
 * Handles lifecycle, resizing, and theme changes
 */
function UPlotWrapperComponent({
  data,
  options,
  onCreate,
  onDelete,
  className = '',
  height = '100%',
  width = '100%',
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const legendContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize chart - recreate when options change
  useEffect(() => {
    if (!chartContainerRef.current || !data || data[0].length === 0) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    // Get container dimensions
    const rect = chartContainerRef.current.getBoundingClientRect();
    
    // Add legend mount callback if legend is enabled
    const legendMount = options.legend?.show ? 
      (_self: uPlot, el: HTMLElement) => {
        if (legendContainerRef.current) {
          legendContainerRef.current.appendChild(el);
        }
      } : undefined;
    
    const chartOptions: uPlot.Options = {
      ...options,
      width: options.width || rect.width || 800,
      height: options.height || rect.height || 400,
      series: options.series || [{}], // Ensure series is always defined
      legend: options.legend ? {
        ...options.legend,
        mount: legendMount,
      } : undefined,
    } as uPlot.Options;


    try {
      // Create new chart instance
      const chart = new uPlot(chartOptions, data, chartContainerRef.current);
      chartRef.current = chart;
      setIsReady(true);


      // Call onCreate callback
      if (onCreate) {
        onCreate(chart);
      }
    } catch (error) {
      console.error('[UPlotWrapper] Failed to create chart:', error);
    }

    // Cleanup
    return () => {
      if (chartRef.current) {
        if (onDelete) {
          onDelete(chartRef.current);
        }
        chartRef.current.destroy();
        chartRef.current = null;
        setIsReady(false);
      }
    };
  }, [options, data]); // Recreate chart when options or data changes

  // Removed duplicate data update - chart is recreated when data changes

  // Handle resize
  useEffect(() => {
    if (!chartContainerRef.current || !chartRef.current || !isReady) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && chartRef.current) {
          chartRef.current.setSize({
            width: Math.floor(width),
            height: Math.floor(height),
          });
        }
      }
    });

    resizeObserver.observe(chartContainerRef.current);

    // Also handle window resize
    const handleWindowResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          chartRef.current.setSize({
            width: Math.floor(rect.width),
            height: Math.floor(rect.height),
          });
        }
      }
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [isReady]);

  // Handle container styles - ensure legend has space
  const containerStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  };

  const chartStyle: React.CSSProperties = {
    flex: '1 1 auto',
    minHeight: 0,
    position: 'relative',
  };

  const legendStyle: React.CSSProperties = {
    flex: '0 0 auto',
    padding: '8px',
    backgroundColor: 'var(--legend-bg, rgba(30, 30, 30, 0.95))',
    borderTop: '1px solid var(--legend-border, rgba(255, 255, 255, 0.2))',
    minHeight: options?.legend?.show ? '40px' : '0',
  };

  return (
    <div 
      ref={containerRef} 
      className={`uplot-container ${className}`}
      style={containerStyle}
    >
      <div ref={chartContainerRef} style={chartStyle} />
      {options?.legend?.show && (
        <div ref={legendContainerRef} className="uplot-legend-container" style={legendStyle} />
      )}
    </div>
  );
}

// Export without memo to ensure chart updates properly
export const UPlotWrapper = UPlotWrapperComponent;