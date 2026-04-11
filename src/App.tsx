import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from './services/supabase'; 
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  GraduationCap, 
  Calendar, 
  Settings, 
  LogOut,
  Loader2,
  Bell,
  Check,
  X
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
import { UpdatePasswordModal } from './components/auth/UpdatePasswordModal';

function App() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [rtoName, setRtoName] = useState('RTO Scheduler');
  
  // NEW: Track the role so we know what sidebar links to show!
  const [userRole, setUserRole] = useState<'admin' | 'teacher'>('teacher');

  // --- NOTIFICATION STATE ---
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // --- MOBILE DETECTION ---
  const [isMobile, setIsMobile] = useState(Capacitor.isNativePlatform() || window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(Capacitor.isNativePlatform() || window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- AUTH LISTENER ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- FETCH DYNAMIC RTO NAME, ROLE & NOTIFICATIONS ---
  useEffect(() => {
    const fetchUserData = async () => {
      if (!session?.user) return;
      
      try {
        let myOrgId = null;
        let role: 'admin' | 'teacher' = 'teacher';

        // 1. Fetch Profile (Gets Role and Org ID)
        try {
          const { data: profile } = await supabase.from('user_profiles').select('organization_id, role').eq('id', session.user.id).single();
          if (profile) {
              myOrgId = profile.organization_id;
              if (profile.role === 'admin') role = 'admin';
          }
        } catch (e) {}

        setUserRole(role); // Save the role to state

        if (!myOrgId) {
          const { data: teachers } = await supabase.from('teachers').select('organization_id').eq('user_id', session.user.id).limit(1);
          if (teachers && teachers.length > 0) myOrgId = teachers[0].organization_id;
        }

        if (myOrgId) {
          const { data: org } = await supabase.from('organizations').select('name').eq('id', myOrgId).single();
          if (org && org.name) setRtoName(org.name);
        }

        // 2. Fetch Notifications
        const { data: notifs } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(20);
          
        if (notifs) setNotifications(notifs);

      } catch (error) {
        console.error("Failed to load user data:", error);
      }
    };

    fetchUserData();

    // 3. Real-time Notification Listener
    if (session?.user) {
        const notifSubscription = supabase
            .channel('public:notifications')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'notifications', 
                filter: `user_id=eq.${session.user.id}` 
            }, (payload) => {
                setNotifications((current) => [payload.new, ...current]);
            })
            .subscribe();

        return () => { supabase.removeChannel(notifSubscription); };
    }
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // --- NOTIFICATION HANDLERS ---
  const markAsRead = async (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ user_id: session?.user?.id }).eq('is_read', true);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'teachers': return <TeacherList />;
      case 'subjects': return <SubjectList />;
      case 'courses': return <CourseList />;
      case 'calendar': return <CalendarView />;
      case 'settings': return <SettingsView />;
      default: return <Dashboard />;
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

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 text-blue-600">
        <Loader2 className="animate-spin" size={40} />
      </div>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  return (
    <div className={`flex h-screen bg-slate-50 font-sans text-slate-900 relative ${isMobile ? 'overflow-hidden' : ''}`}>
      
      {/* SIDEBAR - Only show on Desktop */}
      {!isMobile && (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-20">
          <div className="p-6 flex items-center justify-between">
            <h1 className="text-xl font-extrabold text-blue-700 flex items-center gap-2 truncate pr-2" title={rtoName}>
              <GraduationCap size={28} className="shrink-0" />
              <span className="truncate">{rtoName}</span>
            </h1>

            {/* NOTIFICATION BELL */}
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors relative"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
              )}
            </button>
          </div>

          <nav className="flex-1 px-4 overflow-y-auto">
            <div className="space-y-1">
              {/* Dashboard is named "My Portal" for Teachers */}
              <NavItem id="dashboard" icon={LayoutDashboard} label={userRole === 'admin' ? "Dashboard" : "My Portal"} />
              
              {/* Only Admins see these three tabs */}
              {userRole === 'admin' && (
                <>
                  <NavItem id="teachers" icon={Users} label="Teachers" />
                  <NavItem id="subjects" icon={BookOpen} label="Subjects" />
                  <NavItem id="courses" icon={GraduationCap} label="Courses" />
                </>
              )}
              
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
      )}

      {/* NOTIFICATION FLYOUT PANEL - Desktop Only */}
      {!isMobile && isNotificationsOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsNotificationsOpen(false)}></div>
          <div className="fixed top-6 left-64 ml-4 w-96 max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Bell size={16} className="text-blue-600" /> Notifications
              </h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors">Mark all read</button>
                )}
                <button onClick={() => setIsNotificationsOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={16}/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">You're all caught up!</div>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} onClick={() => markAsRead(notif.id)} className={`p-3 rounded-xl cursor-pointer transition-colors ${notif.is_read ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/50 border border-blue-100'}`}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <h4 className={`text-sm ${notif.is_read ? 'font-medium text-slate-700' : 'font-bold text-blue-900'}`}>{notif.title}</h4>
                        <p className={`text-xs mt-1 leading-relaxed ${notif.is_read ? 'text-slate-500' : 'text-slate-700'}`}>{notif.message}</p>
                        <span className="text-[10px] text-slate-400 mt-2 block font-medium uppercase tracking-wider">
                          {new Date(notif.created_at).toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {!notif.is_read && <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1"></div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* MAIN CONTENT AREA - Mobile friendly layout */}
      <main className={`flex-1 overflow-y-auto h-screen ${isMobile ? 'ml-0 p-0' : 'ml-64 p-8'}`}>
        <div className={isMobile ? 'w-full h-full' : 'max-w-7xl mx-auto'}>
          {renderContent()}
          <UpdatePasswordModal />
        </div>
      </main>

    </div>
  );
}

export default App;