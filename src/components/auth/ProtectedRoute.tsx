import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean; // Set this to true for admin-only routes
}

export const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [needsMFA, setNeedsMFA] = useState<boolean>(false);
  const location = useLocation();

  useEffect(() => {
    const checkSecurityLevel = async () => {
      // 1. Check basic authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setIsAuthenticated(false);
        return;
      }

      // 2. Check Multi-Factor Authentication Assurance Level
      const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (mfaError) {
        console.error("MFA Check failed:", mfaError);
        setIsAuthenticated(false);
        return;
      }

      // If they logged in with a password (aal1) but their account requires an authenticator app (aal2)
      if (mfaData.currentLevel === 'aal1' && mfaData.nextLevel === 'aal2') {
        setNeedsMFA(true);
      }
      
      setIsAuthenticated(true);
    };

    checkSecurityLevel();
  }, [location.pathname]);

  // Show a spinner while we check the vault locks
  if (isAuthenticated === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  // Bounce unauthenticated users to the login page
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Bounce users who need a 2FA code to the verification screen
  if (needsMFA) {
    return <Navigate to="/mfa-verify" state={{ from: location }} replace />;
  }

  // If they pass all checks, let them into the page
  return <>{children}</>;
};