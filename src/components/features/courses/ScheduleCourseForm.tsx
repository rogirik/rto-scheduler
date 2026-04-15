import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { X, Loader2, Calendar as CalIcon, Trash2, Plus, AlertCircle } from 'lucide-react';
import type { CourseInstance, Course, Subject, AcademicYear } from '../../../services/api';

interface ScheduleCourseFormProps {
  initialData?: CourseInstance | null;
  onClose: () => void;
  onSuccess: () => void;
}

const DAYS_MAP = [
    { id: 0, label: 'Sun' }, { id: 1, label: 'Mon' }, { id: 2, label: 'Tue' },
    { id: 3, label: 'Wed' }, { id: 4, label: 'Thu' }, { id: 5, label: 'Fri' }, { id: 6, label: 'Sat' }
];

export const ScheduleCourseForm = ({ initialData, onClose, onSuccess }: ScheduleCourseFormProps) => {
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  
  const [templates, setTemplates] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [previewEvents, setPreviewEvents] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    template_id: '',
    start_date: '',
    start_time: '09:00',
    hours_per_day: 6,
    delivery_mode: 'Blended',
    allowed_days: [1, 2, 3, 4, 5],
    additional_dates: [] as string[],
    excluded_dates: [] as string[]
  });

  const [newAddDate, setNewAddDate] = useState('');
  const [newExcludeDate, setNewExcludeDate] = useState('');

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
          allowed_days: initialData.allowed_days || [1, 2, 3, 4, 5],
          additional_dates: Array.isArray(initialData.additional_dates) ? initialData.additional_dates : [],
          excluded_dates: Array.isArray(initialData.excluded_dates) ? initialData.excluded_dates : []
        });
      }
    };
    fetchDependencies();
  }, [initialData]);

  // --- LIVE PREVIEW GENERATOR ---
  useEffect(() => {
      if (!formData.template_id || !formData.start_date) {
          setPreviewEvents([]);
          return;
      }
      setCalculating(true);
      
      const timer = setTimeout(() => {
          const selectedTemplate = templates.find(t => t.id === formData.template_id);
          
          // Use the exact same engine the calendar uses
          const mockInstance = { ...formData, id: 'preview' } as unknown as CourseInstance;
          const events = generateAllEventsForInstance(
              mockInstance, 
              academicYears, 
              selectedTemplate, 
              subjects, 
              [], // No teachers needed for preview
              []  // Overrides are fed via formData
          );
          
          setPreviewEvents(events);
          setCalculating(false);
      }, 300);

      return () => clearTimeout(timer);
  }, [formData, templates, subjects, academicYears]);

  const toggleDay = (dayId: number) => {
    setFormData(prev => ({
        ...prev,
        allowed_days: prev.allowed_days.includes(dayId)
            ? prev.allowed_days.filter(d => d !== dayId)
            : [...prev.allowed_days, dayId].sort()
    }));
  };

  const handleAddManualDate = () => {
      if (!newAddDate) return;
      if (!formData.additional_dates.includes(newAddDate)) {
          setFormData(prev => ({ ...prev, additional_dates: [...prev.additional_dates, newAddDate].sort() }));
      }
      setNewAddDate('');
  };

  const handleAddExcludeDate = () => {
      if (!newExcludeDate) return;
      if (!formData.excluded_dates.includes(newExcludeDate)) {
          setFormData(prev => ({ ...prev, excluded_dates: [...prev.excluded_dates, newExcludeDate].sort() }));
      }
      setNewExcludeDate('');
  };

  const removeDate = (type: 'add' | 'exclude', dateToRemove: string) => {
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
            ...formData,
            status: 'active'
        };

        if (initialData) {
            await supabase.from('course_instances').update(payload).eq('id', initialData.id);
        } else {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('course_instances').insert([{ ...payload, user_id: user?.id }]);
        }
        onSuccess();
    } catch (error) {
        alert("Failed to save schedule.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Cohort Schedule' : 'Schedule New Cohort'}</h2>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><AlertCircle size={12}/> Automatically skips term breaks and holidays.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
        </div>

        {/* CONTENT GRID */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            
            {/* LEFT SIDE: Form Inputs */}
            <div className="flex-1 overflow-y-auto p-6 border-r border-slate-100 space-y-6 custom-scrollbar">
                <form id="schedule-form" onSubmit={handleSubmit} className="space-y-6">
                    
                    <div>
                        <label className="block text-xs font-bold text-blue-600 uppercase mb-2">Course Information</label>
                        <div className="space-y-4">
                            <div>
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
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-blue-600 uppercase mb-2">Delivery Logistics</label>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Hours / Teaching Day</label>
                                <input required type="number" step="0.5" className="w-full border border-slate-300 p-2.5 rounded-lg" value={formData.hours_per_day} onChange={e => setFormData({...formData, hours_per_day: parseFloat(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Delivery Mode</label>
                                <select className="w-full border border-slate-300 p-2.5 rounded-lg bg-white" value={formData.delivery_mode} onChange={e => setFormData({...formData, delivery_mode: e.target.value})}>
                                    <option value="Blended">Blended</option><option value="Online">Online</option><option value="On Campus">On Campus</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-2">Weekly Teaching Schedule</label>
                            <div className="flex gap-2">
                                {DAYS_MAP.map(day => (
                                    <button 
                                        key={day.id} type="button" onClick={() => toggleDay(day.id)}
                                        className={`flex-1 py-2 rounded-lg border font-bold text-sm transition-all ${formData.allowed_days.includes(day.id) ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-400 hover:border-blue-300 hover:text-blue-500'}`}
                                    >
                                        {day.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Start Date</label>
                            <input required type="date" className="w-full border border-slate-300 p-2 rounded bg-white shadow-sm" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Start Time</label>
                            <input required type="time" className="w-full border border-slate-300 p-2 rounded bg-white shadow-sm" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} />
                        </div>
                    </div>
                </form>
            </div>

            {/* RIGHT SIDE: Live Preview & Overrides */}
            <div className="flex-1 bg-slate-50 flex flex-col min-w-[350px]">
                
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><CalIcon size={18} className="text-blue-600"/> Class Dates Preview</h3>
                    {calculating && <Loader2 size={16} className="animate-spin text-blue-500" />}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-slate-100">
                    {previewEvents.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 italic text-sm">Select a Template and Start Date to generate the schedule.</div>
                    ) : (
                        previewEvents.map((ev, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="text-xs font-bold text-slate-300 w-6">{idx + 1}</div>
                                <div className="font-bold text-slate-700 text-sm">{ev.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                            </div>
                        ))
                    )}
                </div>

                {/* MANUAL DATE CONTROLS */}
                <div className="p-4 bg-white border-t border-slate-200 space-y-4">
                    
                    {/* Add Make-up Session */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Inject Manual Makeup Session</label>
                        <div className="flex gap-2">
                            <input type="date" className="flex-1 border border-slate-300 p-2 rounded-lg text-sm" value={newAddDate} onChange={e => setNewAddDate(e.target.value)} />
                            <button type="button" onClick={handleAddManualDate} className="bg-emerald-600 text-white px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-1 hover:bg-emerald-700"><Plus size={16}/> Add Date</button>
                        </div>
                        
                        {/* THE MISSING LIST IS BACK */}
                        {formData.additional_dates.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                                {formData.additional_dates.map(d => (
                                    <div key={d} className="flex justify-between items-center p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-800">
                                        <span className="font-bold">{new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        <button onClick={() => removeDate('add', d)} className="text-emerald-500 hover:text-red-500"><Trash2 size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-slate-100 w-full"></div>

                    {/* Exclude / Skip Date */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Skip Specific Date</label>
                        <div className="flex gap-2">
                            <input type="date" className="flex-1 border border-slate-300 p-2 rounded-lg text-sm" value={newExcludeDate} onChange={e => setNewExcludeDate(e.target.value)} />
                            <button type="button" onClick={handleAddExcludeDate} className="bg-red-500 text-white px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-1 hover:bg-red-600"><X size={16}/> Skip Date</button>
                        </div>
                        
                        {/* EXCLUDED DATES LIST */}
                        {formData.excluded_dates.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                                {formData.excluded_dates.map(d => (
                                    <div key={d} className="flex justify-between items-center p-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800">
                                        <span className="font-bold line-through opacity-75">{new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        <button onClick={() => removeDate('exclude', d)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>

        {/* FOOTER */}
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
