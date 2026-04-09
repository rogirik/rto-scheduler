import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { Course, CourseInstance, Subject } from '../../../services/api';
import { 
  X, 
  Calendar, 
  Clock, 
  BookOpen, 
  Calculator, 
  Loader2, 
  Save, 
  Trash2, 
  PlusCircle, 
  CalendarDays,
  Plus,
  AlertTriangle,
  Info
} from 'lucide-react';

interface Props {
  initialData?: CourseInstance | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ScheduleCourseForm = ({ initialData, onClose, onSuccess }: Props) => {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Course[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [generatedDates, setGeneratedDates] = useState<string[]>([]);
  const [customDate, setCustomDate] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    template_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    start_time: '09:00', // Default start time
    hours_per_day: 7,
    break_minutes: 30,
    delivery_mode: 'F2F', 
    status: 'active',
    allowed_days: [1, 2, 3, 4, 5] 
  });

  const [calculatedInfo, setCalculatedInfo] = useState({ duration: '', totalHours: 0 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
        const [tData, sData] = await Promise.all([
            ApiService.getAll<Course>('course_templates'),
            ApiService.getAll<Subject>('subjects')
        ]);
        setTemplates(tData);
        setAllSubjects(sData);
    } catch (e) {
        console.error("Failed to load metadata", e);
    }
  };

