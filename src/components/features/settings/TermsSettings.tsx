import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { TermItem, HolidayItem, AcademicYear } from '../../../services/api';
import { Trash2, Calendar, Coffee, Save, Loader2, MapPin, Plus } from 'lucide-react';

export const TermsSettings = () => {
  const [currentYear, setCurrentYear] = useState('2026');
  const [selectedState, setSelectedState] = useState('VIC');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);

  // Reload data whenever the year OR the state changes
  useEffect(() => {
    loadYearData();
  }, [currentYear, selectedState]);

  const loadYearData = async () => {
    setLoading(true);
    try {
      // 1. We construct the exact new ID (e.g. "2026-VIC")
      const targetId = `${currentYear}-${selectedState}`;
      console.log(`Loading Record: ${targetId}`);

      // 2. Fetch precisely this state's row from the database
      const { data, error } = await supabase
        .from('academic_years')
        .select('*')
        .eq('id', targetId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error(error);
      }
      
      if (data) {
        // Parse safely in case of stringified JSON
        const parsedTerms = typeof data.terms === 'string' ? JSON.parse(data.terms || '[]') : (data.terms || []);
        const parsedHolidays = typeof data.holidays === 'string' ? JSON.parse(data.holidays || '[]') : (data.holidays || []);
        
        setTerms(parsedTerms);
        setHolidays(parsedHolidays);
      } else {
        // If the row doesn't exist yet, clear the screen
        setTerms([]);
        setHolidays([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const targetId = `${currentYear}-${selectedState}`;

      const payload = {
        id: targetId,
        user_id: user?.id,
        state: selectedState,
        terms: terms,
        holidays: holidays
      };

      // Upsert: Updates if exists, inserts if brand new
      const { error } = await supabase
        .from('academic_years')
        .upsert([payload]);

      if (error) throw error;
      alert('Saved successfully.');
    } catch (err) {
      console.error(err);
      alert('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // --- ARRAY MANAGERS ---
  const addTerm = () => setTerms([...terms, { name: '', start: '', end: '' }]);
  const removeTerm = (index: number) => setTerms(terms.filter((_, i) => i !== index));
  const updateTerm = (index: number, field: keyof TermItem, value: string) => {
    const newTerms = [...terms];
    newTerms[index][field] = value;
    setTerms(newTerms);
  };

  const addHoliday = () => setHolidays([...holidays, { name: '', date: '' }]);
  const removeHoliday = (index: number) => setHolidays(holidays.filter((_, i) => i !== index));
  const updateHoliday = (index: number, field: keyof HolidayItem, value: string) => {
    const newHolidays = [...holidays];
    newHolidays[index][field] = value;
    setHolidays(newHolidays);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-6 items-center justify-between">
        <div className="flex gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Academic Year</label>
            <select value={currentYear} onChange={e => setCurrentYear(e.target.value)} className="border border-slate-300 rounded-lg p-2 text-sm font-bold bg-slate-50 min-w-[100px] outline-none focus:border-blue-500">
              {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
              <MapPin size={12} /> Filter by State
            </label>
            <select value={selectedState} onChange={e => setSelectedState(e.target.value)} className="border border-slate-300 rounded-lg p-2 text-sm font-bold bg-white min-w-[150px] text-blue-700 outline-none focus:border-blue-500">
              <option value="VIC">Victoria (VIC)</option>
              <option value="NSW">New South Wales (NSW)</option>
              <option value="QLD">Queensland (QLD)</option>
              <option value="WA">Western Australia (WA)</option>
              <option value="SA">South Australia (SA)</option>
              <option value="TAS">Tasmania (TAS)</option>
              <option value="NT">Northern Territory (NT)</option>
              <option value="ACT">Aust. Capital Territory (ACT)</option>
            </select>
          </div>
        </div>
        <button onClick={handleSaveAll} disabled={saving} className="bg-slate-800 text-white px-5 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-slate-900 disabled:opacity-50 transition-all">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save Changes
        </button>
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="animate-spin inline mr-2"/> Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* TERMS */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Calendar className="text-blue-600" size={20} /> {selectedState} School Terms</h3>
                <button onClick={addTerm} className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors">
                    <Plus size={14} /> Add Term
                </button>
            </div>
            
            <div className="space-y-3">
              {terms.sort((a,b) => a.start.localeCompare(b.start)).map((term, i) => (
                <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 group hover:border-blue-300 transition-colors">
                  <div className="flex justify-between items-start">
                      <input 
                        placeholder="Term Name (e.g. Term 1)" 
                        className="font-bold text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none w-full mr-4 transition-colors"
                        value={term.name}
                        onChange={(e) => updateTerm(i, 'name', e.target.value)}
                      />
                      <button onClick={() => removeTerm(i)} className="p-1 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                  </div>
                  <div className="flex items-center gap-3">
                      <input 
                        type="date" 
                        className="text-xs text-slate-600 font-mono border border-slate-200 rounded p-1.5 outline-none focus:border-blue-500 flex-1"
                        value={term.start}
                        onChange={(e) => updateTerm(i, 'start', e.target.value)}
                      />
                      <span className="text-slate-400 text-xs">➜</span>
                      <input 
                        type="date" 
                        className="text-xs text-slate-600 font-mono border border-slate-200 rounded p-1.5 outline-none focus:border-blue-500 flex-1"
                        value={term.end}
                        onChange={(e) => updateTerm(i, 'end', e.target.value)}
                      />
                  </div>
                </div>
              ))}
              {terms.length === 0 && <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed text-slate-400 text-sm">No terms found.</div>}
            </div>
          </div>

          {/* HOLIDAYS */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Coffee className="text-orange-500" size={20} /> {selectedState} Public Holidays</h3>
                <button onClick={addHoliday} className="text-xs bg-orange-50 text-orange-600 hover:bg-orange-100 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors">
                    <Plus size={14} /> Add Holiday
                </button>
            </div>

            <div className="space-y-3">
              {holidays.sort((a,b) => a.date.localeCompare(b.date)).map((h, i) => (
                <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 group hover:border-orange-300 transition-colors">
                  <input 
                      type="date" 
                      className="bg-orange-50 text-orange-700 text-xs font-bold px-2 py-1.5 rounded-lg border border-orange-100 w-32 outline-none focus:ring-2 focus:ring-orange-500"
                      value={h.date}
                      onChange={(e) => updateHoliday(i, 'date', e.target.value)}
                  />
                  <input 
                      placeholder="Holiday Name" 
                      className="flex-1 font-bold text-slate-800 text-sm border-b border-transparent hover:border-slate-300 focus:border-orange-500 outline-none p-1 transition-colors truncate"
                      value={h.name}
                      onChange={(e) => updateHoliday(i, 'name', e.target.value)}
                  />
                  <button onClick={() => removeHoliday(i)} className="p-2 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                </div>
              ))}
               {holidays.length === 0 && <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed text-slate-400 text-sm">No holidays found.</div>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
