import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveAuth } from '@/lib/auth';
import { Eye, EyeOff } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    console.log('\n🔐 [LOGIN] Starting frontend login process...');
    console.log(`📧 [LOGIN] Email: ${email}`);
    console.log(`🔑 [LOGIN] Password: ${password.substring(0, 3)}***`);
    console.log(`🌐 [LOGIN] API URL: ${API_BASE_URL}`);
    
    try {
      const requestBody = { email, password };
      console.log(`📦 [LOGIN] Request body: ${JSON.stringify(requestBody)}`);
      
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      console.log(`📡 [LOGIN] Response status: ${res.status}`);
      console.log(`📡 [LOGIN] Response headers:`, Object.fromEntries(res.headers.entries()));
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`❌ [LOGIN] Error response: ${JSON.stringify(data)}`);
        throw new Error(data.error || 'Login failed');
      }
      
      const data = await res.json();
      console.log(`✅ [LOGIN] Success response: ${JSON.stringify(data, null, 2)}`);
      
      // Save authentication data including role
      console.log('💾 [LOGIN] Saving authentication data...');
      saveAuth(data.token, data.access, email, data.role);
      
      console.log('🚀 [LOGIN] Redirecting to dashboard...');
      // Redirect all users (including admin) to alerts dashboard
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      console.error(`❌ [LOGIN] Login error:`, err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your alerts dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            </div>
            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
            <div className="flex justify-center">
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}