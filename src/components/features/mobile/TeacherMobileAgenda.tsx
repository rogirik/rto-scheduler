import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Calendar, ChevronRight, UserCheck, LogOut, User, BookOpen, Award } from 'lucide-react';
import { supabase } from '../../../services/supabase';

// Detail View Import
import { MobileClassDetailView } from './MobileClassDetailView';

export const TeacherMobileAgenda = ({ events = [] }) => {
  const [activeTab, setActiveTab] = useState<'agenda' | 'profile'>('agenda');
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  
  // Profile State
  const [userEmail, setUserEmail] = useState<string>('Loading...');
  const [teacherProfile, setTeacherProfile] = useState<any>(null);
  const [qualifications, setQualifications] = useState<string[]>([]);

  // Calculate stats from the events passed in
  const uniqueClasses = Array.from(new Set(events.map(e => e.summary)));
  const allocatedHours = events.reduce((sum, e) => sum + (e.hours || e.baseHours || 0), 0);

  useEffect(() => {
    const fetchProfileData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setUserEmail(user.email || 'Unknown Email');

      // 1. Fetch Teacher Profile (including the competencies ID array)
      const { data: teacher } = await supabase
        .from('teachers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (teacher) {
        setTeacherProfile(teacher);

        // 2. Translate those Subject IDs into actual Subject Names
        if (teacher.competencies && teacher.competencies.length > 0) {
          const { data: subjectNames, error } = await supabase
            .from('subjects')
            .select('name')
            .in('id', teacher.competencies); // Matches any ID in the array

          if (!error && subjectNames) {
            setQualifications(subjectNames.map(s => s.name).filter(Boolean));
          } else {
            setQualifications([]);
          }
        } else {
          // If the array is empty or null
          setQualifications([]);
        }
      }
    };

    fetchProfileData();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const sortedEvents = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  if (selectedEvent) {
    return <MobileClassDetailView event={selectedEvent} onBack={() => setSelectedEvent(null)} />;
  }

  // Calculate Capacity Metric for the Progress Bar
  const maxHours = teacherProfile?.max_hours || 800;
  const capacityPercentage = Math.min((allocatedHours / maxHours) * 100, 100);

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      
      {activeTab === 'agenda' ? (
        <>
          <div className="bg-blue-600 px-6 pt-14 pb-6 shadow-lg shrink-0">
            <h1 className="text-2xl font-bold text-white uppercase tracking-tight">My Teaching Agenda</h1>
            <p className="text-blue-100 text-sm mt-1">Upcoming sessions for this semester</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
            {sortedEvents.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                 <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                 <p>No classes scheduled yet.</p>
              </div>
            ) : (
              sortedEvents.map((event, idx) => {
                const dateObj = new Date(event.start);
                const isToday = new Date().toDateString() === dateObj.toDateString();

                return (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedEvent(event)}
                    className={`bg-white p-5 rounded-2xl shadow-sm border cursor-pointer active:scale-[0.98] transition-all ${isToday ? 'border-blue-400 ring-2 ring-blue-50' : 'border-slate-100'}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isToday ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {dateObj.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <button className="text-blue-500 flex items-center gap-1 text-xs font-bold bg-blue-50 px-2 py-1 rounded-lg">
                        Details <ChevronRight size={14} />
                      </button>
                    </div>

                    <h3 className="text-lg font-extrabold text-slate-800 leading-tight mb-1">
                      {event.summary}
                    </h3>
                    <p className="text-sm font-medium text-slate-500 mb-4">{event.instanceName}</p>

                    <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-2 text-slate-600 text-xs font-bold">
                        <Clock size={14} className="text-blue-500" />
                        <span>{dateObj.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} Start</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 text-xs font-bold">
                        <MapPin size={14} className="text-blue-500" />
                        <span>Room 102</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto pb-24">
          {/* Header Profile Section */}
          <div className="bg-white px-6 pt-14 pb-8 border-b border-slate-100 shrink-0 shadow-sm">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-md">
              {teacherProfile ? teacherProfile.name.charAt(0) : <User size={32} />}
            </div>
            <h1 className="text-2xl font-bold text-slate-800">{teacherProfile ? teacherProfile.name : 'Loading...'}</h1>
            <p className="text-slate-500 text-sm font-medium">{userEmail}</p>
          </div>

          <div className="p-4 space-y-4">
            
            {/* Workload Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Clock size={18} className="text-blue-600" /> My Workload
                    </h3>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                        {Math.round(allocatedHours)} / {maxHours} hrs
                    </span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-500 ${capacityPercentage > 100 ? 'bg-red-500' : capacityPercentage > 85 ? 'bg-orange-500' : 'bg-blue-500'}`} 
                        style={{ width: `${capacityPercentage}%` }}
                    ></div>
                </div>
            </div>

            {/* Current Classes Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
                    <BookOpen size={18} className="text-purple-600" /> Active Units
                </h3>
                {uniqueClasses.length === 0 ? (
                    <p className="text-sm text-slate-400">No active units assigned.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {uniqueClasses.map((className, i) => (
                            <span key={i} className="bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-purple-100">
                                {className as string}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Qualifications Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
                    <Award size={18} className="text-emerald-600" /> Qualifications
                </h3>
                {qualifications.length === 0 ? (
                    <p className="text-sm text-slate-400">No qualifications listed.</p>
                ) : (
                    <ul className="space-y-2">
                        {qualifications.map((qual, i) => (
                            <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0"></div>
                                <span className="leading-tight">{qual}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Sign Out Button */}
            <button 
              onClick={handleSignOut}
              className="w-full flex items-center justify-between p-5 mt-4 bg-white border border-red-100 rounded-2xl text-red-600 font-bold shadow-sm active:bg-red-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <LogOut size={20} />
                <span>Sign Out</span>
              </div>
            </button>
            
          </div>
        </div>
      )}

      <div className="fixed bottom-0 w-full bg-white border-t border-slate-200 px-10 py-4 flex justify-around items-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10">
        <button 
          onClick={() => { setActiveTab('agenda'); setSelectedEvent(null); }}
          className={`flex flex-col items-center gap-1 transition-colors cursor-pointer ${activeTab === 'agenda' ? 'text-blue-600' : 'text-slate-300'}`}
        >
          <Calendar size={22} />
          <span className="text-[10px] font-bold">Agenda</span>
        </button>
        <button 
          onClick={() => { setActiveTab('profile'); setSelectedEvent(null); }}
          className={`flex flex-col items-center gap-1 transition-colors cursor-pointer ${activeTab === 'profile' ? 'text-blue-600' : 'text-slate-300'}`}
        >
          <UserCheck size={22} />
          <span className="text-[10px] font-bold">Profile</span>
        </button>
      </div>
    </div>
  );
};