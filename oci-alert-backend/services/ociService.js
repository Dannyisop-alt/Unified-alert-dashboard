const oci = require('oci-sdk');

// Load OCI configuration from ~/.oci/config
const configurationFilePath = "~/.oci/config";
const configProfile = "DEFAULT";

console.log(`🔧 [CONFIG] Loading OCI configuration from: ${configurationFilePath}`);
console.log(`🔧 [CONFIG] Using profile: ${configProfile}`);

// Initialize OCI SDK clients for all necessary services
let provider, monitoringClient, identityClient, computeClient;

try {
    console.log(`🔧 [INIT] Initializing OCI authentication provider...`);
    provider = new oci.common.ConfigFileAuthenticationDetailsProvider(
        configurationFilePath,
        configProfile
    );
    console.log(`✅ [INIT] Authentication provider initialized successfully`);
    
    console.log(`🔧 [INIT] Initializing monitoring client...`);
    monitoringClient = new oci.monitoring.MonitoringClient({
        authenticationDetailsProvider: provider
    });
    console.log(`✅ [INIT] Monitoring client initialized successfully`);
    
    console.log(`🔧 [INIT] Initializing identity client...`);
    identityClient = new oci.identity.IdentityClient({
        authenticationDetailsProvider: provider
    });
    console.log(`✅ [INIT] Identity client initialized successfully`);
    
    console.log(`🔧 [INIT] Initializing compute client...`);
    computeClient = new oci.core.ComputeClient({
        authenticationDetailsProvider: provider
    });
    console.log(`✅ [INIT] Compute client initialized successfully`);
    
} catch (initError) {
    console.error(`❌ [INIT] Failed to initialize OCI clients:`, initError.message);
    console.error(`❌ [INIT] Stack trace:`, initError.stack);
}

// Caches for performance
const compartmentNameCache = new Map();
const instanceCache = new Map();
const instanceNameMap = new Map();

console.log(`🔧 [CACHE] Initialized performance caches`);

// Function to clear compartment cache for testing
const clearCompartmentCache = () => {
    compartmentNameCache.clear();
    console.log(`🧹 [CACHE] Compartment cache cleared`);
};

// Clear cache on startup to ensure fresh detection
clearCompartmentCache();

/**
 * Enhanced Tenant Name Extraction
 * Automatically detects compartment names without manual mapping.
 * Handles special cases like PaaS compartments and nested compartments.
 */
