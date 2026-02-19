import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { Mail, Lock, Loader2, AlertCircle, CheckCircle2, Building2 } from 'lucide-react';

export const LoginView = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    orgName: '' 
  });

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        // --- 1. SIGN UP USER ---
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });
        if (authError) throw authError;
        if (!authData.user) throw new Error("No user created");

        // --- 2. SMART JOIN (Call the Database Function) ---
        // This function checks if the Org exists. If yes -> Join. If no -> Create.
        const { error: rpcError } = await supabase.rpc('join_or_create_org', {
          org_name: formData.orgName,
          target_user_id: authData.user.id
        });

        if (rpcError) throw rpcError;

        setMessage("Account created! You have joined the workspace.");
        
        // Force a page reload to grab the new permissions
        window.location.reload();

      } else {
        // --- SIGN IN ---
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error(error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        
        <div className="bg-slate-900 p-8 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">AS</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Academic Scheduler</h1>
          <p className="text-slate-400 text-sm mt-2">
            {isSignUp ? 'Join or Create Workspace' : 'Sign in to your Workspace'}
          </p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm rounded-xl flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div className="mb-6 p-4 bg-emerald-50 text-emerald-600 text-sm rounded-xl flex items-start gap-3">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            
            {/* Organisation Name (Only for Sign Up) */}
            {isSignUp && (
              <div className="animate-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Organisation Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    required={isSignUp}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    placeholder="Enter Exact RTO Name to Join"
                    value={formData.orgName}
                    onChange={e => setFormData({...formData, orgName: e.target.value})}
                  />
                  <p className="text-[10px] text-slate-400 mt-1 ml-1">
                    * Type the EXACT name to join an existing team.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  type="email" 
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  placeholder="name@company.com.au"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  type="password" 
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
            >
              {isLoading ? <Loader2 className="animate-spin" /> : (isSignUp ? 'Join / Create Workspace' : 'Sign In')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              {isSignUp ? "Already have an account? Sign In" : "New User? Join Team"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};