const oci = require('oci-sdk');

// Load OCI configuration from ~/.oci/config
const configurationFilePath = "~/.oci/config";
const configProfile = "DEFAULT";

// OCI Configuration loaded

// Initialize OCI SDK clients for all necessary services
let provider, monitoringClient, identityClient, computeClient;

try {
    provider = new oci.common.ConfigFileAuthenticationDetailsProvider(
        configurationFilePath,
        configProfile
    );
    
    monitoringClient = new oci.monitoring.MonitoringClient({
        authenticationDetailsProvider: provider
    });
    
    identityClient = new oci.identity.IdentityClient({
        authenticationDetailsProvider: provider
    });
    
    computeClient = new oci.core.ComputeClient({
        authenticationDetailsProvider: provider
    });
    
} catch (initError) {
    console.error(`❌ Failed to initialize OCI clients:`, initError.message);
}

// Caches for performance
const compartmentNameCache = new Map();
const instanceCache = new Map();
const instanceNameMap = new Map();

// Performance caches initialized

// Function to clear compartment cache for testing
const clearCompartmentCache = () => {
    compartmentNameCache.clear();
};

// Clear cache on startup to ensure fresh detection
clearCompartmentCache();

/**
 * Enhanced Tenant Name Extraction
 * Automatically detects compartment names without manual mapping.
 * Handles special cases like PaaS compartments and nested compartments.
 */
const getCompartmentName = async (compartmentId) => {
    // Getting compartment name
    
    if (compartmentNameCache.has(compartmentId)) {
        const cachedName = compartmentNameCache.get(compartmentId);
        // Found in cache
        return cachedName;
    }
    
    try {
        // Making API call
        const compartment = await identityClient.getCompartment({
            compartmentId
        });
        // API response received
        
        let name = compartment.compartment.name;
        // Processing compartment name

        // Handle nested compartments or special cases
        if (name === 'ManagedCompartmentForPaaS' || name.includes('ocid1.')) {
            // Special case detected
            if (compartment.compartment.parentCompartmentId) {
                try {
                    // Fetching parent compartment
                    const parent = await identityClient.getCompartment({
                        compartmentId: compartment.compartment.parentCompartmentId
                    });
                    name = parent.compartment.name;
                    // Using parent compartment name
                } catch (parentError) {
                    console.error(`❌ Could not fetch parent compartment: ${parentError.message}`);
                }
            } else {
                // No parent compartment ID available
            }
        }
        
        // Caching compartment name
        compartmentNameCache.set(compartmentId, name);
        // Final compartment name
        return name;
    } catch (error) {
        console.error(`❌ Error fetching compartment name for ${compartmentId}:`, error.message);
        return 'Unknown Tenant';
    }
};

/**
 * ✅ OPTIMIZED: Fast Server Name Extraction
 * Minimal logging for maximum performance
 */
const extractVmInfo = async (alarm, instanceMap) => {
    let vmId = null;
    let vmName = 'N/A';
    
    // Method 1: Check dimensions (most common) - try multiple possible keys
    if (alarm.dimensions && typeof alarm.dimensions === 'object') {
        vmId = alarm.dimensions.resourceId || 
                   alarm.dimensions.instanceId ||
                   alarm.dimensions.instance_id ||
                   alarm.dimensions.resourceName ||
                   alarm.dimensions.resource_id ||
                   alarm.dimensions.vmId;
    }
    
    // Method 2: Parse from query string - enhanced patterns
    if (!vmId && alarm.query) {
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
                break;
            }
        }
    }
    
    // Get VM name if we found an ID
    if (vmId) {
        if (instanceMap.has(vmId)) {
            vmName = instanceMap.get(vmId);
        } else {
            // ✅ OPTIMIZED: Skip direct API calls for performance - use vmId as fallback
            if (vmId.includes('ocid1.instance')) {
                const parts = vmId.split('.');
                vmName = parts[parts.length - 1] || vmId;
            } else {
                vmName = vmId;
            }
        }
    }
    
    return { vmId, vmName };
};

/**
 * Fetches real alerts from OCI Monitoring Alarms,
 * enriching the data with human-readable VM and tenant names.
 * @returns {Array} An array of alerts formatted for your OciAlert model.
 */
