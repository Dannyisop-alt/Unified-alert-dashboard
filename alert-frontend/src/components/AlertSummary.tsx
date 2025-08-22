import { Card, CardContent } from '@/components/ui/card';

interface AlertSummaryProps {
  totalAlerts: number;
  criticalAlerts: number;
  warningAlerts: number;
  infoAlerts: number;
}

export const AlertSummary = ({ 
  totalAlerts, 
  criticalAlerts, 
  warningAlerts, 
  infoAlerts 
}: AlertSummaryProps) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card className="border border-border bg-card">
        <CardContent className="p-6 text-center">
          <div className="text-3xl font-bold text-foreground mb-1">
            {totalAlerts}
          </div>
          <div className="text-sm text-muted-foreground">
            Total Alerts
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-border bg-card">
        <CardContent className="p-6 text-center">
          <div className="text-3xl font-bold text-destructive mb-1">
            {criticalAlerts}
          </div>
          <div className="text-sm text-muted-foreground">
            Critical
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-border bg-card">
        <CardContent className="p-6 text-center">
          <div className="text-3xl font-bold text-warning mb-1">
            {warningAlerts}
          </div>
          <div className="text-sm text-muted-foreground">
            Warnings
          </div>
        </CardContent>
      </Card>
      
      <Card className="border border-border bg-card">
        <CardContent className="p-6 text-center">
          <div className="text-3xl font-bold text-info mb-1">
            {infoAlerts}
          </div>
          <div className="text-sm text-muted-foreground">
            Info
          </div>
        </CardContent>
      </Card>
    </div>
  );
};