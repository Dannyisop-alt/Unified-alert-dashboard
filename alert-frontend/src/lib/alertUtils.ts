import type { GraylogAlert, OCIAlert, AlertFilters, ProcessedAlert } from '@/types/alerts';
import type { HeartbeatAlert } from '@/lib/heartbeatService';

export const processAlerts = (
  graylogAlerts: GraylogAlert[],
  ociAlerts: OCIAlert[],
  heartbeatAlerts: HeartbeatAlert[],
  filters: AlertFilters
): ProcessedAlert[] => {
  
  console.log('🔍 [PROCESS] Starting alert processing...');
  console.log('🔍 [PROCESS] Input counts - Graylog:', graylogAlerts.length, 'OCI:', ociAlerts.length, 'Heartbeat:', heartbeatAlerts.length);
  console.log('🔍 [PROCESS] Active source filters:', filters.source);

  // ✅ CRITICAL: Return empty immediately if no source filters
  if (!filters.source || filters.source.length === 0) {
    console.log('⚠️ [PROCESS] No source filter provided - returning empty array');
    return [];
  }

  const processedAlerts: ProcessedAlert[] = [];

  // ✅ STRICT: Only process alerts that match current source filters
  const shouldProcessGraylog = filters.source.includes('Application Logs');
  const shouldProcessOCI = filters.source.includes('Infrastructure Alerts');
  const shouldProcessHeartbeat = filters.source.includes('Application Heartbeat');

  console.log('🔍 [PROCESS] Processing flags - Graylog:', shouldProcessGraylog, 'OCI:', shouldProcessOCI, 'Heartbeat:', shouldProcessHeartbeat);

  // Helper: Determine if an OCI alert is database-related
  // ✅ FIXED: Only match alerts that contain "DB" or "DATABASE" words
  const isDatabaseAlert = (alert: OCIAlert): boolean => {
    const vmName = (alert.vm || '').toLowerCase();
    const message = (alert.message || '').toLowerCase();
    const metricName = (alert.metricName || '').toLowerCase();
    const alertType = (alert.alertType || '').toLowerCase();
    
    // ✅ STRICT: Only check for explicit "DB" or "DATABASE" patterns
    const dbPatterns = [
      'db', 'database', 'db_', '_db', 'db-', '-db'
    ];
    
    // Check VM name for DB patterns
    if (dbPatterns.some(pattern => vmName.includes(pattern))) {
      return true;
    }
    
    // Check message for DB patterns
    if (dbPatterns.some(pattern => message.includes(pattern))) {
      return true;
    }
    
    // Check metric name for DB patterns
    if (dbPatterns.some(pattern => metricName.includes(pattern))) {
      return true;
    }
    
    // Check alert type for DB patterns
    if (dbPatterns.some(pattern => alertType.includes(pattern))) {
      return true;
    }
    
    // ✅ SPECIFIC: Check for known database alert patterns in your system
    if (message.includes('pht_database_session_alarm') || 
        message.includes('gatra_sessions_alert') ||
        message.includes('dtc-db_alert') ||
        message.includes('qrydedb_')) {
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

  // Process Graylog alerts ONLY for Application Logs
  if (shouldProcessGraylog && graylogAlerts.length > 0) {
    console.log('📋 [PROCESS] Processing', graylogAlerts.length, 'Graylog alerts for Application Logs');
    graylogAlerts.forEach((alert, index) => {
      const source: 'Application Logs' = 'Application Logs';
      const severity = mapSeverity(alert.severity, source);

      let category: 'heartbeat' | 'logs' | 'infrastructure' = 'logs';
      if (alert.channel?.includes('heartbeat') || alert.channel?.includes('monitor')) {
        category = 'heartbeat';
      } else if (alert.channel?.includes('infrastructure') || alert.channel?.includes('system')) {
        category = 'infrastructure';
      }

      const processedAlert = {
        id: alert._id || `graylog-${alert.timestamp}-${index}`, // Ensure unique IDs
        source,
        severity,
        title: alert.shortMessage || 'No title',
        description: alert.fullMessage || alert.shortMessage || 'No description',
        timestamp: alert.timestamp,
        category
      };

      processedAlerts.push(processedAlert);
      console.log(`📋 [PROCESS] Added Graylog alert: ${processedAlert.title}`);
    });
  } else if (shouldProcessGraylog) {
    console.log('📋 [PROCESS] Should process Graylog but no alerts provided');
  }

  // Process OCI alerts ONLY for Infrastructure Alerts  
  if (shouldProcessOCI && ociAlerts.length > 0) {
    console.log('🏗️ [PROCESS] Processing', ociAlerts.length, 'OCI alerts for Infrastructure Alerts');
    ociAlerts.forEach((alert, index) => {
      const source: 'Infrastructure Alerts' = 'Infrastructure Alerts';
      const severity = mapSeverity(alert.severity, source);

      // Clean up alert title
      let alertTitle = alert.message || 'No title available';
      
      if (alertTitle.includes('Processing Error') || alertTitle.includes('OCI_ALARM_ERROR')) {
        if (alert.metricName && alert.metricName !== 'Unknown') {
          alertTitle = alert.metricName;
        } else if (alert.alertType && alert.alertType !== 'OCI_ALARM') {
          alertTitle = alert.alertType;
        } else {
          alertTitle = `Alert on ${alert.vm}`;
        }
      }
      
      if (alertTitle.length > 100) {
        alertTitle = alertTitle.substring(0, 97) + '...';
      }
      
      alertTitle = alertTitle.replace(/^(OCI_|ALARM_|ERROR_)/i, '');

      const isDatabase = isDatabaseAlert(alert);
      const resourceType: 'Database' | 'Server' = isDatabase ? 'Database' : 'Server';
      const category: 'infrastructure' | 'database' = isDatabase ? 'database' : 'infrastructure';

      const processedAlert = {
        id: alert._id || `oci-${alert.timestamp}-${index}`, // Ensure unique IDs
        source, // ✅ MUST be 'Infrastructure Alerts'
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
      };

      processedAlerts.push(processedAlert);
      console.log(`🏗️ [PROCESS] Added Infrastructure alert: ${processedAlert.title}`);
    });
  } else if (shouldProcessOCI) {
    console.log('🏗️ [PROCESS] Should process OCI but no alerts provided');
  }

  // Process Heartbeat alerts ONLY for Application Heartbeat
  if (shouldProcessHeartbeat && heartbeatAlerts.length > 0) {
    console.log('💓 [PROCESS] Processing', heartbeatAlerts.length, 'Heartbeat alerts for Application Heartbeat');
    heartbeatAlerts.forEach((alert, index) => {
      const source: 'Application Heartbeat' = 'Application Heartbeat';
      const severity = mapSeverity(alert.severity, source);

      const processedAlert = {
        id: alert.id || `heartbeat-${alert.timestamp}-${index}`, // Ensure unique IDs
        source,
        severity,
        title: `${alert.siteName} - ${alert.service}`,
        description: alert.message,
        timestamp: alert.timestamp,
        site: alert.site,
        services: [{
          name: alert.service,
          status: alert.status === 'GREEN' ? 'OK' as const : alert.status === 'ORANGE' ? 'WARN' as const : 'ERR' as const
        }],
        category: 'heartbeat' as const
      };

      processedAlerts.push(processedAlert);
      console.log(`💓 [PROCESS] Added Heartbeat alert: ${processedAlert.title}`);
    });
  } else if (shouldProcessHeartbeat) {
    console.log('💓 [PROCESS] Should process Heartbeat but no alerts provided');
  }

  console.log('✅ [PROCESS] Total processed alerts:', processedAlerts.length);
  
  // ✅ VALIDATION: Check that all alerts have correct sources
  const sourceDistribution = processedAlerts.reduce((acc, alert) => {
    acc[alert.source] = (acc[alert.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('✅ [PROCESS] Source distribution:', sourceDistribution);

  // ✅ DETECT CONTAMINATION
  processedAlerts.forEach(alert => {
    if (!filters.source.includes(alert.source)) {
      console.error('🚨 [CONTAMINATION] Alert with wrong source detected:', {
        title: alert.title,
        source: alert.source,
        expectedSources: filters.source
      });
    }
  });

  // Apply filters
  let filteredAlerts = processedAlerts;

  if (filters.severity?.length > 0) {
    const beforeCount = filteredAlerts.length;
    filteredAlerts = filteredAlerts.filter(alert => 
      filters.severity.includes(alert.severity)
    );
    console.log(`🔍 [FILTER] Severity filter: ${beforeCount} → ${filteredAlerts.length}`);
  }

  // ✅ Source filter should be redundant now, but keep as safety
  if (filters.source?.length > 0) {
    const beforeCount = filteredAlerts.length;
    filteredAlerts = filteredAlerts.filter(alert => {
      const isAllowed = filters.source.includes(alert.source);
      if (!isAllowed) {
        console.error(`🚨 [LEAK] Alert leaked through: ${alert.title} (source: ${alert.source})`);
      }
      return isAllowed;
    });
    console.log(`🔒 [FILTER] Source safety filter: ${beforeCount} → ${filteredAlerts.length}`);
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
  const sortedAlerts = filteredAlerts.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  console.log('✅ [PROCESS] Final result:', sortedAlerts.length, 'alerts');
  return sortedAlerts;
};