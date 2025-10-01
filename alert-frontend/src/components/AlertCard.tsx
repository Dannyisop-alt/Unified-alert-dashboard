import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Globe, Check, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { api } from '@/lib/api';

import type { ProcessedAlert } from '@/types/alerts';

interface AlertCardProps {
  alert: ProcessedAlert;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'Critical':
      return 'destructive';
    case 'Warning':
      return 'secondary';
    case 'Error':
    case 'Info':
      return 'outline';
    default:
      return 'outline';
  }
};

const getSeverityBorderStyle = (severity: string) => {
  switch (severity) {
    case 'Critical':
      return 'bg-red-50 border border-red-200';
    case 'Warning':
      return 'bg-orange-50 border border-orange-200';
    case 'Error':
    case 'Info':
      return 'bg-blue-50 border border-blue-200';
    default:
      return 'bg-gray-50 border border-gray-200';
  }
};

const getSeverityIconStyle = (severity: string) => {
  switch (severity) {
    case 'Critical':
      return 'bg-red-500 text-white';
    case 'Warning':
      return 'bg-orange-500 text-white';
    case 'Error':
    case 'Info':
      return 'bg-blue-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

const getSeverityDotStyle = (severity: string) => {
  switch (severity) {
    case 'Critical':
      return 'bg-red-500';
    case 'Warning':
      return 'bg-orange-500';
    case 'Error':
    case 'Info':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
};

const getSourceIcon = (source: string) => {
  return <Globe className="h-4 w-4" />;
};

export const AlertCard = ({ alert }: AlertCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Safety check to ensure description is always a string
  const safeDescription = alert.description || 'No description available';
  
  // For Infrastructure Alerts, never show expand button
  // For other alerts, show expand button if description is long
  const shouldShowExpand = alert.source !== 'Infrastructure Alerts' && safeDescription.length > 100;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const truncatedDescription = shouldShowExpand && alert.source !== 'Infrastructure Alerts'
    ? safeDescription.substring(0, 100) + '...' 
    : safeDescription;

  return (
    <Card className={`${getSeverityBorderStyle(alert.severity)} hover:shadow-md transition-all relative`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between min-h-0">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`p-2 rounded-lg flex-shrink-0 ${getSeverityIconStyle(alert.severity)}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs bg-white">
                  {alert.source}
                </Badge>
                <Badge variant={getSeverityColor(alert.severity)} className="text-xs">
                  {alert.severity}
                </Badge>
                {alert.site && (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                    {alert.site}
                  </Badge>
                )}
                {alert.region && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    {alert.region}
                  </Badge>
                )}
              </div>
              
              <div>
                <h3 className="font-semibold mb-1 text-gray-900 text-base">
                  {alert.title || 'System Alert'}
                </h3>
                
                {/* Show alarm summary for Infrastructure Alerts */}
                {alert.source === 'Infrastructure Alerts' && alert.alarmSummary && (
                  <div className="mb-2 text-sm text-gray-700">
                    {alert.alarmSummary}
                  </div>
                )}
                
                {/* Show metrics right under the title for Infrastructure Alerts */}
                {alert.source === 'Infrastructure Alerts' && alert.metricValues && (
                  <div className="mb-2">
                    <div className="space-y-1">
                      {/* Check if metricValues is an array with at least one element */}
                      {Array.isArray(alert.metricValues) && alert.metricValues.length > 0 ? (
                        // If it's an array, map over it and then get the entries of the object inside
                        alert.metricValues.map((metricObject, arrayIndex) => (
                          Object.entries(metricObject).map(([key, value], entryIndex) => (
                            <div key={`metric-${arrayIndex}-${entryIndex}`} className="flex items-center gap-2 text-sm">
                              <span className="text-gray-600 font-medium">{String(key)}:</span>
                              <span className="font-mono text-gray-800 font-semibold">{String(value)}</span>
                            </div>
                          ))
                        ))
                      ) : (
                        // Fallback for non-array or empty metricValues
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">No metric values available</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="overflow-hidden">
                  <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                    {/* Show description for non-Infrastructure alerts */}
                    {alert.source !== 'Infrastructure Alerts' && (
                      <div className="text-sm break-words text-gray-600">
                        {isExpanded ? safeDescription : truncatedDescription}
                      </div>
                    )}
                    
                    {/* Infrastructure Alerts - Query and Show More button */}
                    {alert.source === 'Infrastructure Alerts' && (
                      <div className="mt-2">
                        {alert.query && (
                          <div className="text-xs text-gray-500 mb-2">
                            <span className="font-medium">Query:</span> 
                            <span className="ml-1 font-mono">{alert.query}</span>
                          </div>
                        )}
                        
                        {/* Show More button removed for Infrastructure Alerts */}
                        
                        {/* Show additional OCI fields when expanded - REMOVED unwanted fields */}
                        {isExpanded && (
                          <div className="mt-2 text-xs space-y-1 text-gray-500">
                            {/* No additional fields to show - removed status, shape, availability domain, fault domain */}
                          </div>
                        )}
                      </div>
                    )}
                  </Collapsible>
                </div>
              </div>
              
              <p className="text-xs text-gray-500">
                {formatTimestamp(alert.timestamp)}
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3 flex-shrink-0 ml-4">
            <div className={`w-3 h-3 rounded-full ${getSeverityDotStyle(alert.severity)}`}></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};