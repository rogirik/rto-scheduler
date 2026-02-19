import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { CourseInstance, Course, UnitAllocation, Teacher, Subject, AcademicYear } from '../../../services/api';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { 
  Plus, 
  Search, 
  FileText, 
  Settings, 
  Users, 
  Loader2, 
  AlertTriangle, 
  Calendar as CalendarIcon,
  Trash2,
  CheckCircle2,
  Wand2,
  ShieldAlert,
  BookOpen,
  X,
  Edit2,
  CalendarX
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

  useEffect(() => {
    loadData();
  }, []);

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
      setInstances(iData);
      setTemplates(tData);
      setAllocations(aData);
      setTeachers(teachData);
      setSubjects(subData);
      setAcademicYears(yearData);
    } catch (error) {
      console.error("Failed to load courses", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled course?')) return;
    try {
      await ApiService.delete('course_instances', id);
      loadData();
    } catch (e) {
      alert('Failed to delete course');
    }
  };

  // --- PDF GENERATOR (HOLIDAY & OVERRIDE AWARE) ---
  const handleDownloadPDF = async (instance: CourseInstance) => {
      const template = templates.find(t => t.id === instance.template_id);
      if (!template) return alert("Template not found.");

      // 1. Fetch ALL constraints for this instance
      const [hRes, oRes] = await Promise.all([
        supabase.from('holidays').select('date'),
        supabase.from('schedule_overrides').select('override_date').eq('instance_id', instance.id).eq('action_type', 'remove')
      ]);

      const holidays = new Set(hRes.data?.map(h => h.date));
      const removals = new Set(oRes.data?.map(o => o.override_date));

      // 2. Generate raw events
      const rawEvents = generateAllEventsForInstance(instance, academicYears, template as any, subjects as any[], teachers);
      
      // 3. STRICT FILTERING: Only keep dates NOT in holidays AND NOT in removals
      const filteredEvents = rawEvents.filter(ev => {
          const dateStr = ev.start.toISOString().split('T')[0];
          return !holidays.has(dateStr) && !removals.has(dateStr);
      });
      
      const sorted = [...filteredEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
      
      // Merge consecutive days for cleaner PDF (e.g., "Mon 12 Feb - Wed 14 Feb")
      const merged: any[] = [];
      let currentGroup: any = null;

      sorted.forEach((ev) => {
          const allocation = allocations.find(a => a.instance_id === ev.instanceId && a.subject_id === ev.subjectId);
          const teacher = teachers.find(t => t.id === allocation?.teacher_id);
          const teacherName = teacher?.name || 'Unassigned';

          const evKey = `${ev.summary}|${teacherName}|${ev.start.getHours()}:${ev.start.getMinutes()}`;
          if (!currentGroup) {
              currentGroup = { ...ev, endDate: ev.start, key: evKey, teacherName };
          } else {
              const prevDate = new Date(currentGroup.endDate);
              prevDate.setDate(prevDate.getDate() + 1); 
              const isNextDay = ev.start.toDateString() === prevDate.toDateString();
              
              if (evKey === currentGroup.key && isNextDay) {
                  currentGroup.endDate = ev.start; 
              } else {
                  merged.push(currentGroup);
                  currentGroup = { ...ev, endDate: ev.start, key: evKey, teacherName };
              }
          }
      });
      if (currentGroup) merged.push(currentGroup);

      const printWindow = window.open('', '', 'height=800,width=1000');
      if (!printWindow) return;

      printWindow.document.write(`
        <html>
          <head>
            <title>Schedule - ${instance.name}</title>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #334155; }
              h1 { color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th { background: #f1f5f9; color: #475569; padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
              td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
              .date-col { font-weight: bold; width: 180px; }
            </style>
          </head>
          <body>
            <h1>${instance.name} - Class Schedule</h1>
            <table>
              <thead><tr><th>Date(s)</th><th>Time</th><th>Subject / Unit</th><th>Trainer</th></tr></thead>
              <tbody>
                ${merged.map(ev => {
                    const isRange = ev.start.toDateString() !== ev.endDate.toDateString();
                    const dateDisplay = isRange 
                      ? `${ev.start.toLocaleDateString([], {day: 'numeric', month: 'short'})} - ${ev.endDate.toLocaleDateString([], {day: 'numeric', month: 'short'})}`
                      : ev.start.toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'});
                    return `<tr>
                        <td class="date-col">${dateDisplay}</td>
                        <td>${ev.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                        <td>${ev.summary}</td>
                        <td>${ev.teacherName}</td>
                      </tr>`;
                }).join('')}
              </tbody>
            </table>
            <script>window.onload = function() { window.print(); }</script>
          </body>
        </html>
      `);
      printWindow.document.close();
  };

  const getUnassignedCount = (instance: CourseInstance) => {
    const template = templates.find(t => t.id === instance.template_id);
    if (!template) return 0;
    const raw = template as any;
    const rawSeq = raw.sequenced_subjects || raw.sequencedSubjects || [];
    const requiredSubjectIds = rawSeq.map((item: any) => typeof item === 'string' ? item : item.id).filter(Boolean);
    const instanceAllocations = allocations.filter(a => a.instance_id === instance.id);
    const assignedIds = new Set(instanceAllocations.map(a => a.subject_id));
    return requiredSubjectIds.filter((id: string) => !assignedIds.has(id)).length;
  };

  const filteredInstances = instances.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* Header & Main Controls */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Scheduled Courses</h1>
          <p className="text-slate-500">Manage active cohorts and teacher allocations.</p>
        </div>
        <div className="flex gap-3">
            <button onClick={() => setShowTemplateManager(true)} className="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50 shadow-sm">
                <BookOpen size={18} /> Qualifications
            </button>
            <button onClick={() => { setSelectedInstance(null); setShowScheduleModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm">
                <Plus size={18} /> Schedule New
            </button>
        </div>
      </div>

      {/* List Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
          <input placeholder="Search active cohorts..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm uppercase">
              <th className="p-4 font-bold">Cohort Name</th>
              <th className="p-4 font-bold">Qualification</th>
              <th className="p-4 font-bold">Dates</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredInstances.map(instance => {
              const template = templates.find(t => t.id === instance.template_id);
              const unassignedCount = getUnassignedCount(instance);
              const isFullyAllocated = unassignedCount === 0;

              return (
                <tr key={instance.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 align-top">
                    <div className="font-bold text-slate-800 text-lg">{instance.name}</div>
                    <div className="mt-2 flex items-center gap-2">
                        {isFullyAllocated ? (
                            <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">Allocated</span>
                        ) : (
                            <span className="px-2 py-1 rounded bg-red-50 text-red-700 text-xs font-bold border border-red-100">{unassignedCount} Unassigned</span>
                        )}
                    </div>
                  </td>
                  <td className="p-4 align-top text-slate-700 font-medium">
                    {template?.name || 'Unknown'}
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm text-slate-700 font-bold"><CalendarIcon size={14} className="text-green-600" />{instance.start_date}</div>
                        <div className="flex items-center gap-2 text-sm text-slate-500"><CalendarIcon size={14} className="text-slate-400" />{instance.end_date}</div>
                    </div>
                  </td>
                  <td className="p-4 align-top text-right">
                    <div className="flex justify-end gap-2">
                        <button onClick={() => handleDownloadPDF(instance)} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg border border-slate-100 hover:bg-blue-50" title="Download PDF Schedule"><FileText size={18} /></button>
                        <button onClick={() => { setSelectedInstance(instance); setShowScheduleModal(true); }} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg border border-slate-100 hover:bg-blue-50" title="Edit Schedule Settings"><Settings size={18} /></button>
                        <button onClick={() => setShowAllocator(instance)} className={`px-3 py-2 rounded-lg font-bold text-sm shadow-sm border ${!isFullyAllocated ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>Assign</button>
                        <button onClick={() => handleDelete(instance.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg border border-slate-100 hover:bg-red-50"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showScheduleModal && (
        <ScheduleCourseForm 
            initialData={selectedInstance}
            onClose={() => { setShowScheduleModal(false); setSelectedInstance(null); }}
            onSuccess={() => { setShowScheduleModal(false); setSelectedInstance(null); loadData(); }}
        />
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