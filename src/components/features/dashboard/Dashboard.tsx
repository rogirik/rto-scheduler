import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import type { Teacher, Course, Subject, AcademicYear } from '../../../services/api';
import { Users, GraduationCap, Calendar, TrendingUp, Loader2, AlertCircle, CheckCircle2, MoreHorizontal } from 'lucide-react';

export const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [userRole, setUserRole] = useState<'admin' | 'teacher'>('teacher');
  
  const [stats, setStats] = useState({
    activeCohorts: 0,
    totalTeachers: 0,
    totalUnitsRequired: 0,
    assignedUnits: 0,
    allocationPercentage: 0,
    staffUtilization: 0
  });

  const [trainerWorkload, setTrainerWorkload] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
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
      // Do not strict filter reference data initially to protect calculation engine
      let subjects = subRes || [];
      let academicYears = yRes || [];

      let myOrgId = null;
      let role: 'admin' | 'teacher' = 'teacher';

      if (user) {
          try {
              const { data: profile } = await supabase
                  .from('user_profiles')
                  .select('organization_id, role')
                  .eq('id', user.id)
                  .single();
                  
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

      teachers.forEach(t => teacherHoursMap[t.id] = 0);

      activeInstances.forEach(instance => {
        const template = templates.find(t => t.id === instance.template_id);
        
        if (template) {
            const events = generateAllEventsForInstance(
                instance,
                academicYears,
                template as any,
                subjects,
                teachers
            );

            const currentYearEvents = events.filter(e => {
                const d = typeof e.start === 'string' ? new Date(e.start) : e.start;
                return d.getFullYear() === currentYear;
            });

            currentYearEvents.forEach(event => {
                const allocation = allocations.find((a: any) => 
                    a.instance_id === instance.id && a.subject_id === event.subjectId
                );

                if (allocation && allocation.teacher_id) {
                    if (teacherHoursMap[allocation.teacher_id] !== undefined) {
                        teacherHoursMap[allocation.teacher_id] += (event.hours || event.baseHours || 0);
                    }
                }
            });
        }
      });

      let workload = teachers.map(teacher => {
        const allocatedHours = Math.round(teacherHoursMap[teacher.id] || 0);
        const maxHours = teacher.max_hours || 800; 
        
        const capacityMetric = maxHours > 0 ? (allocatedHours / maxHours) * 100 : 0;

        return {
          ...teacher,
          allocatedHours, 
          maxHours,       
          capacityMetric
        };
      });

      workload.sort((a, b) => b.capacityMetric - a.capacityMetric);

      if (role === 'teacher' && user) {
          workload = workload.filter(w => w.user_id === user.id);
      }

      setTrainerWorkload(workload);

      const assignedUnits = allocations.filter((a: any) => activeInstances.some(i => i.id === a.instance_id)).length;
      
      let totalUnitsRequired = 0;
      activeInstances.forEach(instance => {
        const template = templates.find(t => t.id === instance.template_id);
        if (template && (template as any).sequenced_subjects) {
          totalUnitsRequired += (template as any).sequenced_subjects.length;
        }
      });

      const uniqueTeachersAllocated = new Set(allocations.map((a: any) => a.teacher_id)).size;

      setStats({
        activeCohorts: activeInstances.length,
        totalTeachers: teachers.length,
        totalUnitsRequired,
        assignedUnits,
        allocationPercentage: totalUnitsRequired > 0 ? Math.round((assignedUnits / totalUnitsRequired) * 100) : 0,
        staffUtilization: teachers.length > 0 ? Math.round((uniqueTeachersAllocated / teachers.length) * 100) : 0
      });

    } catch (err: any) {
      console.error("Dashboard load failed:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full bg-slate-50 text-slate-400"><Loader2 className="animate-spin mr-2" /> Loading Dashboard...</div>;
  if (error) return <div className="p-8"><div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3"><AlertCircle /><div><h3 className="font-bold">Error</h3><p className="text-sm">{error}</p></div></div></div>;

  return (
    <div className="p-8 space-y-8 h-full overflow-y-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          {userRole === 'admin' ? 'RTO Overview' : 'Dashboard Overview'}
        </h1>
        <p className="text-slate-500">Academic resource allocation and delivery status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1 */}
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

        {/* Card 2 */}
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

        {/* Card 3 */}
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

        {/* Card 4 */}
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
        
        {/* System Status */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">System Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3"><CheckCircle2 className="text-green-500" size={20} /><span className="font-medium text-slate-700">Database Connection</span></div>
                <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">Online</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3"><CheckCircle2 className="text-green-500" size={20} /><span className="font-medium text-slate-700">Allocation Engine</span></div>
                <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">Ready</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3"><CheckCircle2 className="text-green-500" size={20} /><span className="font-medium text-slate-700">Calendar Sync</span></div>
                <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded">Active</span>
            </div>
          </div>
        </div>

        {/* WORKLOAD */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[320px]">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800">
                    {userRole === 'admin' ? 'Trainer Workload' : 'Your Workload'}
                </h3>
                <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {trainerWorkload.length === 0 ? <div className="text-center text-slate-400 py-8">No active workload data.</div> : (
                    trainerWorkload.map(trainer => (
                        <div key={trainer.id} className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-sm" style={{ backgroundColor: trainer.color || '#3b82f6' }}>{trainer.name.charAt(0)}</div>
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-bold text-slate-700">{trainer.name}</span>
                                    <span className="text-xs font-medium text-slate-500">
                                        {trainer.allocatedHours} / {trainer.maxHours} hrs
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-500 ${trainer.capacityMetric > 100 ? 'bg-red-500' : trainer.capacityMetric > 85 ? 'bg-orange-500' : 'bg-blue-500'}`} 
                                        style={{ width: `${Math.min(trainer.capacityMetric, 100)}%` }}
                                    ></div>
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
