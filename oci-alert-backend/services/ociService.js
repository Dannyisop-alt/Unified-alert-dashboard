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

// Caches for performance
const compartmentNameCache = new Map();
const instanceCache = new Map();

/**
 * Enhanced Tenant Name Extraction
 * Handles special cases, like PaaS compartments, and now includes a manual mapping
 * for known IDs that are not correctly resolved by the API.
 */
const getCompartmentName = async (compartmentId) => {
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
        return manualMappings[compartmentId];
    }
    if (compartmentNameCache.has(compartmentId)) {
        return compartmentNameCache.get(compartmentId);
    }
    try {
        const compartment = await identityClient.getCompartment({
            compartmentId
        });
        let name = compartment.compartment.name;

        // Handle nested compartments or special cases
        if (name === 'ManagedCompartmentForPaaS' || name.includes('ocid1.')) {
            if (compartment.compartment.parentCompartmentId) {
                try {
                    const parent = await identityClient.getCompartment({
                        compartmentId: compartment.compartment.parentCompartmentId
                    });
                    name = parent.compartment.name;
                } catch (parentError) {
                    console.log(`Could not fetch parent compartment: ${parentError.message}`);
                }
            }
        }

        compartmentNameCache.set(compartmentId, name);
        return name;
    } catch (error) {
        console.error(`Error fetching compartment name for ${compartmentId}:`, error.message);
        return 'Unknown Tenant';
    }
};

/**
 * Enhanced Server Name Extraction
 * Updated to include new patterns for both queries and display names.
 */
const extractVmInfo = (alarm, instanceMap, instanceNameMap) => {
    let vmId = null;
    let vmName = 'N/A';
    console.log(`\n🔍 Processing alarm: ${alarm.displayName}`);
    console.log(`🔍 Alarm query: ${alarm.query}`);
    console.log(`🔍 Alarm dimensions:`, alarm.dimensions);

    // Method 1: Check dimensions with multiple possible keys
    if (alarm.dimensions && typeof alarm.dimensions === 'object') {
        const dimensionKeys = [
            'resourceId', 'instanceId', 'instance_id', 'resourceName',
            'resource_id', 'vmId', 'resourceDisplayName', 'displayName'
        ];
        for (const key of dimensionKeys) {
            if (alarm.dimensions[key]) {
                vmId = alarm.dimensions[key];
                console.log(`📋 Found vmId in dimensions[${key}]: ${vmId}`);
                break;
            }
        }
    }

    // Method 2: Enhanced query parsing with more patterns
    if (!vmId && alarm.query) {
        const patterns = [
            /resourceId\s*=\s*"([^"]+)"/i,
            /instanceId\s*=\s*"([^"]+)"/i,
            /instance_id\s*=\s*"([^"]+)"/i,
            /resourceName\s*=\s*"([^"]+)"/i,
            /resourceDisplayName\s*=\s*"([^"]+)"/i,
            /displayName\s*=\s*"([^"]+)"/i,
            /(ocid1\.instance\.[a-zA-Z0-9\._-]+)/i,
            // Add patterns for server names directly in queries
            /resourceDisplayName\s*=\s*"?([A-Z]+-[A-Z0-9]+-[A-Z0-9]+)"?/i,
            /resourceDisplayName\s*=\s*"?([A-Z]+\d*-\d+[A-Z]?)"?/i
        ];
        for (const pattern of patterns) {
            const match = alarm.query.match(pattern);
            if (match) {
                vmId = match[1];
                console.log(`🔎 Found vmId in query: ${vmId}`);
                break;
            }
        }
    }

    // Method 3: Direct server name extraction from alarm display name (ENHANCED)
    if (alarm.displayName) {
        // First try exact server name matches (your known servers)
        const knownServerNames = [
            'TURN-SERVER01', 'Graylog-01E', 'Graylog-01D', 'Graylog-01C',
            'Graylog-01B', 'Graylog-01A', 'ITMSL-Disp360-SCRT', 'ITMSL-Disp360',
            'Portainer', 'METABASE-02', 'DB SOURCE'
        ];
        // Add instance map values
        const allServerNames = [...knownServerNames, ...Array.from(instanceMap.values())];
        for (const serverName of allServerNames) {
            if (alarm.displayName.toLowerCase().includes(serverName.toLowerCase())) {
                vmName = serverName;
                console.log(`🎯 Matched exact server name: ${vmName}`);
                break;
            }
        }
        // Enhanced pattern extraction if no exact match
        if (vmName === 'N/A') {
            const enhancedPatterns = [
                // Specific patterns for your environment
                /(TURN-SERVER\d+)/i,
                /(Graylog-\d+[A-Z])/i,
                /(ITMSL-[A-Z0-9]+-[A-Z0-9]+)/i,
                /(METABASE-\d+)/i,
                /(Portainer)/i,
                /(DB\s+SOURCE)/i,
                // Generic patterns
                /([A-Z]{2,}-[A-Z0-9]+-[A-Z0-9]+)/i,
                /([A-Z]+\d*-\d+[A-Z]?)/i,
                /([A-Z]{3,}\d+)/i,
                // Pattern for server names in alarm titles
                /Common_([A-Za-z]+)/i,
                /([A-Z]+_[A-Z]+)/i,
                /([A-Z]{4,})-[A-Za-z0-9]+/i, // E.g., TRANWARE-something
                // Extract from beginning of alarm name
                /^([A-Z][A-Za-z0-9_-]+)/i
            ];
            for (const pattern of enhancedPatterns) {
                const match = alarm.displayName.match(pattern);
                if (match) {
                    vmName = match[1];
                    console.log(`🔍 Extracted server name from pattern: ${vmName}`);
                    break;
                }
            }
        }
    }

    // Method 4: Get VM name from instance maps
    if (vmId) {
        if (instanceMap.has(vmId)) {
            vmName = instanceMap.get(vmId);
            console.log(`✅ Found VM name in instance map: ${vmName}`);
        }
    }
    return {
        vmId,
        vmName
    };
};

