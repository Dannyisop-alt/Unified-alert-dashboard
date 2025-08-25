const oci = require('oci-sdk');

// Load OCI configuration from ~/.oci/config
const configurationFilePath = "~/.oci/config";
const configProfile = "DEFAULT";

// Initialize OCI SDK clients for all necessary services
const provider = new oci.common.ConfigFileAuthenticationDetailsProvider(
  configurationFilePath,
  configProfile
);
const monitoringClient = new oci.monitoring.MonitoringClient({
  authenticationDetailsProvider: provider
});
const identityClient = new oci.identity.IdentityClient({
    authenticationDetailsProvider: provider
});
const computeClient = new oci.core.ComputeClient({
    authenticationDetailsProvider: provider
});

// A simple cache for compartment names to reduce redundant API calls
const compartmentNameCache = new Map();
const getCompartmentName = async (compartmentId) => {
    if (compartmentNameCache.has(compartmentId)) {
        return compartmentNameCache.get(compartmentId);
    }
    try {
        const compartment = await identityClient.getCompartment({ compartmentId });
        compartmentNameCache.set(compartmentId, compartment.compartment.name);
        return compartment.compartment.name;
    } catch (error) {
        console.error(`Error fetching compartment name for ${compartmentId}:`, error.message);
        return 'Unknown Tenant';
    }
};

/**
 * Fetches real alerts from OCI Monitoring Alarms,
 * enriching the data with human-readable VM and tenant names.
 * @returns {Array} An array of alerts formatted for your OciAlert model.
 */
