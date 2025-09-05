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
    // Check if the user is authenticated. If not, redirect to the login page.
    if (!isAuthenticated()) {
      // User not authenticated
      navigate('/login');
      return;
    }

    // If the route requires an admin and the user is not an admin, redirect them.
    if (requireAdmin && !isAdmin()) {
      // User is not an admin
      navigate('/login');
    }
  }, [navigate, requireAdmin]);

  // If all checks pass, render the child components (the protected route content).
  return (
    <>
      {children}
    </>
  );
};