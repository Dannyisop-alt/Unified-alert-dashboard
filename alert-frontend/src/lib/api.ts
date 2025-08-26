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
        'Authorization': `Bearer ${getToken()}`,
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
        'Authorization': `Bearer ${getToken()}`,
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
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Failed to trigger OCI alert pull');
    return response.json();
  },

  // ADMIN API CALLS
  async adminCreateUser(userData: { email: string; password: string; access: string }): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/create-user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to create user');
    }
    
    return response.json();
  },

  async adminGetUser(userId: string): Promise<{
    email: string;
    access: string[];
    role: string;
    createdAt: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/user/${encodeURIComponent(userId)}`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to fetch user');
    }
    
    return response.json();
  },

  async adminUpdateUser(userId: string, updateData: { password?: string; access?: string }): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/user/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to update user');
    }
    
    return response.json();
  },

  async adminListUsers(): Promise<Array<{
    email: string;
    access: string[];
    role: string;
    createdAt: string;
  }>> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/users`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to fetch users');
    }
    
    return response.json();
  },

  async adminDeleteUser(userId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/admin/user/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to delete user');
    }
    
    return response.json();
  }
};