const getCompartmentName = async (compartmentId) => {
    console.log(`🏢 [COMPARTMENT] Getting compartment name for ID: ${compartmentId}`);
    
    if (compartmentNameCache.has(compartmentId)) {
        const cachedName = compartmentNameCache.get(compartmentId);
        console.log(`💾 [COMPARTMENT] Found in cache: ${cachedName}`);
        return cachedName;
    }
    
    try {
        console.log(`📡 [COMPARTMENT] Making API call to get compartment details...`);
        const compartment = await identityClient.getCompartment({
            compartmentId
        });
        console.log(`📡 [COMPARTMENT] API response received for compartment: ${compartment.compartment.name}`);
        
        let name = compartment.compartment.name;
        console.log(`🔍 [COMPARTMENT] Initial compartment name: ${name}`);

        // Handle nested compartments or special cases
        if (name === 'ManagedCompartmentForPaaS' || name.includes('ocid1.')) {
            console.log(`⚠️ [COMPARTMENT] Special case detected (${name}), checking parent compartment...`);
            if (compartment.compartment.parentCompartmentId) {
                try {
                    console.log(`📡 [COMPARTMENT] Fetching parent compartment: ${compartment.compartment.parentCompartmentId}`);
                    const parent = await identityClient.getCompartment({
                        compartmentId: compartment.compartment.parentCompartmentId
                    });
                    name = parent.compartment.name;
                    console.log(`✅ [COMPARTMENT] Using parent compartment name: ${name}`);
                } catch (parentError) {
                    console.log(`❌ [COMPARTMENT] Could not fetch parent compartment: ${parentError.message}`);
                }
            } else {
                console.log(`⚠️ [COMPARTMENT] No parent compartment ID available`);
            }
        }
        
        console.log(`💾 [COMPARTMENT] Caching compartment name: ${name}`);
        compartmentNameCache.set(compartmentId, name);
        console.log(`✅ [COMPARTMENT] Final compartment name: ${name}`);
        return name;
    } catch (error) {
        console.error(`❌ [COMPARTMENT] Error fetching compartment name for ${compartmentId}:`, error.message);
        console.error(`❌ [COMPARTMENT] Error stack:`, error.stack);
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
    console.log(`\n🚀 [MAIN] =====================================`);
    console.log(`🚀 [MAIN] Starting OCI Alerts Pull Process...`);
    console.log(`🚀 [MAIN] Timestamp: ${new Date().toISOString()}`);
    console.log(`🚀 [MAIN] =====================================\n`);
    
    try {
        console.log("📡 [MAIN] Pulling alerts from OCI...");
        
        console.log("🔧 [TENANCY] Getting tenancy ID...");
        const tenancyId = await provider.getTenantId();
        console.log(`✅ [TENANCY] Tenancy ID obtained: ${tenancyId}`);
        
        // 1. Fetch all instances to create a fast lookup map for VM names.
        console.log("\n📊 [INSTANCES] =====================================");
        console.log("📊 [INSTANCES] Fetching instances from compute service...");
        
        const instancesRequest = { 
            compartmentId: tenancyId, 
            compartmentIdInSubtree: true 
        };
        console.log(`📊 [INSTANCES] Request parameters:`, JSON.stringify(instancesRequest, null, 2));
        
        console.log(`📡 [INSTANCES] Making API call to list instances...`);
        const instancesResponse = await computeClient.listInstances(instancesRequest);
        console.log(`✅ [INSTANCES] API call completed successfully`);
        
        const instanceMap = new Map();
        console.log(`📊 [INSTANCES] Processing ${instancesResponse.items.length} instances...`);
        
        for (let i = 0; i < instancesResponse.items.length; i++) {
            const instance = instancesResponse.items[i];
            instanceMap.set(instance.id, instance.displayName);
            console.log(`📊 [INSTANCES] [${i + 1}/${instancesResponse.items.length}] ${instance.displayName} -> ${instance.id}`);
        }
        console.log(`✅ [INSTANCES] Instance map created with ${instanceMap.size} entries`);
        console.log("📊 [INSTANCES] =====================================\n");

        // 2. Fetch all currently firing alarms from the entire tenancy.
        console.log("🚨 [ALARMS] =====================================");
        console.log("🚨 [ALARMS] Fetching alarms from monitoring service...");
        
        const alarmsRequest = {
            compartmentId: tenancyId,
            compartmentIdInSubtree: true,
            lifecycleState: oci.monitoring.models.Alarm.LifecycleState.Active
        };
        console.log(`🚨 [ALARMS] Request parameters:`, JSON.stringify(alarmsRequest, null, 2));
        
        console.log(`📡 [ALARMS] Making API call to list alarms...`);
        const alarmsResponse = await monitoringClient.listAlarms(alarmsRequest);
        console.log(`✅ [ALARMS] API call completed successfully`);
        console.log(`🚨 [ALARMS] Found ${alarmsResponse.items.length} alarms to process`);
        console.log("🚨 [ALARMS] =====================================\n");
        
        const alerts = [];
        
        // 3. ✅ OPTIMIZED: Batch process alarms with parallel execution
        console.log("🔄 [PROCESSING] Starting optimized alarm processing...");
        
        // ✅ Create compartment cache to avoid repeated API calls
        const compartmentCache = new Map();
        
        // ✅ Process alarms in parallel batches for better performance
        const batchSize = 10; // Process 10 alarms at a time
        const batches = [];
        
        for (let i = 0; i < alarmsResponse.items.length; i += batchSize) {
            batches.push(alarmsResponse.items.slice(i, i + batchSize));
        }
        
        console.log(`📊 [BATCH] Processing ${alarmsResponse.items.length} alarms in ${batches.length} batches of ${batchSize}`);
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            console.log(`🔄 [BATCH ${batchIndex + 1}/${batches.length}] Processing ${batch.length} alarms...`);
            
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
            
            console.log(`✅ [BATCH ${batchIndex + 1}/${batches.length}] Completed - ${batchResults.filter(r => r).length} alerts processed`);
        }

        console.log("\n🔄 [PROCESSING] =====================================");
        console.log(`🎉 [COMPLETE] OCI Alert Pull Complete!`);
        console.log(`📊 [STATS] Total alarms processed: ${alarmsResponse.items.length}`);
        console.log(`📊 [STATS] Total alerts generated: ${alerts.length}`);
        console.log(`📊 [STATS] Success rate: ${((alerts.length / alarmsResponse.items.length) * 100).toFixed(1)}%`);
        console.log(`⏰ [COMPLETE] Process completed at: ${new Date().toISOString()}`);
        console.log(`🎉 [COMPLETE] =====================================\n`);
        
        return alerts;

    } catch (error) {
        console.error("\n❌ [CRITICAL] =====================================");
        console.error("❌ [CRITICAL] OCI Service Critical Error:", error.message);
        console.error("❌ [CRITICAL] Error stack:", error.stack);
        console.error("❌ [CRITICAL] Timestamp:", new Date().toISOString());
        console.error("❌ [CRITICAL] =====================================\n");
        
        // Don't create fake error alerts - return empty array instead
        // This ensures only real Oracle data gets through to the frontend
        console.log(`🚨 [CRITICAL] No alerts returned due to service error - frontend will show empty state`);
        return [];
    }
}

module.exports = {
    getOCIAlerts
};