import { Server, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AlertCategory } from '@/types/alerts';

interface CategoryToggleProps {
  selectedCategory: AlertCategory;
  onCategoryChange: (category: AlertCategory) => void;
  alertCounts: {
    heartbeat: number;
    logs: number;
    infrastructure: number;
  };
}

export const CategoryToggle = ({ 
  selectedCategory, 
  onCategoryChange, 
  alertCounts 
}: CategoryToggleProps) => {
  const categories = [
    {
      id: 'heartbeat' as AlertCategory,
      label: 'Application Heartbeat',
      icon: Server,
      count: alertCounts.heartbeat
    },
    {
      id: 'logs' as AlertCategory,
      label: 'Application Logs', 
      icon: FileText,
      count: alertCounts.logs
    },
    {
      id: 'infrastructure' as AlertCategory,
      label: 'Infrastructure Alerts',
      icon: AlertTriangle,
      count: alertCounts.infrastructure
    }
  ];

  return (
    <div className="border-b border-border bg-card/30 backdrop-blur">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center gap-2">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'ghost'}
                onClick={() => onCategoryChange(selectedCategory === category.id ? null : category.id)}
                className="flex items-center gap-2 relative"
              >
                <Icon className="h-4 w-4" />
                {category.label}
                {category.count > 0 && (
                  <Badge 
                    variant={selectedCategory === category.id ? "secondary" : "destructive"} 
                    className="ml-1 px-1.5 py-0.5 text-xs"
                  >
                    {category.count}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
};