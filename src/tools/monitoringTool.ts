import { z } from 'zod';
import { Tool, ToolResult } from './types';

export const MonitoringToolParams = z.object({
  container_name: z.string().describe('Container name to monitor (e.g., "agentiq-db", "agentiq_cadvisor")'),
});

export type MonitoringToolInput = z.infer<typeof MonitoringToolParams>;

export const monitoringTool: Tool = {
  name: 'monitoring',
  description: 'Get container resource usage metrics (CPU, Memory, Network) from cAdvisor. Use this to check system health, resource consumption, or detect performance issues.',
  parameters: MonitoringToolParams,
  
  execute: async (params: any): Promise<ToolResult> => {
    try {
      const validated = MonitoringToolParams.parse(params) as MonitoringToolInput;
      
      // Fetch stats from cAdvisor (first sample)
      const response = await fetch('http://localhost:8080/api/v1.3/docker');
      
      if (!response.ok) {
        return {
          success: false,
          error: `cAdvisor API error: ${response.statusText}`,
        };
      }

      const data = await response.json();
      
      // Find the container in the stats by searching aliases
      let containerStats: any = null;
      for (const [path, stats] of Object.entries(data)) {
        const containerData = stats as any;
        if (containerData.aliases && containerData.aliases.includes(validated.container_name)) {
          containerStats = containerData;
          break;
        }
      }
      
      if (!containerStats) {
        return {
          success: false,
          error: `Container "${validated.container_name}" not found. Available containers can be checked via cAdvisor.`,
        };
      }
      
      const spec = containerStats.spec;
      const latest = containerStats.stats[containerStats.stats.length - 1];

      // Wait 1 second and fetch again for CPU calculation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const response2 = await fetch('http://localhost:8080/api/v1.3/docker');
      const data2 = await response2.json();
      
      let containerStats2: any = null;
      for (const [path, stats] of Object.entries(data2)) {
        const containerData = stats as any;
        if (containerData.aliases && containerData.aliases.includes(validated.container_name)) {
          containerStats2 = containerData;
          break;
        }
      }
      
      const latest2 = containerStats2.stats[containerStats2.stats.length - 1];
      
      // Calculate CPU usage percentage (delta over time)
      const cpuDelta = latest2.cpu.usage.total - latest.cpu.usage.total;
      const timeDelta = new Date(latest2.timestamp).getTime() - new Date(latest.timestamp).getTime();
      const cpuPercent = ((cpuDelta / (timeDelta * 1000000)) * 100 / spec.cpu.limit).toFixed(2);

      // Memory usage
      const memoryUsage = latest.memory.usage;
      const memoryLimit = spec.memory.limit;
      const memoryPercent = ((memoryUsage / memoryLimit) * 100).toFixed(2);
      const memoryUsageMB = (memoryUsage / (1024 * 1024)).toFixed(2);
      const memoryLimitMB = (memoryLimit / (1024 * 1024)).toFixed(2);

      // Network I/O
      const networkRxBytes = latest.network?.interfaces?.[0]?.rx_bytes || 0;
      const networkTxBytes = latest.network?.interfaces?.[0]?.tx_bytes || 0;

      return {
        success: true,
        data: {
          container: validated.container_name,
          timestamp: latest2.timestamp,
          cpu: {
            usage_percent: parseFloat(cpuPercent),
            cores: spec.cpu.limit,
          },
          memory: {
            usage_mb: parseFloat(memoryUsageMB),
            limit_mb: parseFloat(memoryLimitMB),
            usage_percent: parseFloat(memoryPercent),
          },
          network: {
            rx_bytes: networkRxBytes,
            tx_bytes: networkTxBytes,
            rx_mb: (networkRxBytes / (1024 * 1024)).toFixed(2),
            tx_mb: (networkTxBytes / (1024 * 1024)).toFixed(2),
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch monitoring data',
      };
    }
  },
};