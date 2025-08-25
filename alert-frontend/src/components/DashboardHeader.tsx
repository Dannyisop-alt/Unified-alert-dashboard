import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface DashboardHeaderProps {
  onRefresh?: () => void;
}

export const DashboardHeader = ({ onRefresh }: DashboardHeaderProps) => {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshInfrastructure = async () => {
    setIsRefreshing(true);
    try {
      const result = await api.triggerOCIAlertPull();
      toast({
        title: "Infrastructure Alerts Refreshed",
        description: result.message,
      });
      onRefresh?.();
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh infrastructure alerts",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="border-b border-border bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Qryde Heartbeat
            </h1>
            <p className="text-muted-foreground text-lg">
              Enterprise monitoring dashboard for real-time system alerts and health monitoring
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleRefreshInfrastructure}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Infrastructure
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};