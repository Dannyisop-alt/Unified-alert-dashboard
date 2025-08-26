import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getToken, clearAuth, getEmail, isAdmin } from '@/lib/auth';
import { UserPlus, Edit, LogOut, Users, Trash2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface User {
  email: string;
  access: string[];
  role: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchUserId, setSearchUserId] = useState('');

  // Check if user is admin on component mount
  useEffect(() => {
    if (!isAdmin()) {
      navigate('/login', { replace: true });
      return;
    }
    fetchUsers();
  }, [navigate]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/auth/admin/users`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      
      const userData = await response.json();
      setUsers(userData);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = () => {
    navigate('/admin/create-user');
  };

  const handleEditUser = () => {
    if (!searchUserId.trim()) {
      setError('Please enter a user email to edit');
      return;
    }
    navigate(`/admin/edit-user/${encodeURIComponent(searchUserId.trim())}`);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm(`Are you sure you want to delete user: ${userId}?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin/user/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      // Refresh users list
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">Welcome, {getEmail()}</p>
          </div>
          <Button onClick={handleLogout} variant="outline" className="gap-2">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* User Management Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>
                Create new users and manage existing accounts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Create User */}
              <div className="space-y-2">
                <Button onClick={handleCreateUser} className="w-full gap-2">
                  <UserPlus className="h-4 w-4" />
                  Create New User
                </Button>
              </div>

              <Separator />

              {/* Edit User */}
              <div className="space-y-2">
                <Label htmlFor="searchUserId">Edit User</Label>
                <div className="flex gap-2">
                  <Input
                    id="searchUserId"
                    placeholder="Enter user email to edit"
                    value={searchUserId}
                    onChange={(e) => setSearchUserId(e.target.value)}
                  />
                  <Button onClick={handleEditUser} variant="outline" className="gap-2">
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current Users List */}
          <Card>
            <CardHeader>
              <CardTitle>Current Users</CardTitle>
              <CardDescription>
                {loading ? 'Loading users...' : `${users.length} total users`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="text-center text-muted-foreground">Loading...</div>
                ) : users.length === 0 ? (
                  <div className="text-center text-muted-foreground">No users found</div>
                ) : (
                  users.map((user) => (
                    <div key={user.email} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{user.email}</div>
                          <div className="text-sm text-muted-foreground">
                            Created: {formatDate(user.createdAt)}
                          </div>
                          <div className="flex gap-1 mt-2">
                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                              {user.role}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {user.access.map((access) => (
                              <Badge key={access} variant="outline" className="text-xs">
                                {access}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {user.role !== 'admin' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/admin/edit-user/${encodeURIComponent(user.email)}`)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteUser(user.email)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}