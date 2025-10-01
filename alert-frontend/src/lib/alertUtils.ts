import type { GraylogAlert, OCIAlert, AlertFilters, ProcessedAlert } from '@/types/alerts';
import type { HeartbeatAlert } from '@/lib/heartbeatService';

// Helper function to parse alarm summary into readable English
const parseAlarmSummary = (alarmSummary: string, query: string): string => {
  if (!alarmSummary) return 'No alarm details available';
  
  // Extract key information from alarm summary
  const alarmName = alarmSummary.match(/Alarm "([^"]+)"/)?.[1] || 'Unknown Alarm';
  const state = alarmSummary.match(/is in a "([^"]+)"/)?.[1] || 'Unknown State';
  const triggerRule = alarmSummary.match(/trigger rule: "([^"]+)"/)?.[1] || query || 'No rule specified';
  const delay = alarmSummary.match(/trigger delay of (\d+ minutes?)/)?.[1] || 'No delay specified';
  
  // Convert to readable English
  let readableSummary = `${alarmName} is currently ${state.toLowerCase()}`;
  
  if (triggerRule && triggerRule !== 'No rule specified') {
    readableSummary += ` because the monitoring rule "${triggerRule}" has been triggered`;
  }
  
  if (delay && delay !== 'No delay specified') {
    readableSummary += ` since last ${delay}`;
  }
  
  return readableSummary;
};

// Helper function to parse query into readable English
const parseQuery = (query: string): string => {
  if (!query) return 'No query specified';
  
  // Parse common OCI monitoring queries
  const queryPatterns = [
    // CPU utilization patterns
    {
      pattern: /CpuUtilization\[(\d+)m\]\.percentile\(\.(\d+)\)\s*([><=]+)\s*(\d+)/,
      readable: (match: RegExpMatchArray) => {
        const timeWindow = match[1];
        const percentile = match[2];
        const operator = match[3];
        const threshold = match[4];
        const opText = operator === '>' ? 'exceeds' : operator === '<' ? 'falls below' : 'equals';
        return `CPU usage (${percentile}th percentile over ${timeWindow} minutes) ${opText} ${threshold}%`;
      }
    },
    // Memory utilization patterns
    {
      pattern: /MemoryUtilization\[(\d+)m\]\.percentile\(\.(\d+)\)\s*([><=]+)\s*(\d+)/,
      readable: (match: RegExpMatchArray) => {
        const timeWindow = match[1];
        const percentile = match[2];
        const operator = match[3];
        const threshold = match[4];
        const opText = operator === '>' ? 'exceeds' : operator === '<' ? 'falls below' : 'equals';
        return `Memory usage (${percentile}th percentile over ${timeWindow} minutes) ${opText} ${threshold}%`;
      }
    },
    // Disk utilization patterns
    {
      pattern: /DiskUtilization\[(\d+)m\]\.percentile\(\.(\d+)\)\s*([><=]+)\s*(\d+)/,
      readable: (match: RegExpMatchArray) => {
        const timeWindow = match[1];
        const percentile = match[2];
        const operator = match[3];
        const threshold = match[4];
        const opText = operator === '>' ? 'exceeds' : operator === '<' ? 'falls below' : 'equals';
        return `Disk usage (${percentile}th percentile over ${timeWindow} minutes) ${opText} ${threshold}%`;
      }
    },
    // Network patterns
    {
      pattern: /NetworkUtilization\[(\d+)m\]\.percentile\(\.(\d+)\)\s*([><=]+)\s*(\d+)/,
      readable: (match: RegExpMatchArray) => {
        const timeWindow = match[1];
        const percentile = match[2];
        const operator = match[3];
        const threshold = match[4];
        const opText = operator === '>' ? 'exceeds' : operator === '<' ? 'falls below' : 'equals';
        return `Network usage (${percentile}th percentile over ${timeWindow} minutes) ${opText} ${threshold}%`;
      }
    }
  ];
  
  // Try to match known patterns
  for (const { pattern, readable } of queryPatterns) {
    const match = query.match(pattern);
    if (match) {
      return readable(match);
    }
  }
  
  // If no pattern matches, return a simplified version
  return query.replace(/\[(\d+)m\]/g, ' (over $1 minutes)')
              .replace(/\.percentile\(\.(\d+)\)/g, ' ($1th percentile)')
              .replace(/>/g, ' exceeds ')
              .replace(/</g, ' falls below ')
              .replace(/=/g, ' equals ');
};

