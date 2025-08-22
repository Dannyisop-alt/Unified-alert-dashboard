import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter } from 'lucide-react';
import type { AlertFilters, AlertCategory, GraylogAlert, OCIAlert } from '@/types/alerts';
import type { HeartbeatAlert } from '@/lib/heartbeatService';

interface FilterPanelProps {
  filters: AlertFilters;
  onFiltersChange: (filters: AlertFilters) => void;
  selectedCategory: AlertCategory;
  graylogAlerts: GraylogAlert[];
  ociAlerts: OCIAlert[];
  heartbeatAlerts: HeartbeatAlert[];
}

export const FilterPanel = ({ filters, onFiltersChange, selectedCategory, graylogAlerts, ociAlerts, heartbeatAlerts }: FilterPanelProps) => {
  const severityOptions = ['Critical', 'Warning', 'Info'];
  
  // Extract dynamic filters from actual alert data
  const extractChannelsFromLogs = () => {
    const channels = new Set<string>();
    graylogAlerts.forEach(alert => {
      if (alert.channel) {
        channels.add(alert.channel);
      }
    });
    return Array.from(channels).sort();
  };

  const extractSystemsFromHeartbeat = () => {
    const systems = new Set<string>();
    heartbeatAlerts.forEach(alert => {
      if (alert.service) {
        systems.add(alert.service);
      }
    });
    return Array.from(systems).sort();
  };

  const extractVMsFromOCI = () => {
    const vms = new Set<string>();
    ociAlerts.forEach(alert => {
      if (alert.vm) {
        vms.add(alert.vm);
      }
      if (alert.tenant) {
        vms.add(alert.tenant);
      }
    });
    return Array.from(vms).sort();
  };

  // Context-sensitive source options based on selected category
  const getSourceOptions = () => {
    if (!selectedCategory) {
      return ['Application Heartbeat', 'Application Logs', 'Infrastructure Alerts', 'OCI Alerts', 'System Monitoring'];
    }
    
    switch (selectedCategory) {
      case 'logs':
        return ['Application Logs', 'System Logs', 'Security Logs'];
      case 'heartbeat':
        return ['Application Heartbeat', 'Application Logs', 'Infrastructure Alerts'];
      case 'infrastructure':
        return ['Infrastructure Alerts', 'OCI Alerts', 'System Monitoring'];
      default:
        return ['Application Heartbeat', 'Application Logs', 'Infrastructure Alerts'];
    }
  };

  // Dynamic filter options based on selected category and actual data
  const getDynamicFilterOptions = () => {
    if (!selectedCategory) {
      // When no category is selected, show combined options from all sources
      const channels = extractChannelsFromLogs();
      const systems = extractSystemsFromHeartbeat();
      const vms = extractVMsFromOCI();
      return ['ALL', ...channels, ...systems, ...vms];
    }
    
    switch (selectedCategory) {
      case 'logs':
        const logChannels = extractChannelsFromLogs();
        return ['ALL', ...logChannels];
      case 'heartbeat':
        const heartbeatSystems = extractSystemsFromHeartbeat();
        return ['ALL', ...heartbeatSystems];
      case 'infrastructure':
        const infraVMs = extractVMsFromOCI();
        return ['ALL', ...infraVMs];
      default:
        return ['ALL'];
    }
  };

  const dynamicFilterOptions = getDynamicFilterOptions();
  const sourceOptions = getSourceOptions();
  
  const toggleSeverity = (severity: string) => {
    const currentSeverities = filters.severity || [];
    const newSeverities = currentSeverities.includes(severity)
      ? currentSeverities.filter(s => s !== severity)
      : [...currentSeverities, severity];
    
    onFiltersChange({ ...filters, severity: newSeverities });
  };


  const handleSeverityChange = (value: string) => {
    if (value === 'ALL') {
      onFiltersChange({ ...filters, severity: [] });
    } else {
      onFiltersChange({ ...filters, severity: [value] });
    }
  };

  const handleDynamicFilterChange = (value: string) => {
    // When "ALL" is selected, only clear the dynamic filter, not the category-based filtering
    const updatedFilters = { 
      ...filters, 
      dynamicFilter: value === 'ALL' ? undefined : value
    };
    onFiltersChange(updatedFilters);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 mb-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4" />
          Filters
        </div>

        <div className="flex items-center gap-2">
          <Select value={filters.dynamicFilter || 'ALL'} onValueChange={handleDynamicFilterChange}>
            <SelectTrigger className="w-[99px] h-9 bg-background border-border">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-background border-border shadow-lg z-50">
              {dynamicFilterOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Severity:</span>
          <Select 
            value={filters.severity?.[0] || 'ALL'} 
            onValueChange={handleSeverityChange}
          >
            <SelectTrigger className="w-[154px] h-9">
              <SelectValue placeholder="All Severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Severities</SelectItem>
              {severityOptions.map((severity) => (
                <SelectItem key={severity} value={severity}>
                  {severity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      </div>
    </div>
  );
};