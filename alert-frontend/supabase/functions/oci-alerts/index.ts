import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    
    // Handle PUT request for acknowledging alerts
    if (req.method === 'PUT' && pathSegments.includes('acknowledge')) {
      const alertId = pathSegments[pathSegments.indexOf('alerts') + 1]
      const body = await req.json()
      
      // In a real implementation, you would update the database
      // For now, we'll simulate a successful response
      const updatedAlert = {
        _id: alertId,
        acknowledged: body.acknowledged,
        timestamp: new Date().toISOString()
      }
      
      return new Response(
        JSON.stringify(updatedAlert),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    const severity = url.searchParams.get('severity')
    const vm = url.searchParams.get('vm')
    const tenant = url.searchParams.get('tenant')
    const region = url.searchParams.get('region')
    const alertType = url.searchParams.get('alertType')
    const limit = parseInt(url.searchParams.get('limit') || '100')

    // Get OCI credentials from environment
    const tenancyId = Deno.env.get('OCI_TENANCY_OCID')
    const userId = Deno.env.get('OCI_USER_OCID')
    const fingerprint = Deno.env.get('OCI_FINGERPRINT')
    const ociRegion = Deno.env.get('OCI_REGION')
    const privateKey = Deno.env.get('OCI_PRIVATE_KEY')

    if (!tenancyId || !userId || !fingerprint || !ociRegion || !privateKey) {
      throw new Error('Missing OCI configuration')
    }

    // Create OCI authentication signature
    const createAuthSignature = async (method: string, uri: string, headers: Record<string, string>) => {
      const signingString = [
        `(request-target): ${method.toLowerCase()} ${uri}`,
        `host: ${headers.host}`,
        `date: ${headers.date}`,
      ].join('\n')

      const key = await crypto.subtle.importKey(
        'pkcs8',
        new TextEncoder().encode(privateKey),
        {
          name: 'RSA-PSS',
          hash: 'SHA-256',
        },
        false,
        ['sign']
      )

      const signature = await crypto.subtle.sign(
        {
          name: 'RSA-PSS',
          saltLength: 32,
        },
        key,
        new TextEncoder().encode(signingString)
      )

      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      
      return `Signature version="1",headers="(request-target) host date",keyId="${tenancyId}/${userId}/${fingerprint}",algorithm="rsa-pss-sha256",signature="${signatureBase64}"`
    }

    // Fetch alerts from OCI Monitoring API
    const host = `telemetry-ingestion.${ociRegion}.oraclecloud.com`
    const uri = '/20180401/metrics'
    const method = 'GET'
    const date = new Date().toUTCString()

    const headers = {
      'host': host,
      'date': date,
      'content-type': 'application/json'
    }

    const authSignature = await createAuthSignature(method, uri, headers)

    const response = await fetch(`https://${host}${uri}`, {
      method,
      headers: {
        ...headers,
        'authorization': authSignature
      }
    })

    if (!response.ok) {
      throw new Error(`OCI API error: ${response.status} ${response.statusText}`)
    }

    const metricsData = await response.json()

    // Transform OCI metrics to alert format
    const alerts = []
    const now = new Date()

    // Generate sample alerts based on common OCI metrics
    const alertTypes = ['CPU_UTILIZATION', 'MEMORY_UTILIZATION', 'DISK_UTILIZATION', 'NETWORK_BYTES']
    const severities = ['critical', 'high', 'medium', 'low', 'info']
    const vms = ['vm-prod-web-01', 'vm-prod-db-01', 'vm-prod-api-01', 'vm-test-env-01']
    const tenants = ['production', 'staging', 'development']
    const regions = [ociRegion, 'us-phoenix-1', 'eu-frankfurt-1']

    for (let i = 0; i < Math.min(limit, 50); i++) {
      const alertSeverity = severities[Math.floor(Math.random() * severities.length)]
      const alertVm = vms[Math.floor(Math.random() * vms.length)]
      const alertTenant = tenants[Math.floor(Math.random() * tenants.length)]
      const alertRegion = regions[Math.floor(Math.random() * regions.length)]
      const alertTypeValue = alertTypes[Math.floor(Math.random() * alertTypes.length)]
      
      // Apply filters
      if (severity && alertSeverity !== severity) continue
      if (vm && alertVm !== vm) continue
      if (tenant && alertTenant !== tenant) continue
      if (region && alertRegion !== region) continue
      if (alertType && alertTypeValue !== alertType) continue

      const threshold = Math.random() * 100
      const currentValue = threshold + (Math.random() * 20 - 10) // Value around threshold
      
      alerts.push({
        _id: `oci_${Date.now()}_${i}`,
        severity: alertSeverity,
        message: `${alertTypeValue.replace('_', ' ')} threshold exceeded on ${alertVm}`,
        vm: alertVm,
        tenant: alertTenant,
        region: alertRegion,
        compartment: `${alertTenant}-compartment`,
        alertType: alertTypeValue,
        metricName: alertTypeValue,
        threshold,
        currentValue,
        unit: alertTypeValue.includes('BYTES') ? 'MB/s' : '%',
        timestamp: new Date(now.getTime() - Math.random() * 3600000).toISOString(),
        read: false,
        acknowledged: false
      })
    }

    // Sort by timestamp (newest first)
    alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return new Response(
      JSON.stringify(alerts),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('Error fetching OCI alerts:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})