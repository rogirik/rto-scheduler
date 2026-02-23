import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { CourseInstance, Course, UnitAllocation, Teacher, Subject, AcademicYear } from '../../../services/api';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { 
  Plus, Search, FileText, Settings, Loader2, Trash2, 
  CheckCircle2, ShieldAlert, BookOpen, X, Edit2, AlertTriangle, Wand2, Lock
} from 'lucide-react';
import { ScheduleCourseForm } from './ScheduleCourseForm';
import { CourseAllocation } from './CourseAllocation';
import { CourseForm } from './CourseForm';

export const CourseList = () => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  const [instances, setInstances] = useState<CourseInstance[]>([]);
  const [templates, setTemplates] = useState<Course[]>([]);
  const [allocations, setAllocations] = useState<UnitAllocation[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Course | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<CourseInstance | null>(null);
  const [showAllocator, setShowAllocator] = useState<CourseInstance | null>(null);

  useEffect(() => { 
    loadData(); 
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const [iRes, tRes, aRes, teachRes, subRes, yearRes] = await Promise.all([
        ApiService.getCourseInstances(),
        ApiService.getAll<Course>('course_templates'),
        ApiService.getAllocationsGlobal(),
        supabase.from('teachers').select('*'), // Fetch raw to prevent 400 errors
        ApiService.getSubjects(),
        ApiService.getAll<AcademicYear>('academic_years')
      ]);

      let filteredInstances = iRes || [];
      let filteredTemplates = tRes || [];
      let filteredAllocations = aRes || [];
      let filteredTeachers = teachRes.data || [];
      let filteredSubjects = subRes || [];
      let filteredYears = yearRes || [];

      // --- ADDED: STRICT ORGANIZATION FILTER ---
      if (user) {
          let myOrgId = null;
          try {
              const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
              myOrgId = profile?.organization_id;
          } catch (e) {
              // Ignore missing profile
          }

          if (!myOrgId) {
              const myKnownTeacher = filteredTeachers.find(t => t.user_id === user.id && t.organization_id);
              myOrgId = myKnownTeacher?.organization_id;
          }

          const isMine = (item: any) => {
              if (myOrgId) {
                  if (item.organization_id) return item.organization_id === myOrgId;
                  return item.user_id === user.id;
              }
              return item.user_id === user.id;
          };

          filteredInstances = filteredInstances.filter(isMine);
          filteredTemplates = filteredTemplates.filter(isMine);
          filteredTeachers = filteredTeachers.filter(isMine);
          filteredSubjects = filteredSubjects.filter(isMine);
          filteredYears = filteredYears.filter(isMine);

          const validInstanceIds = new Set(filteredInstances.map(i => i.id));
          filteredAllocations = filteredAllocations.filter(a => validInstanceIds.has(a.instance_id));
      }

      setInstances(filteredInstances);
      setTemplates(filteredTemplates);
      setAllocations(filteredAllocations);
      setTeachers(filteredTeachers); 
      setSubjects(filteredSubjects);
      setAcademicYears(filteredYears);
    } catch (error) {
      console.error("Dashboard Load Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (table: string, id: string) => {
    if (!confirm('Permanently delete this record?')) return;
    try {
        await ApiService.delete(table as any, id);
        loadData();
    } catch (e) { alert("Delete failed."); }
  };

  const handleGlobalAutoAssign = async () => {
    if (!confirm("Auto-assign trainers to EMPTY units across all active cohorts?")) return;
    setProcessing(true);
    try {
        let localAllocations = [...allocations];
        const terms: any[] = [];
        const globalHolidays = new Set<string>();
        
        academicYears.forEach(row => { 
            if (Array.isArray(row.terms)) terms.push(...row.terms); 
            if (Array.isArray(row.holidays)) row.holidays.forEach((h: any) => globalHolidays.add(h.date || h));
        });

        for (const instance of instances) {
            if (instance.status === 'completed') continue;
            
            const template = templates.find(t => t.id === instance.template_id);
            if (!template) continue;
            
            const rawSeq = (template as any).sequenced_subjects || [];
            const requiredIds = rawSeq.map((item: any) => typeof item === 'string' ? item : item.id).filter(Boolean);
            const missingIds = requiredIds.filter(id => !localAllocations.find(a => a.instance_id === instance.id && a.subject_id === id));

            if (missingIds.length === 0) continue;

            // Generate class dates to check against teacher availability schedules
            const rawEvents = generateAllEventsForInstance(instance, academicYears, template as any, subjects, teachers);
            const filteredEvents = rawEvents.filter(ev => {
                const iso = ev.start.toISOString().split('T')[0];
                const isInTerm = terms.length === 0 || terms.some(t => iso >= t.start && iso <= t.end);
                return isInTerm && !globalHolidays.has(iso);
            });

            const subjectDates: Record<string, string[]> = {};
            filteredEvents.forEach(ev => {
                const iso = ev.start.toISOString().split('T')[0];
                if (!subjectDates[ev.subjectId]) subjectDates[ev.subjectId] = [];
                subjectDates[ev.subjectId].push(iso);
            });

            for (const subId of missingIds) {
                const subject = subjects.find(s => s.id === subId);
                const subHours = subject?.hours || 20;
                
                const candidates = [...teachers].sort(() => 0.5 - Math.random());
                let assignedTeacherId = null;
                
                for (const teacher of candidates) {
                    // 1. DELIVERY MODE CHECK: Stop online-only teachers from face-to-face classes
                    if (teacher.trains_online && instance.delivery_mode !== 'Online') continue;

                    // 2. LOAD BALANCING CHECK: Stop teachers from exceeding max annual hours
                    const teacherLoad = localAllocations
                        .filter(a => a.teacher_id === teacher.id)
                        .reduce((sum, a) => {
                            const s = subjects.find(sub => sub.id === a.subject_id);
                            return sum + (s?.hours || 0);
                        }, 0);
                        
                    if (teacherLoad + subHours > (teacher.max_hours || 800)) continue;

                    // 3. AVAILABILITY CHECK: Ensure they actually work on the generated class days
                    let isAvailable = true;
                    const requiredDates = subjectDates[subId] || [];
                    for (const classDate of requiredDates) {
                        const [y, m, d] = classDate.split('-').map(Number);
                        const dayOfWeek = new Date(y, m - 1, d).getDay();
                        const teacherSchedule = (teacher.availability as any)?.schedule || {};
                        
                        if (teacherSchedule[dayOfWeek] && !teacherSchedule[dayOfWeek].active) { 
                            isAvailable = false; 
                            break; 
                        }
                    }

                    if (isAvailable) { 
                        assignedTeacherId = teacher.id; 
                        break; 
                    }
                }

                if (assignedTeacherId) {
                    const newAlloc = { 
                        instance_id: instance.id, 
                        subject_id: subId, 
                        teacher_id: assignedTeacherId
                    };
                    await ApiService.saveAllocation(newAlloc);
                    localAllocations.push(newAlloc as UnitAllocation);
                }
            }
        }
        await loadData();
        alert("Safe global allocation finished.");
    } catch (e) { console.error(e); } finally { setProcessing(false); }
  };

  const handleDownloadPDF = async (instance: CourseInstance) => {
      const template = templates.find(t => t.id === instance.template_id);
      if (!template) return;

      const terms: any[] = [];
      const holidays = new Set<string>();
      academicYears.forEach(row => {
          if (Array.isArray(row.terms)) terms.push(...row.terms);
          if (Array.isArray(row.holidays)) row.holidays.forEach((h: any) => holidays.add(h.date || h));
      });

      const rawEvents = generateAllEventsForInstance(instance, academicYears, template as any, subjects, teachers);
      const filteredEvents = rawEvents.filter(ev => {
          const iso = ev.start.toISOString().split('T')[0];
          const isInTerm = terms.length === 0 || terms.some(t => iso >= t.start && iso <= t.end);
          return isInTerm && !holidays.has(iso);
      });

      const printWindow = window.open('', '', 'height=800,width=1000');
      if (!printWindow) return;

      printWindow.document.write(`
        <html>
          <head><title>Schedule - ${instance.name}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background: #f8fafc; padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
            td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
          </style></head>
          <body>
            <h1>${instance.name} - Class Schedule</h1>
            <table>
              <thead><tr><th>Date</th><th>Unit</th><th>Trainer</th></tr></thead>
              <tbody>
                ${filteredEvents.map(ev => {
                    const alloc = allocations.find(a => a.instance_id === instance.id && a.subject_id === ev.subjectId);
                    const teacher = teachers.find(t => t.id === alloc?.teacher_id);
                    return `<tr><td>${ev.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${ev.summary}</td><td>${teacher?.name || 'Unassigned'}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
            <script>window.onload = () => window.print();</script>
          </body>
        </html>
      `);
      printWindow.document.close();
  };

  // --- ADDED: STATS HELPER FOR BADGES ---
  const getInstanceStats = (instance: CourseInstance) => {
    const template = templates.find(t => t.id === instance.template_id);
    if (!template) return { total: 0, assigned: 0 };
    
    const rawSeq = (template as any).sequenced_subjects || [];
    const requiredIds = rawSeq.map((item: any) => typeof item === 'string' ? item : item.id).filter(Boolean);
    const total = requiredIds.length;
    
    const assignedCount = requiredIds.filter((id: string) => 
        allocations.some(a => a.instance_id === instance.id && a.subject_id === id && a.teacher_id)
    ).length;

    return { total, assigned: assignedCount };
  };

  const filteredInstances = instances.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500" size={40} /></div>;

  return (
    <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Scheduled Courses</h1>
          <p className="text-sm text-slate-500">Manage your active cohorts and schedule dates.</p>
        </div>
        
        <div className="flex gap-3">
            <button onClick={handleGlobalAutoAssign} disabled={processing} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 shadow-sm transition-all">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <ShieldAlert size={18} />} Global Auto Assign
            </button>
            <button onClick={() => setShowTemplateManager(true)} className="bg-white border px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-slate-50">
                <BookOpen size={18} /> Qualifications
            </button>
            <button onClick={() => { setSelectedInstance(null); setShowScheduleModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-blue-700">
                <Plus size={18} /> New Cohort
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
          <input placeholder="Search active cohorts..." className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b text-slate-500 text-[10px] uppercase font-bold tracking-widest">
              <th className="p-4">Cohort</th>
              <th className="p-4">Qualification</th>
              <th className="p-4">Dates</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredInstances.map(instance => {
              // --- ADDED: CALCULATION FOR BADGES ---
              const stats = getInstanceStats(instance);
              const isFullyAllocated = stats.total > 0 && stats.assigned === stats.total;

              return (
                <tr key={instance.id} className="hover:bg-slate-50 transition-all">
                  <td className="p-4">
                    <div className="font-bold text-slate-800 text-lg">{instance.name}</div>
                    
                    {/* --- ADDED: ALLOCATION BADGES --- */}
                    <div className="mt-1">
                        {isFullyAllocated ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100">
                                <CheckCircle2 size={10}/> Allocated: {stats.assigned}/{stats.total}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-100">
                                <AlertTriangle size={10}/> Pending: {stats.assigned}/{stats.total}
                            </span>
                        )}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{templates.find(t => t.id === instance.template_id)?.name}</td>
                  <td className="p-4 text-sm font-bold text-slate-700">{instance.start_date} to {instance.end_date}</td>
                  <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                          <button onClick={() => handleDownloadPDF(instance)} className="p-2 text-slate-400 hover:text-blue-600"><FileText size={18} /></button>
                          <button onClick={() => { setSelectedInstance(instance); setShowScheduleModal(true); }} className="p-2 text-slate-400 hover:text-blue-600"><Settings size={18} /></button>
                          <button onClick={() => setShowAllocator(instance)} className="px-4 py-2 rounded-lg font-bold text-xs bg-blue-600 text-white">Assign</button>
                          <button onClick={() => handleDelete('course_instances', instance.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={18} /></button>
                      </div>
                    </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showScheduleModal && (
        <ScheduleCourseForm initialData={selectedInstance} onClose={() => setShowScheduleModal(false)} onSuccess={() => { setShowScheduleModal(false); loadData(); }} />
      )}
      {showAllocator && (
        <CourseAllocation instance={showAllocator} onClose={() => setShowAllocator(null)} onUpdate={() => loadData()} />
      )}
      {showTemplateManager && !showCourseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold">Manage Qualifications</h2>
                    <button onClick={() => setShowTemplateManager(false)}><X size={24} className="text-slate-400"/></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-3">
                    {templates.map(t => (
                        <div key={t.id} className="flex justify-between items-center p-4 bg-white border rounded-xl">
                            <div className="font-bold text-slate-800">{t.name}</div>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditingTemplate(t); setShowCourseForm(true); }} className="p-2 text-slate-400 hover:text-blue-600"><Edit2 size={18} /></button>
                                <button onClick={() => handleDelete('course_templates', t.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => { setEditingTemplate(null); setShowCourseForm(true); }} className="w-full py-3 border-2 border-dashed rounded-xl text-slate-400 font-bold hover:bg-slate-50">+ New Qualification</button>
                </div>
            </div>
        </div>
      )}
      {showCourseForm && (
          <CourseForm initialData={editingTemplate} onClose={() => setShowCourseForm(false)} onSuccess={() => { setShowCourseForm(false); loadData(); }} />
      )}
    </div>
  );
};