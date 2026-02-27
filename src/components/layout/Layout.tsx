import React, { useState, useEffect } from 'react';
import { BookOpen, Users, Settings, GraduationCap, Calendar, LogOut } from 'lucide-react';
import { supabase } from '../../services/supabase';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Layout = ({ children, currentView, onNavigate }: LayoutProps) => {
  const [rtoName, setRtoName] = useState('RTO Scheduler');

  useEffect(() => {
    const fetchOrganizationName = async () => {
      try {
        // 1. Get the currently logged-in user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 2. Find their Organization ID
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();

        if (profile && profile.organization_id) {
          // 3. Get the actual Organization Name
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', profile.organization_id)
            .single();

          if (org && org.name) {
            setRtoName(org.name);
          }
        }
      } catch (error) {
        console.error("Failed to load RTO name:", error);
      }
    };

    fetchOrganizationName();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { id: 'teachers', label: 'Teachers', icon: Users },
    { id: 'subjects', label: 'Subjects', icon: BookOpen },
    { id: 'courses', label: 'Courses', icon: GraduationCap },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <h1 
            className="text-xl font-extrabold text-blue-600 flex items-center gap-2 truncate"
            title={rtoName} // Shows full name on hover if it gets cut off
          >
            <GraduationCap className="shrink-0" />
            <span className="truncate">{rtoName}</span>
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                currentView === item.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};
