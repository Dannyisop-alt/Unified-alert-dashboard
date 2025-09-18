import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated, isAdmin } from '@/lib/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin = false }) => {
  const navigate = useNavigate();

  useEffect(() => {
    console.log('\n🛡️ [PROTECTED] Checking route protection...');
    console.log(`🔒 [PROTECTED] Require admin: ${requireAdmin}`);
    
    // Check if the user is authenticated. If not, redirect to the login page.
    if (!isAuthenticated()) {
      console.log('❌ [PROTECTED] User not authenticated, redirecting to login');
      navigate('/login');
      return;
    }

    console.log('✅ [PROTECTED] User is authenticated');

    // If the route requires an admin and the user is not an admin, redirect them.
    if (requireAdmin && !isAdmin()) {
      console.log('❌ [PROTECTED] User is not admin, redirecting to login');
      navigate('/login');
      return;
    }

    if (requireAdmin) {
      console.log('✅ [PROTECTED] User is admin, access granted');
    } else {
      console.log('✅ [PROTECTED] User access granted');
    }
  }, [navigate, requireAdmin]);

  // If all checks pass, render the child components (the protected route content).
  return (
    <>
      {children}
    </>
  );
};