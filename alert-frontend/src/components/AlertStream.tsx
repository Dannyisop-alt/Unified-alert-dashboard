import { useMemo } from 'react';
import { AlertCard } from '@/components/AlertCard';
import { processAlerts } from '@/lib/alertUtils';
import { Loader2 } from 'lucide-react';
import type { GraylogAlert, OCIAlert, AlertFilters, AlertCategory } from '@/types/alerts';
import type { HeartbeatAlert } from '@/lib/heartbeatService';

interface AlertStreamProps {
  graylogAlerts: GraylogAlert[];
  ociAlerts: OCIAlert[];
  heartbeatAlerts: HeartbeatAlert[];
  filters: AlertFilters;
  isRefreshing?: boolean;
  selectedCategory?: AlertCategory;
}

export const AlertStream = ({ graylogAlerts, ociAlerts, heartbeatAlerts, filters, isRefreshing = false, selectedCategory }: AlertStreamProps) => {
  const processedAlerts = useMemo(() => {
    return processAlerts(graylogAlerts, ociAlerts, heartbeatAlerts, filters);
  }, [graylogAlerts, ociAlerts, heartbeatAlerts, filters]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground">
            Live Alert Stream
          </h2>
          {isRefreshing && selectedCategory === 'heartbeat' && (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse-glow"></div>
          {processedAlerts.length} alerts
        </div>
      </div>

      <div className="space-y-3">
        {processedAlerts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <span className="text-2xl">📊</span>
            </div>
            <p>No alerts match your current filters</p>
          </div>
        ) : (
          processedAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))
        )}
      </div>
    </div>
  );
};