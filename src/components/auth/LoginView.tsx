import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { Mail, Lock, Loader2, AlertCircle, CheckCircle2, Building2, Ticket, ArrowLeft, KeyRound } from 'lucide-react';

export const LoginView = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'signin' | 'signup' | 'forgot'>('signin'); // New State
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    input: '' 
  });

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      // --- 1. FORGOT PASSWORD ---
      if (view === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
          redirectTo: window.location.origin, // Redirects back to your app
        });
        if (error) throw error;
        setMessage("Check your email for the password reset link.");
      } 
      
      // --- 2. SIGN UP ---
      else if (view === 'signup') {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });
        if (authError) throw authError;
        if (!authData.user) throw new Error("No user created");

        // Join/Create Logic
        const { data, error: rpcError } = await supabase.rpc('join_via_code_or_create', {
          input_text: formData.input,
          user_email: formData.email,
          target_user_id: authData.user.id
        });

        if (rpcError) throw rpcError;
        
        const result = data as any;
        if (result.status === 'joined') setMessage("Success! You have joined the team.");
        else setMessage("Success! New RTO Workspace created.");
        
        window.location.reload();
      } 
      
      // --- 3. SIGN IN ---
      else {
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
            {view === 'signup' ? 'Join Team or Create RTO' : (view === 'forgot' ? 'Reset Password' : 'Sign in to your Workspace')}
          </p>
        </div>

        <div className="p-8">
          {error && <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm rounded-xl flex items-start gap-3"><AlertCircle size={18} /><span>{error}</span></div>}
          {message && <div className="mb-6 p-4 bg-emerald-50 text-emerald-600 text-sm rounded-xl flex items-start gap-3"><CheckCircle2 size={18} /><span>{message}</span></div>}

          <form onSubmit={handleAuth} className="space-y-4">
            
            {/* SIGN UP FIELDS */}
            {view === 'signup' && (
              <div className="animate-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Join Code OR New RTO Name</label>
                <div className="relative">
                  <Ticket className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    required={view === 'signup'}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    placeholder="e.g. A9F2B3 (to join) or 'My College' (to create)"
                    value={formData.input}
                    onChange={e => setFormData({...formData, input: e.target.value})}
                  />
                </div>
              </div>
            )}

            {/* EMAIL (Always Visible) */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  type="email" 
                  required 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                />
              </div>
            </div>

            {/* PASSWORD (Hidden for Forgot Password) */}
            {view !== 'forgot' && (
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input 
                    type="password" 
                    required={view !== 'forgot'}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                  />
                </div>
                {view === 'signin' && (
                  <div className="text-right mt-2">
                    <button 
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200">
              {isLoading ? <Loader2 className="animate-spin" /> : (
                view === 'signup' ? 'Continue' : (view === 'forgot' ? 'Send Reset Link' : 'Sign In')
              )}
            </button>
          </form>

          {/* TOGGLE LINKS */}
          <div className="mt-6 text-center space-y-2">
            {view === 'forgot' ? (
              <button onClick={() => setView('signin')} className="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center justify-center gap-2 mx-auto">
                <ArrowLeft size={16} /> Back to Sign In
              </button>
            ) : (
              <button 
                onClick={() => setView(view === 'signin' ? 'signup' : 'signin')} 
                className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                {view === 'signin' ? "New User? Join Team" : "Already have an account? Sign In"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};