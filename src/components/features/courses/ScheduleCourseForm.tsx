import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { X, Loader2, Calendar as CalIcon, Trash2, Plus, AlertCircle, RotateCcw, LayoutTemplate, Layers, AlertTriangle } from 'lucide-react';
import type { CourseInstance, Course, Subject, AcademicYear } from '../../../services/api';

interface ScheduleCourseFormProps {
  initialData?: CourseInstance | null;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS_MAP = [
    { id: 0, label: 'Sun', short: 'S' }, { id: 1, label: 'Mon', short: 'M' }, { id: 2, label: 'Tue', short: 'T' },
    { id: 3, label: 'Wed', short: 'W' }, { id: 4, label: 'Thu', short: 'T' }, { id: 5, label: 'Fri', short: 'F' }, { id: 6, label: 'Sat', short: 'S' }
];

export const ScheduleCourseForm = ({ initialData, onClose, onSuccess }: ScheduleCourseFormProps) => {
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  
  const [templates, setTemplates] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [generatedEvents, setGeneratedEvents] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    template_id: '',
    start_date: '',
    start_time: '09:00',
    hours_per_day: 6,
    delivery_mode: 'Blended',
    scheduling_mode: 'consecutive' as 'consecutive' | 'flexible',
    allowed_days: [1, 2, 3, 4, 5],
    subject_rules: {} as Record<string, { start_date: string, allowed_days: number[] }>,
    additional_dates: [] as string[],
    excluded_dates: [] as string[]
  });

  const [newAddDate, setNewAddDate] = useState('');

  useEffect(() => {
    const fetchDependencies = async () => {
      const [tRes, sRes, yRes] = await Promise.all([
        ApiService.getAll<Course>('course_templates'),
        ApiService.getSubjects(),
        ApiService.getAll<AcademicYear>('academic_years')
      ]);
      setTemplates(tRes || []);
      setSubjects(sRes || []);
      setAcademicYears(yRes || []);

      if (initialData) {
        setFormData({
          name: initialData.name || '',
          template_id: initialData.template_id || '',
          start_date: initialData.start_date || '',
          start_time: initialData.start_time || '09:00',
          hours_per_day: initialData.hours_per_day || 6,
          delivery_mode: initialData.delivery_mode || 'Blended',
          scheduling_mode: (initialData as any).scheduling_mode || 'consecutive',
          allowed_days: initialData.allowed_days || [1, 2, 3, 4, 5],
          subject_rules: (initialData as any).subject_rules || {},
          additional_dates: Array.isArray(initialData.additional_dates) ? initialData.additional_dates : [],
          excluded_dates: Array.isArray(initialData.excluded_dates) ? initialData.excluded_dates : []
        });
      }
    };
    fetchDependencies();
  }, [initialData]);

  // --- LIVE SCHEDULE GENERATOR ---
  useEffect(() => {
      if (!formData.template_id || !formData.start_date) {
          setGeneratedEvents([]);
          return;
      }
      setCalculating(true);
      
      const timer = setTimeout(() => {
          const selectedTemplate = templates.find(t => t.id === formData.template_id);
          const mockInstance = { ...formData, id: 'preview' } as unknown as CourseInstance;
          
          let events = generateAllEventsForInstance(mockInstance, academicYears, selectedTemplate, subjects, [], []);
          
          // Sort events strictly chronologically
          events = events.sort((a, b) => a.start.getTime() - b.start.getTime());
          
          setGeneratedEvents(events);
          setCalculating(false);
      }, 300);

      return () => clearTimeout(timer);
  }, [formData, templates, subjects, academicYears, formData.scheduling_mode, formData.subject_rules, formData.additional_dates, formData.excluded_dates]);

  const toggleGlobalDay = (dayId: number) => {
    setFormData(prev => ({
        ...prev,
        allowed_days: prev.allowed_days.includes(dayId)
            ? prev.allowed_days.filter(d => d !== dayId)
            : [...prev.allowed_days, dayId].sort()
    }));
  };

  const updateSubjectRule = (subjectId: string, field: 'start_date' | 'allowed_days', value: any) => {
      setFormData(prev => {
          const currentRule = prev.subject_rules[subjectId] || { start_date: prev.start_date, allowed_days: prev.allowed_days };
          return {
              ...prev,
              subject_rules: {
                  ...prev.subject_rules,
                  [subjectId]: { ...currentRule, [field]: value }
              }
          };
      });
  };

  const toggleSubjectDay = (subjectId: string, dayId: number) => {
      const currentRule = formData.subject_rules[subjectId] || { start_date: formData.start_date, allowed_days: formData.allowed_days };
      const currentDays = currentRule.allowed_days;
      const newDays = currentDays.includes(dayId) 
          ? currentDays.filter(d => d !== dayId) 
          : [...currentDays, dayId].sort();
      
      updateSubjectRule(subjectId, 'allowed_days', newDays);
  };

  const handleAddManualDate = () => {
      if (!newAddDate) return;
      if (!formData.additional_dates.includes(newAddDate)) {
          setFormData(prev => ({ ...prev, additional_dates: [...prev.additional_dates, newAddDate].sort() }));
      }
      setNewAddDate('');
  };

  const handleSkipDateFromList = (dateObj: Date) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (!formData.excluded_dates.includes(dateStr)) {
          setFormData(prev => ({ ...prev, excluded_dates: [...prev.excluded_dates, dateStr].sort() }));
      }
  };

  const removeOverrideDate = (type: 'add' | 'exclude', dateToRemove: string) => {
      setFormData(prev => ({
          ...prev,
          additional_dates: type === 'add' ? prev.additional_dates.filter(d => d !== dateToRemove) : prev.additional_dates,
          excluded_dates: type === 'exclude' ? prev.excluded_dates.filter(d => d !== dateToRemove) : prev.excluded_dates
      }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
        const payload = {
            name: formData.name,
            template_id: formData.template_id,
            start_date: formData.start_date,
            start_time: formData.start_time,
            hours_per_day: formData.hours_per_day,
            delivery_mode: formData.delivery_mode,
            scheduling_mode: formData.scheduling_mode,
            allowed_days: formData.allowed_days,
            subject_rules: formData.subject_rules,
            additional_dates: formData.additional_dates,
            excluded_dates: formData.excluded_dates,
            status: 'active'
        };

        let instanceId = initialData?.id;

        if (initialData) {
            await supabase.from('course_instances').update(payload).eq('id', instanceId);
        } else {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: newInstance, error } = await supabase
                .from('course_instances')
                .insert([{ ...payload, user_id: user?.id }])
                .select()
                .single();
                
            if (error) throw error;
            instanceId = newInstance.id;
        }

        if (instanceId) {
            await supabase.from('schedule_overrides').delete().eq('instance_id', instanceId);
            const overridesToInsert: any[] = [];
            formData.additional_dates.forEach(date => overridesToInsert.push({ instance_id: instanceId, override_date: date, action_type: 'add' }));
            formData.excluded_dates.forEach(date => overridesToInsert.push({ instance_id: instanceId, override_date: date, action_type: 'remove' }));
            if (overridesToInsert.length > 0) await supabase.from('schedule_overrides').insert(overridesToInsert);
        }

        onSuccess();
    } catch (error) {
        console.error(error);
        alert("Failed to save schedule.");
    } finally {
        setLoading(false);
    }
  };

  // Resolve Subjects for the active template
  const selectedTemplate = templates.find(t => t.id === formData.template_id);
  const seqSubjects = (selectedTemplate as any)?.sequenced_subjects || (selectedTemplate as any)?.sequencedSubjects || [];
  
  let totalHours = 0;
  const resolvedSubjects = seqSubjects.map((subItem: any) => {
      const subId = typeof subItem === 'string' ? subItem : subItem.subjectId || subItem.id;
      const sub = subjects.find(s => s.id === subId);
      if (sub && sub.hours) totalHours += sub.hours;
      else totalHours += 40;
      return sub;
  }).filter(Boolean);
  
  const sessionsRequired = Math.ceil(totalHours / (formData.hours_per_day || 6));
  let estimatedCompletion = '';
  if (generatedEvents.length > 0) estimatedCompletion = generatedEvents[generatedEvents.length - 1].start.toLocaleDateString('en-CA'); 

  // --- NEW: CLASH DETECTION ---
  const dateCounts: Record<string, number> = {};
  generatedEvents.forEach(ev => {
      const d = ev.start.toLocaleDateString('en-CA');
      dateCounts[d] = (dateCounts[d] || 0) + 1;
  });
  const overlappingDates = Object.keys(dateCounts).filter(d => dateCounts[d] > 1);
  const hasOverlaps = formData.scheduling_mode === 'flexible' && overlappingDates.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Cohort Schedule' : 'Schedule New Cohort'}</h2>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><AlertCircle size={12}/> Automatically skips term breaks and holidays.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            
            {/* LEFT SIDE: Form Inputs */}
            <div className="flex-1 overflow-y-auto p-6 border-r border-slate-100 space-y-8 custom-scrollbar">
                <form id="schedule-form" onSubmit={handleSubmit} className="space-y-8">
                    
                    <div className="space-y-4">
                        <label className="block text-xs font-bold text-blue-600 uppercase mb-2 border-b border-slate-100 pb-2">Core Settings</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-500 mb-1">Qualification Template</label>
                                <select required className="w-full border border-slate-300 p-2.5 rounded-lg bg-white" value={formData.template_id} onChange={e => setFormData({...formData, template_id: e.target.value})}>
                                    <option value="" disabled>Select a Template...</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Cohort Name</label>
                                <input required className="w-full border border-slate-300 p-2.5 rounded-lg" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. 256THU7" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Delivery Mode</label>
                                <select className="w-full border border-slate-300 p-2.5 rounded-lg bg-white" value={formData.delivery_mode} onChange={e => setFormData({...formData, delivery_mode: e.target.value})}>
                                    <option value="Blended">Blended</option><option value="Online">Online</option><option value="On Campus">On Campus</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Base Start Date</label>
                                <input required type="date" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Start Time</label>
                                    <input required type="time" className="w-full border border-slate-300 p-2.5 rounded-lg bg-white" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Hrs / Day</label>
                                    <input required type="number" step="0.5" className="w-full border border-slate-300 p-2.5 rounded-lg" value={formData.hours_per_day} onChange={e => setFormData({...formData, hours_per_day: parseFloat(e.target.value)})} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-xs font-bold text-blue-600 uppercase mb-2 border-b border-slate-100 pb-2">Scheduling Architecture</label>
                        
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button 
                                type="button" 
                                onClick={() => setFormData({...formData, scheduling_mode: 'consecutive'})}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${formData.scheduling_mode === 'consecutive' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <LayoutTemplate size={16} /> Consecutive
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setFormData({...formData, scheduling_mode: 'flexible'})}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${formData.scheduling_mode === 'flexible' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Layers size={16} /> Flexible (Per Subject)
                            </button>
                        </div>

                        {/* MODE: CONSECUTIVE */}
                        {formData.scheduling_mode === 'consecutive' && (
                            <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-xl space-y-3 animate-in fade-in">
                                <p className="text-xs text-blue-700 font-medium">Subjects will run one after the other on these selected days.</p>
                                <div>
                                    <label className="block text-xs font-bold text-blue-900 mb-2">Weekly Teaching Schedule</label>
                                    <div className="flex gap-2">
                                        {DAYS_MAP.map(day => (
                                            <button 
                                                key={day.id} type="button" onClick={() => toggleGlobalDay(day.id)}
                                                className={`flex-1 py-2 rounded-lg border font-bold text-sm transition-all ${formData.allowed_days.includes(day.id) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-400 hover:border-blue-300 hover:text-blue-500'}`}
                                            >
                                                {day.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* MODE: FLEXIBLE */}
                        {formData.scheduling_mode === 'flexible' && (
                            <div className="bg-purple-50/50 border border-purple-100 p-5 rounded-xl space-y-4 animate-in fade-in">
                                <p className="text-xs text-purple-700 font-medium">Assign specific dates and days to individual subjects to run them concurrently.</p>
                                
                                {resolvedSubjects.length === 0 ? (
                                    <div className="text-center text-sm text-purple-400 py-4 italic">Please select a Qualification Template first.</div>
                                ) : (
                                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {resolvedSubjects.map((sub: any) => {
                                            const rule = formData.subject_rules[sub.id] || { start_date: formData.start_date, allowed_days: formData.allowed_days };
                                            return (
                                                <div key={sub.id} className="bg-white border border-purple-100 p-3 rounded-lg shadow-sm hover:border-purple-300 transition-colors">
                                                    <div className="font-bold text-slate-800 text-sm mb-3 line-clamp-1" title={sub.name}>{sub.code || sub.name}</div>
                                                    <div className="flex gap-4 items-center">
                                                        <div className="w-1/3">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Start Date</label>
                                                            <input 
                                                                type="date" 
                                                                className="w-full border border-slate-300 p-1.5 text-xs rounded outline-none focus:ring-1 focus:ring-purple-500"
                                                                value={rule.start_date || ''}
                                                                onChange={(e) => updateSubjectRule(sub.id, 'start_date', e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="w-2/3">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Days</label>
                                                            <div className="flex gap-1">
                                                                {DAYS_MAP.map(day => (
                                                                    <button 
                                                                        key={day.id} type="button" onClick={() => toggleSubjectDay(sub.id, day.id)}
                                                                        className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold transition-all ${rule.allowed_days?.includes(day.id) ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                                                    >
                                                                        {day.short}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase px-1 border-t border-slate-100 pt-4">
                        <div>Total Hours: <span className="text-slate-800">{totalHours}</span></div>
                        <div>Sessions Required: <span className="text-slate-800">{sessionsRequired}</span></div>
                        <div>Est. Finish: <span className="text-blue-600">{estimatedCompletion || 'Pending'}</span></div>
                    </div>
                </form>
            </div>

            {/* RIGHT SIDE: Live Schedule & Overrides */}
            <div className="flex-1 bg-slate-50 flex flex-col min-w-[350px] relative">
                
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><CalIcon size={18} className="text-blue-600"/> Class Schedule</h3>
                    {calculating && <Loader2 size={16} className="animate-spin text-blue-500" />}
                </div>

                {/* THE OVERLAP BANNER */}
                {hasOverlaps && (
                    <div className="mx-4 mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2 text-orange-800 text-sm shadow-sm animate-in slide-in-from-top-2">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-orange-500" />
                        <div>
                            <strong className="block">Schedule Overlap Detected</strong>
                            <span className="text-xs opacity-90 block mt-0.5">Multiple subjects are scheduled on the same calendar day. Review the highlighted dates below to ensure this is intentional.</span>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {generatedEvents.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 italic text-sm">Select a Template and Start Date to generate the schedule.</div>
                    ) : (
                        generatedEvents.map((ev, idx) => {
                            const dateStr = ev.start.toLocaleDateString('en-CA');
                            const isOverlap = formData.scheduling_mode === 'flexible' && overlappingDates.includes(dateStr);

                            return (
                                <div key={idx} className={`p-3 rounded-lg border shadow-sm flex items-center justify-between gap-4 group transition-colors ${isOverlap ? 'bg-orange-50 border-orange-200 hover:border-orange-300' : 'bg-white border-slate-200 hover:border-red-200'}`}>
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="text-xs font-bold text-slate-300 w-6">{idx + 1}</div>
                                        <div>
                                            <div className={`font-bold text-sm ${isOverlap ? 'text-orange-800' : 'text-slate-700'} flex items-center gap-2`}>
                                                {ev.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                                {isOverlap && <AlertTriangle size={14} className="text-orange-500" title="Multiple subjects scheduled on this day" />}
                                            </div>
                                            {formData.scheduling_mode === 'flexible' && <div className={`text-[10px] font-bold mt-0.5 line-clamp-1 ${isOverlap ? 'text-orange-600' : 'text-purple-600'}`}>{ev.summary}</div>}
                                        </div>
                                    </div>
                                    <button 
                                        type="button" onClick={() => handleSkipDateFromList(ev.start)}
                                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="Skip this date"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* MANUAL DATE CONTROLS */}
                <div className="p-4 bg-white border-t border-slate-200 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Inject Manual Makeup Session</label>
                        <div className="flex gap-2">
                            <input type="date" className="flex-1 border border-slate-300 p-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-emerald-500" value={newAddDate} onChange={e => setNewAddDate(e.target.value)} />
                            <button type="button" onClick={handleAddManualDate} className="bg-emerald-600 text-white px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-1 hover:bg-emerald-700"><Plus size={16}/> Add Date</button>
                        </div>
                        {formData.additional_dates.length > 0 && (
                            <div className="mt-3 space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                                {formData.additional_dates.map(d => (
                                    <div key={d} className="flex justify-between items-center p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-800">
                                        <span className="font-bold">{new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        <button type="button" onClick={() => removeOverrideDate('add', d)} className="text-emerald-500 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {formData.excluded_dates.length > 0 && (
                        <>
                            <div className="h-px bg-slate-100 w-full"></div>
                            <div>
                                <label className="block text-xs font-bold text-red-500 uppercase mb-2">Manually Skipped Dates</label>
                                <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                                    {formData.excluded_dates.map(d => (
                                        <div key={d} className="flex justify-between items-center p-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800">
                                            <span className="font-bold line-through opacity-75">{new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            <button type="button" onClick={() => removeOverrideDate('exclude', d)} className="text-red-400 hover:text-red-600 transition-colors flex items-center gap-1" title="Restore this date">
                                                <RotateCcw size={14} /> Restore
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-bold transition-colors">Cancel</button>
            <button type="submit" form="schedule-form" disabled={loading || calculating} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 flex items-center gap-2 shadow-sm transition-all">
                {loading && <Loader2 className="animate-spin" size={16} />}
                {initialData ? 'Update Cohort' : 'Generate Schedule'}
            </button>
        </div>
      </div>
    </div>
  );
};