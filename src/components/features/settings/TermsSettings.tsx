import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import type { TermItem, HolidayItem, AcademicYear } from '../../../services/api';
import { Trash2, Calendar, Coffee, Save, Loader2, MapPin } from 'lucide-react';

export const TermsSettings = () => {
  const [currentYear, setCurrentYear] = useState('2026');
  const [selectedState, setSelectedState] = useState('VIC');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [allTerms, setAllTerms] = useState<TermItem[]>([]);
  const [allHolidays, setAllHolidays] = useState<HolidayItem[]>([]);
  const [displayTerms, setDisplayTerms] = useState<TermItem[]>([]);
  const [displayHolidays, setDisplayHolidays] = useState<HolidayItem[]>([]);

  useEffect(() => {
    loadYearData();
  }, [currentYear]);

  useEffect(() => {
    filterData();
  }, [selectedState, allTerms, allHolidays]);

  const loadYearData = async () => {
    setLoading(true);
    try {
      // DEBUG LOG: Look for this in your console
      console.log(`Loading Year: ${currentYear}`);
      const data = await ApiService.getAcademicYear(currentYear);
      
      if (data) {
        setAllTerms(data.terms || []);
        setAllHolidays(data.holidays || []);
      } else {
        setAllTerms([]);
        setAllHolidays([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filterData = () => {
    // 1. Filter Terms
    const filteredTerms = allTerms.filter(t => 
      t.name.startsWith(`${selectedState} -`) || !t.name.includes('-')
    );

    // 2. Filter Holidays
    const otherStates = ['VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'].filter(s => s !== selectedState);
    const filteredHolidays = allHolidays.filter(h => {
      const isSpecificToMyState = h.name.includes(`(${selectedState})`);
      const isSpecificToOtherState = otherStates.some(s => h.name.includes(`(${s})`));
      return isSpecificToMyState || !isSpecificToOtherState;
    });

    setDisplayTerms(filteredTerms);
    setDisplayHolidays(filteredHolidays);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload: AcademicYear = {
        id: currentYear,
        user_id: '', 
        terms: allTerms,
        holidays: allHolidays
      };
      await ApiService.saveAcademicYear(payload);
      alert('Saved successfully.');
    } catch (err) {
      alert('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const removeTerm = (term: TermItem) => setAllTerms(allTerms.filter(t => t !== term));
  const removeHoliday = (h: HolidayItem) => setAllHolidays(allHolidays.filter(item => item !== h));

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-6 items-center justify-between">
        <div className="flex gap-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Academic Year</label>
            <select value={currentYear} onChange={e => setCurrentYear(e.target.value)} className="border border-slate-300 rounded-lg p-2 text-sm font-bold bg-slate-50 min-w-[100px]">
              {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
              <MapPin size={12} /> Filter by State
            </label>
            <select value={selectedState} onChange={e => setSelectedState(e.target.value)} className="border border-slate-300 rounded-lg p-2 text-sm font-bold bg-white min-w-[150px] text-blue-700">
              <option value="VIC">Victoria (VIC)</option>
              <option value="NSW">New South Wales (NSW)</option>
              <option value="QLD">Queensland (QLD)</option>
              <option value="WA">Western Australia (WA)</option>
              <option value="SA">South Australia (SA)</option>
            </select>
          </div>
        </div>
        <button onClick={handleSaveAll} disabled={saving} className="bg-slate-800 text-white px-5 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 hover:bg-slate-900 disabled:opacity-50">
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
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Calendar className="text-blue-600" size={20} /> {selectedState} School Terms</h3>
            <div className="space-y-3">
              {displayTerms.sort((a,b) => a.start.localeCompare(b.start)).map((term, i) => (
                <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center group">
                  <div>
                    <div className="font-bold text-slate-800">{term.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">{term.start} ➜ {term.end}</div>
                  </div>
                  <button onClick={() => removeTerm(term)} className="p-2 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                </div>
              ))}
              {displayTerms.length === 0 && <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed text-slate-400 text-sm">No terms found.</div>}
            </div>
          </div>

          {/* HOLIDAYS */}
          <div className="space-y-4">
             <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Coffee className="text-orange-500" size={20} /> {selectedState} Public Holidays</h3>
            <div className="space-y-3">
              {displayHolidays.sort((a,b) => a.date.localeCompare(b.date)).map((h, i) => (
                <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 group">
                  <div className="bg-orange-50 text-orange-700 text-xs font-bold px-3 py-2 rounded-lg border border-orange-100 w-24 text-center">{h.date}</div>
                  <div className="flex-1 font-bold text-slate-800 text-sm truncate">{h.name}</div>
                  <button onClick={() => removeHoliday(h)} className="p-2 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                </div>
              ))}
               {displayHolidays.length === 0 && <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed text-slate-400 text-sm">No holidays found.</div>}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};