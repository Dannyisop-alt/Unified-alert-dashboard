import { useState, useEffect } from 'react';
import { MonitoringDashboard } from '@/components/MonitoringDashboard';
import { DashboardHeader } from '@/components/DashboardHeader';
import { CategoryToggle } from '@/components/CategoryToggle';
import { heartbeatService } from '@/lib/heartbeatService';
import { api } from '@/lib/api';
import { getAccess } from '@/lib/auth';
import type { AlertCategory, UserPreferences, AlertFilters } from '@/types/alerts';

// Helper function to get default category based on user access
const getDefaultCategoryFromAccess = (access: string[]): AlertCategory => {
  // Priority order: logs -> infrastructure -> heartbeat
  if (access.includes('Application Logs')) return 'logs';
  if (access.includes('Infrastructure Alerts')) return 'infrastructure';
  if (access.includes('Application Heartbeat')) return 'heartbeat';
  return 'logs'; // fallback
};

// Helper function to get default source based on category
const getDefaultSourceFromCategory = (category: AlertCategory): string[] => {
  const sourceMap = {
    'heartbeat': ['Application Heartbeat'],
    'logs': ['Application Logs'], 
    'infrastructure': ['Infrastructure Alerts']
  };
  return sourceMap[category];
};

const Index = () => {
  // Get user access to determine default category
  const userAccess = getAccess();
  const defaultCategory = getDefaultCategoryFromAccess(userAccess);
  const defaultSource = getDefaultSourceFromCategory(defaultCategory);
  
  const [selectedCategory, setSelectedCategory] = useState<AlertCategory>(defaultCategory);
  const [heartbeatCriticalCount, setHeartbeatCriticalCount] = useState<number>(0);
  const [logsCriticalCount, setLogsCriticalCount] = useState<number>(0);
  const [infrastructureCriticalCount, setInfrastructureCriticalCount] = useState<number>(0);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    defaultCategory: defaultCategory,
    enabledSources: userAccess // Use actual user access instead of hardcoded values
  });
  const [filters, setFilters] = useState<AlertFilters>({
    severity: [],
    source: defaultSource, // Use access-based default source
    channel: [],
    timeRange: '24h',
    searchText: '',
    dynamicFilter: 'ALL'
  });

  // Load user preferences on mount - but respect access permissions
  useEffect(() => {
    const savedPreferences = localStorage.getItem('userPreferences');
    if (savedPreferences) {
      const preferences = JSON.parse(savedPreferences);
      
      // Only use saved preferences if the user still has access to that category
      const hasAccessToCategory = (category: AlertCategory) => {
        const sourceMap = {
          'heartbeat': 'Application Heartbeat',
          'logs': 'Application Logs', 
          'infrastructure': 'Infrastructure Alerts'
        };
        return userAccess.includes(sourceMap[category]);
      };
      
      // Use saved category only if user has access, otherwise use default
      const validCategory = hasAccessToCategory(preferences.defaultCategory) 
        ? preferences.defaultCategory 
        : defaultCategory;
      
      setUserPreferences({
        ...preferences,
        defaultCategory: validCategory,
        enabledSources: userAccess // Always use current access permissions
      });
      setSelectedCategory(validCategory);
      setFilters(prev => ({ ...prev, source: getDefaultSourceFromCategory(validCategory) }));
    }
  }, [userAccess, defaultCategory]);

  // Fetch heartbeat data and count critical alerts - ONLY if user has access
  useEffect(() => {
    if (!userAccess.includes('Application Heartbeat')) {
      setHeartbeatCriticalCount(0);
      return;
    }

    const fetchHeartbeatCount = async () => {
      try {
        const heartbeatAlerts = await heartbeatService.fetchHeartbeatData();
        const criticalCount = heartbeatAlerts.filter(alert => alert.severity === 'critical').length;
        setHeartbeatCriticalCount(criticalCount);
      } catch (error) {
        console.error('Failed to fetch heartbeat data:', error);
        // Don't set count to 0 on error, keep previous value
      }
    };

    // Initial fetch with delay to stagger requests
    const initialTimeout = setTimeout(fetchHeartbeatCount, 1000);
    
    // Set up polling every 60 seconds (reduced frequency)
    const interval = setInterval(fetchHeartbeatCount, 60000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [userAccess]);

  // Fetch Graylog alerts and count critical alerts - ONLY if user has access
  useEffect(() => {
    if (!userAccess.includes('Application Logs')) {
      setLogsCriticalCount(0);
      return;
    }

    const fetchLogsCount = async () => {
      try {
        const graylogAlerts = await api.getGraylogAlerts({ limit: 100 });
        const criticalCount = graylogAlerts.filter(alert => alert.severity === 'critical').length;
        setLogsCriticalCount(criticalCount);
      } catch (error) {
        console.error('Failed to fetch logs data:', error);
        // Don't set count to 0 on error, keep previous value
      }
    };

    // Initial fetch with delay to stagger requests
    const initialTimeout = setTimeout(fetchLogsCount, 2000);
    
    // Set up polling every 60 seconds (reduced frequency)
    const interval = setInterval(fetchLogsCount, 60000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [userAccess]);

  // Fetch infrastructure/OCI data and count critical alerts - ONLY if user has access
  useEffect(() => {
    if (!userAccess.includes('Infrastructure Alerts')) {
      setInfrastructureCriticalCount(0);
      return;
    }

    const fetchInfrastructureCount = async () => {
      try {
        const infrastructureAlerts = await api.getOCIAlerts({ limit: 100 });
        const criticalCount = infrastructureAlerts.filter(alert => 
          alert.severity === 'critical' || alert.severity === 'error'
        ).length;
        setInfrastructureCriticalCount(criticalCount);
      } catch (error) {
        console.error('Failed to fetch infrastructure data:', error);
        // Don't set count to 0 on error, keep previous value
      }
    };

    // Initial fetch with delay to stagger requests
    const initialTimeout = setTimeout(fetchInfrastructureCount, 3000);
    
    // Set up polling every 10 minutes (increased from 5 minutes to reduce load)
    const interval = setInterval(fetchInfrastructureCount, 600000);
    
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [userAccess]);

  // Save preferences and update source filter when category changes
  const handleCategoryChange = (category: AlertCategory) => {
    console.log(`🔄 [DEBUG] Switching to category: ${category}`);
    
    const sourceMap: Record<AlertCategory, string> = {
      'heartbeat': 'Application Heartbeat',
      'logs': 'Application Logs',
      'infrastructure': 'Infrastructure Alerts',
      'database': 'Infrastructure Alerts'
    };
    
    const requiredAccess = sourceMap[category!];
    
    // SECURITY: Only allow category change if user has access
    if (!userAccess.includes(requiredAccess)) {
      console.warn(`🚫 [SECURITY] User attempted to access ${category} without permission`);
      return;
    }
    
    const newSource = [requiredAccess];
    
    // ✅ CRITICAL: Update filters FIRST (prevents race condition)
    setFilters(prev => ({ 
      ...prev, 
      source: newSource,
      // Reset ALL other filters to prevent contamination
      severity: [],
      channel: [],
      searchText: '',
      dynamicFilter: 'ALL',
      region: undefined,
      // ✅ FIX: Set resourceType filter for database category
      resourceType: category === 'database' ? 'Database' : undefined,
      timeRange: '24h'
    }));
    
    // Then update category
    setSelectedCategory(category);
    
    // Save preferences
    const newPreferences = { ...userPreferences, defaultCategory: category || 'heartbeat' };
    setUserPreferences(newPreferences);
    localStorage.setItem('userPreferences', JSON.stringify(newPreferences));
    
    console.log(`✅ [DEBUG] Category change complete: ${category} with source: ${newSource}, resourceType: ${category === 'database' ? 'Database' : 'undefined'}`);
  };

  // Calculate critical alert counts only
  const alertCounts = {
    heartbeat: heartbeatCriticalCount, // Real critical alerts count from heartbeat service
    logs: logsCriticalCount,           // Real critical alerts count from logs  
    infrastructure: infrastructureCriticalCount  // Real critical alerts count from infrastructure
  };

  const handleRefresh = () => {
    // Trigger refresh of the monitoring dashboard
    if ((window as any).refreshAlerts) {
      (window as any).refreshAlerts();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        {/* Header */}
        <DashboardHeader onRefresh={handleRefresh} selectedCategory={selectedCategory} />
        
        {/* Category Toggle */}
        <CategoryToggle 
          selectedCategory={selectedCategory}
          onCategoryChange={handleCategoryChange}
          alertCounts={alertCounts}
        />
        
        {/* Main Content */}
        <main className="container mx-auto px-6 py-6">
          <MonitoringDashboard 
            key={`${selectedCategory}-${filters.source?.join(',') || 'none'}`} // ✅ FORCE REMOUNT
            selectedCategory={selectedCategory} 
            filters={filters} 
            onFiltersChange={setFilters}
            onRefresh={handleRefresh}
          />
        </main>
      </div>
    </div>
  );
};

export default Index;