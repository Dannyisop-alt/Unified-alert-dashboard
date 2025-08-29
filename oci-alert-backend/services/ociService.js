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

/**
 * Enhanced Tenant Name Extraction
 * Handles special cases, like PaaS compartments, and now includes a manual mapping
 * for known IDs that are not correctly resolved by the API.
 */
const getCompartmentName = async (compartmentId) => {
    console.log(`🏢 [COMPARTMENT] Getting compartment name for ID: ${compartmentId}`);
    
    // Manual mapping for known issues
    const manualMappings = {
        'ocid1.compartment.oc1..aaaaaaaaln6a3g7t5f5i4a7z6f4q6c8r4s9b6e1r7e4i4g1h5a8h': 'DTC',
        'ocid1.compartment.oc1..aaaaaaaay7g8g6m7c2e1f1h4z1y2h8n1s4t1o3i1e3s2t3a9f7d3a': 'CommonResources',
        'ocid1.compartment.oc1..aaaaaaaanb7v6z2h4q2f4v2h2v4c1h6o3p9r2h4g1o6d2s3a2m3r4': 'GATRA',
        'ocid1.compartment.oc1..aaaaaaaaeu2v3t8s1d3s9p2w8g3m3z6v7m3w4s5r7e4x4u9h4o4w6a': 'GDOT',
        'ocid1.compartment.oc1..aaaaaaaacv2b4c1h4c9g4i2v2o6y1h6p3r4h2k1n4p1j3t2m3r1s3e': 'MART-PROD',
        'ocid1.compartment.oc1..aaaaaaaacm6q1h6z2q2o1h3w2p3o4v1y4g2k2g4i1e3j2q3d2g4y1a': 'Vendors',
        'ocid1.compartment.oc1..aaaaaaaagp6s2y9c2c2x9g3c2d4v8v2s4x7h3m4f2g5t3v1t6m2c2y': 'Transit',
        'ocid1.compartment.oc1..aaaaaaaakv6v7w3x2m3k7h3h2k2x5h6x4p8v2m3m4e1s6w6t2d4t9e': 'TRANWARE'
    };

    if (manualMappings[compartmentId]) {
        console.log(`✅ [COMPARTMENT] Found in manual mappings: ${manualMappings[compartmentId]}`);
        return manualMappings[compartmentId];
    }
    
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
 * Enhanced Server Name Extraction
 * Updated to include new patterns for both queries and display names.
 */
const extractVmInfo = async (alarm, instanceMap, instanceNameMap) => {
    let vmId = null;
    let vmName = 'N/A';
    
    console.log(`\n🔍 [VM_EXTRACT] =====================================`);
    console.log(`🔍 [VM_EXTRACT] Processing alarm: ${alarm.displayName}`);
    console.log(`🔍 [VM_EXTRACT] Alarm ID: ${alarm.id}`);
    console.log(`🔍 [VM_EXTRACT] Alarm dimensions:`, JSON.stringify(alarm.dimensions, null, 2));
    console.log(`🔍 [VM_EXTRACT] Alarm query:`, alarm.query);
    console.log(`🔍 [VM_EXTRACT] Instance map size: ${instanceMap.size}`);
    
    // Method 1: Check dimensions (most common) - try multiple possible keys
    if (alarm.dimensions && typeof alarm.dimensions === 'object') {
        console.log(`🔍 [VM_EXTRACT] Method 1: Checking dimensions object...`);
        const dimensionKeys = Object.keys(alarm.dimensions);
        console.log(`🔍 [VM_EXTRACT] Available dimension keys: ${dimensionKeys.join(', ')}`);
        
        vmId = alarm.dimensions.resourceId || 
                   alarm.dimensions.instanceId ||
                   alarm.dimensions.instance_id ||
                   alarm.dimensions.resourceName ||
                   alarm.dimensions.resource_id ||
                   alarm.dimensions.vmId;
        
        if (vmId) {
            console.log(`✅ [VM_EXTRACT] Found vmId in dimensions: ${vmId}`);
        } else {
            console.log(`⚠️ [VM_EXTRACT] No vmId found in dimensions`);
        }
    } else {
        console.log(`⚠️ [VM_EXTRACT] No dimensions object found or invalid type`);
    }
    
    // Method 2: Parse from query string - enhanced patterns
    if (!vmId && alarm.query) {
        console.log(`🔍 [VM_EXTRACT] Method 2: Parsing query string...`);
        console.log(`🔍 [VM_EXTRACT] Query to parse: ${alarm.query}`);
        
        // Try multiple regex patterns for different alarm query formats
        const patterns = [
            { name: 'resourceId', pattern: /resourceId\s*=\s*"([^"]+)"/i },
            { name: 'instanceId', pattern: /instanceId\s*=\s*"([^"]+)"/i },
            { name: 'instance_id', pattern: /instance_id\s*=\s*"([^"]+)"/i },
            { name: 'resourceName', pattern: /resourceName\s*=\s*"([^"]+)"/i },
            { name: 'resource_id', pattern: /resource_id\s*=\s*"([^"]+)"/i },
            { name: 'ocid_pattern', pattern: /(ocid1\.instance\.[a-zA-Z0-9\._-]+)/i },
            { name: 'resourceDisplayName', pattern: /resourceDisplayName\s*=\s*"([^"]+)"/i }
        ];
        
        for (const { name, pattern } of patterns) {
            console.log(`🔍 [VM_EXTRACT] Trying pattern '${name}': ${pattern}`);
            const match = alarm.query.match(pattern);
            if (match) {
                vmId = match[1];
                console.log(`✅ [VM_EXTRACT] Found vmId in query with pattern '${name}': ${vmId}`);
                break;
            } else {
                console.log(`❌ [VM_EXTRACT] Pattern '${name}' did not match`);
            }
        }
        
        if (!vmId) {
            console.log(`⚠️ [VM_EXTRACT] No vmId found in query after trying all patterns`);
        }
    } else if (!alarm.query) {
        console.log(`⚠️ [VM_EXTRACT] No query string available for parsing`);
    }
    
    // Method 3: Check if alarm display name contains server names
    if (!vmId && alarm.displayName) {
        console.log(`🔍 [VM_EXTRACT] Method 3: Checking alarm display name for server names...`);
        const serverNames = [
            'TURN-SERVER01', 'Graylog-01E', 'Graylog-01D', 'Graylog-01C', 
            'Graylog-01B', 'Graylog-01A', 'ITMSL-Disp360-SCRT', 'ITMSL-Disp360',
            'Portainer', 'METABASE-02', 'DB SOURCE'
        ];
        
        console.log(`🔍 [VM_EXTRACT] Known server names to check: ${serverNames.join(', ')}`);
        
        for (const serverName of serverNames) {
            console.log(`🔍 [VM_EXTRACT] Checking if '${alarm.displayName}' contains '${serverName}'...`);
            if (alarm.displayName.toLowerCase().includes(serverName.toLowerCase())) {
                vmName = serverName;
                console.log(`✅ [VM_EXTRACT] Matched server name from alarm title: ${vmName}`);
                break;
            }
        }
        
        if (vmName === 'N/A') {
            console.log(`⚠️ [VM_EXTRACT] No known server names found in alarm display name`);
        }
    }
    
    // Get VM name if we found an ID
    if (vmId) {
        console.log(`🔍 [VM_EXTRACT] VM ID found, attempting to resolve name...`);
        
        if (instanceMap.has(vmId)) {
            vmName = instanceMap.get(vmId);
            console.log(`✅ [VM_EXTRACT] Found VM name in instance map: ${vmName}`);
        } else {
            console.log(`⚠️ [VM_EXTRACT] VM ID not found in instance map, attempting direct API call...`);
            // Try to fetch instance directly if not in map
            try {
                console.log(`📡 [VM_EXTRACT] Making direct API call for instance: ${vmId}`);
                const instanceResponse = await computeClient.getInstance({ instanceId: vmId });
                vmName = instanceResponse.instance.displayName;
                console.log(`✅ [VM_EXTRACT] Directly fetched instance name: ${vmName}`);
                
                // Add to map for future use
                instanceMap.set(vmId, vmName);
                console.log(`💾 [VM_EXTRACT] Added instance to map for future use`);
            } catch (err) {
                console.log(`❌ [VM_EXTRACT] Could not fetch instance ${vmId}: ${err.message}`);
                console.log(`❌ [VM_EXTRACT] Error stack:`, err.stack);
                
                // If vmId looks like an OCID, use a shortened version
                if (vmId.startsWith('ocid1.')) {
                    vmName = vmId.split('.').pop()?.substring(0, 10) || vmId;
                    console.log(`🔧 [VM_EXTRACT] Using shortened OCID as name: ${vmName}`);
                } else {
                    vmName = vmId; // Use OCID as fallback
                    console.log(`🔧 [VM_EXTRACT] Using full ID as name: ${vmName}`);
                }
            }
        }
    } else {
        console.log(`⚠️ [VM_EXTRACT] No VM ID found through any method`);
    }
    
    console.log(`🔍 [VM_EXTRACT] Final result - VM ID: ${vmId || 'null'}, VM Name: ${vmName}`);
    console.log(`🔍 [VM_EXTRACT] =====================================\n`);
    
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
        
        // 3. Process each alarm with enhanced extraction
        console.log("🔄 [PROCESSING] =====================================");
        console.log("🔄 [PROCESSING] Starting alarm processing loop...");
        
        for (let i = 0; i < alarmsResponse.items.length; i++) {
            const alarm = alarmsResponse.items[i];
            const alarmIndex = i + 1;
            const totalAlarms = alarmsResponse.items.length;
            
            console.log(`\n🔄 [PROCESSING] [${alarmIndex}/${totalAlarms}] Processing alarm: ${alarm.displayName}`);
            console.log(`🔄 [PROCESSING] [${alarmIndex}/${totalAlarms}] Alarm ID: ${alarm.id}`);
            
            try {
                // Fetch alert history to get the precise firing timestamp
                console.log(`📡 [HISTORY] [${alarmIndex}/${totalAlarms}] Fetching alarm history...`);
                const alarmHistoryRequest = {
                    alarmId: alarm.id
                };
                console.log(`📡 [HISTORY] [${alarmIndex}/${totalAlarms}] History request:`, JSON.stringify(alarmHistoryRequest, null, 2));
                
                const alarmHistoryResponse = await monitoringClient.listAlarmHistory(alarmHistoryRequest);
                console.log(`✅ [HISTORY] [${alarmIndex}/${totalAlarms}] History API call completed`);
                console.log(`📊 [HISTORY] [${alarmIndex}/${totalAlarms}] History items count: ${alarmHistoryResponse.items?.length || 0}`);
                
                const latestHistory = alarmHistoryResponse.items?.[0]?.historySummary;
                if (latestHistory) {
                    console.log(`📊 [HISTORY] [${alarmIndex}/${totalAlarms}] Latest history summary:`, JSON.stringify(latestHistory, null, 2));
                } else {
                    console.log(`⚠️ [HISTORY] [${alarmIndex}/${totalAlarms}] No history summary available`);
                }
                
                // Extract VM and tenant information
                console.log(`🔍 [EXTRACT] [${alarmIndex}/${totalAlarms}] Extracting VM information...`);
                const { vmName } = await extractVmInfo(alarm, instanceMap);
                console.log(`✅ [EXTRACT] [${alarmIndex}/${totalAlarms}] VM extraction completed: ${vmName}`);
                
                console.log(`🏢 [EXTRACT] [${alarmIndex}/${totalAlarms}] Extracting tenant information...`);
                const tenantName = await getCompartmentName(alarm.compartmentId);
                console.log(`✅ [EXTRACT] [${alarmIndex}/${totalAlarms}] Tenant extraction completed: ${tenantName}`);

                const alertTimestamp = latestHistory?.timestamp || alarm.timeUpdated || alarm.timeCreated;
                console.log(`⏰ [TIMESTAMP] [${alarmIndex}/${totalAlarms}] Alert timestamp: ${alertTimestamp}`);
                
                const message = latestHistory?.summary || alarm.body || alarm.displayName;
                console.log(`📝 [MESSAGE] [${alarmIndex}/${totalAlarms}] Alert message: ${message}`);
                
                const alertData = {
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
                    currentValue: latestHistory?.namespaceId ? latestHistory.datum?.value : undefined,
                    unit: latestHistory?.datum?.unit,
                    timestamp: alertTimestamp
                };
                
                alerts.push(alertData);
                
                console.log(`✅ [ALERT] [${alarmIndex}/${totalAlarms}] Alert created successfully:`);
                console.log(`📊 [ALERT] [${alarmIndex}/${totalAlarms}] Alert data:`, JSON.stringify(alertData, null, 2));
                console.log(`📈 [PROGRESS] [${alarmIndex}/${totalAlarms}] Progress: ${((alarmIndex / totalAlarms) * 100).toFixed(1)}%`);
                
            } catch (alarmError) {
                console.error(`❌ [ERROR] [${alarmIndex}/${totalAlarms}] Error processing alarm ${alarm.displayName}:`, alarmError.message);
                console.error(`❌ [ERROR] [${alarmIndex}/${totalAlarms}] Error stack:`, alarmError.stack);

                const errorAlert = {
                    id: alarm.id,
                    severity: 'error',
                    message: alarm.displayName || 'Failed to process OCI alarm',
                    vm: 'Processing Error',
                    tenant: await getCompartmentName(alarm.compartmentId).catch(() => 'Unknown'),
                    region: provider.getRegion().regionId,
                    compartment: alarm.compartmentId,
                    alertType: 'OCI_ALARM_ERROR',
                    metricName: 'ProcessingError',
                    timestamp: alarm.timeUpdated || new Date()
                };
                
                alerts.push(errorAlert);
                console.log(`🔧 [ERROR_ALERT] [${alarmIndex}/${totalAlarms}] Error alert created:`, JSON.stringify(errorAlert, null, 2));
            }
        }

        console.log("\n🔄 [PROCESSING] =====================================");
        console.log(`🎉 [COMPLETE] OCI Alert Pull Complete!`);
        console.log(`📊 [STATS] Total alarms processed: ${alarmsResponse.items.length}`);
        console.log(`📊 [STATS] Total alerts generated: ${alerts.length}`);
        console.log(`📊 [STATS] Success rate: ${(((alerts.length - alerts.filter(a => a.alertType === 'OCI_ALARM_ERROR').length) / alarmsResponse.items.length) * 100).toFixed(1)}%`);
        console.log(`⏰ [COMPLETE] Process completed at: ${new Date().toISOString()}`);
        console.log(`🎉 [COMPLETE] =====================================\n`);
        
        return alerts;

    } catch (error) {
        console.error("\n❌ [CRITICAL] =====================================");
        console.error("❌ [CRITICAL] OCI Service Critical Error:", error.message);
        console.error("❌ [CRITICAL] Error stack:", error.stack);
        console.error("❌ [CRITICAL] Timestamp:", new Date().toISOString());
        console.error("❌ [CRITICAL] =====================================\n");

        const criticalErrorAlert = {
            severity: 'critical',
            message: `OCI Service Error: ${error.message}`,
            vm: 'Service Connection Failed',
            tenant: 'OCI Service',
            region: 'error',
            compartment: 'error',
            alertType: 'OCI_SERVICE_ERROR',
            metricName: 'ConnectionError',
            timestamp: new Date()
        };
        
        console.log(`🚨 [CRITICAL_ALERT] Critical error alert created:`, JSON.stringify(criticalErrorAlert, null, 2));
        
        return [criticalErrorAlert];
    }
}

module.exports = {
    getOCIAlerts
};