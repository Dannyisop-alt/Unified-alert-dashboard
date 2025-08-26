import { Button } from "@/components/ui/button";
import { RefreshCw, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { clearAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

interface DashboardHeaderProps {
  onRefresh?: () => void;
  selectedCategory?: 'heartbeat' | 'logs' | 'infrastructure' | null;
}

export const DashboardHeader = ({ onRefresh, selectedCategory }: DashboardHeaderProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshInfrastructure = async () => {
    setIsRefreshing(true);
    try {
      // Call the refresh function from parent which will fetch all alerts
      if (onRefresh) {
        await onRefresh();
        toast({
          title: "Infrastructure Alerts Refreshed",
          description: "Successfully refreshed infrastructure alerts",
        });
      }
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

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
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
            {selectedCategory === 'infrastructure' && (
              <Button 
                onClick={handleRefreshInfrastructure}
                disabled={isRefreshing}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Infrastructure
              </Button>
            )}
            <Button 
              onClick={handleLogout}
              variant="outline"
              size="sm"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};