// Helper function to safely extract nested rawPayload
const extractNestedPayload = (alert: OCIAlert): any => {
  // Handle double-nested rawPayload structure
  if (alert.rawPayload?.rawPayload) {
    return alert.rawPayload.rawPayload;
  }
  // Handle single-nested structure
  if (alert.rawPayload) {
    return alert.rawPayload;
  }
  // Fallback to the alert itself
  return alert;
};

// Helper function to safely stringify metric values
const safeStringifyMetricValues = (metricValues: any): string => {
  if (!metricValues) return '';
  
  try {
    if (typeof metricValues === 'object') {
      if (Array.isArray(metricValues) && metricValues.length > 0) {
        // Handle array of metric values
        const firstMetric = metricValues[0];
        if (typeof firstMetric === 'object') {
          return Object.entries(firstMetric)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
        }
        return String(firstMetric);
      } else if (!Array.isArray(metricValues)) {
        // Handle object metric values
        return Object.entries(metricValues)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
      }
    }
    return String(metricValues);
  } catch (error) {
    console.warn('Error stringifying metric values:', error);
    return 'Unable to display metric values';
  }
};

export const processAlerts = (
  graylogAlerts: GraylogAlert[],
  ociAlerts: OCIAlert[],
  heartbeatAlerts: HeartbeatAlert[],
  filters: AlertFilters
): ProcessedAlert[] => {
  
  // Starting alert processing

  // ✅ CRITICAL: Return empty immediately if no source filters
  if (!filters.source || filters.source.length === 0) {
    // No source filter provided
    return [];
  }

  const processedAlerts: ProcessedAlert[] = [];

  // ✅ STRICT: Only process alerts that match current source filters
  const shouldProcessGraylog = filters.source.includes('Application Logs');
  const shouldProcessOCI = filters.source.includes('Infrastructure Alerts');
  const shouldProcessHeartbeat = filters.source.includes('Application Heartbeat');

  // Processing flags determined

  // Helper: Determine if an OCI alert is database-related
  // ✅ FIXED: Only match alerts that contain "DB" or "DATABASE" words
  const isDatabaseAlert = (alert: OCIAlert): boolean => {
    const vmName = (alert.vm || '').toLowerCase();
    const message = (alert.message || '').toLowerCase();
    const title = (alert.title || '').toLowerCase();
    const metricName = (alert.metricName || '').toLowerCase();
    const alertType = (alert.alertType || '').toLowerCase();
    const resourceDisplayName = (alert.resourceDisplayName || '').toLowerCase();
    const alarmSummary = (alert.alarmSummary || '').toLowerCase();
    
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
    
    // Check title for DB patterns (new webhook format)
    if (dbPatterns.some(pattern => title.includes(pattern))) {
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
    
    // Check resource display name for DB patterns
    if (dbPatterns.some(pattern => resourceDisplayName.includes(pattern))) {
      return true;
    }
    
    // Check alarm summary for DB patterns (new webhook format)
    if (dbPatterns.some(pattern => alarmSummary.includes(pattern))) {
      return true;
    }
    
    // ✅ SPECIFIC: Check for known database alert patterns in your system
    if (message.includes('pht_database_session_alarm') || 
        message.includes('gatra_sessions_alert') ||
        message.includes('dtc-db_alert') ||
        message.includes('qrydedb_') ||
        title.includes('pht_database_session_alarm') || 
        title.includes('gatra_sessions_alert') ||
        title.includes('dtc-db_alert') ||
        title.includes('qrydedb_') ||
        alarmSummary.includes('pht_database_session_alarm') || 
        alarmSummary.includes('gatra_sessions_alert') ||
        alarmSummary.includes('dtc-db_alert') ||
        alarmSummary.includes('qrydedb_')) {
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
    // Processing Graylog alerts
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
      // Added Graylog alert
    });
  } else if (shouldProcessGraylog) {
    // Should process Graylog but no alerts provided
  }

  // Process OCI alerts ONLY for Infrastructure Alerts  
  if (shouldProcessOCI && ociAlerts.length > 0) {
    // Process OCI alerts with new webhook format
    ociAlerts.forEach((alert, index) => {
      const source: 'Infrastructure Alerts' = 'Infrastructure Alerts';
      
      // Extract the nested payload safely
      const rawPayload = extractNestedPayload(alert);
      
      // Check if this is the new OCI webhook format
      if (rawPayload && rawPayload.alarmMetaData && rawPayload.alarmMetaData.length > 0) {
        // New OCI webhook format processing
        const alarmMeta = rawPayload.alarmMetaData[0]; // Use first alarm metadata
        const dimensions = alarmMeta.dimensions && alarmMeta.dimensions[0] ? alarmMeta.dimensions[0] : {};
        
        // 1. Title - Extract from rawPayload.title (bold at top)
        const alertTitle = rawPayload.title || alarmMeta.title || 'No title available';
        
        // 2. Severity - Extract from rawPayload.severity
        const severity = mapSeverity(rawPayload.severity || alarmMeta.severity, source);
        
        // 3. Create readable description from alarm summary and query
        const alarmSummary = alarmMeta.alarmSummary || '';
        const query = alarmMeta.query || '';
        const readableAlarmSummary = parseAlarmSummary(alarmSummary, query);
        const readableQuery = parseQuery(query);
        
        // 4. Add metric values to description if available
        let description = readableAlarmSummary;
        if (alarmMeta.metricValues && alarmMeta.metricValues.length > 0) {
          const metricInfo = safeStringifyMetricValues(alarmMeta.metricValues);
          if (metricInfo) {
            description += `. Current values: ${metricInfo}`;
          }
        }
        
        // 5. Resource Name - Extract from dimensions
        const resourceName = dimensions.resourceDisplayName || dimensions.resourceName || dimensions.hostName || 'Unknown Resource';
        
        // 6. Region - Extract from dimensions
        const region = dimensions.region || 'Unknown Region';
        
        // 7. Timestamp - Use rawPayload.timestamp (first timestamp)
        const timestamp = rawPayload.timestamp || alert.timestamp;
        
        // 8. Determine if database or server based on namespace or resource name
        const isDatabase = alarmMeta.namespace?.includes('database') || 
                          resourceName.toLowerCase().includes('db') || 
                          isDatabaseAlert(alert);
        const resourceType: 'Database' | 'Server' = isDatabase ? 'Database' : 'Server';
        
        const processedAlert = {
          id: alert._id || `oci-${rawPayload.dedupeKey || Date.now()}-${index}`,
          source,
          severity,
          title: alertTitle,
          description: description,
          timestamp,
          site: resourceName,
          category: isDatabase ? 'database' as const : 'infrastructure' as const,
          region,
          resourceType,
          resourceDisplayName: resourceName,
          metricValues: alarmMeta.metricValues || [],
          query: readableQuery,
          alarmSummary: readableAlarmSummary,
          alarmOCID: alarmMeta.id,
          namespace: alarmMeta.namespace,
          totalMetricsFiring: alarmMeta.totalMetricsFiring,
          alarmUrl: alarmMeta.alarmUrl,
          status: alarmMeta.status,
          shape: dimensions.shape,
          availabilityDomain: dimensions.availabilityDomain,
          faultDomain: dimensions.faultDomain,
          instancePoolId: dimensions.instancePoolId,
          notificationType: rawPayload.notificationType,
          version: rawPayload.version,
          timestampEpochMillis: rawPayload.timestampEpochMillis
        };
        
        processedAlerts.push(processedAlert);
      } else {
        // Legacy OCI alert format processing (fallback)
        const severity = mapSeverity(alert.severity, source);
        
        // Use title from new webhook format if available, otherwise fall back to message
        let alertTitle = alert.title || alert.message || 'No title available';
        
        // Clean up alert title - remove OCI prefixes
        alertTitle = alertTitle.replace(/^(OCI_|ALARM_|ERROR_)/i, '');
        
        // For new webhook format, don't add metric info to title as it will be shown separately
        // For old format, show metric information in the title
        if (!alert.title && alert.metricValues && Object.keys(alert.metricValues).length > 0) {
          const metricInfo = safeStringifyMetricValues(alert.metricValues);
          if (metricInfo) {
            alertTitle = `${alertTitle} - ${metricInfo}`;
          }
        } else if (!alert.title && alert.query) {
          // Extract metric from query if no metricValues available
          const queryMatch = alert.query.match(/^([A-Za-z]+)\[/);
          if (queryMatch) {
            alertTitle = `${alertTitle} - ${queryMatch[1]}`;
          }
        }
        
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

        const isDatabase = isDatabaseAlert(alert);
        const resourceType: 'Database' | 'Server' = isDatabase ? 'Database' : 'Server';
        const category: 'infrastructure' | 'database' = isDatabase ? 'database' : 'infrastructure';

        // Parse alarm summary and query into readable English
        const readableAlarmSummary = parseAlarmSummary(alert.alarmSummary || '', alert.query || '');
        const readableQuery = parseQuery(alert.query || '');

        const processedAlert = {
          id: alert._id || `oci-${alert.timestamp}-${index}`, // Ensure unique IDs
          source, // ✅ MUST be 'Infrastructure Alerts'
          severity,
          title: alertTitle,
          description: readableAlarmSummary, // Use parsed alarm summary
          timestamp: alert.timestamp,
          site: alert.vm,
          category: category,
          region: alert.region,
          compartment: alert.compartment,
          metricName: alert.metricName,
          tenant: alert.tenant,
          resourceType: resourceType,
          resourceDisplayName: alert.resourceDisplayName,
          metricValues: alert.metricValues,
          query: readableQuery, // Use parsed query
          // New webhook format fields
          alarmSummary: readableAlarmSummary, // Use parsed alarm summary
          shape: alert.shape,
          availabilityDomain: alert.availabilityDomain,
          faultDomain: alert.faultDomain,
          instancePoolId: alert.instancePoolId,
          // Status and timestamp fields
          status: alert.status,
          timestampEpochMillis: alert.timestampEpochMillis
        };

        processedAlerts.push(processedAlert);
        // Added Infrastructure alert
      }
    });
  } else if (shouldProcessOCI) {
    // Should process OCI but no alerts provided
  }

  // Process Heartbeat alerts ONLY for Application Heartbeat
  if (shouldProcessHeartbeat && heartbeatAlerts.length > 0) {
    // Processing Heartbeat alerts
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
      // Added Heartbeat alert
    });
  } else if (shouldProcessHeartbeat) {
    // Should process Heartbeat but no alerts provided
  }

  // Total processed alerts
  
  // ✅ VALIDATION: Check that all alerts have correct sources
  const sourceDistribution = processedAlerts.reduce((acc, alert) => {
    acc[alert.source] = (acc[alert.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  // Source distribution

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
    // Severity filter applied
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
    // Source safety filter applied
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

  // 🔍 DETAILED LOGGING: Final Result
  
  // Final result processed
  return sortedAlerts;
};