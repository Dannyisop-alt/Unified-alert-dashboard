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
  const shouldShowExpand = safeDescription.length > 100;

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

  const truncatedDescription = shouldShowExpand 
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
                {alert.tenant && (
                  <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                    Tenant: {alert.tenant}
                  </Badge>
                )}
              </div>
              
              <div>
                <h3 className="font-semibold mb-1 text-gray-900">
                  {alert.title || 'System Alert'}
                </h3>
                <div className="overflow-hidden">
                  <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                    <div className="text-sm break-words text-gray-600">
                      {isExpanded ? safeDescription : truncatedDescription}
                    </div>
                    {/* Show OCI-specific fields for Infrastructure Alerts */}
                    {alert.source === 'Infrastructure Alerts' && (alert.compartment || alert.metricName) && (
                      <div className="mt-2 text-xs space-y-1 text-gray-500">
                        {alert.compartment && (
                          <div>
                            <span className="font-medium">Compartment:</span> {alert.compartment}
                          </div>
                        )}
                        {alert.metricName && (
                          <div>
                            <span className="font-medium">Metric:</span> {alert.metricName}
                          </div>
                        )}
                      </div>
                    )}
                    {shouldShowExpand && (
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="mt-1 p-0 h-auto text-xs hover:text-blue-800 text-blue-600">
                          <span className="flex items-center gap-1">
                            {isExpanded ? (
                              <>
                                Show Less
                                <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                Show More
                                <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </span>
                        </Button>
                      </CollapsibleTrigger>
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