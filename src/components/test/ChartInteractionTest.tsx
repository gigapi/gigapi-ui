import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartRenderer } from '@/components/shared/ChartRenderer';
import type { PanelConfig, NDJSONRecord } from '@/types/dashboard.types';

/**
 * Test component to verify chart interactions are working properly
 * Tests:
 * 1. Legend click to show/hide series
 * 2. Tooltip display without blocking interactions
 * 3. Proper z-index layering
 */
export function ChartInteractionTest() {
  const [testData] = useState<NDJSONRecord[]>([
    // Generate test time series data with multiple series
    ...Array.from({ length: 50 }, (_, i) => {
      const baseTime = Date.now() - (50 - i) * 60000; // 1 minute intervals
      return [
        {
          time: new Date(baseTime),
          value: Math.sin(i / 10) * 100 + 200,
          series: 'CPU Usage',
        },
        {
          time: new Date(baseTime),
          value: Math.cos(i / 10) * 50 + 150,
          series: 'Memory Usage',
        },
        {
          time: new Date(baseTime),
          value: Math.sin(i / 5) * 30 + 100,
          series: 'Disk I/O',
        },
      ];
    }).flat(),
  ]);

  const testConfig: PanelConfig = {
    id: 'test-chart',
    title: 'Chart Interaction Test',
    type: 'timeseries',
    query: 'TEST_QUERY',
    database: 'test',
    fieldMapping: {
      xField: 'time',
      yField: 'value',
      seriesField: 'series',
    },
    options: {
      legend: {
        showLegend: true,
        placement: 'bottom',
      },
    },
    fieldConfig: {
      defaults: {
        unit: '%',
        decimals: 1,
        custom: {
          lineWidth: 2,
          fillOpacity: 0.1,
          lineInterpolation: 'smooth',
        },
      },
    },
  };

  const [interactionLog, setInteractionLog] = useState<string[]>([]);

  useEffect(() => {
    // Log initial render
    setInteractionLog(prev => [...prev, `Chart rendered at ${new Date().toLocaleTimeString()}`]);
  }, []);

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Chart Interaction Test</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>✅ Click on legend items to show/hide series</p>
              <p>✅ Hover over the chart to see tooltips</p>
              <p>✅ Tooltips should not block interactions</p>
              <p>✅ Legend should have smooth animations</p>
            </div>
            
            <div className="h-96 w-full border rounded">
              <ChartRenderer
                config={testConfig}
                data={testData}
                height="100%"
                width="100%"
              />
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Test Buttons (should be clickable even with tooltip visible)</h3>
              <div className="flex gap-2">
                <button 
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  onClick={() => setInteractionLog(prev => [...prev, `Button 1 clicked at ${new Date().toLocaleTimeString()}`])}
                >
                  Test Button 1
                </button>
                <button 
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  onClick={() => setInteractionLog(prev => [...prev, `Button 2 clicked at ${new Date().toLocaleTimeString()}`])}
                >
                  Test Button 2
                </button>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Interaction Log:</h3>
              <div className="bg-muted p-2 rounded text-xs font-mono max-h-32 overflow-y-auto">
                {interactionLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}