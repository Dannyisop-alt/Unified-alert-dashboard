import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { getToken, isAdmin } from '@/lib/auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PASSWORD_REGEX = /^(?=(?:.*[A-Z]){2,})(?=(?:.*[a-z]){2,})(?=(?:.*\d){2,})(?=(?:.*[^A-Za-z\d]){2,}).{12,}$/;
const PASSWORD_BLACKLIST = ['hbss', 'qyryde'];

export default function CreateUser() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [access, setAccess] = useState(['Infrastructure Alerts']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Verify admin access on component mount
  useEffect(() => {
    if (!isAdmin()) {
      navigate('/login', { replace: true });
      return;
    }
  }, [navigate]);

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
    
    const lower = password.toLowerCase();
    if (PASSWORD_BLACKLIST.some(w => lower.includes(w))) {
      setError('hbss,qyryde not allowed in password');
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setError('Password must be 12+ chars with 2 upper, 2 lower, 2 digits, 2 specials.');
      return;
    }
    
    const accessCsv = access.join(', ');
    
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/auth/admin/create-user`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ email, password, access: accessCsv })
      });
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        if (res.status === 403) {
          navigate('/login', { replace: true });
          return;
        }
        throw new Error(data.error || 'Failed to create user');
      }
      
      setSuccess('User created successfully. Returning to admin dashboard...');
      toast({ title: 'User created', description: 'New user has been created successfully.' });
      setTimeout(() => navigate('/admin'), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
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
              <CardTitle>Create User Account</CardTitle>
              <CardDescription>Create a new user for the alerts dashboard</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
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
                  Must be 12+ chars with 2 uppercase, 2 lowercase, 2 digits, 2 special.
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
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creating User...' : 'Create User'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}