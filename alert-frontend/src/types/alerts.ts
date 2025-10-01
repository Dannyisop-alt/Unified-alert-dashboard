export interface GraylogAlert {
  _id?: string;
  channel: string;
  shortMessage: string;
  fullMessage?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown';
  color?: string;
  username?: string;
  iconEmoji?: string;
  timestamp: string;
  read?: boolean;
}

// New OCI Webhook Structure Types
export interface OCIDimension {
  hostName?: string;
  deploymentType?: string;
  resourceId?: string;
  resourceName?: string;
  instanceNumber?: string;
  instanceName?: string;
  resourceName_database?: string;
  resourceId_database?: string;
  instancePoolId?: string;
  resourceDisplayName?: string;
  faultDomain?: string;
  availabilityDomain?: string;
  imageId?: string;
  shape?: string;
  dedicatedVmHostId?: string;
  region?: string;
}

export interface OCIMetricValue {
  [key: string]: string;
}

export interface OCIAlarmMetadata {
  id: string;
  status: string;
  severity: string;
  namespace: string;
  query: string;
  totalMetricsFiring: number;
  dimensions: OCIDimension[];
  alarmUrl: string;
  alarmSummary: string;
  metricValues: OCIMetricValue[];
}

export interface OCIRawPayload {
  dedupeKey: string;
  title: string;
  type: string;
  severity: string;
  timestampEpochMillis: number;
  timestamp: string;
  alarmMetaData: OCIAlarmMetadata[];
  notificationType: string;
  version: number;
}

export interface OCIRawWebhook {
  timestamp: string;
  alertType: string;
  source: string;
  rawPayload: OCIRawPayload;
}

export interface OCIAlert {
  _id?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'error' | 'warning';
  message: string;
  vm: string;
  tenant: string;
  region?: string;
  compartment?: string;
  alertType?: string;
  metricName?: string;
  threshold?: number;
  currentValue?: number;
  unit?: string;
  resourceDisplayName?: string;
  metricValues?: Record<string, string>;
  query?: string;
  timestamp: string;
  read?: boolean;
  // Webhook-specific fields (not sent to frontend)
  webhookReceivedAt?: string;
  alarmOCID?: string;
  dedupeKey?: string;
  imageId?: string;
  resourceId?: string;
  // New webhook format fields
  alarmSummary?: string;
  title?: string;
  shape?: string;
  availabilityDomain?: string;
  faultDomain?: string;
  instancePoolId?: string;
  // New fields for status and timestamp display
  status?: string;
  timestampEpochMillis?: number;
  // Raw webhook data for new OCI format
  rawPayload?: OCIRawWebhook;
}

export interface AlertFilters {
  severity: string[];
  source: string[];
  channel: string[];
  timeRange: string;
  searchText: string;
  dynamicFilter: string;
  region?: string;
  resourceType?: string;
}

export type AlertCategory = 'heartbeat' | 'logs' | 'infrastructure' | 'database' | null;

export interface UserPreferences {
  defaultCategory: AlertCategory;
  enabledSources: string[];
}

export interface ProcessedAlert {
  id: string;
  source: 'Application Logs' | 'Application Heartbeat' | 'Infrastructure Alerts';
  severity: 'Critical' | 'Warning' | 'Error' | 'Info';
  title: string;
  description: string;
  timestamp: string;
  site?: string;
  services?: {
    name: string;
    status: 'OK' | 'ERR' | 'WARN';
  }[];
  category: AlertCategory;
  
  // OCI-specific fields
  region?: string;
  compartment?: string;
  metricName?: string;
  tenant?: string;
  resourceType?: 'Database' | 'Server';
  resourceDisplayName?: string;
  metricValues?: Record<string, string>;
  query?: string;
  // New webhook format fields
  alarmSummary?: string;
  shape?: string;
  availabilityDomain?: string;
  faultDomain?: string;
  instancePoolId?: string;
  // New fields for status and timestamp display
  status?: string;
  timestampEpochMillis?: number;
  // New OCI webhook specific fields
  alarmOCID?: string;
  namespace?: string;
  totalMetricsFiring?: number;
  alarmUrl?: string;
  notificationType?: string;
  version?: number;
}