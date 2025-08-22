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
      const alertId = pathSegments[pathSegments.indexOf('graylog-alerts') + 1]
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

    // Handle GET request for fetching alerts
    const severity = url.searchParams.get('severity')
    const limit = parseInt(url.searchParams.get('limit') || '100')

    // Generate sample Graylog alerts
    const alerts = []
    const now = new Date()
    const severities = ['critical', 'high', 'medium', 'low', 'info']
    const channels = ['application', 'security', 'system', 'database']
    const messages = [
      'Database connection timeout',
      'High CPU usage detected',
      'Authentication failure',
      'Memory usage exceeded threshold',
      'API response time degraded'
    ]

    for (let i = 0; i < Math.min(limit, 25); i++) {
      const alertSeverity = severities[Math.floor(Math.random() * severities.length)]
      
      // Apply severity filter
      if (severity && alertSeverity !== severity) continue

      const message = messages[Math.floor(Math.random() * messages.length)]
      const channel = channels[Math.floor(Math.random() * channels.length)]
      
      alerts.push({
        _id: `graylog_${Date.now()}_${i}`,
        channel,
        shortMessage: message,
        fullMessage: `${message} - Additional details about the alert condition.`,
        severity: alertSeverity,
        color: alertSeverity === 'critical' ? '#ff0000' : alertSeverity === 'high' ? '#ff8000' : '#ffff00',
        username: 'system',
        iconEmoji: alertSeverity === 'critical' ? '🔴' : alertSeverity === 'high' ? '🟠' : '🟡',
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
    console.error('Error fetching Graylog alerts:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})