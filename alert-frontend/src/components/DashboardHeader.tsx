import { Button } from "@/components/ui/button";
import { LogOut, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { clearAuth, isAdmin } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import type { AlertCategory } from "@/types/alerts";

interface DashboardHeaderProps {
  onRefresh?: () => void;
  selectedCategory?: AlertCategory;
}

export const DashboardHeader = ({ onRefresh, selectedCategory }: DashboardHeaderProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const handleUserManagement = () => {
    navigate('/admin');
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
            {isAdmin() && (
              <Button 
                onClick={handleUserManagement}
                variant="outline"
                size="sm"
              >
                <Users className="h-4 w-4 mr-2" />
                User Management
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