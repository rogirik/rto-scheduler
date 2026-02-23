import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { CourseInstance, UnitAllocation, Teacher, Subject, Course } from '../../../services/api';
import { 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  User, 
  Loader2, 
  ShieldAlert, 
  Search,
  ArrowRight,
  BookOpen,
  RotateCcw
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
  const [currentAllocations, setCurrentAllocations] = useState<UnitAllocation[]>([]);
  const [globalAllocations, setGlobalAllocations] = useState<UnitAllocation[]>([]);
  const [allInstances, setAllInstances] = useState<CourseInstance[]>([]);
  const [template, setTemplate] = useState<Course | null>(null);

  // UI State
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [processingSubjectId, setProcessingSubjectId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        // 1. Fetch Data
        const [tRes, sData, aData, templateData, iData] = await Promise.all([
          supabase.from('teachers').select('*'), // Fetch raw to filter manually
          ApiService.getSubjects(),
          ApiService.getAllocationsGlobal(),
          ApiService.getById<Course>('course_templates', instance.template_id),
          ApiService.getCourseInstances()
        ]);
        
        // 2. Filter Ghost Teachers (Organization Security)
        let validTeachers = tRes.data || [];
        if (user) {
            const myKnownTeacher = validTeachers.find(t => t.user_id === user.id && t.organization_id);
            const myOrgId = myKnownTeacher?.organization_id;

            validTeachers = validTeachers.filter(t => {
                if (myOrgId && t.organization_id === myOrgId) return true;
                return t.user_id === user.id;
            });
        }

        setTeachers(validTeachers);
        setSubjects(sData);
        setGlobalAllocations(aData);
        setCurrentAllocations(aData.filter((a: any) => a.instance_id === instance.id));
        setAllInstances(iData);
        setTemplate(templateData);
      } catch (error) {
        console.error("Failed to load allocation data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [instance.id, instance.template_id]);

  // Auto-select first subject
  useEffect(() => {
      if (!selectedSubjectId && template) {
          const firstSub = (template as any).sequenced_subjects?.[0];
          const firstId = typeof firstSub === 'string' ? firstSub : firstSub?.id;
          if (firstId) setSelectedSubjectId(firstId);
      }
  }, [template]);

  // --- STRICT COMPLIANCE ENGINE ---
  const getTeacherStatus = (teacherId: string, subjectId: string) => {
      const teacher = teachers.find(t => t.id === teacherId);
      const subject = subjects.find(s => s.id === subjectId);
      if (!teacher || !subject) return null;

      const warnings: string[] = [];
      let isCritical = false;

      // 1. ONLINE CHECK (Critical)
      if (teacher.trains_online && instance.delivery_mode !== 'Online') {
          warnings.push("Online Only (Incompatible Mode)");
          isCritical = true;
      }

      // 2. LOAD CHECKS
      const teacherAllocations = globalAllocations.filter(a => a.teacher_id === teacherId);
      
      // -- A. Annual Cap --
      let currentAnnualLoad = 0;
      teacherAllocations.forEach(alloc => {
          const sub = subjects.find(s => s.id === alloc.subject_id);
          if (sub) currentAnnualLoad += (sub.hours || 0);
      });
      // Add current subject if not already assigned
      if (!teacherAllocations.some(a => a.instance_id === instance.id && a.subject_id === subject.id)) {
          currentAnnualLoad += (subject.hours || 0);
      }
      
      if (currentAnnualLoad > (teacher.max_hours || 800)) {
          warnings.push(`Over Annual Cap (${currentAnnualLoad}/${teacher.max_hours || 800}h)`);
          isCritical = true;
      }

      // -- B. Daily 8h Limit --
      const targetDays = instance.allowed_days || [];
      const targetDailyHours = instance.hours_per_day || 0;
      const activeInstanceIds = new Set(teacherAllocations.map(a => a.instance_id));
      
      for (const day of targetDays) {
          let dailyTotal = targetDailyHours;
          activeInstanceIds.forEach(otherId => {
              if (otherId === instance.id) return;
              const otherInstance = allInstances.find(i => i.id === otherId);
              if (otherInstance && otherInstance.status !== 'completed') {
                  const otherDays = otherInstance.allowed_days || [];
                  if (otherDays.includes(day)) {
                      dailyTotal += (otherInstance.hours_per_day || 0);
                  }
              }
          });

          if (dailyTotal > 8) {
              const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day];
              warnings.push(`>8h Limit (${dailyTotal}h on ${dayName})`);
              isCritical = true;
              break; 
          }
      }

      if (warnings.length === 0) return null;
      return { warnings, isCritical };
  };

  // Actions
  const handleAssign = async (teacherId: string) => {
    if (!selectedSubjectId) return;
    
    // --- SAFETY CHECK START ---
    const status = getTeacherStatus(teacherId, selectedSubjectId);
    if (status?.isCritical) {
        const confirmMsg = `CRITICAL WARNING: This assignment violates rules:\n\n- ${status.warnings.join('\n- ')}\n\nAre you sure you want to force this assignment?`;
        if (!confirm(confirmMsg)) return;
    }
    // --- SAFETY CHECK END ---

    setProcessingSubjectId(selectedSubjectId);

    try {
        const existingAlloc = currentAllocations.find(a => a.subject_id === selectedSubjectId);
        
        const payload = {
            instance_id: instance.id,
            subject_id: selectedSubjectId,
            teacher_id: teacherId 
        };

        // 1. Update UI Instantly
        const newAllocations = existingAlloc 
            ? currentAllocations.map(a => a.subject_id === selectedSubjectId ? { ...a, teacher_id: teacherId } : a)
            : [...currentAllocations, { ...payload, id: 'temp-' + Date.now() } as UnitAllocation];
        
        setCurrentAllocations(newAllocations);

        const newGlobal = existingAlloc
            ? globalAllocations.map(a => a.id === existingAlloc.id ? { ...a, teacher_id: teacherId } : a)
            : [...globalAllocations, { ...payload, id: 'temp-' + Date.now() } as UnitAllocation];
        
        setGlobalAllocations(newGlobal.filter(a => a.teacher_id)); 

        // 2. Safely Save to Database
        if (existingAlloc && existingAlloc.id && !existingAlloc.id.toString().startsWith('temp')) {
            await supabase.from('course_unit_allocations') // Kept your table name
                .update({ teacher_id: teacherId })
                .eq('id', existingAlloc.id);
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
    } catch (e) {
      alert("Failed to remove trainer.");
    } finally {
      setProcessingSubjectId(null);
    }
  };

  const handleClearCourse = async () => {
      if (!confirm("Are you sure you want to clear ALL teacher assignments for this course?")) return;
      setLoading(true);
      try {
          await supabase.from('course_unit_allocations').delete().eq('instance_id', instance.id);
          setCurrentAllocations([]);
          setGlobalAllocations(prev => prev.filter(a => a.instance_id !== instance.id));
      } catch (e) {
          alert("Clear failed.");
      } finally {
          setLoading(false);
      }
  };

  const getAssignedTeacherId = (subjectId: string) => {
      return currentAllocations.find(a => a.subject_id === subjectId)?.teacher_id || "";
  };

  if (loading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"><Loader2 className="animate-spin text-white" size={40} /></div>;

  const subjectList = (template as any)?.sequenced_subjects || (template as any)?.sequencedSubjects || [];
  const resolvedSubjects = subjectList.map((item: any) => {
      const id = typeof item === 'string' ? item : item.id;
      return subjects.find(s => s.id === id);
  }).filter(Boolean) as Subject[];

  const filteredTeachers = teachers.filter(t => t.name.toLowerCase().includes(teacherSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="text-blue-600" size={24}/>
                Assign Trainers
            </h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                <span className="font-bold text-blue-600">{instance.name}</span>
                <span>•</span>
                <span>{instance.delivery_mode}</span>
                <span>•</span>
                <span>{resolvedSubjects.length} Units</span>
            </div>
          </div>
          <div className="flex gap-3">
              <button 
                onClick={handleClearCourse}
                className="px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-bold text-xs transition-colors border border-red-200 flex items-center gap-1"
              >
                  <RotateCcw size={14} /> Clear All
              </button>
              <button onClick={() => { onUpdate(); onClose(); }} className="text-slate-400 hover:text-slate-600 p-2"><X size={24} /></button>
          </div>
        </div>

        {/* --- DUAL COLUMN LAYOUT --- */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* LEFT: SUBJECTS (SLOTS) */}
            <div className="w-1/2 flex flex-col border-r border-slate-200 bg-slate-50/50">
                <div className="p-4 border-b border-slate-200 bg-white">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">1. Select Subject</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {resolvedSubjects.map((subject, index) => {
                        const assignedId = getAssignedTeacherId(subject.id);
                        const assignedTeacher = teachers.find(t => t.id === assignedId);
                        const isSelected = selectedSubjectId === subject.id;
                        const status = assignedId ? getTeacherStatus(assignedId, subject.id) : null;
                        const isProcessing = processingSubjectId === subject.id;

                        return (
                            <div 
                                key={subject.id}
                                onClick={() => setSelectedSubjectId(subject.id)}
                                className={`relative p-4 rounded-xl border cursor-pointer transition-all ${
                                    isSelected 
                                    ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500 z-10' 
                                    : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                            {index + 1}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                                {subject.code}
                                                {((subject as any).is_online || (subject as any).delivery_mode === 'Online') && (
                                                    <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Online Allowed</span>
                                                )}
                                            </span>
                                            <span className="text-xs text-slate-500 mt-0.5">{subject.name}</span>
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                        {subject.hours}h
                                    </span>
                                </div>

                                <div className="pl-9">
                                    {isProcessing ? (
                                        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 text-slate-500 text-sm font-bold border border-slate-200 w-fit">
                                            <Loader2 size={14} className="animate-spin" /> Processing...
                                        </div>
                                    ) : assignedTeacher ? (
                                        <div className={`flex items-center justify-between p-2 rounded-lg text-sm border ${status ? (status.isCritical ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200') : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                            <div className="flex items-center gap-2 font-bold">
                                                {status ? (status.isCritical ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />) : <CheckCircle2 size={16} className="text-emerald-500" />}
                                                {assignedTeacher.name}
                                                {status && <span className="text-xs font-normal opacity-80 bg-white/50 px-2 py-0.5 rounded ml-1">{status.warnings[0]}</span>}
                                            </div>
                                            
                                            <button 
                                                onClick={(e) => handleRemove(subject.id, e)}
                                                className={`p-1.5 rounded-md transition-colors ${status ? (status.isCritical ? 'hover:bg-red-200 text-red-600' : 'hover:bg-amber-200 text-amber-700') : 'hover:bg-emerald-200 text-emerald-700'}`}
                                                title="Unassign Trainer"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-slate-400 font-bold p-2 border border-dashed border-slate-300 rounded-lg w-fit">
                                            Unassigned - Click to select
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT: TEACHERS (RESOURCES) */}
            <div className="w-1/2 flex flex-col bg-white">
                <div className="p-4 border-b border-slate-200">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex justify-between items-center">
                        <span>2. Assign Teacher</span>
                        {selectedSubjectId && <span className="text-blue-500">Click a name to assign</span>}
                    </h3>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                        <input 
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded-lg text-sm transition-all border border-slate-200"
                            placeholder="Search teachers..."
                            value={teacherSearch}
                            onChange={e => setTeacherSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredTeachers.map(teacher => {
                        const currentStatus = selectedSubjectId ? getTeacherStatus(teacher.id, selectedSubjectId) : null;
                        const isCritical = currentStatus?.isCritical;
                        const isAssignedToSelected = selectedSubjectId && getAssignedTeacherId(selectedSubjectId) === teacher.id;

                        const teacherAllocations = globalAllocations.filter(a => a.teacher_id === teacher.id);
                        let displayLoad = 0;
                        teacherAllocations.forEach(alloc => {
                            const sub = subjects.find(s => s.id === alloc.subject_id);
                            if (sub) displayLoad += (sub.hours || 0);
                        });

                        return (
                            <button
                                key={teacher.id}
                                disabled={!selectedSubjectId || isAssignedToSelected || processingSubjectId !== null}
                                onClick={() => selectedSubjectId && handleAssign(teacher.id)}
                                className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 transition-all group ${
                                    isAssignedToSelected 
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md cursor-default' 
                                    : !selectedSubjectId || processingSubjectId !== null
                                        ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-100'
                                        : 'hover:border-blue-400 hover:shadow-md bg-white border-slate-200'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isAssignedToSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                    {teacher.name.charAt(0)}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <span className={`font-bold ${isAssignedToSelected ? 'text-white' : 'text-slate-800'}`}>
                                            {teacher.name}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold ${isAssignedToSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                                                Load: {displayLoad}/{teacher.max_hours || 800}h
                                            </span>
                                            {teacher.trains_online && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${isAssignedToSelected ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'}`}>
                                                    Online
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className={`text-xs mt-1 truncate ${isAssignedToSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                                        {currentStatus ? (
                                            <span className={`flex items-center gap-1 font-bold ${isCritical ? (isAssignedToSelected ? 'text-red-100' : 'text-red-500') : (isAssignedToSelected ? 'text-amber-100' : 'text-amber-500')}`}>
                                                {isCritical ? <ShieldAlert size={12} /> : <AlertTriangle size={12} />}
                                                {currentStatus.warnings[0]}
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1">
                                                <CheckCircle2 size={12} className={isAssignedToSelected ? 'text-emerald-200' : 'text-slate-400'} />
                                                Available for assignment
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
            <button 
                onClick={() => { onUpdate(); onClose(); }}
                className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md hover:shadow-lg transition-all"
            >
                Done
            </button>
        </div>

      </div>
    </div>
  );
};