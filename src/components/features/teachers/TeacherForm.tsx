import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase'; 
import type { Teacher, DaySchedule, Subject } from '../../../services/api';
import { Trash2, RotateCcw, AlertTriangle, Clock, Loader2, X, Save, CalendarOff, Plus, BookOpen } from 'lucide-react';

interface TeacherFormProps {
  initialData?: Teacher | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface DateRange {
  start: string;
  end: string;
}

export const TeacherForm = ({ initialData, onClose, onSuccess }: TeacherFormProps) => {
  const [loading, setLoading] = useState(false);
  const [globalAwardHours, setGlobalAwardHours] = useState(800);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const defaultSchedule: Record<number, DaySchedule> = {
    1: { start: '08:30', end: '16:30', active: true },
    2: { start: '08:30', end: '16:30', active: true },
    3: { start: '08:30', end: '16:30', active: true },
    4: { start: '08:30', end: '16:30', active: true },
    5: { start: '08:30', end: '16:30', active: true },
    6: { start: '08:30', end: '16:30', active: false },
    0: { start: '08:30', end: '16:30', active: false },
  };

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    color: '#3b82f6',
    employment_type: 'Full-time',
    time_fraction: 1.0, 
    max_hours: 800,
    trains_online: false,
    schedule: defaultSchedule,
    leave_date: '',
    blackout_dates: [] as DateRange[],
    competencies: [] as string[]
  });

  useEffect(() => {
    const loadGlobalData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const [settings, subs] = await Promise.all([
                ApiService.getSettings().catch(() => null),
                ApiService.getSubjects().catch(() => [])
            ]);
            
            if (settings?.annual_award_hours) {
                setGlobalAwardHours(settings.annual_award_hours);
                if (!initialData) setFormData(prev => ({ ...prev, max_hours: settings.annual_award_hours }));
            }

            let filteredSubs = subs || [];
            if (user) {
                let myOrgId = null;
                try {
                    const { data: profile } = await supabase.from('user_profiles').select('organization_id').eq('id', user.id).single();
                    if (profile) myOrgId = profile.organization_id;
                } catch(e) {}
                
                filteredSubs = filteredSubs.filter((s: any) => {
                    if (!s.organization_id) return true;
                    if (myOrgId) return s.organization_id === myOrgId;
                    return s.user_id === user.id;
                });
            }
            setSubjects(filteredSubs);

        } catch (e) {
            console.warn("Failed to load global form data.");
        }
    };
    loadGlobalData();
  }, [initialData]);

  useEffect(() => {
    if (initialData) {
      const savedSchedule = (initialData.availability as any)?.schedule || {};
      const mergedSchedule = { ...defaultSchedule, ...savedSchedule };

      let parsedBlackouts: DateRange[] = [];
      const rawBlackouts = (initialData as any).blackout_dates;
      if (Array.isArray(rawBlackouts)) {
          parsedBlackouts = rawBlackouts.map(b => {
              if (typeof b === 'string') return { start: b, end: b }; 
              return { start: b.start || '', end: b.end || '' };
          });
      }

      setFormData({
        name: initialData.name || '',
        email: initialData.email || '',
        color: initialData.color || '#3b82f6',
        employment_type: initialData.employment_type || 'Full-time',
        time_fraction: initialData.time_fraction || 1.0, 
        max_hours: initialData.max_hours || globalAwardHours,
        trains_online: initialData.trains_online || false,
        schedule: mergedSchedule,
        leave_date: (initialData as any).leave_date || '',
        blackout_dates: parsedBlackouts,
        competencies: (initialData as any).competencies || [] 
      });
    }
  }, [initialData, globalAwardHours]);

  const handleFteChange = (newFte: number) => {
      const calculated = Math.round(globalAwardHours * newFte);
      setFormData(prev => ({ ...prev, time_fraction: newFte, max_hours: calculated }));
  };

  const toggleDayActive = (dayId: number) => {
      setFormData(prev => ({ ...prev, schedule: { ...prev.schedule, [dayId]: { ...prev.schedule[dayId], active: !prev.schedule[dayId].active } } }));
  };

  const updateTime = (dayId: number, field: 'start' | 'end', value: string) => {
      setFormData(prev => ({ ...prev, schedule: { ...prev.schedule, [dayId]: { ...prev.schedule[dayId], [field]: value } } }));
  };

  const addBlackoutDate = () => {
    setFormData(prev => ({ ...prev, blackout_dates: [...prev.blackout_dates, { start: '', end: '' }] }));
  };

  const updateBlackoutDate = (index: number, field: 'start' | 'end', value: string) => {
    const updated = [...formData.blackout_dates];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, blackout_dates: updated });
  };

  const removeBlackoutDate = (index: number) => {
    setFormData(prev => ({ ...prev, blackout_dates: prev.blackout_dates.filter((_, i) => i !== index) }));
  };

  const toggleCompetency = (subjectId: string) => {
      setFormData(prev => {
          const isSelected = prev.competencies.includes(subjectId);
          if (isSelected) {
              return { ...prev, competencies: prev.competencies.filter(id => id !== subjectId) };
          } else {
              return { ...prev, competencies: [...prev.competencies, subjectId] };
          }
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // --- PAYWALL CHECK: TRAINER LIMIT ---
    if (!initialData) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from('user_profiles').select('organization_id').eq('id', user.id).single();
          if (profile?.organization_id) {
            const { data: org } = await supabase.from('organizations').select('max_trainers').eq('id', profile.organization_id).single();
            const { count } = await supabase.from('teachers').select('*', { count: 'exact', head: true }).eq('organization_id', profile.organization_id);

            if (count !== null && org?.max_trainers && count >= org.max_trainers) {
              alert(`⚠️ Limit Reached: Your current plan only allows ${org.max_trainers} trainers. Please upgrade your RTO account to add more staff.`);
              return; 
            }
          }
        }
      } catch (err) {
        console.error("Limit check failed", err);
      }
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId && !(initialData as any)?.user_id) {
          throw new Error("No active user session found.");
      }

      const cleanedBlackouts = formData.blackout_dates
        .filter(d => d.start.trim() !== '' || d.end.trim() !== '')
        .map(d => ({ start: d.start || d.end, end: d.end || d.start }));

      const payload: any = {
          name: formData.name,
          email: formData.email,
          color: formData.color,
          employment_type: formData.employment_type,
          time_fraction: formData.time_fraction,
          max_hours: formData.max_hours,
          trains_online: formData.trains_online,
          availability: { schedule: formData.schedule },
          leave_date: formData.leave_date || null,
          blackout_dates: cleanedBlackouts,
          competencies: formData.competencies,
          user_id: (initialData as any)?.user_id || userId 
      };

      if (initialData) {
        payload.id = initialData.id;
        const { error } = await supabase.from('teachers').upsert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('teachers').insert([payload]);
        if (error) throw error;
      }
      onSuccess();
    } catch (error: any) {
      alert(`Failed to save: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const displayDays = [
      { id: 1, label: 'Monday' }, { id: 2, label: 'Tuesday' }, { id: 3, label: 'Wednesday' },
      { id: 4, label: 'Thursday' }, { id: 5, label: 'Friday' }, { id: 6, label: 'Saturday' }, { id: 0, label: 'Sunday' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">{initialData ? 'Edit Profile' : 'Add New Staff'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
            <form id="teacher-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Name</label>
                <input required className="w-full border border-slate-300 p-2 rounded-lg" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                <input required type="email" className="w-full border border-slate-300 p-2 rounded-lg" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Employment Type</label>
                    <select className="w-full border border-slate-300 p-2 rounded-lg bg-white" value={formData.employment_type} onChange={e => setFormData(prev => ({ ...prev, employment_type: e.target.value }))}>
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Casual">Casual</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Display Color</label>
                    <input type="color" className="w-full h-[42px] p-1 border border-slate-300 rounded-lg cursor-pointer" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} />
                </div>
            </div>

            <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/30 space-y-3">
                <label className="block text-sm font-bold text-blue-900 flex items-center gap-2 border-b border-blue-200 pb-3"><BookOpen size={16} /> Qualified Subjects</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                    {subjects.map(sub => (
                        <label key={sub.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                            <input type="checkbox" className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600" checked={formData.competencies.includes(sub.id)} onChange={() => toggleCompetency(sub.id)} />
                            <div className="font-bold text-sm text-slate-800">{sub.code || sub.name}</div>
                        </label>
                    ))}
                </div>
            </div>

            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
                <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Clock size={16} /> Weekly Availability</label>
                <div className="space-y-3">
                  {displayDays.map((day) => {
                    const dayData = formData.schedule[day.id];
                    return (
                        <div key={day.id} className="flex items-center justify-between h-9">
                            <label className="flex items-center gap-3 cursor-pointer min-w-[120px]">
                                <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-blue-600" checked={dayData.active} onChange={() => toggleDayActive(day.id)} />
                                <span className={`font-medium ${dayData.active ? 'text-slate-800' : 'text-slate-400'}`}>{day.label}</span>
                            </label>
                            {dayData.active && (
                                <div className="flex items-center gap-2">
                                    <input type="time" className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={dayData.start} onChange={(e) => updateTime(day.id, 'start', e.target.value)} />
                                    <span className="text-slate-400">-</span>
                                    <input type="time" className="border border-slate-300 rounded px-2 py-1 text-sm bg-white" value={dayData.end} onChange={(e) => updateTime(day.id, 'end', e.target.value)} />
                                </div>
                            )}
                        </div>
                    );
                  })}
                </div>
            </div>
            </form>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Cancel</button>
            <button type="submit" form="teacher-form" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2 shadow-sm transition-all">
                {loading ? <Loader2 className="animate-spin" size={16} /> : null}
                {loading ? 'Saving...' : initialData ? 'Update Teacher' : 'Create Teacher'}
            </button>
        </div>
      </div>
    </div>
  );
};