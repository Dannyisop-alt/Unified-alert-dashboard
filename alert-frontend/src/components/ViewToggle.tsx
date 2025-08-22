import { AlertTriangle, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ViewMode } from '@/pages/Index';
import type { AlertCategory } from '@/types/alerts';

interface ViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  alertCount?: number;
  selectedCategory: AlertCategory;
}

export const ViewToggle = ({ 
  viewMode, 
  onViewModeChange, 
  alertCount = 0, 
  selectedCategory 
}: ViewToggleProps) => {
  const getViewLabel = () => {
    switch(selectedCategory) {
      case 'heartbeat':
        return 'System Monitor';
      case 'logs':
        return 'Alert Stream';
      case 'infrastructure':
        return 'Infrastructure Monitor';
      default:
        return 'Alert Stream';
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={viewMode === 'alerts' ? 'default' : 'ghost'}
        onClick={() => onViewModeChange('alerts')}
        className="flex items-center gap-2 relative"
      >
        <AlertTriangle className="h-4 w-4" />
        {getViewLabel()}
        {viewMode === 'alerts' && alertCount > 0 && (
          <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-xs">
            {alertCount}
          </Badge>
        )}
      </Button>
      <Button
        variant={viewMode === 'metrics' ? 'default' : 'ghost'}
        onClick={() => onViewModeChange('metrics')}
        className="flex items-center gap-2"
      >
        <Activity className="h-4 w-4" />
        System Status
      </Button>
    </div>
  );
};