  useEffect(() => {
    if (formData.template_id && formData.start_date && allSubjects.length > 0) {
      calculateSchedule();
    }
  }, [formData.template_id, formData.start_date, formData.hours_per_day, formData.allowed_days, allSubjects]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        template_id: initialData.template_id,
        start_date: initialData.start_date,
        end_date: initialData.end_date,
        start_time: initialData.start_time || '09:00',
        hours_per_day: initialData.hours_per_day || 7,
        break_minutes: initialData.break_minutes || 30,
        delivery_mode: initialData.delivery_mode || 'F2F',
        status: initialData.status || 'active',
        allowed_days: initialData.allowed_days || [1,2,3,4,5]
      });
    }
  }, [initialData]);

  const calculateSchedule = async () => {
    const template = templates.find(t => t.id === formData.template_id);
    if (!template) return;

    // 1. Fetch JSON Terms from Academic Years
    const { data: yearData } = await supabase.from('academic_years').select('terms');
    const validTerms: any[] = [];
    yearData?.forEach(row => {
        if (Array.isArray(row.terms)) validTerms.push(...row.terms);
    });

    // 2. Fetch Overrides
    const { data: overrides } = await supabase
        .from('schedule_overrides')
        .select('override_date, action_type')
        .eq('instance_id', initialData?.id || 'none');
    
    const removals = new Set(overrides?.filter(o => o.action_type === 'remove').map(o => o.override_date));
    const forcedAdds = overrides?.filter(o => o.action_type === 'add').map(o => o.override_date) || [];

    // 3. Sum Total Hours
    const rawSeq = (template as any).sequenced_subjects || (template as any).sequencedSubjects || [];
    let totalHours = 0;
    rawSeq.forEach((item: any) => {
        const id = typeof item === 'string' ? item : item.id;
        const subject = allSubjects.find(s => s.id === id);
        if (subject) totalHours += (subject.hours || 0);
    });

    const sessionsNeeded = Math.ceil((totalHours || 100) / (formData.hours_per_day || 1));
    const [y, m, d] = formData.start_date.split('-').map(Number);
    const current = new Date(y, m - 1, d, 12, 0, 0); 

    let sessionsScheduled = 0;
    const tempDates: string[] = [...forcedAdds];
    sessionsScheduled = tempDates.length;

    // 4. Scheduling Loop using JSON Terms
    let safety = 0;
    while (sessionsScheduled < sessionsNeeded && safety < 1000) {
        const isoDate = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay();

        // Check if date is within the JSON term start/end blocks
        const isInTerm = validTerms.some(term => isoDate >= term.start && isoDate <= term.end);
        const isAllowedDay = formData.allowed_days.includes(dayOfWeek);
        const isRemoved = removals.has(isoDate);

        if (isInTerm && isAllowedDay && !isRemoved && !tempDates.includes(isoDate)) {
            tempDates.push(isoDate);
            sessionsScheduled++;
        }

        current.setDate(current.getDate() + 1);
        safety++;
    }

    const finalSorted = tempDates.sort();
    setGeneratedDates(finalSorted);
    
    if (finalSorted.length > 0) {
        const calculatedEnd = finalSorted[finalSorted.length - 1];
        if (calculatedEnd !== formData.end_date) {
            setFormData(prev => ({ ...prev, end_date: calculatedEnd }));
        }
    }

    setCalculatedInfo({
        totalHours,
        duration: `${sessionsNeeded} Sessions`
    });
  };

  const handleOverride = async (dateStr: string, action: 'add' | 'remove') => {
    if (!initialData) return alert("Save cohort first to manually add or skip dates.");
    const { error } = await supabase.from('schedule_overrides').insert({
        instance_id: initialData.id,
        override_date: dateStr,
        action_type: action
    });
    if (!error) { setCustomDate(''); calculateSchedule(); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await ApiService.saveCourseInstance({...formData, id: initialData?.id});
      onSuccess();
    } catch (error) {
      alert("Save failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Cohort Schedule' : 'Schedule New Cohort'}</h2>
            <div className="flex gap-4 mt-1">
                <span className="text-xs text-slate-500 flex items-center gap-1"><Info size={12}/> Automatically skips term breaks and holidays.</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2"><X size={24} /></button>
        </div>

        <div className="flex-1 flex overflow-hidden">
            {/* LEFT SIDE: CORE SETTINGS */}
            <div className="w-1/2 overflow-y-auto p-8 space-y-8 border-r border-slate-100">
                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider">Course Information</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Qualification Template</label>
                            <select 
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white"
                                value={formData.template_id}
                                onChange={e => setFormData({...formData, template_id: e.target.value})}
                                disabled={!!initialData}
                            >
                                <option value="">Select Qualification...</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cohort Name</label>
                            <input className="w-full px-4 py-2 border border-slate-300 rounded-lg" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. 2026-CH-01"/>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider">Delivery Logistics</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Hours / Teaching Day</label>
                            <input type="number" step="0.5" className="w-full p-2 border border-slate-300 rounded-lg" value={formData.hours_per_day} onChange={e => setFormData({...formData, hours_per_day: parseFloat(e.target.value)})}/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Delivery Mode</label>
                            <select className="w-full p-2 border border-slate-300 rounded-lg" value={formData.delivery_mode} onChange={e => setFormData({...formData, delivery_mode: e.target.value})}>
                                <option value="F2F">Face-to-Face</option>
                                <option value="Online">Online</option>
                                <option value="Blended">Blended</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2">Weekly Teaching Schedule</label>
                        <div className="flex gap-2">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                                <button key={idx} type="button" onClick={() => {
                                    const newDays = formData.allowed_days.includes(idx) ? formData.allowed_days.filter(d => d !== idx) : [...formData.allowed_days, idx].sort();
                                    if (newDays.length) setFormData({...formData, allowed_days: newDays});
                                }} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${formData.allowed_days.includes(idx) ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}>{day}</button>
                            ))}
                        </div>
                    </div>
                </section>

                <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl space-y-4">
                    {/* HERE IS THE FIX: 3-Column Grid for Date, Time, and Completion */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-blue-800 uppercase mb-2">Start Date</label>
                            <input type="date" className="w-full p-2 border border-blue-200 rounded-lg font-bold" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})}/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-blue-800 uppercase mb-2">Start Time</label>
                            <input type="time" className="w-full p-2 border border-blue-200 rounded-lg font-bold" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})}/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-blue-800 uppercase mb-2">Completion (Est.)</label>
                            <div className="p-2 bg-white/50 border border-blue-200 rounded-lg font-bold text-blue-900">{formData.end_date || '...'}</div>
                        </div>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-blue-600 uppercase">
                        <span>Total Hours: {calculatedInfo.totalHours}</span>
                        <span>Sessions Required: {generatedDates.length}</span>
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE: LIVE CALENDAR VIEW */}
            <div className="w-1/2 flex flex-col bg-slate-50/50">
                <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <CalendarDays size={18} className="text-blue-600" />
                        Class Dates
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {generatedDates.map((date, idx) => (
                        <div key={date} className="group flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-red-200 transition-all shadow-sm">
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-slate-300 w-5">{idx + 1}</span>
                                <span className="font-medium text-slate-700">{new Date(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                            <button onClick={() => handleOverride(date, 'remove')} className="opacity-0 group-hover:opacity-100 p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Skip this date"><Trash2 size={16} /></button>
                        </div>
                    ))}
                    {generatedDates.length === 0 && (
                        <div className="p-12 text-center text-slate-400">
                             <AlertTriangle className="mx-auto mb-2 opacity-20" size={48} />
                             <p className="text-sm font-medium">No dates generated. Ensure your Start Date is within an Academic Term.</p>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-white border-t border-slate-200">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Inject Manual Makeup Session</label>
                    <div className="flex gap-2">
                        <input type="date" className="flex-1 p-2 border border-slate-200 rounded-lg text-sm" value={customDate} onChange={e => setCustomDate(e.target.value)} />
                        <button onClick={() => customDate && handleOverride(customDate, 'add')} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm">
                            <Plus size={16} /> Add Date
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
            <button onClick={onClose} className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg">Cancel</button>
            <button onClick={handleSubmit} disabled={loading || !formData.template_id} className="px-10 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 flex items-center gap-2 transition-all">
                {loading && <Loader2 className="animate-spin" size={18} />}
                {initialData ? 'Update Cohort' : 'Create Cohort'}
            </button>
        </div>
      </div>
    </div>
  );
};