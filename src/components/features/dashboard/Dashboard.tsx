import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import type { Teacher, Course, Subject, AcademicYear } from '../../../services/api';
import { 
  Users, 
  GraduationCap, 
  Calendar, 
  TrendingUp, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  MoreHorizontal, 
  Bell, 
  AlertTriangle,
  User,
  Clock,
  BookOpen,
  Award,
  CalendarOff,
  Plus,
  Trash2
} from 'lucide-react';

// Mobile View
import { TeacherMobileAgenda } from '../mobile/TeacherMobileAgenda';

export const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'teacher'>('teacher');
  const [userEmail, setUserEmail] = useState<string>('');
  const [allEvents, setAllEvents] = useState<any[]>([]);
  
  const [isMobile, setIsMobile] = useState(Capacitor.isNativePlatform() || window.innerWidth < 768);

  const [stats, setStats] = useState({ activeCohorts: 0, totalTeachers: 0, totalUnitsRequired: 0, assignedUnits: 0, allocationPercentage: 0, staffUtilization: 0 });
  const [trainerWorkload, setTrainerWorkload] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<{ id: string, type: 'error' | 'warning', message: string }[]>([]);

  // --- TEACHER SPECIFIC STATE ---
  const [myProfile, setMyProfile] = useState<any>(null);
  const [myQualifications, setMyQualifications] = useState<string[]>([]);
  const [blackoutDates, setBlackoutDates] = useState<any[]>([]);
  const [isAddingLeave, setIsAddingLeave] = useState(false);
  const [newLeaveStart, setNewLeaveStart] = useState('');
  const [newLeaveEnd, setNewLeaveEnd] = useState('');
  const [newLeaveReason, setNewLeaveReason] = useState('');

  useEffect(() => {
    const handleResize = () => setIsMobile(Capacitor.isNativePlatform() || window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || '');

      const [iRes, tRes, aRes, tempRes, subRes, yRes] = await Promise.all([
        ApiService.getCourseInstances(),
        supabase.from('teachers').select('*'), 
        ApiService.getAllocationsGlobal(),
        ApiService.getAll<Course>('course_templates'),
        ApiService.getSubjects(),
        ApiService.getAll<AcademicYear>('academic_years')
      ]);

      let instances = iRes || [];
      let teachers = tRes.data || [];
      let allocations = aRes || [];
      let templates = tempRes || [];
      let subjects = subRes || [];
      let academicYears = yRes || [];
      let myOrgId = null;
      let role: 'admin' | 'teacher' = 'teacher';

      if (user) {
          try {
              const { data: profile } = await supabase.from('user_profiles').select('organization_id, role').eq('id', user.id).single();
              if (profile) {
                  myOrgId = profile.organization_id;
                  if (profile.role === 'admin') role = 'admin';
              }
          } catch (e) {}

          if (!myOrgId) {
              const myKnownTeacher = teachers.find(t => t.user_id === user.id && t.organization_id);
              myOrgId = myKnownTeacher?.organization_id;
          }

          setUserRole(role);

          const isMine = (item: any) => {
              if (myOrgId) {
                  if (item.organization_id) return item.organization_id === myOrgId;
                  return item.user_id === user.id;
              }
              return item.user_id === user.id;
          };

          const isMineOrGlobal = (item: any) => {
              if (!item.organization_id) return true; 
              if (myOrgId) return item.organization_id === myOrgId;
              return item.user_id === user.id;
          };

          instances = instances.filter(isMine);
          teachers = teachers.filter(isMine);
          templates = templates.filter(isMineOrGlobal);
          const validInstanceIds = new Set(instances.map(i => i.id));
          allocations = allocations.filter(a => validInstanceIds.has(a.instance_id));
      }

      const activeInstances = instances.filter(i => i.status !== 'completed');
      const currentYear = new Date().getFullYear(); 
      const teacherHoursMap: Record<string, number> = {};
      const tSchedules: Record<string, any[]> = {};
      const newAlerts: { id: string, type: 'error' | 'warning', message: string }[] = [];
      const generatedEvents: any[] = [];

      teachers.forEach(t => { teacherHoursMap[t.id] = 0; tSchedules[t.id] = []; });

      activeInstances.forEach(instance => {
        const template = templates.find(t => t.id === instance.template_id);
        if (template) {
            const requiredSubjects = (template as any).sequenced_subjects?.length || 0;
            const assignedSubjects = allocations.filter((a: any) => a.instance_id === instance.id).length;
            
            if (assignedSubjects < requiredSubjects && instance.start_date) {
                const today = new Date();
                const startDate = new Date(instance.start_date);
                const daysUntil = Math.floor((startDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                if (daysUntil <= 28 && daysUntil >= 0) {
                    newAlerts.push({ id: `missing-${instance.id}`, type: daysUntil <= 14 ? 'error' : 'warning', message: `Cohort ${instance.name} starts in ${daysUntil} days but has ${requiredSubjects - assignedSubjects} unassigned subjects.` });
                }
            }

            const events = generateAllEventsForInstance(instance, academicYears, template as any, subjects, teachers);

            events.forEach(event => {
                const allocation = allocations.find((a: any) => a.instance_id === instance.id && a.subject_id === event.subjectId);
                if (allocation && allocation.teacher_id) {
                    const eventDate = typeof event.start === 'string' ? new Date(event.start) : event.start;
                    if (eventDate.getFullYear() === currentYear) {
                        if (teacherHoursMap[allocation.teacher_id] !== undefined) teacherHoursMap[allocation.teacher_id] += (event.hours || event.baseHours || 0);
                    }
                    if (tSchedules[allocation.teacher_id]) tSchedules[allocation.teacher_id].push({ ...event, instanceName: instance.name });
                    generatedEvents.push({ ...event, teacher_id: allocation.teacher_id, instanceName: instance.name });
                }
            });
        }
      });

      if (user) {
        const currentTeacher = teachers.find(t => t.user_id === user.id);
        if (currentTeacher) {
          setAllEvents(generatedEvents.filter(e => e.teacher_id === currentTeacher.id));
          
          if (role === 'teacher') {
            setMyProfile(currentTeacher);
            setBlackoutDates(currentTeacher.blackout_dates || []); // Load existing leave dates
            if (currentTeacher.competencies) {
              const quals = subjects.filter(s => currentTeacher.competencies.includes(s.id)).map(s => s.name);
              setMyQualifications(quals);
            }
          }
        }
      }

      let workload = teachers.map(teacher => {
        const allocatedHours = Math.round(teacherHoursMap[teacher.id] || 0);
        const maxHours = teacher.max_hours || 800; 
        const capacityMetric = maxHours > 0 ? (allocatedHours / maxHours) * 100 : 0;
        if (allocatedHours > maxHours) newAlerts.push({ id: `over-${teacher.id}`, type: 'error', message: `${teacher.name} is over-allocated (${allocatedHours} / ${maxHours} hrs).` });
        return { ...teacher, allocatedHours, maxHours, capacityMetric };
      });

      workload.sort((a, b) => b.capacityMetric - a.capacityMetric);
      if (role === 'teacher' && user) workload = workload.filter(w => w.user_id === user.id);
      setTrainerWorkload(workload);

      Object.keys(tSchedules).forEach(tId => {
          const events = tSchedules[tId].sort((a, b) => a.start.getTime() - b.start.getTime());
          const teacherName = teachers.find(t => t.id === tId)?.name || 'Unknown Teacher';
          for (let i = 0; i < events.length - 1; i++) {
              const current = events[i];
              const next = events[i+1];
              if (next.start.getTime() < current.end.getTime()) {
                  const dateStr = current.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
                  newAlerts.push({ id: `clash-${tId}-${i}`, type: 'error', message: `Clash: ${teacherName} is double-booked on ${dateStr} (${current.instanceName} and ${next.instanceName}).` });
              }
          }
      });

      newAlerts.sort((a, b) => (a.type === 'error' ? -1 : 1) - (b.type === 'error' ? -1 : 1));
      setAlerts(newAlerts);

      const assignedUnits = allocations.filter((a: any) => activeInstances.some(i => i.id === a.instance_id)).length;
      let totalUnitsRequired = 0;
      activeInstances.forEach(instance => {
        const template = templates.find(t => t.id === instance.template_id);
        if (template && (template as any).sequenced_subjects) totalUnitsRequired += (template as any).sequenced_subjects.length;
      });
      const uniqueTeachersAllocated = new Set(allocations.map((a: any) => a.teacher_id)).size;

      setStats({ activeCohorts: activeInstances.length, totalTeachers: teachers.length, totalUnitsRequired, assignedUnits, allocationPercentage: totalUnitsRequired > 0 ? Math.round((assignedUnits / totalUnitsRequired) * 100) : 0, staffUtilization: teachers.length > 0 ? Math.round((uniqueTeachersAllocated / teachers.length) * 100) : 0 });

    } catch (err: any) {
      console.error("Dashboard load failed:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  // --- LEAVE MANAGEMENT FUNCTIONS ---
  const handleSaveLeave = async () => {
    if (!newLeaveStart || !newLeaveEnd || !myProfile) return;
    
    const newLeaveObj = {
        id: Math.random().toString(36).substr(2, 9),
        start: newLeaveStart,
        end: newLeaveEnd,
        reason: newLeaveReason || 'Leave / Unavailable'
    };

    const updatedDates = [...blackoutDates, newLeaveObj];
    
    // Save to Supabase
    const { error } = await supabase
        .from('teachers')
        .update({ blackout_dates: updatedDates })
        .eq('id', myProfile.id);

    if (!error) {
        setBlackoutDates(updatedDates);
        setIsAddingLeave(false);
        setNewLeaveStart('');
        setNewLeaveEnd('');
        setNewLeaveReason('');
    } else {
        console.error("Failed to save leave", error);
    }
  };

  const handleDeleteLeave = async (leaveId: string) => {
      const updatedDates = blackoutDates.filter(d => d.id !== leaveId);
      
      const { error } = await supabase
        .from('teachers')
        .update({ blackout_dates: updatedDates })
        .eq('id', myProfile.id);

      if (!error) {
          setBlackoutDates(updatedDates);
      }
  };

  if (loading) return <div className="flex items-center justify-center h-full bg-slate-50 text-slate-400"><Loader2 className="animate-spin mr-2" /> Loading Dashboard...</div>;
  if (error) return <div className="p-8"><div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3"><AlertCircle /><div><h3 className="font-bold">Error</h3><p className="text-sm">{error}</p></div></div></div>;

  if (isMobile) return <TeacherMobileAgenda events={allEvents} />;

  // ============================================================================
  // DESKTOP VIEW: TEACHER PORTAL
  // ============================================================================
  if (userRole === 'teacher') {
    const allocatedHours = allEvents.reduce((sum, e) => sum + (e.hours || e.baseHours || 0), 0);
    const maxHours = myProfile?.max_hours || 800;
    const capacityPercentage = Math.min((allocatedHours / maxHours) * 100, 100);
    const uniqueClasses = Array.from(new Set(allEvents.map(e => e.summary)));

    return (
      <div className="p-8 space-y-8 h-full overflow-y-auto bg-slate-50">
        
        {/* Profile Header */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-6">
          <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-md shrink-0">
            {myProfile ? myProfile.name.charAt(0) : <User size={40} />}
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold text-slate-800">{myProfile ? myProfile.name : 'Loading...'}</h1>
            <p className="text-slate-500 font-medium mt-1">{userEmail}</p>
            <div className="flex items-center justify-center md:justify-start gap-4 mt-4">
              <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-blue-100">Teacher Profile</span>
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg">{myProfile?.employment_type || 'Staff'}</span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Workload & Alerts */}
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><Clock size={20} className="text-blue-600" /> Annual Workload</h3>
                    <span className="text-sm font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">{Math.round(allocatedHours)} / {maxHours} hrs</span>
                </div>
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full transition-all duration-500 ${capacityPercentage > 100 ? 'bg-red-500' : capacityPercentage > 85 ? 'bg-orange-500' : 'bg-blue-500'}`} style={{ width: `${capacityPercentage}%` }}></div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-5"><Bell className="text-amber-500" size={20} /> Schedule Alerts</h3>
              <div className="max-h-[200px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {alerts.length === 0 ? (
                   <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                     <CheckCircle2 size={40} className="mb-3 text-emerald-400 opacity-50" />
                     <p className="font-medium text-slate-500">Your schedule is clear.</p>
                   </div>
                ) : (
                   alerts.map(alert => (
                     <div key={alert.id} className="p-3.5 rounded-xl border bg-amber-50 border-amber-100 text-amber-800 text-sm flex gap-3 items-start">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-500" />
                        <span className="font-medium leading-relaxed">{alert.message}</span>
                     </div>
                   ))
                )}
              </div>
            </div>
          </div>

          {/* Academic Profile & Leave */}
          <div className="space-y-8">
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><BookOpen size={20} className="text-purple-600" /> Assigned Units</h3>
                {uniqueClasses.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center border-2 border-dashed border-slate-100 rounded-xl">No active units currently assigned.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {uniqueClasses.map((className, i) => (
                            <span key={i} className="bg-purple-50 text-purple-700 text-sm font-bold px-3 py-2 rounded-lg border border-purple-100">{className as string}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* LEAVE MANAGEMENT PANEL */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <CalendarOff size={20} className="text-red-500" /> Leave & Unavailability
                    </h3>
                    {!isAddingLeave && (
                        <button onClick={() => setIsAddingLeave(true)} className="flex items-center gap-1 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                            <Plus size={16} /> Add Leave
                        </button>
                    )}
                </div>

                {isAddingLeave && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-2 gap-4 mb-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Start Date</label>
                                <input type="date" value={newLeaveStart} onChange={(e) => setNewLeaveStart(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">End Date</label>
                                <input type="date" value={newLeaveEnd} onChange={(e) => setNewLeaveEnd(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Reason (Optional)</label>
                            <input type="text" placeholder="e.g. Annual Leave" value={newLeaveReason} onChange={(e) => setNewLeaveReason(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsAddingLeave(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                            <button onClick={handleSaveLeave} disabled={!newLeaveStart || !newLeaveEnd} className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Save Dates</button>
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    {blackoutDates.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center border-2 border-dashed border-slate-100 rounded-xl">No upcoming leave scheduled.</p>
                    ) : (
                        blackoutDates.map((leave, i) => (
                            <div key={i} className="flex justify-between items-center p-3 border border-slate-100 bg-slate-50 rounded-xl">
                                <div>
                                    <p className="text-sm font-bold text-slate-700">
                                        {new Date(leave.start).toLocaleDateString()} - {new Date(leave.end).toLocaleDateString()}
                                    </p>
                                    <p className="text-xs text-slate-500">{leave.reason}</p>
                                </div>
                                <button onClick={() => handleDeleteLeave(leave.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // DESKTOP VIEW: ADMIN OVERVIEW (Remains Unchanged)
  // ============================================================================
  return (
    <div className="p-8 space-y-8 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">RTO Overview</h1>
        <p className="text-slate-500">Academic resource allocation and delivery status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><TrendingUp size={24} /></div>
            {stats.allocationPercentage >= 100 ? <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">Complete</span> : <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">In Progress</span>}
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Allocation</h3>
            <div className="text-3xl font-bold text-slate-800 mt-1">{stats.allocationPercentage}%</div>
            <div className="text-slate-400 text-sm mt-1">{stats.assignedUnits} / {stats.totalUnitsRequired} units assigned</div>
            <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${stats.allocationPercentage}%` }}></div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><GraduationCap size={24} /></div>
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Active & Planned</h3>
            <div className="text-3xl font-bold text-slate-800 mt-1">{stats.activeCohorts}</div>
            <div className="text-slate-400 text-sm mt-1">Cohorts in pipeline</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-orange-50 text-orange-600 rounded-xl"><Users size={24} /></div>
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Staff Utilization</h3>
            <div className="text-3xl font-bold text-slate-800 mt-1">{stats.staffUtilization}%</div>
            <div className="text-slate-400 text-sm mt-1">Trainers with active classes</div>
          </div>
        </div>

         <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl"><Calendar size={24} /></div>
          </div>
          <div>
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Staff</h3>
            <div className="text-3xl font-bold text-slate-800 mt-1">{stats.totalTeachers}</div>
            <div className="text-slate-400 text-sm mt-1">Registered in system</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[320px]">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
               <Bell className="text-blue-600" size={20} /> Action Required
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {alerts.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-slate-400">
                 <CheckCircle2 size={40} className="mb-3 text-emerald-400" />
                 <p className="font-medium text-slate-600">All systems green.</p>
               </div>
            ) : (
               alerts.map(alert => (
                 <div key={alert.id} className={`p-3.5 rounded-xl border text-sm flex gap-3 items-start ${alert.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                    <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${alert.type === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
                    <span className="font-medium leading-relaxed">{alert.message}</span>
                 </div>
               ))
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[320px]">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800">Trainer Workload</h3>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                {trainerWorkload.length === 0 ? <div className="text-center text-slate-400 py-8">No active workload data.</div> : (
                    trainerWorkload.map(trainer => (
                        <div key={trainer.id} className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-sm" style={{ backgroundColor: trainer.color || '#3b82f6' }}>{trainer.name.charAt(0)}</div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-bold text-slate-700">{trainer.name}</span>
                                    <span className="text-xs font-medium text-slate-500">{trainer.allocatedHours} / {trainer.maxHours} hrs</span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-500 ${trainer.capacityMetric > 100 ? 'bg-red-500' : trainer.capacityMetric > 85 ? 'bg-orange-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(trainer.capacityMetric, 100)}%` }}></div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
    </div>
  );
};