async function getOCIAlerts() {
    try {
        console.log("Pulling alerts from OCI...");
        const tenancyId = await provider.getTenantId();
        
        // 1. Fetch all instances to create a fast lookup map for VM names.
        console.log("Fetching instances...");
        const instancesResponse = await computeClient.listInstances({ 
            compartmentId: tenancyId, 
            compartmentIdInSubtree: true 
        });
        const instanceMap = new Map();
        for (const instance of instancesResponse.items) {
            instanceMap.set(instance.id, instance.displayName);
        }
        console.log(`Found ${instanceMap.size} instances`);

        // 2. Fetch all currently firing alarms from the entire tenancy.
        console.log("Fetching alarms...");
        const alarmsRequest = {
            compartmentId: tenancyId,
            compartmentIdInSubtree: true,
            lifecycleState: oci.monitoring.models.Alarm.LifecycleState.Active // Keep as Active for now
        };
        const alarmsResponse = await monitoringClient.listAlarms(alarmsRequest);
        console.log(`Found ${alarmsResponse.items.length} alarms`);
        
        const alerts = [];

        // 3. Process each alarm, enriching the data with VM and tenant names.
        for (const alarm of alarmsResponse.items) {
            try {
                // Enhanced logic to extract VM OCID from various alarm sources
                let vmId = null;
                let vmName = 'N/A';
                
                console.log(`Processing alarm: ${alarm.displayName}`);
                console.log(`Alarm dimensions:`, alarm.dimensions);
                console.log(`Alarm query:`, alarm.query);
                
                // Method 1: Check dimensions (most common) - try multiple possible keys
                if (alarm.dimensions && typeof alarm.dimensions === 'object') {
                    vmId = alarm.dimensions.resourceId || 
                           alarm.dimensions.instanceId ||
                           alarm.dimensions.instance_id ||
                           alarm.dimensions.resourceName ||
                           alarm.dimensions.resource_id ||
                           alarm.dimensions.vmId;
                    
                    if (vmId) {
                        console.log(`Found vmId in dimensions: ${vmId}`);
                    }
                }
                
                // Method 2: Parse from query string - enhanced patterns
                if (!vmId && alarm.query) {
                    // Try multiple regex patterns for different alarm query formats
                    const patterns = [
                        /resourceId\s*=\s*"([^"]+)"/i,
                        /instanceId\s*=\s*"([^"]+)"/i,
                        /instance_id\s*=\s*"([^"]+)"/i,
                        /resourceName\s*=\s*"([^"]+)"/i,
                        /resource_id\s*=\s*"([^"]+)"/i,
                        /(ocid1\.instance\.[a-zA-Z0-9\._-]+)/i,
                        /resourceDisplayName\s*=\s*"([^"]+)"/i
                    ];
                    
                    for (const pattern of patterns) {
                        const match = alarm.query.match(pattern);
                        if (match) {
                            vmId = match[1];
                            console.log(`Found vmId in query with pattern ${pattern}: ${vmId}`);
                            break;
                        }
                    }
                }
                
                // Method 3: Check if alarm display name contains server names
                if (!vmId && alarm.displayName) {
                    const serverNames = [
                        'TURN-SERVER01', 'Graylog-01E', 'Graylog-01D', 'Graylog-01C', 
                        'Graylog-01B', 'Graylog-01A', 'ITMSL-Disp360-SCRT', 'ITMSL-Disp360',
                        'Portainer', 'METABASE-02', 'DB SOURCE'
                    ];
                    
                    for (const serverName of serverNames) {
                        if (alarm.displayName.toLowerCase().includes(serverName.toLowerCase())) {
                            vmName = serverName;
                            console.log(`Matched server name from alarm title: ${vmName}`);
                            break;
                        }
                    }
                }
                
                // Get VM name if we found an ID
                if (vmId && instanceMap.has(vmId)) {
                    vmName = instanceMap.get(vmId);
                    console.log(`Found VM name in instance map: ${vmName}`);
                } else if (vmId) {
                    // Try to fetch instance directly if not in map
                    try {
                        const instanceResponse = await computeClient.getInstance({ instanceId: vmId });
                        vmName = instanceResponse.instance.displayName;
                        console.log(`Directly fetched instance: ${vmName}`);
                    } catch (err) {
                        console.log(`Could not fetch instance ${vmId}: ${err.message}`);
                        // If vmId looks like an OCID, use a shortened version
                        if (vmId.startsWith('ocid1.')) {
                            vmName = vmId.split('.').pop()?.substring(0, 10) || vmId;
                        } else {
                            vmName = vmId; // Use OCID as fallback
                        }
                    }
                }
                
                // Get the tenant (compartment) name
                const tenantName = await getCompartmentName(alarm.compartmentId);

                alerts.push({
                    severity: alarm.severity.toLowerCase(),
                    message: alarm.body || alarm.displayName,
                    vm: vmName, 
                    tenant: tenantName,
                    region: provider.getRegion().regionId, 
                    compartment: alarm.compartmentId,
                    alertType: 'OCI_ALARM',
                    metricName: alarm.metric,
                    timestamp: alarm.timeUpdated
                });
                
                console.log(`Processed: ${alarm.displayName} -> VM: ${vmName}, Tenant: ${tenantName}`);
                
            } catch (alarmError) {
                console.error(`Error processing alarm:`, alarmError.message);
                // Still add the alarm with basic info
                alerts.push({
                    severity: (alarm.severity || 'info').toLowerCase(),
                    message: alarm.displayName || 'OCI Alarm',
                    vm: 'Error loading VM name',
                    tenant: 'Error loading tenant name',
                    region: provider.getRegion().regionId,
                    compartment: alarm.compartmentId,
                    alertType: 'OCI_ALARM',
                    metricName: alarm.metric || 'Unknown',
                    timestamp: alarm.timeUpdated || new Date()
                });
            }
        }

        console.log(`✅ OCI Alert Pull: Generated ${alerts.length} alerts from Alarms service.`);
        return alerts;

    } catch (error) {
        console.error("❌ OCI Service Error:", error.message);
        // Return some mock data for testing so your frontend doesn't break
        return [
            {
                severity: 'warning',
                message: 'OCI Service connection error: ' + error.message,
                vm: 'Connection Error',
                tenant: 'OCI Service',
                region: 'error',
                compartment: 'error',
                alertType: 'OCI_ERROR',
                metricName: 'ServiceError',
                timestamp: new Date()
            }
        ];
    }
}

module.exports = {
  getOCIAlerts
};