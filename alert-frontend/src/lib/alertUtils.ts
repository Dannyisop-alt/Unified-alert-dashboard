import type { GraylogAlert, OCIAlert, AlertFilters, ProcessedAlert } from '@/types/alerts';
import type { HeartbeatAlert } from '@/lib/heartbeatService';

export const processAlerts = (
  graylogAlerts: GraylogAlert[],
  ociAlerts: OCIAlert[],
  heartbeatAlerts: HeartbeatAlert[],
  filters: AlertFilters
): ProcessedAlert[] => {
  const processedAlerts: ProcessedAlert[] = [];

  // Process Graylog alerts
  graylogAlerts.forEach((alert) => {
    let severity: 'Critical' | 'Warning' | 'Info' = 'Info';
    
    // Map backend severity to frontend severity
    if (alert.severity === 'critical' || alert.severity === 'high') severity = 'Critical';
    else if (alert.severity === 'medium' || alert.severity === 'low') severity = 'Warning';
    else severity = 'Info';

    // Determine category based on channel
    let category: 'heartbeat' | 'logs' | 'infrastructure' = 'logs';
    if (alert.channel?.includes('heartbeat') || alert.channel?.includes('monitor')) {
      category = 'heartbeat';
    } else if (alert.channel?.includes('infrastructure') || alert.channel?.includes('system')) {
      category = 'infrastructure';
    }

    processedAlerts.push({
      id: alert._id || `graylog-${alert.timestamp}`,
      source: 'Application Logs',
      severity,
      title: alert.shortMessage || 'No title',
      description: alert.fullMessage || alert.shortMessage || 'No description',
      timestamp: alert.timestamp,
      acknowledged: alert.acknowledged || false,
      category
    });
  });

  // Process OCI alerts
  ociAlerts.forEach((alert) => {
    let severity: 'Critical' | 'Warning' | 'Info' = 'Info';
    
    // Map backend severity to frontend severity
    if (alert.severity === 'critical' || alert.severity === 'high' || alert.severity === 'error') severity = 'Critical';
    else if (alert.severity === 'medium' || alert.severity === 'low' || alert.severity === 'warning') severity = 'Warning';
    else severity = 'Info';

    processedAlerts.push({
      id: alert._id || `oci-${alert.timestamp}`,
      source: 'Infrastructure Alerts',
      severity,
      title: `${alert.vm} - ${alert.alertType || 'Alert'}`,
      description: alert.message || 'No description available',
      timestamp: alert.timestamp,
      site: alert.vm,
      acknowledged: alert.acknowledged || false,
      category: 'infrastructure',
      region: alert.region,
      compartment: alert.compartment,
      metricName: alert.metricName,
      tenant: alert.tenant
    });
  });

  // Process Heartbeat alerts
  heartbeatAlerts.forEach((alert) => {
    let severity: 'Critical' | 'Warning' | 'Info' = 'Info';
    
    // Map heartbeat severity to frontend severity
    if (alert.severity === 'critical') severity = 'Critical';
    else if (alert.severity === 'medium') severity = 'Warning';
    else severity = 'Info';

    processedAlerts.push({
      id: alert.id,
      source: 'Application Heartbeat',
      severity,
      title: `${alert.siteName} - ${alert.service}`,
      description: alert.message,
      timestamp: alert.timestamp,
      site: alert.site,
      acknowledged: false, // Heartbeat alerts don't support acknowledgment currently
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
      
      // For OCI/infrastructure alerts
      if (alert.source === 'Infrastructure Alerts') {
        const ociAlert = ociAlerts.find(o => o.timestamp === alert.timestamp);
        if (ociAlert) {
          return ociAlert.vm?.toLowerCase().includes(filterValue.toLowerCase()) ||
                 ociAlert.tenant?.toLowerCase().includes(filterValue.toLowerCase()) ||
                 ociAlert.region?.toLowerCase().includes(filterValue.toLowerCase());
        }
      }
      
      // For heartbeat alerts
      if (alert.source === 'Application Heartbeat') {
        const heartbeatAlert = heartbeatAlerts.find(h => h.id === alert.id);
        if (heartbeatAlert) {
          return heartbeatAlert.service?.toLowerCase() === filterValue.toLowerCase();
        }
      }
      
      return false;
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