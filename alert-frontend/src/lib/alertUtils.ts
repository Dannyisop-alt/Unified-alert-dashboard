import type { GraylogAlert, OCIAlert, AlertFilters, ProcessedAlert } from '@/types/alerts';
import type { HeartbeatAlert } from '@/lib/heartbeatService';

export const processAlerts = (
  graylogAlerts: GraylogAlert[],
  ociAlerts: OCIAlert[],
  heartbeatAlerts: HeartbeatAlert[],
  filters: AlertFilters
): ProcessedAlert[] => {
  const processedAlerts: ProcessedAlert[] = [];

  // Helper: Determine if an OCI alert is database-related
  const isDatabaseAlert = (alert: OCIAlert): boolean => {
    const vmName = (alert.vm || '').toLowerCase();
    const message = (alert.message || '').toLowerCase();
    const metricName = (alert.metricName || '').toLowerCase();
    const alertType = (alert.alertType || '').toLowerCase();
    
    // Database-related VM name patterns
    const dbVmPatterns = [
      'db', 'database', 'sql', 'oracle', 'mysql', 'postgres', 'mongo', 'redis',
      'dbspc', 'db-prod', 'db-dev', 'db-stage', 'db-test', 'db-uat',
      'oracle-db', 'mysql-db', 'postgres-db', 'mongo-db', 'redis-db',
      'gatra', 'gatra-db', 'gatra_prod', 'gatra_dev', 'gatra_stage'
    ];
    
    // Database-related message patterns
    const dbMessagePatterns = [
      'database', 'db', 'sql', 'oracle', 'mysql', 'postgres', 'mongo', 'redis',
      'connection pool', 'query timeout', 'deadlock', 'lock wait',
      'buffer cache', 'shared pool', 'data file', 'tablespace',
      'index', 'table scan', 'full table scan', 'partition',
      'backup', 'recovery', 'archive', 'redo log', 'undo',
      'performance', 'slow query', 'execution plan', 'statistics',
      'sessions', 'session', 'connection', 'query', 'transaction',
      'lock', 'wait', 'timeout', 'pool', 'cache', 'buffer',
      'iops', 'throughput', 'latency', 'response time'
    ];
    
    // Database-related metric patterns
    const dbMetricPatterns = [
      'database', 'db', 'sql', 'oracle', 'mysql', 'postgres', 'mongo', 'redis',
      'connection', 'session', 'query', 'transaction', 'lock',
      'buffer', 'cache', 'memory', 'storage', 'iops',
      'cpu_utilization', 'memory_utilization', 'storage_utilization',
      'active_sessions', 'total_sessions', 'wait_time', 'sessions',
      'gatra', 'gatra_sessions', 'gatra_sessions_alert',
      'connection_count', 'session_count', 'query_count',
      'transaction_count', 'lock_count', 'wait_count',
      'buffer_hit_ratio', 'cache_hit_ratio', 'memory_usage',
      'storage_usage', 'iops_count', 'throughput_rate',
      'latency_ms', 'response_time_ms'
    ];
    
    // Check VM name patterns
    if (dbVmPatterns.some(pattern => vmName.includes(pattern))) {
      return true;
    }
    
    // Check message patterns
    if (dbMessagePatterns.some(pattern => message.includes(pattern))) {
      return true;
    }
    
    // Check metric name patterns
    if (dbMetricPatterns.some(pattern => metricName.includes(pattern))) {
      return true;
    }
    
    // Check for specific database error patterns
    if (message.includes('ora-') || message.includes('mysql error') || 
        message.includes('postgres error') || message.includes('connection failed') ||
        message.includes('session') || message.includes('connection') ||
        message.includes('query') || message.includes('transaction')) {
      return true;
    }
    
    // Check for GATRA-specific patterns (common in your system)
    if (vmName.includes('gatra') || message.includes('gatra') || metricName.includes('gatra')) {
      return true;
    }
    
    // Check for session-related patterns
    if (message.includes('sessions') || message.includes('session') || 
        metricName.includes('sessions') || metricName.includes('session')) {
      return true;
    }
    
    // Check for common database performance indicators
    if (message.includes('high cpu') || message.includes('high memory') || 
        message.includes('high iops') || message.includes('high throughput') ||
        message.includes('slow response') || message.includes('timeout') ||
        message.includes('connection limit') || message.includes('pool exhausted')) {
      return true;
    }
    
    // Check for database-specific alert names
    if (alertType.includes('sessions') || alertType.includes('connection') ||
        alertType.includes('query') || alertType.includes('transaction') ||
        alertType.includes('lock') || alertType.includes('wait') ||
        alertType.includes('performance') || alertType.includes('throughput')) {
      return true;
    }
    
    return false;
  };

  // Helper: Map severity label by source
  const mapSeverity = (
    severity: string,
    source: 'Application Logs' | 'Application Heartbeat' | 'Infrastructure Alerts'
  ): 'Critical' | 'Warning' | 'Error' | 'Info' => {
    const s = (severity || '').toLowerCase();
    
    // For Infrastructure Alerts: support Critical, Warning, Info, Error
    if (source === 'Infrastructure Alerts') {
      if (s.includes('critical') || s === 'crit' || s === 'high') return 'Critical';
      if (s.includes('warning') || s === 'warn' || s === 'medium') return 'Warning';
      if (s.includes('error') || s === 'err') return 'Error';
      if (s.includes('info') || s === 'low') return 'Info';
      return 'Info'; // Default for infrastructure
    }
    
    // For Application Logs and Heartbeat: support Critical, Warning, Info only
    if (s.includes('critical') || s === 'crit' || s === 'high') return 'Critical';
    if (s.includes('warning') || s === 'warn' || s === 'medium') return 'Warning';
    if (s.includes('error') || s === 'err' || s.includes('info') || s === 'low') return 'Info';
    return 'Info'; // Default for logs and heartbeat
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

    // Extract the actual alert message/title from the message field
    let alertTitle = alert.message || 'No title available';
    
    // If message contains "Processing Error" or similar, try to extract meaningful info
    if (alertTitle.includes('Processing Error') || alertTitle.includes('OCI_ALARM_ERROR') || alertTitle.includes('Failed to process')) {
      // Try to use metricName or alertType if available
      if (alert.metricName && alert.metricName !== 'Unknown' && alert.metricName !== 'ProcessingError') {
        alertTitle = alert.metricName;
      } else if (alert.alertType && alert.alertType !== 'OCI_ALARM' && alert.alertType !== 'OCI_ALARM_ERROR') {
        alertTitle = alert.alertType;
      } else {
        // Fallback to a more descriptive title
        alertTitle = `Alert on ${alert.vm}`;
      }
    }
    
    // Clean up the title if it's too long or contains unnecessary information
    if (alertTitle.length > 100) {
      alertTitle = alertTitle.substring(0, 97) + '...';
    }
    
    // Remove common prefixes that don't add value
    alertTitle = alertTitle.replace(/^(OCI_|ALARM_|ERROR_)/i, '');

    // Determine resource type and category
    const isDatabase = isDatabaseAlert(alert);
    const resourceType: 'Database' | 'Server' = isDatabase ? 'Database' : 'Server';
    const category: 'infrastructure' | 'database' = isDatabase ? 'database' : 'infrastructure';
    
    // Debug logging for categorization
    console.log(`🔍 [CATEGORIZATION] Alert: ${alert.vm} - "${alert.message}"`);
    console.log(`🔍 [CATEGORIZATION] Metric: ${alert.metricName}, Type: ${alert.alertType}`);
    console.log(`🔍 [CATEGORIZATION] Categorized as: ${resourceType} (${category})`);
    console.log(`🔍 [CATEGORIZATION] Database detection: ${isDatabase}`);

    processedAlerts.push({
      id: alert._id || `oci-${alert.timestamp}`,
      source,
      severity,
      title: alertTitle,
      description: alert.message || 'No description available',
      timestamp: alert.timestamp,
      site: alert.vm,
      
      category: category,
      region: alert.region,
      compartment: alert.compartment,
      metricName: alert.metricName,
      tenant: alert.tenant,
      resourceType: resourceType
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
      
      // Use the resourceType field that was set during processing
      return alert.resourceType === filters.resourceType;
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