async function getOCIAlerts() {
    try {
        const tenancyId = await provider.getTenantId();
        
        // 1. Fetch all instances to create a fast lookup map for VM names.
        const instancesRequest = { 
            compartmentId: tenancyId, 
            compartmentIdInSubtree: true 
        };
        
        const instancesResponse = await computeClient.listInstances(instancesRequest);
        
        const instanceMap = new Map();
        for (let i = 0; i < instancesResponse.items.length; i++) {
            const instance = instancesResponse.items[i];
            instanceMap.set(instance.id, instance.displayName);
        }

        // 2. Fetch all currently firing alarms from the entire tenancy.
        const alarmsRequest = {
            compartmentId: tenancyId,
            compartmentIdInSubtree: true,
            lifecycleState: oci.monitoring.models.Alarm.LifecycleState.Active
        };
        const alarmsResponse = await monitoringClient.listAlarms(alarmsRequest);
        // Alarms fetched successfully
        
        const alerts = [];
        
        // 3. ✅ OPTIMIZED: Batch process alarms with parallel execution
        
        // ✅ Create compartment cache to avoid repeated API calls
        const compartmentCache = new Map();
        
        // ✅ Process alarms in parallel batches for better performance
        const batchSize = 10; // Process 10 alarms at a time
        const batches = [];
        
        for (let i = 0; i < alarmsResponse.items.length; i += batchSize) {
            batches.push(alarmsResponse.items.slice(i, i + batchSize));
        }
        
        // Processing alarms in batches
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            // Processing batch
            
            // ✅ Process batch in parallel
            const batchPromises = batch.map(async (alarm, index) => {
                try {
                    // ✅ Fast VM extraction using cached instance map
                    const { vmName } = await extractVmInfo(alarm, instanceMap);
                    
                    // ✅ Fast tenant extraction using cache
                    let tenantName;
                    if (compartmentCache.has(alarm.compartmentId)) {
                        tenantName = compartmentCache.get(alarm.compartmentId);
                    } else {
                        tenantName = await getCompartmentName(alarm.compartmentId);
                        compartmentCache.set(alarm.compartmentId, tenantName);
                    }
                    
                    // ✅ Fast timestamp extraction
                    const alertTimestamp = alarm.timeUpdated ? 
                        new Date(alarm.timeUpdated).toISOString() : 
                        alarm.timeCreated ? 
                        new Date(alarm.timeCreated).toISOString() : 
                        new Date().toISOString();
                    
                    const message = alarm.body || alarm.displayName;
                    
                    return {
                        id: alarm.id,
                        severity: alarm.severity.toLowerCase(),
                        message: message,
                        vm: vmName, 
                        tenant: tenantName,
                        region: provider.getRegion().regionId, 
                        compartment: alarm.compartmentId,
                        alertType: 'OCI_ALARM',
                        metricName: alarm.metric,
                        threshold: alarm.threshold,
                        currentValue: undefined,
                        unit: undefined,
                        timestamp: alertTimestamp
                    };
                    
                } catch (alarmError) {
                    console.error(`❌ [BATCH ${batchIndex + 1}] Error processing alarm ${alarm.displayName}:`, alarmError.message);
                    return null; // Skip failed alarms
                }
            });
            
            // ✅ Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            
            // ✅ Add successful results to alerts array
            batchResults.forEach(result => {
                if (result) {
                    alerts.push(result);
                }
            });
            
            // Batch completed
        }

        // OCI Alert Pull Complete
        
        return alerts;

    } catch (error) {
        console.error("\n❌ [CRITICAL] =====================================");
        console.error("❌ [CRITICAL] OCI Service Critical Error:", error.message);
        console.error("❌ [CRITICAL] Error stack:", error.stack);
        console.error("❌ [CRITICAL] Timestamp:", new Date().toISOString());
        console.error("❌ [CRITICAL] =====================================\n");
        
        // Don't create fake error alerts - return empty array instead
        // This ensures only real Oracle data gets through to the frontend
        // No alerts returned due to service error
        return [];
    }
}

module.exports = {
    getOCIAlerts
};