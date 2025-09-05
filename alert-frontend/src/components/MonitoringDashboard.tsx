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
  onRefresh?: () => void;
}

export const MonitoringDashboard = ({ selectedCategory, filters, onFiltersChange, onRefresh }: MonitoringDashboardProps) => {
  const [graylogAlerts, setGraylogAlerts] = useState<GraylogAlert[]>([]);
  const [ociAlerts, setOCIAlerts] = useState<OCIAlert[]>([]);
  const [heartbeatAlerts, setHeartbeatAlerts] = useState<HeartbeatAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastHeartbeatUpdate, setLastHeartbeatUpdate] = useState<Date | null>(null);

  // ✅ CRITICAL: Immediately clear ALL state when source changes
  useEffect(() => {
    console.log(`🔄 [DASHBOARD] Category changed to: ${selectedCategory}`);
    // Category/Source changed - clearing state
    
    // ✅ FORCE IMMEDIATE STATE RESET
    setGraylogAlerts([]);
    setOCIAlerts([]);  
    setHeartbeatAlerts([]);
    setError(null);
    setLastHeartbeatUpdate(null);
    
    // State cleared - triggering fresh fetch
  }, [selectedCategory, filters.source?.join(',')]); // React to source array changes


  // ✅ SEPARATE effect for fetching (runs after state is cleared)
  useEffect(() => {
    const fetchCategoryData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetching data for sources
        
        // ✅ ONLY fetch what we need based on current source filter
        const needsGraylog = filters.source?.includes('Application Logs');
        const needsOCI = filters.source?.includes('Infrastructure Alerts');  
        const needsHeartbeat = filters.source?.includes('Application Heartbeat');
        
        // Determining which services to fetch
        
        // ✅ Fetch only required data
        if (needsGraylog) {
          console.log('📋 [DASHBOARD] Fetching Graylog alerts...');
          try {
            const graylogData = await api.getGraylogAlerts({ limit: 100 });
            console.log(`📋 [DASHBOARD] Graylog loaded: ${graylogData.length} alerts`);
            setGraylogAlerts(graylogData);
          } catch (err) {
            console.error('📋 [FETCH] Graylog failed:', err);
          }
        }
        
        if (needsOCI) {
          console.log('🏗️ [DASHBOARD] Fetching Infrastructure alerts...');
          try {
            const ociData = await api.getOCIAlerts({ limit: 100 });
            console.log(`🏗️ [DASHBOARD] Infrastructure loaded: ${ociData.length} alerts`);
            setOCIAlerts(ociData);
          } catch (err) {
            console.error('🏗️ [FETCH] Infrastructure failed:', err);
          }
        }
        
        if (needsHeartbeat) {
          console.log('💓 [DASHBOARD] Fetching Heartbeat alerts...');
          try {
            const heartbeatData = await heartbeatService.fetchHeartbeatData();
            console.log(`💓 [DASHBOARD] Heartbeat loaded: ${heartbeatData.length} alerts`);
            setHeartbeatAlerts(heartbeatData);
            setLastHeartbeatUpdate(new Date());
          } catch (err) {
            console.error('💓 [FETCH] Heartbeat failed:', err);
          }
        }
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
        console.error('🚨 [FETCH] Global error:', err);
      } finally {
        setLoading(false);
        console.log(`✅ [DASHBOARD] ${selectedCategory} tab loaded successfully`);
        // Fetch cycle complete
      }
    };

    // ✅ Only fetch if we have a valid source filter
    if (filters.source && filters.source.length > 0) {
      fetchCategoryData();
    } else {
      // No source filter - skipping fetch
      setLoading(false);
    }
  }, [selectedCategory, filters.source?.join(',')]); // Separate fetch effect

  // Graylog alerts are now fetched via polling in the main fetch effect

  // ✅ Remove the polling effect entirely to prevent contamination
  // The refresh will be manual only

  // Expose refresh for parent
  useEffect(() => {
    if (onRefresh) {
      (window as any).refreshAlerts = () => {
        // Manual refresh triggered
        // Clear state first, then refetch
        setGraylogAlerts([]);
        setOCIAlerts([]);
        setHeartbeatAlerts([]);
        
        // Trigger refetch by updating a dummy state or calling fetch directly
        setTimeout(() => {
          // This will trigger the fetch effect above
          setError(null);
        }, 100);
      };
    }
  }, [onRefresh, selectedCategory, filters.source]);

  // Show loading screen only on initial load, not during refresh
  if (loading && graylogAlerts.length === 0 && ociAlerts.length === 0 && heartbeatAlerts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">
          Loading {selectedCategory} alerts...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-destructive">
          Error loading {selectedCategory} alerts: {error}
          <button 
            onClick={() => {
              setError(null);
              setGraylogAlerts([]);
              setOCIAlerts([]);
              setHeartbeatAlerts([]);
            }}
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
        key={`filter-${selectedCategory}-${filters.source?.join(',')}`} // Force filter panel remount too
        filters={filters} 
        onFiltersChange={onFiltersChange} 
        selectedCategory={selectedCategory}
        graylogAlerts={graylogAlerts}
        ociAlerts={ociAlerts}
        heartbeatAlerts={heartbeatAlerts}
      />

      <AlertStream 
        key={`stream-${selectedCategory}-${filters.source?.join(',')}`} // Force alert stream remount
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