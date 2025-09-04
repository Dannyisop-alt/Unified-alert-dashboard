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
    console.log(`🧹 [CLEAN] Category/Source changed - CLEARING ALL STATE`);
    console.log(`🧹 [CLEAN] New category: ${selectedCategory}, New sources:`, filters.source);
    
    // ✅ FORCE IMMEDIATE STATE RESET
    setGraylogAlerts([]);
    setOCIAlerts([]);  
    setHeartbeatAlerts([]);
    setError(null);
    setLastHeartbeatUpdate(null);
    
    console.log(`🧹 [CLEAN] State cleared - triggering fresh fetch`);
  }, [selectedCategory, filters.source?.join(',')]); // React to source array changes


  // ✅ SEPARATE effect for fetching (runs after state is cleared)
  useEffect(() => {
    const fetchCategoryData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log(`🔄 [FETCH] Fetching data for sources:`, filters.source);
        
        // ✅ ONLY fetch what we need based on current source filter
        const needsGraylog = filters.source?.includes('Application Logs');
        const needsOCI = filters.source?.includes('Infrastructure Alerts');  
        const needsHeartbeat = filters.source?.includes('Application Heartbeat');
        
        console.log(`🔄 [FETCH] Needs - Graylog: ${needsGraylog}, OCI: ${needsOCI}, Heartbeat: ${needsHeartbeat}`);
        
        // ✅ Fetch only required data
        if (needsGraylog) {
          console.log('📋 [FETCH] Fetching Graylog alerts...');
          try {
            const graylogData = await api.getGraylogAlerts({ limit: 100 });
            console.log(`📋 [FETCH] Graylog loaded: ${graylogData.length} alerts`);
            setGraylogAlerts(graylogData);
          } catch (err) {
            console.error('📋 [FETCH] Graylog failed:', err);
          }
        }
        
        if (needsOCI) {
          console.log('🏗️ [FETCH] Fetching Infrastructure alerts...');
          try {
            const ociData = await api.getOCIAlerts({ limit: 100 });
            console.log(`🏗️ [FETCH] Infrastructure loaded: ${ociData.length} alerts`);
            setOCIAlerts(ociData);
          } catch (err) {
            console.error('🏗️ [FETCH] Infrastructure failed:', err);
          }
        }
        
        if (needsHeartbeat) {
          console.log('💓 [FETCH] Fetching Heartbeat alerts...');
          try {
            const heartbeatData = await heartbeatService.fetchHeartbeatData();
            console.log(`💓 [FETCH] Heartbeat loaded: ${heartbeatData.length} alerts`);
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
        console.log(`✅ [FETCH] Fetch cycle complete for category: ${selectedCategory}`);
      }
    };

    // ✅ Only fetch if we have a valid source filter
    if (filters.source && filters.source.length > 0) {
      fetchCategoryData();
    } else {
      console.log('⚠️ [FETCH] No source filter - skipping fetch');
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
        console.log('🔄 [REFRESH] Manual refresh triggered');
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