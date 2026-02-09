import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import type { Teacher, DaySchedule } from '../../../services/api';
import { Trash2, RotateCcw, AlertTriangle, Clock, Loader2, X, Save } from 'lucide-react';

interface TeacherFormProps {
  initialData?: Teacher | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const TeacherForm = ({ initialData, onClose, onSuccess }: TeacherFormProps) => {
  const [loading, setLoading] = useState(false);
  const [globalAwardHours, setGlobalAwardHours] = useState(800);

  // Default Schedule: Mon-Fri, 08:30 - 16:30
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
    schedule: defaultSchedule
  });

  // 1. Fetch Global Settings
  useEffect(() => {
    const loadSettings = async () => {
        try {
            const settings = await ApiService.getSettings();
            if (settings?.annual_award_hours) {
                setGlobalAwardHours(settings.annual_award_hours);
                if (!initialData) {
                    setFormData(prev => ({ ...prev, max_hours: settings.annual_award_hours }));
                }
            }
        } catch (e) {
            console.warn("Using default settings.");
        }
    };
    loadSettings();
  }, []);

  // 2. Load Teacher Data
  useEffect(() => {
    if (initialData) {
      const savedSchedule = (initialData.availability as any)?.schedule || {};
      const mergedSchedule = { ...defaultSchedule, ...savedSchedule };

      setFormData({
        name: initialData.name || '',
        email: initialData.email || '',
        color: initialData.color || '#3b82f6',
        employment_type: initialData.employment_type || 'Full-time',
        time_fraction: initialData.time_fraction || 1.0, 
        max_hours: initialData.max_hours || globalAwardHours,
        trains_online: initialData.trains_online || false,
        schedule: mergedSchedule
      });
    }
  }, [initialData, globalAwardHours]);

  const handleFteChange = (newFte: number) => {
      const calculated = Math.round(globalAwardHours * newFte);
      setFormData(prev => ({
          ...prev,
          time_fraction: newFte,
          max_hours: calculated
      }));
  };

  const toggleDayActive = (dayId: number) => {
      setFormData(prev => ({
          ...prev,
          schedule: {
              ...prev.schedule,
              [dayId]: {
                  ...prev.schedule[dayId],
                  active: !prev.schedule[dayId].active
              }
          }
      }));
  };

  const updateTime = (dayId: number, field: 'start' | 'end', value: string) => {
      setFormData(prev => ({
          ...prev,
          schedule: {
              ...prev.schedule,
              [dayId]: {
                  ...prev.schedule[dayId],
                  [field]: value
              }
          }
      }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
          name: formData.name,
          email: formData.email,
          color: formData.color,
          employment_type: formData.employment_type,
          time_fraction: formData.time_fraction,
          max_hours: formData.max_hours,
          trains_online: formData.trains_online,
          availability: {
              schedule: formData.schedule
          }
      };

      if (initialData) {
        await ApiService.updateTeacher(initialData.id, payload);
      } else {
        await ApiService.createTeacher(payload);
      }
      onSuccess();
    } catch (error) {
      alert('Failed to save teacher. See console.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const displayDays = [
      { id: 1, label: 'Monday' },
      { id: 2, label: 'Tuesday' },
      { id: 3, label: 'Wednesday' },
      { id: 4, label: 'Thursday' },
      { id: 5, label: 'Friday' },
      { id: 6, label: 'Saturday' },
      { id: 0, label: 'Sunday' },
  ];

  // --- ACTIONS (FIXED CRASH HERE) ---
  const handleClose = (e?: React.MouseEvent) => {
      if (e) e.preventDefault(); 
      if (typeof onClose === 'function') {
        onClose();
      }
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
      handleClose(); // Use safe close
    } catch (e) {
      alert("Failed to delete.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                 <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="checkbox"
                        checked={formData.trains_online}
                        onChange={e => setFormData({...formData, trains_online: e.target.checked})}
                        className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-slate-600">Online Only (Remote)</span>
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
                    <p className="text-xs text-slate-400 mt-1">
                        Calculated Limit: {formData.max_hours} hrs/year (based on Settings)
                    </p>
                </div>
            )}

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
                                <input 
                                    type="checkbox"
                                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    checked={dayData.active}
                                    onChange={() => toggleDayActive(day.id)}
                                />
                                <span className={`font-medium ${dayData.active ? 'text-slate-800' : 'text-slate-400'}`}>{day.label}</span>
                            </label>
                            
                            {dayData.active ? (
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="time" 
                                        className="border border-slate-300 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={dayData.start}
                                        onChange={(e) => updateTime(day.id, 'start', e.target.value)}
                                    />
                                    <span className="text-slate-400">-</span>
                                    <input 
                                        type="time" 
                                        className="border border-slate-300 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={dayData.end}
                                        onChange={(e) => updateTime(day.id, 'end', e.target.value)}
                                    />
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

            {/* DANGER ZONE */}
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
                            <button 
                                type="button"
                                onClick={handleClearSchedule}
                                disabled={loading}
                                className="bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-2"
                            >
                                <RotateCcw size={12} /> Clear
                            </button>
                        </div>
                        <div className="w-full h-px bg-red-200/50"></div>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-bold text-red-700 text-sm">Delete Teacher</div>
                                <div className="text-xs text-red-500">Permanently deletes this teacher.</div>
                            </div>
                            <button 
                                type="button" 
                                onClick={handleDeleteTeacher}
                                disabled={loading}
                                className="bg-red-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-red-700 transition-colors flex items-center gap-2"
                            >
                                <Trash2 size={12} /> Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <button 
                type="button" 
                onClick={handleClose} 
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
            >
                Cancel
            </button>
            <button 
                type="submit" 
                form="teacher-form"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2 shadow-sm transition-all"
            >
                {loading && <Loader2 className="animate-spin" size={16} />}
                {loading ? 'Saving...' : initialData ? 'Update Teacher' : 'Create Teacher'}
            </button>
        </div>
      </div>
    </div>
  );
};