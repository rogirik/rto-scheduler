import React, { useState, useEffect } from 'react';
import { supabase } from './services/supabase'; // Import Supabase client
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  GraduationCap, 
  Calendar, 
  Settings, 
  LogOut,
  Loader2 
} from 'lucide-react';

// Auth Component
import { LoginView } from './components/auth/LoginView'; 

// Feature Components
import { Dashboard } from './components/features/dashboard/Dashboard'; 
import { TeacherList } from './components/features/teachers/TeacherList';
import { SubjectList } from './components/features/subjects/SubjectList';
import { CourseList } from './components/features/courses/CourseList';
import { CalendarView } from './components/features/calendar/CalendarView'; 
import { SettingsView } from './components/features/settings/SettingsView'; 

function App() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  // --- AUTH LISTENER ---
  useEffect(() => {
    // 1. Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    // 2. Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'teachers':
        return <TeacherList />;
      case 'subjects':
        return <SubjectList />;
      case 'courses':
        return <CourseList />;
      case 'calendar':
        return <CalendarView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  };

  const NavItem = ({ id, icon: Icon, label }: { id: string, icon: any, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all mb-1 font-medium ${
        activeTab === id 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  // --- RENDER STATES ---

  // 1. Loading Spinner (while checking if logged in)
  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 text-blue-600">
        <Loader2 className="animate-spin" size={40} />
      </div>
    );
  }

  // 2. Login Screen (if not logged in)
  if (!session) {
    return <LoginView />;
  }

  // 3. Main App (if logged in)
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-10">
        <div className="p-6">
          <h1 className="text-xl font-extrabold text-blue-700 flex items-center gap-2">
            <GraduationCap size={28} />
            RTO Scheduler
          </h1>
        </div>

        <nav className="flex-1 px-4 overflow-y-auto">
          <div className="space-y-1">
            <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
            <NavItem id="teachers" icon={Users} label="Teachers" />
            <NavItem id="subjects" icon={BookOpen} label="Subjects" />
            <NavItem id="courses" icon={GraduationCap} label="Courses" />
            <NavItem id="calendar" icon={Calendar} label="Calendar" />
          </div>

          <div className="mt-8 pt-8 border-t border-slate-100 space-y-1">
            <NavItem id="settings" icon={Settings} label="Settings" />
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

    </div>
  );
}

export default App;