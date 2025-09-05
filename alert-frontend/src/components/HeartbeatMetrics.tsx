import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Activity, Shield, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AlertCategory } from '@/types/alerts';

interface HeartbeatSystem {
  SITE: string;
  SITENAME: string;
  SITETYPE: 'MULTI' | 'STANDALONE';
  WEB: 'GREEN' | 'RED' | 'ORANGE' | '...';
  DB: 'GREEN' | 'RED' | 'ORANGE' | '...';
  MTSERVER: 'GREEN' | 'RED' | 'ORANGE' | '...';
  IVRRPT: 'GREEN' | 'RED' | 'ORANGE' | '...';
  UPD_DATETIME: string;
}

interface HeartbeatMetricsProps {
  selectedCategory: AlertCategory;
}

export const HeartbeatMetrics = ({ selectedCategory }: HeartbeatMetricsProps) => {
  const [heartbeatData, setHeartbeatData] = useState<HeartbeatSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [showFilter, setShowFilter] = useState<'SHOWALL' | 'ERRONLY'>('SHOWALL');
  const [isConnecting, setIsConnecting] = useState(false);
  const [soundLoopId, setSoundLoopId] = useState<NodeJS.Timeout | null>(null);

  // Configuration
  const config = {
    wsUrl: 'wss://hbc.hbssweb.com:4950',
    refreshInterval: 1 * 60 * 1000, // 1 minute
    timeout: 10000, // 10 seconds timeout
    debug: true
  };

  const fetchHeartbeatData = useCallback(() => {
    if (isConnecting) {
      // Connection already in progress
      return;
    }

    setIsConnecting(true);
    let dataReceived = false;
    let intentionallyClosed = false;
    let connectionError = false;

    try {
      const ws = new WebSocket(config.wsUrl);
      
      const timeoutId = setTimeout(() => {
        if (!dataReceived) {
          connectionError = true;
          // Connection timeout
          ws.close();
          setLoading(false);
          setIsConnecting(false);
          // Don't set error state for connection timeouts
        }
      }, config.timeout);

      ws.onopen = () => {
        // WebSocket connected
        ws.send('GetConStatus~Y');
      };

      ws.onmessage = (event) => {
        dataReceived = true;
        intentionallyClosed = true;
        clearTimeout(timeoutId);
        
        try {
          const jsonData = JSON.parse(event.data);
          if (jsonData && jsonData.length > 0) {
            setHeartbeatData(jsonData);
            setLastUpdated(new Date());
            setLoading(false);
            setError(null);
            
            // Heartbeat data received
          } else {
            if (config.debug) console.warn('⚠️ Empty response from server');
            setError('No data received from heartbeat service');
            setLoading(false);
          }
        } catch (parseError) {
          console.error('❌ Error parsing heartbeat data:', parseError);
          setError('Invalid data format received from server');
          setLoading(false);
        }
        
        ws.close();
        setIsConnecting(false);
        
        // Data processed
      };

      ws.onerror = (error) => {
        clearTimeout(timeoutId);
        if (!dataReceived && !intentionallyClosed && !connectionError) {
          console.error('❌ WebSocket connection error:', error);
          // Don't set error state for connection errors
          setLoading(false);
        }
        setIsConnecting(false);
      };

      ws.onclose = (event) => {
        clearTimeout(timeoutId);
        setIsConnecting(false);
        
        if (!dataReceived && !intentionallyClosed && !connectionError) {
          // Connection closed unexpectedly
          if (loading) {
            setLoading(false);
            // Don't set error state for connection issues
          }
        }
      };

    } catch (connectError) {
      console.error('❌ Failed to create WebSocket connection:', connectError);
      // Don't set error state for connection errors  
      setLoading(false);
      setIsConnecting(false);
    }
  }, [isConnecting, loading, config.debug, config.timeout, config.wsUrl]);

  useEffect(() => {
    fetchHeartbeatData();
    
    const refreshInterval = setInterval(() => {
      // Scheduled refresh
      fetchHeartbeatData();
    }, config.refreshInterval);

    return () => {
      clearInterval(refreshInterval);
      if (soundLoopId) clearInterval(soundLoopId);
    };
  }, [fetchHeartbeatData, config.refreshInterval, config.debug, soundLoopId]);

  const playErrorSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      // Audio creation failed
    }
  };

  const checkForErrors = () => {
    return heartbeatData.some(system => {
      if (system.SITETYPE === 'MULTI') {
        return isErrorStatus(system.WEB) || 
               isErrorStatus(system.DB) || 
               isErrorStatus(system.MTSERVER) || 
               isErrorStatus(system.IVRRPT);
      } else {
        return isErrorStatus(system.WEB) && isCriticalSystem(system.SITENAME);
      }
    });
  };

  const isErrorStatus = (status: string) => {
    return status === 'RED' || status === 'ORANGE';
  };

  const hasErrors = (system: HeartbeatSystem) => {
    return isErrorStatus(system.WEB) || 
           isErrorStatus(system.DB) || 
           isErrorStatus(system.MTSERVER) || 
           isErrorStatus(system.IVRRPT);
  };

  const isCriticalSystem = (siteName: string) => {
    const criticalSystems = [
      'LOCATIONSERVER', 'HAPROXY', 'CONFIGSERVICEWS', 
      'QRYDEAPPSERVER', 'QRYDE', 'OSRMSERVER', 
      'PENQUIS_SS_MAINE', 'WPSITE', 'GPSVOXQRYDETRACKER', 
      'ESSTS_CTSNOVUS', '_AAL', '-GSE'
    ];
    
    const upperSiteName = siteName?.toUpperCase() || '';
    return criticalSystems.some(critical => upperSiteName.includes(critical));
  };

  useEffect(() => {
    const hasErrors = checkForErrors();
    if (hasErrors && !soundLoopId) {
      const id = setInterval(() => {
        playErrorSound();
      }, 18000);
      setSoundLoopId(id);
      playErrorSound();
    } else if (!hasErrors && soundLoopId) {
      clearInterval(soundLoopId);
      setSoundLoopId(null);
    }
  }, [heartbeatData, soundLoopId]);

  const getStatusIndicator = (status: string) => {
    const className = `w-4 h-4 rounded-full`;
    
    switch (status) {
      case 'GREEN':
        return <div className={`${className} bg-green-500`}></div>;
      case 'RED':
        return <div className={`${className} bg-red-500`}></div>;
      case 'ORANGE':
        return <div className={`${className} bg-orange-500`}></div>;
      default:
        return <div className={`${className} bg-gray-400`}></div>;
    }
  };

  const formatTimestamp = (datetime: string) => {
    const date = new Date(datetime);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const filteredData = heartbeatData.filter(system => {
    if (showFilter === 'SHOWALL') return true;
    if (showFilter === 'ERRONLY') {
      if (system.SITETYPE === 'MULTI') {
        return hasErrors(system);
      } else {
        return isErrorStatus(system.WEB) && isCriticalSystem(system.SITENAME);
      }
    }
    return true;
  });

  const multiSystems = filteredData.filter(system => system.SITETYPE === 'MULTI');
  const standaloneSystems = filteredData.filter(system => system.SITETYPE !== 'MULTI');

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="bg-gradient-to-r from-violet-600 to-violet-800 text-white">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">🫀 Heartbeat Monitor</CardTitle>
              <div className="text-sm opacity-90">
                {isConnecting ? 'Fetching heartbeat data...' : 'Connecting to service...'}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              Loading heartbeat data...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-violet-600 to-violet-800 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-xl">🫀 Rydelog / QRyde Heartbeat Status</CardTitle>
              <p className="text-sm opacity-90 mt-1">Real-time system monitoring</p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-sm opacity-90">
                Last updated: {lastUpdated.toLocaleTimeString()}
                {isConnecting && <span className="ml-2">• Updating...</span>}
              </div>
              <select
                value={showFilter}
                onChange={(e) => setShowFilter(e.target.value as 'SHOWALL' | 'ERRONLY')}
                className="bg-white/20 border border-white/30 text-white rounded px-3 py-1 text-sm"
              >
                <option value="SHOWALL" className="text-black">Show All</option>
                <option value="ERRONLY" className="text-black">Only Errors</option>
              </select>
              <Button
                onClick={fetchHeartbeatData}
                disabled={isConnecting}
                variant="secondary"
                size="sm"
                className="bg-white/20 hover:bg-white/30 border-white/30"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isConnecting ? 'animate-spin' : ''}`} />
                {isConnecting ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Systems</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{heartbeatData.length}</div>
            <p className="text-xs text-muted-foreground">Systems monitored</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {heartbeatData.filter(system => !hasErrors(system)).length}
            </div>
            <p className="text-xs text-muted-foreground">Systems running normally</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warning</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {heartbeatData.filter(system => {
                if (system.SITETYPE === 'MULTI') {
                  return [system.WEB, system.DB, system.MTSERVER, system.IVRRPT].includes('ORANGE') &&
                         ![system.WEB, system.DB, system.MTSERVER, system.IVRRPT].includes('RED');
                }
                return system.WEB === 'ORANGE';
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">Systems with warnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <Shield className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {heartbeatData.filter(system => {
                if (system.SITETYPE === 'MULTI') {
                  return [system.WEB, system.DB, system.MTSERVER, system.IVRRPT].includes('RED');
                }
                return system.WEB === 'RED';
              }).length}
            </div>
            <p className="text-xs text-muted-foreground">Systems with errors</p>
          </CardContent>
        </Card>
      </div>

      {/* Standalone Systems */}
      {standaloneSystems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Standalone Systems</CardTitle>
            <p className="text-sm text-muted-foreground">Independent monitoring systems</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {standaloneSystems.map((system, index) => (
                <div 
                  key={`standalone-${index}`}
                  className={`
                    border rounded-lg p-4 transition-all duration-200 hover:shadow-md cursor-pointer
                    ${hasErrors(system) 
                      ? 'border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20' 
                      : isCriticalSystem(system.SITENAME)
                      ? 'border-l-4 border-l-orange-500 bg-orange-50 dark:bg-orange-950/20'
                      : 'border-border hover:border-border/60'
                    }
                  `}
                  title={system.SITENAME}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {getStatusIndicator(system.WEB)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {system.SITE}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">
                        {formatTimestamp(system.UPD_DATETIME)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Multi-Component Systems - Grid Table Layout */}
      {multiSystems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Multi-Component Systems</CardTitle>
            <p className="text-sm text-muted-foreground">Systems with multiple service components • {multiSystems.length} systems</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[1000px] max-h-[600px] overflow-auto">
                <Table className="w-full">
                  <TableHeader className="sticky top-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 z-20 shadow-sm">
                    <TableRow className="border-b-2 border-border/40">
                      {/* Generate table headers for groups of 3 systems */}
                      {Array.from({ length: Math.ceil(multiSystems.length / 3) }).map((_, groupIndex) => (
                        <React.Fragment key={`group-${groupIndex}`}>
                          <TableHead className="text-center font-semibold border-r border-border/30 w-[140px] h-12 bg-muted/30">
                            <div className="text-sm font-bold text-foreground">Site</div>
                          </TableHead>
                          <TableHead className="text-center font-semibold border-r border-border/30 w-[80px] h-12 bg-muted/30">
                            <div className="text-xs font-bold text-foreground">WebSvr</div>
                          </TableHead>
                          <TableHead className="text-center font-semibold border-r border-border/30 w-[80px] h-12 bg-muted/30">
                            <div className="text-xs font-bold text-foreground">DbSvr</div>
                          </TableHead>
                          <TableHead className="text-center font-semibold border-r border-border/30 w-[80px] h-12 bg-muted/30">
                            <div className="text-xs font-bold text-foreground">MTSvr</div>
                          </TableHead>
                          <TableHead className={`text-center font-semibold w-[80px] h-12 bg-muted/30 ${groupIndex < Math.ceil(multiSystems.length / 3) - 1 ? 'border-r-2 border-border/50' : ''}`}>
                            <div className="text-xs font-bold text-foreground">IvrRpt</div>
                          </TableHead>
                        </React.Fragment>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: Math.ceil(multiSystems.length / 3) }).map((_, rowIndex) => {
                      const system1 = multiSystems[rowIndex * 3];
                      const system2 = multiSystems[rowIndex * 3 + 1];
                      const system3 = multiSystems[rowIndex * 3 + 2];
                      const isEvenRow = rowIndex % 2 === 0;
                      
                      return (
                        <TableRow 
                          key={`row-${rowIndex}`} 
                          className={`
                            transition-colors duration-200 ease-in-out border-b border-border/20
                            ${isEvenRow ? 'bg-background hover:bg-muted/30' : 'bg-muted/10 hover:bg-muted/40'}
                            hover:shadow-sm group
                          `}
                        >
                          {/* System 1 */}
                          {system1 ? (
                            <>
                              <TableCell className="font-medium border-r border-border/30 text-left transition-all duration-200 group-hover:bg-accent/10">
                                <div className="py-2 px-1">
                                  <div className={`font-semibold text-sm truncate ${hasErrors(system1) ? 'text-red-600' : 'text-primary'}`} title={system1.SITENAME}>
                                    {system1.SITE}
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono mt-1">
                                    {formatTimestamp(system1.UPD_DATETIME)}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system1.WEB)}
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system1.DB)}
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system1.MTSERVER)}
                              </TableCell>
                              <TableCell className={`text-center py-3 transition-all duration-200 group-hover:bg-accent/10 ${system2 || system3 ? 'border-r-2 border-border/50' : ''}`}>
                                {getStatusIndicator(system1.IVRRPT)}
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="border-r border-border/30 h-16"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell className={system2 || system3 ? 'border-r-2 border-border/50' : ''}></TableCell>
                            </>
                          )}
                          
                          {/* System 2 */}
                          {system2 ? (
                            <>
                              <TableCell className="font-medium border-r border-border/30 text-left transition-all duration-200 group-hover:bg-accent/10">
                                <div className="py-2 px-1">
                                  <div className={`font-semibold text-sm truncate ${hasErrors(system2) ? 'text-red-600' : 'text-primary'}`} title={system2.SITENAME}>
                                    {system2.SITE}
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono mt-1">
                                    {formatTimestamp(system2.UPD_DATETIME)}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system2.WEB)}
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system2.DB)}
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system2.MTSERVER)}
                              </TableCell>
                              <TableCell className={`text-center py-3 transition-all duration-200 group-hover:bg-accent/10 ${system3 ? 'border-r-2 border-border/50' : ''}`}>
                                {getStatusIndicator(system2.IVRRPT)}
                              </TableCell>
                            </>
                          ) : system1 ? (
                            <>
                              <TableCell className="border-r border-border/30 h-16"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell className={system3 ? 'border-r-2 border-border/50' : ''}></TableCell>
                            </>
                          ) : null}
                          
                          {/* System 3 */}
                          {system3 ? (
                            <>
                              <TableCell className="font-medium border-r border-border/30 text-left transition-all duration-200 group-hover:bg-accent/10">
                                <div className="py-2 px-1">
                                  <div className={`font-semibold text-sm truncate ${hasErrors(system3) ? 'text-red-600' : 'text-primary'}`} title={system3.SITENAME}>
                                    {system3.SITE}
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono mt-1">
                                    {formatTimestamp(system3.UPD_DATETIME)}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system3.WEB)}
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system3.DB)}
                              </TableCell>
                              <TableCell className="text-center border-r border-border/30 py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system3.MTSERVER)}
                              </TableCell>
                              <TableCell className="text-center py-3 transition-all duration-200 group-hover:bg-accent/10">
                                {getStatusIndicator(system3.IVRRPT)}
                              </TableCell>
                            </>
                          ) : (system1 || system2) ? (
                            <>
                              <TableCell className="border-r border-border/30 h-16"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell className="border-r border-border/30"></TableCell>
                              <TableCell></TableCell>
                            </>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {filteredData.length === 0 && !loading && (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-semibold mb-2">No systems found</h3>
            <p className="text-muted-foreground">
              {showFilter === 'ERRONLY' 
                ? 'No systems with errors detected'
                : 'No heartbeat data available'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer Stats */}
      <Card>
        <CardContent className="flex justify-between items-center py-4">
          <div className="text-sm font-medium">
            Monitoring {heartbeatData.length} systems 
            ({multiSystems.length} multi-component, {standaloneSystems.length} standalone)
          </div>
          <div className="text-xs text-muted-foreground">
            🔄 Auto-refresh every minute • 🔴 Red = Critical • 🟠 Orange = Warning • 🟢 Green = OK
          </div>
        </CardContent>
      </Card>
    </div>
  );
};