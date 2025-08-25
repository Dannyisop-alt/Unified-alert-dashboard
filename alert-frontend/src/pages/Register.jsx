import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PASSWORD_REGEX = /^(?=(?:.*[A-Z]){2,})(?=(?:.*[a-z]){2,})(?=(?:.*\d){2,})(?=(?:.*[^A-Za-z\d]){2,}).{12,}$/;

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [access, setAccess] = useState(['Infrastructure Alerts']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const toggleAccess = (label) => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!PASSWORD_REGEX.test(password)) {
      setError('Password must be 12+ chars with 2 upper, 2 lower, 2 digits, 2 specials.');
      return;
    }
    const accessCsv = access.join(', ');
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, access: accessCsv })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setSuccess('Account created successfully. Redirecting to sign in...');
      toast({ title: 'Account created', description: 'Please sign in with your new credentials.' });
      setTimeout(() => navigate('/login'), 900);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const AccessOption = ({ label }) => {
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
          <CardTitle>Create account</CardTitle>
          <CardDescription>Register to access the alerts dashboard</CardDescription>
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
              <Label>Access</Label>
              <div className="flex flex-wrap gap-2">
                <AccessOption label="Infrastructure Alerts" />
                <AccessOption label="Application Logs" />
                <AccessOption label="Application Heartbeat" />
              </div>
              <div className="text-xs text-muted-foreground">Select at least one. Max is all three.</div>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            {success && <div className="text-sm text-emerald-600">{success}</div>}
            <div className="flex items-center justify-between">
              <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</Button>
              <Link to="/login" className="text-sm text-primary underline-offset-4 hover:underline">Have an account? Sign in</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


