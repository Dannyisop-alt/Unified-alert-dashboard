import { useState, useEffect } from 'react';
import { AlertStream } from '@/components/AlertStream';
import { FilterPanel } from '@/components/FilterPanel';
import { api } from '@/lib/api';
import { processAlerts } from '@/lib/alertUtils';
import { heartbeatService } from '@/lib/heartbeatService';
import type { GraylogAlert, OCIAlert, AlertFilters, AlertCategory } from '@/types/alerts';
import type { HeartbeatAlert } from '@/lib/heartbeatService';

interface MonitoringDashboardProps {
  selectedCategory: AlertCategory;
  filters: AlertFilters;
  onFiltersChange: (filters: AlertFilters) => void;
}

export const MonitoringDashboard = ({ selectedCategory, filters, onFiltersChange }: MonitoringDashboardProps) => {
  const [graylogAlerts, setGraylogAlerts] = useState<GraylogAlert[]>([]);
  const [ociAlerts, setOCIAlerts] = useState<OCIAlert[]>([]);
  const [heartbeatAlerts, setHeartbeatAlerts] = useState<HeartbeatAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastHeartbeatUpdate, setLastHeartbeatUpdate] = useState<Date | null>(null);


  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch alerts with individual error handling
      const results = await Promise.allSettled([
        api.getGraylogAlerts({ limit: 100 }),
        api.getOCIAlerts({ limit: 100 }),
        heartbeatService.fetchHeartbeatData()
      ]);
      
      // Handle Graylog alerts
      if (results[0].status === 'fulfilled') {
        setGraylogAlerts(results[0].value);
      } else {
        console.error('Failed to fetch Graylog alerts:', results[0].reason);
      }
      
      // Handle Infrastructure alerts (Oracle/OCI) - keep previous data on failure
      if (results[1].status === 'fulfilled') {
        const newOCIData = results[1].value;
        console.log('✅ Infrastructure alerts fetched:', newOCIData.length, 'alerts');
        console.log('📊 Sample alert:', newOCIData[0]); // Log first alert for debugging
        // Only update if we got actual data
        if (newOCIData && newOCIData.length >= 0) {
          setOCIAlerts(newOCIData);
        }
      } else {
        console.error('❌ Failed to fetch Infrastructure alerts:', results[1].reason);
        // Keep existing infrastructure data - don't clear it
      }
      
      // Handle Heartbeat alerts - keep previous data on failure
      if (results[2].status === 'fulfilled') {
        const newHeartbeatData = results[2].value;
        // Only update if we got actual data
        if (newHeartbeatData && newHeartbeatData.length > 0) {
          setHeartbeatAlerts(newHeartbeatData);
          setLastHeartbeatUpdate(new Date());
        }
      } else {
        console.error('Failed to fetch Heartbeat alerts:', results[2].reason);
        // Keep existing heartbeat data - don't clear it
      }
      
      // Only show error if ALL requests failed
      const allFailed = results.every(result => result.status === 'rejected');
      if (allFailed) {
        setError('Failed to fetch any alerts');
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Poll for new alerts every 30 seconds
    const interval = setInterval(fetchAlerts, 30000);

    return () => clearInterval(interval);
  }, []);

  // Show loading screen only on initial load, not during refresh
  if (loading && graylogAlerts.length === 0 && ociAlerts.length === 0 && heartbeatAlerts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">
          Loading alerts...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-destructive">
          Error: {error}
          <button 
            onClick={fetchAlerts}
            className="block mx-auto mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FilterPanel 
        filters={filters} 
        onFiltersChange={onFiltersChange} 
        selectedCategory={selectedCategory}
        graylogAlerts={graylogAlerts}
        ociAlerts={ociAlerts}
        heartbeatAlerts={heartbeatAlerts}
      />

      <AlertStream 
        graylogAlerts={graylogAlerts}
        ociAlerts={ociAlerts}
        heartbeatAlerts={heartbeatAlerts}
        filters={filters}
        isRefreshing={loading}
        selectedCategory={selectedCategory}
      />
    </div>
  );
};