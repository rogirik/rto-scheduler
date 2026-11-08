import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';

export const MfaVerify = ({ onVerified, onSignOut }: { onVerified: () => void, onSignOut: () => void }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Two-Factor Required</h2>
        <p className="text-slate-500">Your account requires an additional security step to proceed.</p>
        
        {/* We will build the actual code-entry form here later */}
        
        <button onClick={onSignOut} className="px-4 py-2 text-slate-500 hover:text-slate-700 flex items-center justify-center gap-2 w-full mt-4 transition-colors">
          <LogOut size={16} /> Sign out for now
        </button>
      </div>
    </div>
  );
};