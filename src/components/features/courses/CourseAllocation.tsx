import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { CourseInstance, UnitAllocation, Teacher, Subject, Course, AcademicYear } from '../../../services/api';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { 
  X, CheckCircle2, User, Loader2, Search, ArrowRight, BookOpen, RotateCcw
} from 'lucide-react';

interface Props {
  instance: CourseInstance;
  onClose: () => void;
  onUpdate: () => void;
}

export const CourseAllocation = ({ instance, onClose, onUpdate }: Props) => {
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [currentAllocations, setCurrentAllocations] = useState<UnitAllocation[]>([]);
  const [globalAllocations, setGlobalAllocations] = useState<UnitAllocation[]>([]);
  
  // Global Data for Clash Detection
  const [allInstances, setAllInstances] = useState<CourseInstance[]>([]);
  const [allTemplates, setAllTemplates] = useState<Course[]>([]);
  const [teacherSchedules, setTeacherSchedules] = useState<Record<string, any[]>>({});
  const [currentInstanceEvents, setCurrentInstanceEvents] = useState<any[]>([]);
  const [subjectRequiredDays, setSubjectRequiredDays] = useState<Record<string, number[]>>({});

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [processingSubjectId, setProcessingSubjectId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        // Fetch everything needed to build a global schedule
        const [tRes, sData, aData, instData, tempData, yData] = await Promise.all([
          supabase.from('teachers').select('*'), 
          ApiService.getSubjects(),
          ApiService.getAllocationsGlobal(),
          ApiService.getCourseInstances(),
          ApiService.getAll<Course>('course_templates'),
          ApiService.getAll<AcademicYear>('academic_years')
        ]);
        
        let myOrgId = null;
        let validTeachers = tRes.data || [];
        
        if (user) {
            // --- FIXED: Looking at user_profiles instead of profiles ---
            try {
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('organization_id')
                    .eq('id', user.id)
                    .single();
                if (profile) myOrgId = profile.organization_id;
            } catch (e) {
                // Ignore missing profile
            }

            if (!myOrgId) {
                const myKnownTeacher = validTeachers.find(t => t.user_id === user.id && t.organization_id);
                myOrgId = myKnownTeacher?.organization_id;
            }

            const isMine = (item: any) => {
                if (myOrgId && item.organization_id) return item.organization_id === myOrgId;
                return item.user_id === user.id;
            };

            validTeachers = validTeachers.filter(isMine);
            setAllInstances((instData || []).filter(isMine));
            setAllTemplates((tempData || []).filter(isMine));
        } else {
            setAllInstances(instData || []);
            setAllTemplates(tempData || []);
        }

        setTeachers(validTeachers);
        setSubjects(sData);
        setGlobalAllocations(aData);
        setCurrentAllocations(aData.filter((a: any) => a.instance_id === instance.id));
        setAcademicYears(yData || []);

      } catch (error) {
        console.error("Failed to load allocation data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [instance.id]);

  // Compute Global Events for Clash Detection
  useEffect(() => {
      if (allInstances.length === 0 || allTemplates.length === 0 || academicYears.length === 0) return;
      
      const tSchedules: Record<string, any[]> = {};
      let currEvents: any[] = [];
      const dayMap: Record<string, Set<number>> = {};

      allInstances.forEach(inst => {
          if (inst.status === 'completed') return;
          const temp = allTemplates.find(t => t.id === inst.template_id);
          if (!temp) return;

          const events = generateAllEventsForInstance(inst, academicYears, temp as any, subjects, teachers);
          const taggedEvents = events.map(e => ({ ...e, instanceId: inst.id, instanceName: inst.name }));

          if (inst.id === instance.id) {
              currEvents = taggedEvents;
              taggedEvents.forEach(ev => {
                  if (!dayMap[ev.subjectId]) dayMap[ev.subjectId] = new Set();
                  let d = ev.start;
                  if (typeof d === 'string') d = new Date(d);
                  dayMap[ev.subjectId].add(d.getUTCDay());
              });
          }

          // Assign events to specific teachers based on global allocations
          taggedEvents.forEach(ev => {
              const alloc = globalAllocations.find(a => a.instance_id === inst.id && a.subject_id === ev.subjectId);
              if (alloc && alloc.teacher_id) {
                  if (!tSchedules[alloc.teacher_id]) tSchedules[alloc.teacher_id] = [];
                  tSchedules[alloc.teacher_id].push(ev);
              }
          });
      });

      setTeacherSchedules(tSchedules);
      setCurrentInstanceEvents(currEvents);

      const finalMap: Record<string, number[]> = {};
      for (const k in dayMap) finalMap[k] = Array.from(dayMap[k]);
      setSubjectRequiredDays(finalMap);

      if (!selectedSubjectId) {
          const matchedTemp = allTemplates.find(t => t.id === instance.template_id);
          const firstSub = (matchedTemp as any)?.sequenced_subjects?.[0];
          const firstId = typeof firstSub === 'string' ? firstSub : firstSub?.id;
          if (firstId) setSelectedSubjectId(firstId);
      }
  }, [allInstances, allTemplates, academicYears, subjects, teachers, globalAllocations, instance]);

  // Robust Availability Parser
  const isTeacherAvailableOnDay = (teacher: Teacher, day: number) => {
      let avail: any = teacher.availability;
      if (!avail) return false;
      if (typeof avail === 'string') { try { avail = JSON.parse(avail); } catch (e) { avail = {}; } }
      if (avail[String(day)]) return true;
      if (avail.schedule && avail.schedule[String(day)] && avail.schedule[String(day)].active) return true;
      if (Array.isArray(avail) && avail.includes(day)) return true;
      return false;
  };

  const getTeacherStatus = (teacherId: string, subjectId: string) => {
      const teacher = teachers.find(t => t.id === teacherId);
      const subject = subjects.find(s => s.id === subjectId);
      if (!teacher || !subject) return null;

      // 1. ONLINE CHECK
      if (teacher.trains_online && instance.delivery_mode !== 'Online') return { available: false, reason: "Online Only" };

      // 2. LOAD CHECK
      const teacherAllocations = globalAllocations.filter(a => a.teacher_id === teacherId);
      let currentAnnualLoad = 0;
      teacherAllocations.forEach(alloc => {
          const sub = subjects.find(s => s.id === alloc.subject_id);
          if (sub) currentAnnualLoad += (sub.hours || 0);
      });
      if (!teacherAllocations.some(a => a.instance_id === instance.id && a.subject_id === subject.id)) {
          currentAnnualLoad += (subject.hours || 0);
      }
      if (currentAnnualLoad > (teacher.max_hours || 800)) return { available: false, reason: "Over Max Hours" };

      // 3. ACTUAL DAY AVAILABILITY CHECK
      const requiredDays = subjectRequiredDays[subjectId] && subjectRequiredDays[subjectId].length > 0 
          ? subjectRequiredDays[subjectId] 
          : (instance.allowed_days || [1, 2, 3, 4, 5]);

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (const day of requiredDays) {
          if (day === 0) continue; // Skip strict Sunday checking
          if (!isTeacherAvailableOnDay(teacher, day)) {
              return { available: false, reason: `Not available on ${dayNames[day]}` };
          }
      }

      // 4. CLASH DETECTION (Already Teaching)
      const proposedEvents = currentInstanceEvents.filter(e => e.subjectId === subjectId);
      const existingEvents = teacherSchedules[teacherId] || [];

      for (const newEv of proposedEvents) {
          for (const existEv of existingEvents) {
              // Ignore the exact subject we are currently trying to assign (prevents self-clashing)
              if (existEv.instanceId === instance.id && existEv.subjectId === subjectId) continue;

              const newStart = new Date(newEv.start).getTime();
              const newEnd = new Date(newEv.end).getTime();
              const existStart = new Date(existEv.start).getTime();
              const existEnd = new Date(existEv.end).getTime();

              if (newStart < existEnd && newEnd > existStart) {
                  const dt = new Date(existStart);
                  // Force UTC string to avoid AEDT offset issues
                  const dateStr = dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
                  return { available: false, reason: `Clash: ${existEv.instanceName} on ${dateStr}` };
              }
          }
      }

      return { available: true, reason: "" };
  };

  const handleAssign = async (teacherId: string) => {
    if (!selectedSubjectId) return;
    
    const status = getTeacherStatus(teacherId, selectedSubjectId);
    if (status && !status.available) {
        if (!confirm(`WARNING: ${status.reason}.\n\nAre you sure you want to force this assignment?`)) return;
    }

    setProcessingSubjectId(selectedSubjectId);

    try {
        const existingAlloc = currentAllocations.find(a => a.subject_id === selectedSubjectId);
        const payload = { instance_id: instance.id, subject_id: selectedSubjectId, teacher_id: teacherId };

        const newAllocations = existingAlloc 
            ? currentAllocations.map(a => a.subject_id === selectedSubjectId ? { ...a, teacher_id: teacherId } : a)
            : [...currentAllocations, { ...payload, id: 'temp-' + Date.now() } as UnitAllocation];
        
        setCurrentAllocations(newAllocations);

        const newGlobal = existingAlloc
            ? globalAllocations.map(a => a.id === existingAlloc.id ? { ...a, teacher_id: teacherId } : a)
            : [...globalAllocations, { ...payload, id: 'temp-' + Date.now() } as UnitAllocation];
        
        setGlobalAllocations(newGlobal.filter(a => a.teacher_id)); 

        if (existingAlloc && existingAlloc.id && !existingAlloc.id.toString().startsWith('temp')) {
            await supabase.from('course_unit_allocations').update({ teacher_id: teacherId }).eq('id', existingAlloc.id);
        } else {
            await supabase.from('course_unit_allocations').insert([payload]);
        }
    } catch (e) {
        console.error("Assignment error:", e);
        alert("Assignment failed. Check console.");
    } finally {
        setProcessingSubjectId(null);
    }
  };

  const handleRemove = async (subjectId: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    setProcessingSubjectId(subjectId);
    try {
      const existingAlloc = currentAllocations.find(a => a.subject_id === subjectId);
      if (existingAlloc && existingAlloc.id) {
        if (!existingAlloc.id.toString().startsWith('temp')) {
            await supabase.from('course_unit_allocations').delete().eq('id', existingAlloc.id);
        }
        setCurrentAllocations(prev => prev.filter(a => a.subject_id !== subjectId));
        setGlobalAllocations(prev => prev.filter(a => a.id !== existingAlloc.id));
      }
    } catch (e) { alert("Failed to remove trainer."); } finally { setProcessingSubjectId(null); }
  };

  const handleClearCourse = async () => {
      if (!confirm("Are you sure you want to clear ALL teacher assignments for this course?")) return;
      setLoading(true);
      try {
          await supabase.from('course_unit_allocations').delete().eq('instance_id', instance.id);
          setCurrentAllocations([]);
          setGlobalAllocations(prev => prev.filter(a => a.instance_id !== instance.id));
      } catch (e) { alert("Clear failed."); } finally { setLoading(false); }
  };

  const getAssignedTeacherId = (subjectId: string) => currentAllocations.find(a => a.subject_id === subjectId)?.teacher_id || "";

  if (loading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"><Loader2 className="animate-spin text-white" size={40} /></div>;

  const matchedTemplate = allTemplates.find(t => t.id === instance.template_id);
  const subjectList = (matchedTemplate as any)?.sequenced_subjects || (matchedTemplate as any)?.sequencedSubjects || [];
  const resolvedSubjects = subjectList.map((item: any) => {
      const id = typeof item === 'string' ? item : item.id;
      return subjects.find(s => s.id === id);
  }).filter(Boolean) as Subject[];

  const filteredTeachers = teachers.filter(t => t.name.toLowerCase().includes(teacherSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BookOpen className="text-blue-600" size={24}/> Assign Trainers</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500"><span className="font-bold text-blue-600">{instance.name}</span><span>•</span><span>{instance.delivery_mode}</span><span>•</span><span>{resolvedSubjects.length} Units</span></div>
          </div>
          <div className="flex gap-3">
              <button onClick={handleClearCourse} className="px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-bold text-xs transition-colors border border-red-200 flex items-center gap-1"><RotateCcw size={14} /> Clear All</button>
              <button onClick={() => { onUpdate(); onClose(); }} className="text-slate-400 hover:text-slate-600 p-2"><X size={24} /></button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
            <div className="w-1/2 flex flex-col border-r border-slate-200 bg-slate-50/50">
                <div className="p-4 border-b border-slate-200 bg-white"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">1. Select Subject</h3></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {resolvedSubjects.map((subject, index) => {
                        const assignedId = getAssignedTeacherId(subject.id);
                        const assignedTeacher = teachers.find(t => t.id === assignedId);
                        const isSelected = selectedSubjectId === subject.id;
                        const status = assignedId ? getTeacherStatus(assignedId, subject.id) : null;
                        const isProcessing = processingSubjectId === subject.id;

                        return (
                            <div key={subject.id} onClick={() => setSelectedSubjectId(subject.id)} className={`relative p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500 z-10' : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</div>
                                        <div className="flex flex-col"><span className="font-bold text-slate-700 text-sm">{subject.code}</span><span className="text-xs text-slate-500 mt-0.5">{subject.name}</span></div>
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">{subject.hours}h</span>
                                </div>
                                <div className="pl-9">
                                    {isProcessing ? (
                                        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 text-slate-500 text-sm font-bold border border-slate-200 w-fit"><Loader2 size={14} className="animate-spin" /> Processing...</div>
                                    ) : assignedTeacher ? (
                                        <div className={`flex items-center justify-between p-2 rounded-lg text-sm border ${status && !status.available ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                            <div className="flex items-center gap-2 font-bold">{status && !status.available ? <X size={16} /> : <CheckCircle2 size={16} className="text-emerald-500" />}{assignedTeacher.name}</div>
                                            <button onClick={(e) => handleRemove(subject.id, e)} className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600"><X size={16} /></button>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-slate-400 font-bold p-2 border border-dashed border-slate-300 rounded-lg w-fit">Unassigned - Click to select</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="w-1/2 flex flex-col bg-white">
                <div className="p-4 border-b border-slate-200">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex justify-between items-center"><span>2. Assign Teacher</span>{selectedSubjectId && <span className="text-blue-500">Click a name to assign</span>}</h3>
                    <div className="relative"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="Search teachers..." value={teacherSearch} onChange={e => setTeacherSearch(e.target.value)} /></div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredTeachers.map(teacher => {
                        const currentStatus = selectedSubjectId ? getTeacherStatus(teacher.id, selectedSubjectId) : null;
                        const isAvailable = currentStatus?.available ?? true;
                        const isAssignedToSelected = selectedSubjectId && getAssignedTeacherId(selectedSubjectId) === teacher.id;

                        const teacherAllocations = globalAllocations.filter(a => a.teacher_id === teacher.id);
                        let displayLoad = 0;
                        teacherAllocations.forEach(alloc => { const sub = subjects.find(s => s.id === alloc.subject_id); if (sub) displayLoad += (sub.hours || 0); });

                        return (
                            <button key={teacher.id} disabled={!selectedSubjectId || isAssignedToSelected || processingSubjectId !== null} onClick={() => selectedSubjectId && handleAssign(teacher.id)} className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 transition-all group ${isAssignedToSelected ? 'bg-emerald-600 border-emerald-600 text-white shadow-md cursor-default' : !selectedSubjectId || processingSubjectId !== null ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-100' : 'hover:border-blue-400 hover:shadow-md bg-white border-slate-200'}`}>
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isAssignedToSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{teacher.name.charAt(0)}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <span className={`font-bold ${isAssignedToSelected ? 'text-white' : 'text-slate-800'}`}>{teacher.name}</span>
                                        <span className={`text-[10px] font-bold ${isAssignedToSelected ? 'text-emerald-100' : 'text-slate-400'}`}>Load: {displayLoad}/{teacher.max_hours || 800}h</span>
                                    </div>
                                    <div className={`text-xs mt-1 truncate ${isAssignedToSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                                        {!isAvailable ? <span className={`flex items-center gap-1 font-bold ${isAssignedToSelected ? 'text-red-100' : 'text-red-500'}`}><X size={12} /> Not Available ({currentStatus?.reason})</span> : <span className="flex items-center gap-1 font-bold"><CheckCircle2 size={12} className={isAssignedToSelected ? 'text-emerald-200' : 'text-emerald-600'} /> Available</span>}
                                    </div>
                                </div>
                                {!isAssignedToSelected && selectedSubjectId && isAvailable && <div className="opacity-0 group-hover:opacity-100 text-blue-500 font-bold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1">Assign <ArrowRight size={14} /></div>}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
            <button onClick={() => { onUpdate(); onClose(); }} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md">Done</button>
        </div>

      </div>
    </div>
  );
};