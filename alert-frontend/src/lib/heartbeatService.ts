interface HeartbeatSystem {
  SITE: string;
  SITENAME: string;
  SITETYPE: 'MULTI' | 'STANDALONE';
  WEB: 'GREEN' | 'RED' | 'ORANGE' | '...';
  DB: 'GREEN' | 'RED' | 'ORANGE' | '...';
  MTSERVER: 'GREEN' | 'RED' | 'ORANGE' | '...';
  IVRRPT: 'GREEN' | 'RED' | 'ORANGE' | '...';
  UPD_DATETIME: string;
}

export interface HeartbeatAlert {
  id: string;
  site: string;
  siteName: string;
  service: string;
  status: 'GREEN' | 'RED' | 'ORANGE';
  severity: 'critical' | 'medium' | 'info';
  message: string;
  timestamp: string;
  siteType: 'MULTI' | 'STANDALONE';
}

class HeartbeatService {
  private config = {
    wsUrl: 'wss://hbc.hbssweb.com:4950',
    timeout: 10000,
    debug: true
  };

  private isErrorStatus = (status: string): boolean => {
    return status === 'RED' || status === 'ORANGE';
  };

  private isCriticalSystem = (siteName: string): boolean => {
    const criticalSystems = [
      'LOCATIONSERVER', 'HAPROXY', 'CONFIGSERVICEWS', 
      'QRYDEAPPSERVER', 'QRYDE', 'OSRMSERVER', 
      'PENQUIS_SS_MAINE', 'WPSITE', 'GPSVOXQRYDETRACKER', 
      'ESSTS_CTSNOVUS', '_AAL', '-GSE'
    ];
    
    const upperSiteName = siteName?.toUpperCase() || '';
    return criticalSystems.some(critical => upperSiteName.includes(critical));
  };

  private convertToAlerts = (systems: HeartbeatSystem[]): HeartbeatAlert[] => {
    const alerts: HeartbeatAlert[] = [];

    systems.forEach(system => {
      const services = ['WEB', 'DB', 'MTSERVER', 'IVRRPT'] as const;
      
      services.forEach(service => {
        const status = system[service];
        
        // Skip if status is undefined or "..."
        if (!status || status === '...') {
          return;
        }
        
        // Create alerts for all systems (including healthy ones)
        let severity: 'critical' | 'medium' | 'info' = 'info';
        let message = '';

        if (status === 'RED') {
          severity = 'critical';
          message = `${service} service is down on ${system.SITENAME}`;
        } else if (status === 'ORANGE') {
          severity = 'medium';
          message = `${service} service has warnings on ${system.SITENAME}`;
        } else if (status === 'GREEN') {
          severity = 'info';
          if (system.SITETYPE === 'STANDALONE') {
            message = `${system.SITENAME} system is operational`;
          } else {
            message = `${service} service on ${system.SITENAME} is operational`;
          }
        }

        if (message) {
          alerts.push({
            id: `heartbeat-${system.SITE}-${service}-${system.UPD_DATETIME}`,
            site: system.SITE,
            siteName: system.SITENAME,
            service,
            status: status as 'GREEN' | 'RED' | 'ORANGE', // We've already filtered out "..." above
            severity,
            message,
            timestamp: system.UPD_DATETIME,
            siteType: system.SITETYPE
          });
        }
      });
    });

    return alerts;
  };

  async fetchHeartbeatData(): Promise<HeartbeatAlert[]> {
    return new Promise((resolve, reject) => {
      let dataReceived = false;
      let connectionError = false;

      try {
        const ws = new WebSocket(this.config.wsUrl);
        
        const timeoutId = setTimeout(() => {
          if (!dataReceived) {
            connectionError = true;
            if (this.config.debug) console.log('⏱️ Heartbeat connection timeout');
            ws.close();
            reject(new Error('Heartbeat connection timeout')); // Reject instead of empty array
          }
        }, this.config.timeout);

        ws.onopen = () => {
          if (this.config.debug) console.log('✅ Heartbeat WebSocket connected');
          ws.send('GetConStatus~Y');
        };

        ws.onmessage = (event) => {
          dataReceived = true;
          clearTimeout(timeoutId);
          
          try {
            const jsonData: HeartbeatSystem[] = JSON.parse(event.data);
            if (jsonData && jsonData.length > 0) {
              const alerts = this.convertToAlerts(jsonData);
              if (this.config.debug) console.log(`📊 Converted ${jsonData.length} systems to ${alerts.length} heartbeat alerts`);
              resolve(alerts);
            } else {
              resolve([]);
            }
          } catch (parseError) {
            console.error('❌ Error parsing heartbeat data:', parseError);
            reject(new Error('Failed to parse heartbeat data'));
          }
          
          ws.close();
        };

        ws.onerror = (error) => {
          clearTimeout(timeoutId);
          if (!dataReceived && !connectionError) {
            console.error('❌ Heartbeat WebSocket error:', error);
            reject(new Error('Heartbeat WebSocket error'));
          }
        };

        ws.onclose = () => {
          clearTimeout(timeoutId);
          if (!dataReceived && !connectionError) {
            reject(new Error('Heartbeat WebSocket closed unexpectedly'));
          }
        };

      } catch (error) {
        console.error('❌ Failed to create heartbeat WebSocket:', error);
        reject(new Error('Failed to create heartbeat WebSocket'));
      }
    });
  }
}

export const heartbeatService = new HeartbeatService();