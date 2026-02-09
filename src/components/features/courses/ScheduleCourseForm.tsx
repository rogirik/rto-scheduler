import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import type { Course, CourseInstance, Subject } from '../../../services/api';
import { X, Calendar, Clock, BookOpen, Calculator, Loader2, Save, Hash } from 'lucide-react';

interface Props {
  initialData?: CourseInstance | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ScheduleCourseForm = ({ initialData, onClose, onSuccess }: Props) => {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Course[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    template_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    start_time: '09:00',
    hours_per_day: 7,
    break_minutes: 30,
    delivery_mode: 'F2F', 
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
        console.error("Failed to load data");
    }
  };

  // --- TRIGGER CALCULATION ---
  useEffect(() => {
    if (formData.template_id && formData.start_date && allSubjects.length > 0) {
      calculateSchedule();
    }
  }, [
    formData.template_id, 
    formData.start_date, 
    formData.hours_per_day, 
    formData.allowed_days,
    allSubjects
  ]);

  // --- LOAD INITIAL DATA ---
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        template_id: initialData.template_id,
        start_date: initialData.start_date,
        end_date: initialData.end_date,
        start_time: initialData.start_time,
        hours_per_day: initialData.hours_per_day,
        break_minutes: initialData.break_minutes,
        delivery_mode: initialData.delivery_mode,
        allowed_days: initialData.allowed_days || [1,2,3,4,5]
      });
    }
  }, [initialData]);

  // --- ROBUST SCHEDULE ENGINE ---
  const calculateSchedule = () => {
    const template = templates.find(t => t.id === formData.template_id);
    if (!template) return;

    // 1. SUM SUBJECT HOURS (The Source of Truth)
    // We look at the template's sequence, find the real subject objects, and sum their 'hours'
    const rawSeq = (template as any).sequenced_subjects || [];
    let totalHours = 0;

    rawSeq.forEach((item: any) => {
        const id = typeof item === 'string' ? item : item.id;
        const subject = allSubjects.find(s => s.id === id);
        if (subject) {
            totalHours += (subject.hours || 0);
        }
    });

    if (totalHours === 0) totalHours = 100; // Fallback if empty to prevent divide by zero

    // 2. Calculate Sessions Needed
    const dailyHours = formData.hours_per_day || 1; 
    const sessionsNeeded = Math.ceil(totalHours / dailyHours);
    
    // 3. Walk forward (Noon Logic to fix Timezones)
    const [y, m, d] = formData.start_date.split('-').map(Number);
    const current = new Date(y, m - 1, d, 12, 0, 0); 

    let sessionsScheduled = 0;
    let safetyLoops = 0;

    // Loop until we have enough sessions
    while (sessionsScheduled < sessionsNeeded && safetyLoops < 5000) {
        const dayOfWeek = current.getDay(); // 0=Sun
        
        if (formData.allowed_days.includes(dayOfWeek)) {
            sessionsScheduled++;
        }

        // If we still need more, move to tomorrow
        if (sessionsScheduled < sessionsNeeded) {
            current.setDate(current.getDate() + 1);
        }
        safetyLoops++;
    }

    // 4. Format End Date
    const endY = current.getFullYear();
    const endM = String(current.getMonth() + 1).padStart(2, '0');
    const endD = String(current.getDate()).padStart(2, '0');
    const calculatedEnd = `${endY}-${endM}-${endD}`;
    
    // 5. Update State
    if (calculatedEnd !== formData.end_date) {
        setFormData(prev => ({ ...prev, end_date: calculatedEnd }));
    }
    
    // 6. Update Info Text
    const activeDaysPerWeek = formData.allowed_days.length || 1;
    const weeks = Math.ceil(sessionsNeeded / activeDaysPerWeek);
    setCalculatedInfo({
        totalHours,
        duration: `${sessionsNeeded} Sessions (~${weeks} Weeks)`
    });
  };

  const toggleDay = (dayIndex: number) => {
    setFormData(prev => {
        const currentDays = prev.allowed_days;
        const newDays = currentDays.includes(dayIndex)
            ? currentDays.filter(d => d !== dayIndex)
            : [...currentDays, dayIndex].sort();
        
        if (newDays.length === 0) return prev;
        return { ...prev, allowed_days: newDays };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
          ...formData,
          id: initialData?.id
      };
      
      await ApiService.saveCourseInstance(payload);
      onSuccess();
    } catch (error) {
      console.error("Save failed", error);
      alert("Failed to save schedule.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
                {initialData ? 'Edit Schedule' : 'Schedule New Cohort'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">Configure dates, days, and duration.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Qualification Template</label>
                    <div className="relative">
                        <BookOpen className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <select 
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-blue-500"
                            value={formData.template_id}
                            onChange={e => setFormData({...formData, template_id: e.target.value})}
                            disabled={!!initialData}
                        >
                            <option value="">Select a Qualification...</option>
                            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cohort Name</label>
                    <input 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. TAE - Feb Intake 2026"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
            </div>

            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Clock size={18} className="text-blue-600" /> Pattern & Days
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Start Time</label>
                        <input 
                            type="time" 
                            className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                            value={formData.start_time}
                            onChange={e => setFormData({...formData, start_time: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Hours / Day</label>
                        <input 
                            type="number" 
                            className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                            value={formData.hours_per_day}
                            onChange={e => setFormData({...formData, hours_per_day: parseFloat(e.target.value)})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Mode</label>
                        <select 
                            className="w-full p-2 border border-slate-300 rounded-lg bg-white"
                            value={formData.delivery_mode}
                            onChange={e => setFormData({...formData, delivery_mode: e.target.value})}
                        >
                            <option value="F2F">Face-to-Face</option>
                            <option value="Online">Online</option>
                            <option value="Blended">Blended</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Teaching Days</label>
                    <div className="flex flex-wrap gap-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                            <button
                                key={day}
                                type="button"
                                onClick={() => toggleDay(idx)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                                    formData.allowed_days.includes(idx)
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {day}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="border border-blue-100 bg-blue-50/50 p-5 rounded-xl flex items-center justify-between">
                <div>
                    <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Start Date</label>
                    <input 
                        type="date"
                        className="p-2 border border-blue-200 rounded-lg text-blue-900 font-bold bg-white focus:ring-2 focus:ring-blue-400 outline-none"
                        value={formData.start_date}
                        onChange={e => setFormData({...formData, start_date: e.target.value})}
                    />
                </div>

                <div className="flex flex-col items-center px-4">
                    <div className="text-blue-300 mb-1"><Calculator size={24} /></div>
                    <div className="text-xs font-bold text-blue-400">{calculatedInfo.totalHours} Total Hrs</div>
                </div>

                <div className="text-right">
                    <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Est. Finish</label>
                    <div className="text-xl font-bold text-blue-700">{formData.end_date || '...'}</div>
                    <div className="text-xs font-bold text-blue-400 mt-1">{calculatedInfo.duration}</div>
                </div>
            </div>

        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={loading || !formData.template_id} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 flex items-center gap-2 shadow-sm">
                {loading && <Loader2 className="animate-spin" size={18} />}
                {loading ? 'Saving...' : initialData ? 'Update Schedule' : 'Create Schedule'}
            </button>
        </div>

      </div>
    </div>
  );
};