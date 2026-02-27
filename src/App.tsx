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
import { TeamSettings } from './components/features/settings/TeamSettings';
import { UpdatePasswordModal } from './components/auth/UpdatePasswordModal';

function App() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // NEW: State for the dynamic RTO Name
  const [rtoName, setRtoName] = useState('RTO Scheduler');

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

  // --- FETCH DYNAMIC RTO NAME ---
  useEffect(() => {
    const fetchOrganizationName = async () => {
      if (!session?.user) return;
      
      try {
        let myOrgId = null;

        // 1. Try to get it from user_profiles
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('organization_id')
            .eq('id', session.user.id)
            .single();
          if (profile) myOrgId = profile.organization_id;
        } catch (e) {
          // Ignore missing profile
        }

        // 2. Fallback to the teachers table
        if (!myOrgId) {
          const { data: teachers } = await supabase
            .from('teachers')
            .select('organization_id')
            .eq('user_id', session.user.id)
            .limit(1);
          
          if (teachers && teachers.length > 0) {
            myOrgId = teachers[0].organization_id;
          }
        }

        // 3. Fetch the actual name from the organizations table
        if (myOrgId) {
          const { data: org, error } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', myOrgId)
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
  }, [session]);

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
          {/* UPDATED: Dynamic RTO Name with truncation for long names */}
          <h1 
            className="text-xl font-extrabold text-blue-700 flex items-center gap-2 truncate pr-2"
            title={rtoName}
          >
            <GraduationCap size={28} className="shrink-0" />
            <span className="truncate">{rtoName}</span>
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
          <UpdatePasswordModal />
        </div>
      </main>

    </div>
  );
}

export default App;
