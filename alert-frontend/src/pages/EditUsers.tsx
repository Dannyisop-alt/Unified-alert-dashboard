import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, ArrowLeft, Save } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getToken, isAdmin } from '@/lib/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PASSWORD_REGEX = /^(?=(?:.*[A-Z]){2,})(?=(?:.*[a-z]){2,})(?=(?:.*\d){2,})(?=(?:.*[^A-Za-z\d]){2,}).{12,}$/;
const PASSWORD_BLACKLIST = ['hbss', 'qyryde'];

interface UserData {
  email: string;
  access: string[];
  role: string;
  createdAt: string;
}

export default function EditUser() {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [access, setAccess] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Verify admin access and fetch user data on component mount
  useEffect(() => {
    if (!isAdmin()) {
      navigate('/login', { replace: true });
      return;
    }

    if (!userId) {
      setError('No user ID provided');
      setFetchLoading(false);
      return;
    }

    fetchUserData();
  }, [navigate, userId]);

  const fetchUserData = async () => {
    try {
      setFetchLoading(true);
      const response = await fetch(`${API_BASE_URL}/auth/admin/user/${encodeURIComponent(userId!)}`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          navigate('/login', { replace: true });
          return;
        }
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch user data');
      }

      const data = await response.json();
      setUserData(data);
      setAccess(data.access || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load user data');
    } finally {
      setFetchLoading(false);
    }
  };

  const toggleAccess = (label: string) => {
    setAccess((prev) => {
      const has = prev.includes(label);
      if (has) {
        const filtered = prev.filter((a) => a !== label);
        // enforce min 1 value
        return filtered.length === 0 ? prev : filtered;
      }
      const next = [...prev, label];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate password if provided
    if (password) {
      const lower = password.toLowerCase();
      if (PASSWORD_BLACKLIST.some(w => lower.includes(w))) {
        setError('hbss,qyryde not allowed in password');
        return;
      }
    }
    if (password && !PASSWORD_REGEX.test(password)) {
      setError('Password must be 12+ chars with 2 upper, 2 lower, 2 digits, 2 specials.');
      return;
    }

    const accessCsv = access.join(', ');
    const updateData: any = { access: accessCsv };
    if (password) {
      updateData.password = password;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/auth/admin/user/${encodeURIComponent(userId!)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(updateData)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403) {
          navigate('/login', { replace: true });
          return;
        }
        throw new Error(data.error || 'Failed to update user');
      }

      setSuccess('User updated successfully. Returning to admin dashboard...');
      toast({ title: 'User updated', description: 'User has been updated successfully.' });
      setTimeout(() => navigate('/admin'), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/admin');
  };

  const AccessOption = ({ label }: { label: string }) => {
    const checked = access.includes(label);
    return (
      <button
        type="button"
        onClick={() => toggleAccess(label)}
        className={`px-3 py-2 rounded border text-sm ${checked ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'}`}
      >
        {label}
      </button>
    );
  };

  if (fetchLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-xl shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="text-lg">Loading user data...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-xl shadow-lg">
          <CardContent className="p-8 text-center space-y-4">
            <div className="text-lg text-destructive">User not found</div>
            <Button onClick={handleBack} variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Admin
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Button onClick={handleBack} variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <CardTitle>Edit User Account</CardTitle>
              <CardDescription>Modify user permissions and settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* User Info Display */}
          <div className="mb-6 p-4 bg-muted rounded-lg space-y-2">
            <div className="font-medium">User Information</div>
            <div className="text-sm">
              <div><strong>Email:</strong> {userData.email}</div>
              <div><strong>Created:</strong> {new Date(userData.createdAt).toLocaleString()}</div>
              <div className="flex items-center gap-2 mt-2">
                <strong>Role:</strong>
                <Badge variant={userData.role === 'admin' ? 'default' : 'secondary'}>
                  {userData.role}
                </Badge>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password (optional)</Label>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? 'text' : 'password'} 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="Leave empty to keep current password"
                    className="pr-10" 
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">
                  If provided, must be 12+ chars with 2 uppercase, 2 lowercase, 2 digits, 2 special.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Access Permissions</Label>
              <div className="flex flex-wrap gap-2">
                <AccessOption label="Infrastructure Alerts" />
                <AccessOption label="Application Logs" />
                <AccessOption label="Application Heartbeat" />
              </div>
              <div className="text-xs text-muted-foreground">Select at least one. Max is all three.</div>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
            {success && <div className="text-sm text-emerald-600">{success}</div>}

            <div className="flex justify-center">
              <Button type="submit" disabled={loading} className="w-full gap-2">
                <Save className="h-4 w-4" />
                {loading ? 'Updating User...' : 'Update User'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}