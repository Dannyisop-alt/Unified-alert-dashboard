import type { GraylogAlert, OCIAlert } from '@/types/alerts';
import { getToken } from '@/lib/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const api = {
  // Fetch Graylog alerts
  async getGraylogAlerts(params?: { severity?: string; limit?: number }): Promise<GraylogAlert[]> {
    const url = new URL(`${API_BASE_URL}/graylog-alerts`);
    if (params?.severity) url.searchParams.set('severity', params.severity);
    if (params?.limit) url.searchParams.set('limit', params.limit.toString());
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${getToken() || ''}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Failed to fetch Graylog alerts');
    return response.json();
  },

  // Fetch Infrastructure/OCI alerts
  async getOCIAlerts(params?: { 
    severity?: string; 
    vm?: string; 
    tenant?: string; 
    region?: string; 
    alertType?: string; 
    limit?: number;
  }): Promise<OCIAlert[]> {
    const url = new URL(`${API_BASE_URL}/oci-alerts`);
    if (params?.severity) url.searchParams.set('severity', params.severity);
    if (params?.vm) url.searchParams.set('vm', params.vm);
    if (params?.tenant) url.searchParams.set('tenant', params.tenant);
    if (params?.region) url.searchParams.set('region', params.region);
    if (params?.alertType) url.searchParams.set('alertType', params.alertType);
    if (params?.limit) url.searchParams.set('limit', params.limit.toString());
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${getToken() || ''}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Failed to fetch OCI alerts');
    return response.json();
  },

  // Mark alert as read
  async markGraylogAlertAsRead(id: string, read: boolean): Promise<GraylogAlert> {
    const response = await fetch(`${API_BASE_URL}/graylog-alerts/${id}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read })
    });
    if (!response.ok) throw new Error('Failed to update Graylog alert');
    return response.json();
  },

  async markOCIAlertAsRead(id: string, read: boolean): Promise<OCIAlert> {
    const response = await fetch(`${API_BASE_URL}/oci-alerts/${id}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read })
    });
    if (!response.ok) throw new Error('Failed to update OCI alert');
    return response.json();
  },


  // Get filter options for OCI alerts
  async getOCIFilterOptions(): Promise<{
    vms: string[];
    tenants: string[];
    regions: string[];
    alertTypes: string[];
    severities: string[];
  }> {
    const response = await fetch(`${API_BASE_URL}/oci-alerts/filters`);
    if (!response.ok) throw new Error('Failed to fetch filter options');
    return response.json();
  },

  // Trigger fresh OCI alert pull
  async triggerOCIAlertPull(): Promise<{ message: string; newAlerts: any[] }> {
    const response = await fetch(`${API_BASE_URL}/oci-alerts/pull`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken() || ''}`,
      }
    });
    if (!response.ok) throw new Error('Failed to trigger OCI alert pull');
    return response.json();
  }
};