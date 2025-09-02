import { useState, useEffect } from 'react';
import { MonitoringDashboard } from '@/components/MonitoringDashboard';
import { DashboardHeader } from '@/components/DashboardHeader';
import { CategoryToggle } from '@/components/CategoryToggle';
import { heartbeatService } from '@/lib/heartbeatService';
import { api } from '@/lib/api';
import type { AlertCategory, UserPreferences, AlertFilters } from '@/types/alerts';

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState<AlertCategory>('heartbeat');
  const [heartbeatCriticalCount, setHeartbeatCriticalCount] = useState<number>(0);
  const [logsCriticalCount, setLogsCriticalCount] = useState<number>(0);
  const [infrastructureCriticalCount, setInfrastructureCriticalCount] = useState<number>(0);
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    defaultCategory: 'logs',
    enabledSources: ['Application Heartbeat', 'Application Logs', 'Infrastructure Alerts']
  });
  const [filters, setFilters] = useState<AlertFilters>({
    severity: [],
    source: ['Application Heartbeat'], // Start with heartbeat source to prevent showing all alerts initially
    channel: [],
    timeRange: '24h',
    searchText: '',
    dynamicFilter: 'ALL'
  });

  // Load user preferences on mount
  useEffect(() => {
    const savedPreferences = localStorage.getItem('userPreferences');
    if (savedPreferences) {
      const preferences = JSON.parse(savedPreferences);
      setUserPreferences(preferences);
      setSelectedCategory(preferences.defaultCategory);
      // Set initial source filter based on category
      const sourceMap = {
        'heartbeat': 'Application Heartbeat',
        'logs': 'Application Logs', 
        'infrastructure': 'Infrastructure Alerts'
      };
      setFilters(prev => ({ ...prev, source: [sourceMap[preferences.defaultCategory]] }));
    }
  }, []);

  // Fetch heartbeat data and count critical alerts
  useEffect(() => {
    const fetchHeartbeatCount = async () => {
      try {
        const heartbeatAlerts = await heartbeatService.fetchHeartbeatData();
        const criticalCount = heartbeatAlerts.filter(alert => alert.severity === 'critical').length;
        setHeartbeatCriticalCount(criticalCount);
      } catch (error) {
        console.error('Failed to fetch heartbeat data:', error);
      }
    };

    fetchHeartbeatCount();
    // Set up polling every 30 seconds
    const interval = setInterval(fetchHeartbeatCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch logs data and count critical alerts  
  useEffect(() => {
    const fetchLogsCount = async () => {
      try {
        const graylogAlerts = await api.getGraylogAlerts({ limit: 100 });
        const criticalCount = graylogAlerts.filter(alert => alert.severity === 'critical').length;
        setLogsCriticalCount(criticalCount);
      } catch (error) {
        console.error('Failed to fetch logs data:', error);
      }
    };

    fetchLogsCount();
    // Set up polling every 30 seconds
    const interval = setInterval(fetchLogsCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch infrastructure/OCI data and count critical alerts  
  useEffect(() => {
    const fetchInfrastructureCount = async () => {
      try {
        const infrastructureAlerts = await api.getOCIAlerts({ limit: 100 });
        const criticalCount = infrastructureAlerts.filter(alert => 
          alert.severity === 'critical' || alert.severity === 'error'
        ).length;
        setInfrastructureCriticalCount(criticalCount);
      } catch (error) {
        console.error('Failed to fetch infrastructure data:', error);
      }
    };

    fetchInfrastructureCount();
    // Set up polling every 30 seconds
    const interval = setInterval(fetchInfrastructureCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Save preferences and update source filter when category changes
  const handleCategoryChange = (category: AlertCategory) => {
    console.log(`🔄 [DEBUG] Switching to category: ${category}`);
    
    const sourceMap: Record<AlertCategory, string> = {
      'heartbeat': 'Application Heartbeat',
      'logs': 'Application Logs',
      'infrastructure': 'Infrastructure Alerts',
      'database': 'Infrastructure Alerts'
    };
    
    const newSource = [sourceMap[category!]];
    
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