/**
 * Fetches real alerts from OCI Monitoring Alarms,
 * enriching the data with human-readable VM and tenant names.
 * @returns {Array} An array of alerts formatted for your OciAlert model.
 */
async function getOCIAlerts() {
    try {
        console.log("🚀 Pulling alerts from OCI...");
        const tenancyId = await provider.getTenantId();

        // 1. Fetch all instances to create comprehensive lookup maps
        console.log("📊 Fetching instances from all compartments...");
        const instancesResponse = await computeClient.listInstances({
            compartmentId: tenancyId,
            compartmentIdInSubtree: true
        });

        const instanceMap = new Map(); // OCID -> Display Name
        const instanceNameMap = new Map(); // Display Name -> OCID

        for (const instance of instancesResponse.items) {
            instanceMap.set(instance.id, instance.displayName);
            instanceNameMap.set(instance.displayName.toLowerCase(), instance.id);
        }

        console.log(`📋 Built maps with ${instanceMap.size} instances`);

        // 2. Fetch alarms - try both Active and Fired states
        console.log("🚨 Fetching alarms...");

        // First try to get fired (actively alerting) alarms
        let alarmsResponse;
        try {
            alarmsResponse = await monitoringClient.listAlarms({
                compartmentId: tenancyId,
                compartmentIdInSubtree: true,
                lifecycleState: oci.monitoring.models.Alarm.LifecycleState.Fired
            });
            console.log(`🔥 Found ${alarmsResponse.items.length} FIRED alarms`);
        } catch (firedError) {
            console.log(`⚠️ Could not fetch fired alarms, trying active: ${firedError.message}`);
            // Fallback to active alarms
            alarmsResponse = await monitoringClient.listAlarms({
                compartmentId: tenancyId,
                compartmentIdInSubtree: true,
                lifecycleState: oci.monitoring.models.Alarm.LifecycleState.Active
            });
            console.log(`✅ Found ${alarmsResponse.items.length} ACTIVE alarms`);
        }

        const alerts = [];

        // 3. Process each alarm with enhanced extraction
        for (const alarm of alarmsResponse.items) {
            try {
                // Extract VM information using enhanced logic
                let {
                    vmId,
                    vmName
                } = extractVmInfo(alarm, instanceMap, instanceNameMap);

                // FIX: Add more comprehensive logging
                console.log(`\n📊 ALARM DEBUG INFO:`);
                console.log(`- Display Name: ${alarm.displayName}`);
                console.log(`- Body: ${alarm.body}`);
                console.log(`- Summary: ${alarm.summary}`);
                console.log(`- Metric: ${alarm.metric}`);
                console.log(`- Query: ${alarm.query}`);
                console.log(`- Dimensions:`, JSON.stringify(alarm.dimensions, null, 2));
                console.log(`- Compartment: ${alarm.compartmentId}`);
                console.log(`- Final VM Name: ${vmName}`);
                console.log(`- Final VM ID: ${vmId}`);

                // If we have vmId but no name, try direct fetch with caching
                if (vmId && vmName === 'N/A') {
                    if (instanceCache.has(vmId)) {
                        vmName = instanceCache.get(vmId);
                    } else {
                        try {
                            const instanceResponse = await computeClient.getInstance({
                                instanceId: vmId
                            });
                            vmName = instanceResponse.instance.displayName;
                            instanceCache.set(vmId, vmName);
                            console.log(`🔄 Direct fetch successful: ${vmName}`);
                        } catch (fetchErr) {
                            console.log(`❌ Direct fetch failed for ${vmId}: ${fetchErr.message}`);
                            // Create a readable name from OCID
                            if (vmId.startsWith('ocid1.')) {
                                vmName = `VM-${vmId.split('.').pop()?.substring(0, 8)}`;
                            } else {
                                vmName = vmId;
                            }
                        }
                    }
                }

                // Get the compartment (tenant) name
                const tenantName = await getCompartmentName(alarm.compartmentId);

                // ** NEW FIX: IMPROVED SEVERITY MAPPING **
                // Log the raw severity to debug
                const rawSeverity = alarm.severity?.toUpperCase();
                console.log(`🔥 Raw Alarm Severity: ${rawSeverity}`);

                // Map the severity string to the correct category
                const severityMap = {
                    'CRITICAL': 'critical',
                    'ERROR': 'error',
                    'WARNING': 'warning',
                    'INFO': 'info',
                    'OK': 'info' // Treat 'OK' as a non-alarming info state
                };
                const severity = severityMap[rawSeverity] || 'info';
                
                // Add a console message for unrecognized severities
                if (!severityMap[rawSeverity]) {
                    console.log(`⚠️ Unrecognized severity '${rawSeverity}', defaulting to 'info'`);
                }


                // Prioritize summary and body for a more descriptive message
                let alertMessage = alarm.summary || alarm.body;
                if (!alertMessage && alarm.displayName) {
                    alertMessage = alarm.displayName;
                    // Remove "N/A - OCI_ALARM" if it's the only thing in the display name
                    if (alertMessage.trim() === 'N/A - OCI_ALARM') {
                        alertMessage = `Alarm for ${vmName} in ${tenantName}`;
                    }
                } else if (!alertMessage) {
                    alertMessage = 'Unknown OCI Alarm';
                }


                alerts.push({
                    severity: severity,
                    message: alertMessage,
                    vm: vmName,
                    tenant: tenantName,
                    region: provider.getRegion().regionId,
                    compartment: alarm.compartmentId,
                    alertType: 'OCI_ALARM',
                    metricName: alarm.metric || alarm.metricCompartmentId || 'Unknown',
                    threshold: null,
                    currentValue: null,
                    unit: null,
                    timestamp: alarm.timeUpdated || alarm.timeCreated
                });

                // Add an alarm history check for more detailed messages
                try {
                    const alarmHistoryResponse = await monitoringClient.listAlarmHistoryCollection({
                        compartmentId: alarm.compartmentId,
                        alarmId: alarm.id,
                        limit: 1
                    });
                    if (alarmHistoryResponse.items.length > 0) {
                        const latestHistory = alarmHistoryResponse.items[0];
                        if (latestHistory.summary) {
                            alerts[alerts.length - 1].message = latestHistory.summary;
                        }
                    }
                } catch (historyError) {
                    console.log(`Could not fetch alarm history: ${historyError.message}`);
                }


                console.log(`✅ Final result -> VM: ${vmName}, Tenant: ${tenantName}, Severity: ${severity}`);

            } catch (alarmError) {
                console.error(`❌ Error processing alarm ${alarm.displayName}:`, alarmError.message);

                alerts.push({
                    severity: 'error',
                    message: alarm.displayName || 'Failed to process OCI alarm',
                    vm: 'Processing Error',
                    tenant: await getCompartmentName(alarm.compartmentId).catch(() => 'Unknown'),
                    region: provider.getRegion().regionId,
                    compartment: alarm.compartmentId,
                    alertType: 'OCI_ALARM_ERROR',
                    metricName: 'ProcessingError',
                    timestamp: alarm.timeUpdated || new Date()
                });
            }
        }

        console.log(`🎉 OCI Alert Pull Complete: Generated ${alerts.length} alerts`);
        return alerts;

    } catch (error) {
        console.error("� OCI Service Critical Error:", error.message);
        console.error("Stack trace:", error.stack);

        return [{
            severity: 'critical',
            message: `OCI Service Error: ${error.message}`,
            vm: 'Service Connection Failed',
            tenant: 'OCI Service',
            region: 'error',
            compartment: 'error',
            alertType: 'OCI_SERVICE_ERROR',
            metricName: 'ConnectionError',
            timestamp: new Date()
        }];
    }
}

module.exports = {
    getOCIAlerts
};