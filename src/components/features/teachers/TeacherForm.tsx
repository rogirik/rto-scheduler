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
    competencies: [] as string[] // NEW: Stores allowed Subject IDs
  });

  // Load Global Data (Settings & Subjects)
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

            // Securely load subjects for this RTO
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
  }, []);

  // Hydrate Teacher Data
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
        competencies: (initialData as any).competencies || [] // Hydrate competencies
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
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId && !(initialData as any)?.user_id) {
          throw new Error("No active user session found. Please refresh and log in again.");
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
          competencies: formData.competencies, // Save competencies
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
      alert(`Failed to save: ${error.message || 'Check console.'}`);
      console.error("Save Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const displayDays = [
      { id: 1, label: 'Monday' }, { id: 2, label: 'Tuesday' }, { id: 3, label: 'Wednesday' },
      { id: 4, label: 'Thursday' }, { id: 5, label: 'Friday' }, { id: 6, label: 'Saturday' }, { id: 0, label: 'Sunday' },
  ];

  const handleClose = (e?: React.MouseEvent) => {
      if (e) e.preventDefault(); 
      if (typeof onClose === 'function') onClose();
  };

  const handleClearSchedule = async () => {
    if (!initialData) return;
    if (!confirm(`Clear schedule for ${initialData.name}?`)) return;
    setLoading(true);
    try {
      await ApiService.globalClearTeacher(initialData.id);
      alert("Schedule cleared.");
      onSuccess(); 
    } catch (e) {
      alert("Failed to clear.");
      setLoading(false);
    }
  };

  const handleDeleteTeacher = async () => {
    if (!initialData) return;
    if (!confirm(`⚠️ DELETE ${initialData.name}? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await ApiService.deleteTeacher(initialData.id);
      onSuccess(); 
      handleClose(); 
    } catch (e) {
      alert("Failed to delete.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">
            {initialData ? 'Edit Profile' : 'Add New Staff'}
          </h2>
          <button type="button" onClick={handleClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        {/* FORM CONTENT */}
        <div className="flex-1 overflow-y-auto p-6">
            <form id="teacher-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Name & Email */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Name</label>
                <input
                    required
                    className="w-full border border-slate-300 p-2 rounded-lg"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                />
                </div>
                <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                <input
                    required
                    type="email"
                    className="w-full border border-slate-300 p-2 rounded-lg"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                />
                </div>
            </div>

            {/* Online Check */}
            <div>
                 <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input 
                        type="checkbox"
                        checked={formData.trains_online}
                        onChange={e => setFormData({...formData, trains_online: e.target.checked})}
                        className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm font-medium text-slate-600">Online Only (Remote Trainer)</span>
                 </label>
            </div>

            {/* Employment Type & Color */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Employment Type</label>
                    <select
                        className="w-full border border-slate-300 p-2 rounded-lg bg-white"
                        value={formData.employment_type}
                        onChange={e => {
                            const newType = e.target.value;
                            setFormData(prev => ({ 
                                ...prev, 
                                employment_type: newType,
                                time_fraction: newType === 'Full-time' ? 1.0 : prev.time_fraction
                            }));
                            if (newType === 'Full-time') handleFteChange(1.0);
                        }}
                    >
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Casual">Casual</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Display Color</label>
                    <input
                        type="color"
                        className="w-full h-[42px] p-1 border border-slate-300 rounded-lg cursor-pointer"
                        value={formData.color}
                        onChange={e => setFormData({...formData, color: e.target.value})}
                    />
                </div>
            </div>

            {/* FTE (Only if Part-time) */}
            {formData.employment_type === 'Part-time' && (
                 <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Time Fraction (FTE)</label>
                    <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="1.0"
                        className="w-full border border-slate-300 p-2 rounded-lg"
                        value={formData.time_fraction}
                        onChange={e => {
                            const val = parseFloat(e.target.value);
                            if(!isNaN(val)) handleFteChange(val);
                        }}
                    />
                    <p className="text-xs text-slate-400 mt-1">Calculated Limit: {formData.max_hours} hrs/year</p>
                </div>
            )}

            {/* --- COMPETENCY MATRIX --- */}
            <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/30 space-y-3">
                <label className="block text-sm font-bold text-blue-900 flex items-center gap-2 border-b border-blue-200 pb-3">
                  <BookOpen size={16} /> Qualified Subjects (Competency Matrix)
                </label>
                <p className="text-xs text-blue-700">Select the units/clusters this trainer is legally qualified to deliver. They cannot be assigned to unmarked subjects.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 custom-scrollbar bg-white rounded-lg border border-slate-200">
                    {subjects.map(sub => (
                        <label key={sub.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer border border-transparent hover:border-slate-200 transition-colors">
                            <input 
                                type="checkbox"
                                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                checked={formData.competencies.includes(sub.id)}
                                onChange={() => toggleCompetency(sub.id)}
                            />
                            <div>
                                <div className="font-bold text-sm text-slate-800">{sub.code || sub.name}</div>
                                {sub.code && <div className="text-[10px] text-slate-500 line-clamp-1">{sub.name}</div>}
                            </div>
                        </label>
                    ))}
                    {subjects.length === 0 && <div className="p-4 text-sm text-slate-400 italic">No subjects available.</div>}
                </div>
            </div>

            {/* LEAVE & BLACKOUTS */}
            <div className="border border-amber-200 rounded-xl p-5 bg-amber-50/50 space-y-6">
                <label className="block text-sm font-bold text-amber-900 flex items-center gap-2 border-b border-amber-200 pb-3">
                  <CalendarOff size={16} /> Leave & Holiday Exceptions
                </label>
                
                <div>
                    <label className="block text-xs font-bold text-amber-800 uppercase mb-3">Approved Leave / Holiday Ranges</label>
                    <div className="space-y-3">
                        {formData.blackout_dates.map((range, idx) => (
                            <div key={idx} className="flex gap-3 items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex-1 flex items-center gap-3">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Start Date</label>
                                        <input 
                                            type="date" 
                                            className="w-full px-2 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
                                            value={range.start} 
                                            onChange={e => updateBlackoutDate(idx, 'start', e.target.value)} 
                                        />
                                    </div>
                                    <span className="text-slate-300 mt-4 font-bold">to</span>
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">End Date</label>
                                        <input 
                                            type="date" 
                                            className="w-full px-2 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
                                            value={range.end} 
                                            onChange={e => updateBlackoutDate(idx, 'end', e.target.value)} 
                                        />
                                    </div>
                                </div>
                                <button type="button" onClick={() => removeBlackoutDate(idx)} className="mt-4 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addBlackoutDate} className="mt-3 text-xs font-bold text-blue-600 flex items-center gap-1 hover:text-blue-800 transition-colors py-1.5 px-3 bg-blue-100/50 hover:bg-blue-100 rounded-lg"><Plus size={14} /> Add Holiday Range</button>
                </div>

                <div className="w-full h-px bg-amber-200/50"></div>

                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                    <label className="block text-xs font-bold text-red-800 uppercase mb-1">Resignation / Last Day</label>
                    <input type="date" className="w-1/2 px-3 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white text-sm shadow-sm" value={formData.leave_date} onChange={e => setFormData({...formData, leave_date: e.target.value})} />
                    <p className="text-[10px] text-red-600 mt-2 font-medium">Auto-allocator will ignore this trainer on and after this date.</p>
                </div>
            </div>

            {/* WEEKLY AVAILABILITY */}
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
                <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Clock size={16} /> Weekly Availability
                </label>
                <div className="space-y-3">
                  {displayDays.map((day) => {
                    const dayData = formData.schedule[day.id];
                    return (
                        <div key={day.id} className="flex items-center justify-between h-9">
                            <label className="flex items-center gap-3 cursor-pointer min-w-[120px]">
                                <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={dayData.active} onChange={() => toggleDayActive(day.id)} />
                                <span className={`font-medium ${dayData.active ? 'text-slate-800' : 'text-slate-400'}`}>{day.label}</span>
                            </label>
                            
                            {dayData.active ? (
                                <div className="flex items-center gap-2">
                                    <input type="time" className="border border-slate-300 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={dayData.start} onChange={(e) => updateTime(day.id, 'start', e.target.value)} />
                                    <span className="text-slate-400">-</span>
                                    <input type="time" className="border border-slate-300 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={dayData.end} onChange={(e) => updateTime(day.id, 'end', e.target.value)} />
                                </div>
                            ) : (
                                <span className="text-xs text-slate-400 italic flex-1 text-right pr-4">Not available</span>
                            )}
                        </div>
                    );
                  })}
                </div>
            </div>
            </form>

            {initialData && (
                <div className="mt-8 pt-6 border-t border-red-100">
                    <h4 className="text-xs font-bold text-red-800 uppercase mb-3 flex items-center gap-2">
                        <AlertTriangle size={14} /> Danger Zone
                    </h4>
                    <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-bold text-slate-700 text-sm">Clear Schedule</div>
                                <div className="text-xs text-slate-500">Removes teacher from all classes.</div>
                            </div>
                            <button type="button" onClick={handleClearSchedule} disabled={loading} className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-2"><RotateCcw size={12} /> Clear</button>
                        </div>
                        <div className="w-full h-px bg-red-200/50"></div>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-bold text-red-700 text-sm">Delete Teacher</div>
                                <div className="text-xs text-red-500">Permanently deletes this teacher.</div>
                            </div>
                            <button type="button" onClick={handleDeleteTeacher} disabled={loading} className="bg-red-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-red-700 transition-colors flex items-center gap-2"><Trash2 size={12} /> Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button type="button" onClick={handleClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Cancel</button>
            <button type="submit" form="teacher-form" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2 shadow-sm transition-all">
                {loading && <Loader2 className="animate-spin" size={16} />}
                {loading ? 'Saving...' : initialData ? 'Update Teacher' : 'Create Teacher'}
            </button>
        </div>
      </div>
    </div>
  );
};
