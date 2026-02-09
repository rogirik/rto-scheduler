import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
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
  Calendar,
  Trash2,
  CheckCircle2,
  Wand2,
  ShieldAlert,
  BookOpen,
  X,
  Edit2
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

  // --- TEMPLATE MANAGEMENT ---
  const handleEditTemplate = (template: Course) => {
      setEditingTemplate(template);
      setShowCourseForm(true);
  };

  const handleCreateTemplate = () => {
      setEditingTemplate(null);
      setShowCourseForm(true);
  };

  const handleDeleteTemplate = async (id: string) => {
      if (!confirm("Delete this Qualification Template?")) return;
      try {
          await ApiService.delete('course_templates', id);
          loadData();
      } catch (e) {
          alert("Failed to delete template.");
      }
  };

  // --- STRICT VALIDATION LOGIC ---
  const isTeacherValidForCourse = (
      teacher: Teacher, 
      targetInstance: CourseInstance, 
      currentAllocations: UnitAllocation[],
      subjectHours: number
  ) => {
      
      // RULE 1: ONLINE COMPATIBILITY
      if (teacher.trains_online && targetInstance.delivery_mode !== 'Online') {
          return false;
      }

      // RULE 2: MEA CAP (ANNUAL HOURS)
      const teacherAllocations = currentAllocations.filter(a => a.teacher_id === teacher.id);
      let currentLoad = 0;
      teacherAllocations.forEach(alloc => {
          const sub = subjects.find(s => s.id === alloc.subject_id);
          if (sub) currentLoad += (sub.hours || 0);
      });

      if ((currentLoad + subjectHours) > (teacher.max_hours || 800)) {
          return false; 
      }

      // RULE 3: DAILY 8-HOUR LIMIT CHECK
      const targetDays = targetInstance.allowed_days || [];
      const targetDailyHours = targetInstance.hours_per_day || 0;
      const activeInstanceIds = new Set(teacherAllocations.map(a => a.instance_id));

      for (const day of targetDays) {
          let dailyTotal = targetDailyHours; 

          activeInstanceIds.forEach(otherId => {
              if (otherId === targetInstance.id) return;
              const otherInstance = instances.find(i => i.id === otherId);
              if (otherInstance && otherInstance.status !== 'completed') {
                  const otherDays = otherInstance.allowed_days || [];
                  if (otherDays.includes(day)) {
                      dailyTotal += (otherInstance.hours_per_day || 0);
                  }
              }
          });

          if (dailyTotal > 8) {
              console.log(`${teacher.name} skipped. Daily load ${dailyTotal}h on day ${day} exceeds 8h.`);
              return false; // Fail: Would exceed daily limit
          }
      }

      return true;
  };

  // --- AUTO ASSIGNER ---
  const handleAutoAssign = async (instance: CourseInstance) => {
    if (!confirm(`Auto-assign teachers for ${instance.name}?\n\nRules:\n- Max 8 hrs/day\n- Annual Caps\n- Online Restrictions`)) return;
    setProcessing(true);
    
    try {
        const template = templates.find(t => t.id === instance.template_id);
        if (!template) return;

        const raw = template as any;
        const rawSeq = raw.sequenced_subjects || raw.sequencedSubjects || [];
        const subjectMap = new Map<string, Subject>();
        const requiredIds: string[] = [];

        rawSeq.forEach((item: any) => {
            const id = typeof item === 'string' ? item : item.id;
            const sub = subjects.find(s => s.id === id);
            if (sub) {
                subjectMap.set(id, sub);
                requiredIds.push(id);
            }
        });

        let currentLocalAllocations = [...allocations];
        const newAllocationsToSave: any[] = [];

        const existingInThisCourse = currentLocalAllocations.filter(a => a.instance_id === instance.id);
        const assignedIds = new Set(existingInThisCourse.map(a => a.subject_id));
        const missingIds = requiredIds.filter((id: string) => !assignedIds.has(id));

        if (missingIds.length === 0) {
            alert("This course is already fully allocated!");
            setProcessing(false);
            return;
        }

        for (const subId of missingIds) {
            const subject = subjectMap.get(subId);
            const subHours = subject?.hours || 20; 

            const shuffledTeachers = [...teachers].sort(() => 0.5 - Math.random());
            let assignedTeacherId = null;

            for (const teacher of shuffledTeachers) {
                if (isTeacherValidForCourse(teacher, instance, currentLocalAllocations, subHours)) {
                    assignedTeacherId = teacher.id;
                    break; 
                }
            }

            if (assignedTeacherId) {
                const newAlloc = { instance_id: instance.id, subject_id: subId, teacher_id: assignedTeacherId };
                newAllocationsToSave.push(newAlloc);
                currentLocalAllocations.push(newAlloc as UnitAllocation); 
            }
        }

        if (newAllocationsToSave.length > 0) {
            await Promise.all(newAllocationsToSave.map(a => ApiService.saveAllocation(a)));
            await loadData(); 
            alert(`Assigned ${newAllocationsToSave.length} subjects.`);
        } else {
            alert("Could not assign any teachers. Everyone is busy, restricted, or over hours.");
        }

    } catch (e) {
        console.error(e);
        alert("Auto-assign failed.");
    } finally {
        setProcessing(false);
    }
  };

  // --- GLOBAL AUTO ASSIGN ---
  const handleGlobalAutoAssign = async () => {
    if (!confirm(`Are you sure you want to Auto-Assign ALL courses?\n\nStrict Rules Applied (8h Day Limit, Annual Caps).`)) return;
    setProcessing(true);
    
    try {
        let totalAssigned = 0;
        let currentLocalAllocations = [...allocations]; 

        for (const instance of instances) {
            if (instance.status === 'completed') continue;
            const template = templates.find(t => t.id === instance.template_id);
            if (!template) continue;

            const raw = template as any;
            const rawSeq = raw.sequenced_subjects || raw.sequencedSubjects || [];
            
            const subjectMap = new Map<string, Subject>();
            const requiredIds: string[] = [];
            
            rawSeq.forEach((item: any) => {
                const id = typeof item === 'string' ? item : item.id;
                const sub = subjects.find(s => s.id === id);
                if (sub) {
                    subjectMap.set(id, sub);
                    requiredIds.push(id);
                }
            });

            const existing = currentLocalAllocations.filter(a => a.instance_id === instance.id);
            const assignedIds = new Set(existing.map(a => a.subject_id));
            const missingIds = requiredIds.filter((id: string) => !assignedIds.has(id));

            const batchAllocations: any[] = [];

            for (const subId of missingIds) {
                const subject = subjectMap.get(subId);
                const subHours = subject?.hours || 20;

                const shuffledTeachers = [...teachers].sort(() => 0.5 - Math.random());
                let candidateId = null;
                for (const teacher of shuffledTeachers) {
                    if (isTeacherValidForCourse(teacher, instance, currentLocalAllocations, subHours)) {
                        candidateId = teacher.id;
                        break;
                    }
                }
                if (candidateId) {
                    const newAlloc = { instance_id: instance.id, subject_id: subId, teacher_id: candidateId };
                    batchAllocations.push(newAlloc);
                    currentLocalAllocations.push(newAlloc as UnitAllocation);
                }
            }

            if (batchAllocations.length > 0) {
                await Promise.all(batchAllocations.map(a => ApiService.saveAllocation(a)));
                totalAssigned += batchAllocations.length;
            }
        }
        await loadData();
        alert(`Global Auto-Assign Complete.\nAllocated: ${totalAssigned} units.`);
    } catch (e) {
        console.error(e);
        alert("Global Auto-Assign failed.");
    } finally {
        setProcessing(false);
    }
  };

  // --- PDF GENERATOR ---
  const handleDownloadPDF = (instance: CourseInstance) => {
      const template = templates.find(t => t.id === instance.template_id);
      if (!template) return alert("Template not found.");

      const rawEvents = generateAllEventsForInstance(instance, academicYears, template as any, subjects as any[], teachers);
      const sorted = [...rawEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
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
              const isMondayAfterFriday = (currentGroup.endDate.getDay() === 5 && ev.start.getDay() === 1 && (ev.start.getTime() - currentGroup.endDate.getTime()) < 345600000); 

              if (evKey === currentGroup.key && (isNextDay || isMondayAfterFriday)) {
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
              body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; }
              h1 { color: #0f172a; margin-bottom: 5px; font-size: 24px; }
              .meta { color: #64748b; margin-bottom: 30px; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
              th { background-color: #2563eb; color: white; padding: 12px 15px; text-align: left; }
              td { border-bottom: 1px solid #e2e8f0; padding: 12px 15px; }
              tr:nth-child(even) { background-color: #f8fafc; }
            </style>
          </head>
          <body>
            <h1>${instance.name}</h1>
            <div class="meta">Generated on ${new Date().toLocaleDateString()}</div>
            <table>
              <thead><tr><th>Dates</th><th>Time</th><th>Unit / Subject</th><th>Trainer</th></tr></thead>
              <tbody>
                ${merged.map(ev => {
                    const isRange = ev.start.toDateString() !== ev.endDate.toDateString();
                    const dateDisplay = isRange 
                      ? `${ev.start.toLocaleDateString([], {day: 'numeric', month: 'short'})} - ${ev.endDate.toLocaleDateString([], {day: 'numeric', month: 'short'})}`
                      : ev.start.toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'});
                    return `<tr>
                        <td><strong>${dateDisplay}</strong></td>
                        <td>${ev.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${ev.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
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
    const requiredSubjectIds = rawSeq.map((item: any) => typeof item === 'string' ? item : item.subjectId || item.id).filter(Boolean);
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Scheduled Courses</h1>
          <p className="text-slate-500">Manage active cohorts and teacher allocations.</p>
        </div>
        <div className="flex gap-3">
            <button onClick={handleGlobalAutoAssign} disabled={processing} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 shadow-sm disabled:opacity-50">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <ShieldAlert size={18} />}
                Global Auto Assign
            </button>
            <button onClick={() => setShowTemplateManager(true)} className="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50 shadow-sm">
                <BookOpen size={18} /> Qualifications
            </button>
            <button onClick={() => setShowScheduleModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm">
                <Plus size={18} /> Schedule New
            </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
          <input placeholder="Search active cohorts..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {/* Course List Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm uppercase">
              <th className="p-4 font-bold">Cohort Name</th>
              <th className="p-4 font-bold">Qualification</th>
              <th className="p-4 font-bold">Dates</th>
              <th className="p-4 font-bold">Schedule</th>
              <th className="p-4 font-bold text-right">Actions</th>
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
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100"><CheckCircle2 size={12} /> Allocated</span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 text-xs font-bold border border-red-100 animate-pulse"><AlertTriangle size={12} /> {unassignedCount} Unassigned</span>
                        )}
                        <span className={`text-xs px-2 py-1 rounded-md border ${instance.status === 'completed' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{instance.status || 'Active'}</span>
                    </div>
                  </td>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-700">{template?.name || 'Unknown Template'}</div>
                    <div className="text-xs text-slate-400 mt-1 font-mono">ID: {template?.id?.slice(0,8)}</div>
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm text-slate-700"><Calendar size={14} className="text-green-600" /><span className="font-medium">{instance.start_date}</span></div>
                        <div className="flex items-center gap-2 text-sm text-slate-500"><Calendar size={14} className="text-slate-400" /><span>{instance.end_date}</span></div>
                    </div>
                  </td>
                  <td className="p-4 align-top text-sm text-slate-600">
                    <div className="font-medium">{instance.hours_per_day}h / session</div>
                    <div className="text-slate-400 text-xs mt-1 capitalize flex items-center gap-1">{instance.delivery_mode}</div>
                  </td>
                  <td className="p-4 align-top text-right">
                    <div className="flex justify-end gap-2">
                        {!isFullyAllocated && (
                            <button onClick={() => handleAutoAssign(instance)} disabled={processing} className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-purple-200"><Wand2 size={18} /></button>
                        )}
                        <button onClick={() => handleDownloadPDF(instance)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><FileText size={18} /></button>
                        <button onClick={() => { setSelectedInstance(instance); setShowScheduleModal(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Settings size={18} /></button>
                        <button onClick={() => setShowAllocator(instance)} className={`px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm transition-colors border ${!isFullyAllocated ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600' : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'}`}><Users size={16} /> Assign</button>
                        <button onClick={() => handleDelete(instance.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showScheduleModal && (
        <ScheduleCourseForm 
            initialData={selectedInstance}
            onClose={() => { setShowScheduleModal(false); setSelectedInstance(null); }}
            onSuccess={() => { setShowScheduleModal(false); setSelectedInstance(null); loadData(); }}
        />
      )}

      {showAllocator && (
        <CourseAllocation 
            instance={showAllocator}
            onClose={() => setShowAllocator(null)}
            onUpdate={() => { loadData(); }} 
        />
      )}

      {showTemplateManager && !showCourseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-800">Manage Qualifications</h2>
                    <button onClick={() => setShowTemplateManager(false)}><X size={24} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <p className="text-sm text-slate-500">Edit existing qualifications or create new ones.</p>
                        <button onClick={handleCreateTemplate} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2"><Plus size={16} /> Create New</button>
                    </div>
                    <div className="space-y-3">
                        {templates.map(t => (
                            <div key={t.id} className="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-xl hover:shadow-sm transition-shadow">
                                <div><div className="font-bold text-slate-800">{t.name}</div><div className="text-xs text-slate-400 font-mono mt-1">{t.id}</div></div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditTemplate(t)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={18} /></button>
                                    <button onClick={() => handleDeleteTemplate(t.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      )}

      {showCourseForm && (
          <CourseForm 
            initialData={editingTemplate}
            onClose={() => setShowCourseForm(false)}
            onSuccess={() => { setShowCourseForm(false); loadData(); }}
          />
      )}

    </div>
  );
};