import type { GraylogAlert, OCIAlert, AlertFilters, ProcessedAlert } from '@/types/alerts';
import type { HeartbeatAlert } from '@/lib/heartbeatService';

export const processAlerts = (
  graylogAlerts: GraylogAlert[],
  ociAlerts: OCIAlert[],
  heartbeatAlerts: HeartbeatAlert[],
  filters: AlertFilters
): ProcessedAlert[] => {
  const processedAlerts: ProcessedAlert[] = [];

  // Helper: Map severity label by source
  const mapSeverity = (
    severity: string,
    source: 'Application Logs' | 'Application Heartbeat' | 'Infrastructure Alerts'
  ): 'Critical' | 'Warning' | 'Error' | 'Info' => {
    const s = (severity || '').toLowerCase();
    if (s.includes('critical') || s === 'crit' || s === 'high') return 'Critical';
    if (s.includes('warning') || s === 'warn' || s === 'medium' || s === 'low') return 'Warning';
    if (s.includes('error') || s === 'err' || s === 'info') {
      return source === 'Infrastructure Alerts' ? 'Error' : 'Info';
    }
    return source === 'Infrastructure Alerts' ? 'Error' : 'Info';
  };

  // Process Graylog alerts
  graylogAlerts.forEach((alert) => {
    const source: 'Application Logs' = 'Application Logs';
    const severity = mapSeverity(alert.severity, source);

    // Determine category based on channel
    let category: 'heartbeat' | 'logs' | 'infrastructure' = 'logs';
    if (alert.channel?.includes('heartbeat') || alert.channel?.includes('monitor')) {
      category = 'heartbeat';
    } else if (alert.channel?.includes('infrastructure') || alert.channel?.includes('system')) {
      category = 'infrastructure';
    }

    processedAlerts.push({
      id: alert._id || `graylog-${alert.timestamp}`,
      source,
      severity,
      title: alert.shortMessage || 'No title',
      description: alert.fullMessage || alert.shortMessage || 'No description',
      timestamp: alert.timestamp,
      category
    });
  });

  // Process OCI alerts
  ociAlerts.forEach((alert) => {
    const source: 'Infrastructure Alerts' = 'Infrastructure Alerts';
    const severity = mapSeverity(alert.severity, source);

    processedAlerts.push({
      id: alert._id || `oci-${alert.timestamp}`,
      source,
      severity,
      title: `${alert.vm}${(alert.alertType && alert.alertType !== 'OCI_ALARM') ? ` - ${alert.alertType}` : ''}`,
      description: alert.message || 'No description available',
      timestamp: alert.timestamp,
      site: alert.vm,
      
      category: 'infrastructure',
      region: alert.region,
      compartment: alert.compartment,
      metricName: alert.metricName,
      tenant: alert.tenant
    });
  });

  // Process Heartbeat alerts
  heartbeatAlerts.forEach((alert) => {
    const source: 'Application Heartbeat' = 'Application Heartbeat';
    const severity = mapSeverity(alert.severity, source);

    processedAlerts.push({
      id: alert.id,
      source,
      severity,
      title: `${alert.siteName} - ${alert.service}`,
      description: alert.message,
      timestamp: alert.timestamp,
      site: alert.site,
      
      services: [{
        name: alert.service,
        status: alert.status === 'GREEN' ? 'OK' : alert.status === 'ORANGE' ? 'WARN' : 'ERR'
      }],
      category: 'heartbeat'
    });
  });

  // Apply filters
  let filteredAlerts = processedAlerts;

  if (filters.severity?.length > 0) {
    filteredAlerts = filteredAlerts.filter(alert => 
      filters.severity.includes(alert.severity)
    );
  }

  if (filters.source?.length > 0) {
    filteredAlerts = filteredAlerts.filter(alert => 
      filters.source.includes(alert.source)
    );
  }

  if (filters.channel?.length > 0) {
    // For now, we'll filter based on alert type or category
    filteredAlerts = filteredAlerts.filter(alert =>
      filters.channel.some(channel => 
        alert.category.includes(channel.toLowerCase()) ||
        alert.source.toLowerCase().includes(channel.toLowerCase())
      )
    );
  }

  // Apply dynamic filter
  if (filters.dynamicFilter && filters.dynamicFilter !== 'ALL') {
    const filterValue = filters.dynamicFilter;
    
    filteredAlerts = filteredAlerts.filter(alert => {
      // For graylog/logs alerts
      if (alert.source === 'Application Logs') {
        const graylogAlert = graylogAlerts.find(g => g.timestamp === alert.timestamp);
        if (graylogAlert) {
          // Filter by channel (e.g., #alerts, #monitoring)
          if (filterValue.startsWith('#')) {
            return graylogAlert.channel?.toLowerCase() === filterValue.toLowerCase();
          }
          // Filter by system name mentioned in messages (e.g., RTD-PROD-01)
          return graylogAlert.fullMessage?.toUpperCase().includes(filterValue.toUpperCase()) ||
                 graylogAlert.shortMessage?.toUpperCase().includes(filterValue.toUpperCase());
        }
      }
      
      // For OCI/infrastructure alerts - prioritize tenant filtering
      if (alert.source === 'Infrastructure Alerts') {
        const ociAlert = ociAlerts.find(o => o.timestamp === alert.timestamp);
        if (ociAlert) {
          // First check if filter matches tenant (most common case)
          if (ociAlert.tenant?.toLowerCase() === filterValue.toLowerCase()) {
            return true;
          }
          // Then check VM name for more specific filtering
          if (ociAlert.vm?.toLowerCase().includes(filterValue.toLowerCase())) {
            return true;
          }
          return false;
        }
      }
      
      // For heartbeat alerts - check both service name and server categories
      if (alert.source === 'Application Heartbeat') {
        const heartbeatAlert = heartbeatAlerts.find(h => h.id === alert.id);
        if (heartbeatAlert) {
          // Check if filter matches service name
          if (heartbeatAlert.service?.toLowerCase() === filterValue.toLowerCase()) {
            return true;
          }
          // Check if filter matches server category (DBSPC, gse, aal)
          if (heartbeatAlert.site) {
            const site = heartbeatAlert.site.toLowerCase();
            if (filterValue === 'DBSPC' && site.endsWith('_dbspc')) {
              return true;
            } else if (filterValue === 'gse' && site.endsWith('-gse')) {
              return true;
            } else if (filterValue === 'aal' && site.endsWith('_aal')) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
  }

  // Apply infrastructure-specific filters
  if (filters.region && filters.region !== 'ALL') {
    filteredAlerts = filteredAlerts.filter(alert => 
      alert.source !== 'Infrastructure Alerts' || alert.region === filters.region
    );
  }

  if (filters.resourceType && filters.resourceType !== 'ALL') {
    filteredAlerts = filteredAlerts.filter(alert => {
      if (alert.source !== 'Infrastructure Alerts') return true;
      
      const ociAlert = ociAlerts.find(o => o.timestamp === alert.timestamp);
      if (!ociAlert) return false;
      
      // Categorize based on alert type or metric name
      const isDatabase = ociAlert.alertType?.toLowerCase().includes('database') || 
                        ociAlert.metricName?.toLowerCase().includes('database') ||
                        ociAlert.alertType?.toLowerCase().includes('db') ||
                        ociAlert.vm?.toLowerCase().includes('db');
      
      return filters.resourceType === 'Database' ? isDatabase : !isDatabase;
    });
  }

  if (filters.searchText) {
    const searchLower = filters.searchText.toLowerCase();
    filteredAlerts = filteredAlerts.filter(alert =>
      alert.title.toLowerCase().includes(searchLower) ||
      alert.description.toLowerCase().includes(searchLower) ||
      alert.site?.toLowerCase().includes(searchLower)
    );
  }

  // Sort by timestamp (newest first)
  return filteredAlerts.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
};