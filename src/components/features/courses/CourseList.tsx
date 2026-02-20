import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { CourseInstance, Course, UnitAllocation, Teacher, Subject, AcademicYear } from '../../../services/api';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { 
  Plus, Search, FileText, Settings, Loader2, Trash2, 
  CheckCircle2, ShieldAlert, BookOpen, X, Edit2, AlertTriangle 
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
  
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Course | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<CourseInstance | null>(null);
  const [showAllocator, setShowAllocator] = useState<CourseInstance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [iData, tData, aData, teachData, subData, yearData] = await Promise.all([
        ApiService.getCourseInstances(),
        ApiService.getAll<Course>('course_templates'),
        ApiService.getAllocationsGlobal(), 
        ApiService.getTeachers(),
        ApiService.getSubjects(),
        ApiService.getAll<AcademicYear>('academic_years')
      ]);
      setInstances(iData || []);
      setTemplates(tData || []);
      setAllocations(aData || []);
      setTeachers(teachData || []);
      setSubjects(subData || []);
      setAcademicYears(yearData || []);
    } catch (error) {
      console.error("Failed to load dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled course?')) return;
    try { await ApiService.delete('course_instances', id); loadData(); } catch (e) { alert('Failed to delete course'); }
  };

  const getUnassignedCount = (instance: CourseInstance) => {
    const template = templates.find(t => t.id === instance.template_id);
    if (!template) return 0;
    const rawSeq = (template as any).sequenced_subjects || [];
    const requiredIds = rawSeq.map((item: any) => typeof item === 'string' ? item : item.id).filter(Boolean);
    const validAllocations = allocations.filter(a => a.instance_id === instance.id && !!a.teacher_id && a.teacher_id !== 'unassigned');
    const assignedIds = new Set(validAllocations.map(a => a.subject_id));
    return requiredIds.filter((id: string) => !assignedIds.has(id)).length;
  };

  // --- DATE-AWARE GLOBAL AUTO ALLOCATOR ---
  const handleGlobalAutoAssign = async () => {
    if (!confirm("Auto-assign trainers to EMPTY units? Existing manual assignments will NOT be changed.")) return;
    setProcessing(true);
    
    try {
        let localAllocations = [...allocations];

        // 1. Pre-calculate global academic terms & holidays to feed the scheduler
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

            const trulyMissingIds = requiredIds.filter(id => {
                const existing = localAllocations.find(a => a.instance_id === instance.id && a.subject_id === id);
                return !existing || !existing.teacher_id || existing.teacher_id === 'unassigned';
            });

            // If there's nothing to assign, skip to next course
            if (trulyMissingIds.length === 0) continue;

            // 2. Map exact dates for each subject in this course
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

            // 3. Begin Teacher Assignment
            for (const subId of trulyMissingIds) {
                const subject = subjects.find(s => s.id === subId);
                const subHours = subject?.hours || 20;
                
                const seqItem = rawSeq.find((item: any) => (typeof item === 'string' ? item : item.id) === subId);
                const isUnitOnline = typeof seqItem === 'object' ? !!seqItem.is_online : false;
                const effectiveMode = isUnitOnline ? 'Online' : instance.delivery_mode;
                
                const requiredDates = subjectDates[subId] || [];
                const candidates = [...teachers].sort(() => 0.5 - Math.random());
                let assignedTeacherId = null;
                
                for (const teacher of candidates) {
                    // Check Mode
                    if (effectiveMode === 'Online' && !teacher.trains_online) continue;

                    // --- NEW: TEACHER CALENDAR AVAILABILITY CHECK ---
                    let isAvailable = true;
                    const teacherLeaveDate = (teacher as any).leave_date;
                    const teacherBlackouts = (teacher as any).blackout_dates || [];

                    for (const classDate of requiredDates) {
                        // A. Did the teacher leave the company before or on this class date?
                        if (teacherLeaveDate && classDate >= teacherLeaveDate) {
                            isAvailable = false;
                            break;
                        }
                        // B. Is the teacher on holiday on this exact date?
                        if (Array.isArray(teacherBlackouts) && teacherBlackouts.includes(classDate)) {
                            isAvailable = false;
                            break;
                        }
                    }

                    if (!isAvailable) continue; // Skip to next teacher candidate

                    // Check Workload
                    const load = localAllocations.filter(a => a.teacher_id === teacher.id).reduce((sum, a) => sum + (subjects.find(s => s.id === a.subject_id)?.hours || 0), 0);
                    if (load + subHours <= (teacher.max_hours || 800)) {
                        assignedTeacherId = teacher.id;
                        break;
                    }
                }

                // Save Allocation
                if (assignedTeacherId) {
                    const existingAlloc = localAllocations.find(a => a.instance_id === instance.id && a.subject_id === subId);
                    const payload = { ...(existingAlloc ? { id: existingAlloc.id } : {}), instance_id: instance.id, subject_id: subId, teacher_id: assignedTeacherId };
                    await ApiService.saveAllocation(payload);
                    if (existingAlloc) existingAlloc.teacher_id = assignedTeacherId;
                    else localAllocations.push(payload as UnitAllocation);
                }
            }
        }
        await loadData();
        alert("Global allocation finished. Trainer availability was checked.");
    } catch (e) {
        console.error("Global assignment error", e);
    } finally {
        setProcessing(false);
    }
  };

  const handleDownloadPDF = async (instance: CourseInstance) => {
      const template = templates.find(t => t.id === instance.template_id);
      if (!template) return;

      const { data: yearData } = await supabase.from('academic_years').select('terms, holidays');
      const terms: any[] = [];
      const holidays = new Set<string>();
      
      yearData?.forEach(row => {
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

      const rawSeq = (template as any).sequenced_subjects || [];

      printWindow.document.write(`
        <html>
          <head><title>Schedule - ${instance.name}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background: #f1f5f9; padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
            td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
            .date-cell { font-weight: bold; width: 150px; }
            .online-tag { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-left: 8px; vertical-align: middle; }
          </style></head>
          <body>
            <h1>${instance.name} - Official Schedule</h1>
            <p><strong>Primary Delivery Mode:</strong> ${instance.delivery_mode}</p>
            <table>
              <thead><tr><th>Date</th><th>Unit Code & Name</th><th>Trainer</th></tr></thead>
              <tbody>
                ${filteredEvents.map(ev => {
                    const alloc = allocations.find(a => a.instance_id === instance.id && a.subject_id === ev.subjectId);
                    const teacher = teachers.find(t => t.id === alloc?.teacher_id);
                    
                    const seqItem = rawSeq.find((item: any) => (typeof item === 'string' ? item : item.id) === ev.subjectId);
                    const isUnitOnline = typeof seqItem === 'object' ? !!seqItem.is_online : false;
                    const onlineBadge = isUnitOnline ? '<span class="online-tag">ONLINE</span>' : '';
                    
                    return `<tr><td class="date-cell">${ev.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>${ev.summary} ${onlineBadge}</td><td>${teacher?.name || 'Unassigned'}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
            <script>window.onload = () => window.print();</script>
          </body>
        </html>
      `);
      printWindow.document.close();
  };

  const filteredInstances = instances.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500" size={40} /></div>;

  return (
    <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Scheduled Courses</h1>
          <p className="text-sm text-slate-500 font-medium">Manage cohorts and global trainer allocations.</p>
        </div>
        <div className="flex gap-3">
            <button onClick={handleGlobalAutoAssign} disabled={processing} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 disabled:opacity-50 shadow-lg shadow-purple-100">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <ShieldAlert size={18} />} Global Auto Assign
            </button>
            <button onClick={() => setShowTemplateManager(true)} className="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50">
                <BookOpen size={18} /> Qualifications
            </button>
            <button onClick={() => { setSelectedInstance(null); setShowScheduleModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-100">
                <Plus size={18} /> Schedule New
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
          <input placeholder="Search cohorts by name..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-bold">
              <th className="p-4">Cohort Name & Status</th>
              <th className="p-4">Qualification</th>
              <th className="p-4">Training Dates</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredInstances.map(instance => {
              const unassignedCount = getUnassignedCount(instance);
              const isFullyAllocated = unassignedCount === 0;

              return (
                <tr key={instance.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-800 text-lg">{instance.name}</div>
                    <div className="mt-1">
                        {isFullyAllocated ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100 flex items-center w-fit gap-1"><CheckCircle2 size={10}/> Fully Allocated</span>
                        ) : (
                            <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-bold border border-red-100 flex items-center w-fit gap-1"><AlertTriangle size={10}/> {unassignedCount} Units Pending</span>
                        )}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600 font-medium">{templates.find(t => t.id === instance.template_id)?.name || 'Unknown Qualification'}</td>
                  <td className="p-4">
                    <div className="text-sm font-bold text-slate-700">{instance.start_date}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Ends: {instance.end_date}</div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                        <button onClick={() => handleDownloadPDF(instance)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="View Schedule PDF"><FileText size={18} /></button>
                        <button onClick={() => { setSelectedInstance(instance); setShowScheduleModal(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit Schedule"><Settings size={18} /></button>
                        <button onClick={() => setShowAllocator(instance)} className={`px-4 py-2 rounded-lg font-bold text-xs shadow-sm border transition-all ${!isFullyAllocated ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>Assign Trainers</button>
                        <button onClick={() => handleDelete(instance.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showScheduleModal && (
        <ScheduleCourseForm initialData={selectedInstance} onClose={() => { setShowScheduleModal(false); setSelectedInstance(null); }} onSuccess={() => { setShowScheduleModal(false); setSelectedInstance(null); loadData(); }} />
      )}
      {showAllocator && (
        <CourseAllocation instance={showAllocator} onClose={() => setShowAllocator(null)} onUpdate={() => loadData()} />
      )}
      {showTemplateManager && !showCourseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-800">Manage Qualifications</h2>
                    <button onClick={() => setShowTemplateManager(false)}><X size={24} className="text-slate-400"/></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-3">
                    {templates.map(t => (
                        <div key={t.id} className="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-xl">
                            <div className="font-bold text-slate-800">{t.name}</div>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditingTemplate(t); setShowCourseForm(true); }} className="p-2 text-slate-400 hover:text-blue-600"><Edit2 size={18} /></button>
                                <button onClick={() => ApiService.delete('course_templates', t.id).then(loadData)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => { setEditingTemplate(null); setShowCourseForm(true); }} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold hover:bg-slate-50">+ Create New Qualification</button>
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