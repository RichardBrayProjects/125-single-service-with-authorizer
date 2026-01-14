import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { handleOAuthCallback } from '@/api';

const Callback: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Guard against React Strict Mode double-invocation or unexpected re-runs
    if (hasProcessed.current) return;

    const { code, state, errorParam, errorDescription } = extractOAuthParams();

    if (errorParam) {
      handleOAuthError(errorParam, errorDescription);
      return;
    }

    if (!code || !state) {
      handleMissingParams();
      return;
    }

    hasProcessed.current = true;
    handleSuccessfulAuth(code, state);
  }, [params, navigate, setUser]);

  return <p style={{ padding: 16 }}>Signing you in…</p>;

  // Helper functions (hoisted, so available above)
  function showErrorAndRedirect(message: string) {
    toast.error('Authentication Error', {
      description: message,
    });
    setTimeout(() => navigate('/', { replace: true }), 3000);
  }

  function extractOAuthParams() {
    const code = params.get('code');
    const state = params.get('state');
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');
    return { code, state, errorParam, errorDescription };
  }

  function handleOAuthError(errorParam: string, errorDescription: string | null) {
    const message = errorDescription
      ? `${errorParam}: ${decodeURIComponent(errorDescription)}`
      : errorParam;
    showErrorAndRedirect(message);
  }

  function handleMissingParams() {
    showErrorAndRedirect('Missing authorization code or state');
  }

  async function handleSuccessfulAuth(code: string, state: string) {
    try {
      const user = await handleOAuthCallback(code, state);
      setUser(user);
      navigate('/profile', { replace: true });
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to complete authentication';
      showErrorAndRedirect(errorMessage);
    }
  }
};

export default Callback;
