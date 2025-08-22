import type { GraylogAlert, OCIAlert } from '@/types/alerts';

export const mockGraylogAlerts: GraylogAlert[] = [
  {
    channel: "#transit-systems-surveillance",
    shortMessage: "Camera system offline", 
    fullMessage: "Surveillance camera at Platform 3 RTD-PROD-02 has lost connection",
    severity: "critical",
    color: "#FF0000",
    timestamp: "2025-08-13T06:32:00Z"
  },
  {
    channel: "#passenger-info-display",
    shortMessage: "Display system warning",
    fullMessage: "High CPU usage detected on passenger info display RTD-PROD-01 (85%)",
    severity: "medium",
    color: "#FFA500",
    timestamp: "2025-08-13T06:28:15Z"
  },
  {
    channel: "#ticketing-validation",
    shortMessage: "Validator offline",
    fullMessage: "Ticket validator unit 12 at North Station is unresponsive",
    severity: "critical",
    color: "#FF0000",
    timestamp: "2025-08-13T06:15:30Z"
  },
  {
    channel: "#train-tracking",
    shortMessage: "GPS tracking issue",
    fullMessage: "Train 4782 GPS signal lost near downtown corridor",
    severity: "medium",
    color: "#FFA500",
    timestamp: "2025-08-13T06:10:45Z"
  },
  {
    channel: "#station-security",
    shortMessage: "Access control alert",
    fullMessage: "Unauthorized access attempt at maintenance door B-12",
    severity: "critical",
    color: "#FF0000",
    timestamp: "2025-08-13T06:08:30Z"
  },
  {
    channel: "#communication-systems",
    shortMessage: "Radio system degraded",
    fullMessage: "Communication with field units experiencing intermittent issues",
    severity: "medium",
    color: "#FFA500",
    timestamp: "2025-08-13T05:45:20Z"
  },
  {
    channel: "#power-management",
    shortMessage: "Power fluctuation detected",
    fullMessage: "Voltage irregularities detected at East Terminal substation",
    severity: "medium",
    color: "#FFA500",
    timestamp: "2025-08-13T05:30:15Z"
  },
  {
    channel: "#environmental-monitoring",
    shortMessage: "Air quality alert",
    fullMessage: "CO2 levels elevated in underground section tunnel-7",
    severity: "critical",
    color: "#FF0000",
    timestamp: "2025-08-13T05:15:45Z"
  }
];

export const mockOCIAlerts: OCIAlert[] = [
  {
    severity: "info",
    message: "All services operational",
    vm: "RTD-PROD-01",
    tenant: "production",
    region: "us-east-1",
    timestamp: "2025-08-11T06:23:45Z"
  },
  {
    severity: "critical",
    message: "Web service down",
    vm: "RTD-PROD-02",
    tenant: "production", 
    region: "us-east-1",
    timestamp: "2025-08-11T06:21:12Z"
  },
  {
    severity: "medium",
    message: "IVR reporting warnings",
    vm: "RTD-DEV-01",
    tenant: "development",
    region: "us-west-2",
    timestamp: "2025-08-11T06:20:30Z"
  },
  {
    severity: "medium",
    message: "Database performance degraded",
    vm: "RTD-STAGE-01",
    tenant: "staging",
    region: "us-west-2",
    timestamp: "2025-08-11T06:19:15Z"
  }
];