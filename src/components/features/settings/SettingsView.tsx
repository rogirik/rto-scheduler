import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  CalendarDays, 
  Clock, 
  CheckCircle2,
  Save,
  Loader2,
  MapPin,
  Calendar,
  Coffee,
  Trash2,
  FileText,
  ChevronDown,
  Edit2,
  Users // This is used for the new Team Tab
} from 'lucide-react';
import { ApiService } from '../../../services/api';
import type { TermItem, HolidayItem } from '../../../services/api';

// --- IMPORT THE NEW TEAM COMPONENT ---
// This assumes TeamSettings.tsx is in the same folder as this file
import { TeamSettings } from './TeamSettings';

// --- AWARD PRESETS ---
const AWARD_PRESETS = {
  'VIC_TAFE_2024': {
    name: 'Victorian TAFE Teaching Staff MEA 2024',
    annualCap: 800,
    weeklyCap: 21,
    workWeek: 38,
    color: 'blue'
  },
  'SA_TAFE_EA': {
    name: 'South Australian TAFE Educational Staff EA',
    annualCap: 720, 
    weeklyCap: 18,
    workWeek: 37.5,
    color: 'red'
  },
  'OTHER': {
    name: 'Custom / Other Agreement',
    annualCap: 800, 
    weeklyCap: 20,
    workWeek: 38,
    color: 'slate'
  }
};

export const SettingsView = () => {
  // Added 'team' to the allowed tabs
  const [activeTab, setActiveTab] = useState<'industrial' | 'terms' | 'team'>('industrial');

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">System Configuration</h2>
        <p className="text-slate-500">Manage Industrial Agreements, Calendar Terms, and Team Access.</p>
      </div>

      {/* --- TABS NAVIGATION --- */}
      <div className="flex gap-6 border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('industrial')}
          className={`pb-3 flex items-center gap-2 font-medium text-sm transition-colors relative whitespace-nowrap ${
            activeTab === 'industrial' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Shield size={18} />
          Industrial Agreements
          {activeTab === 'industrial' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
        </button>

        <button
          onClick={() => setActiveTab('terms')}
          className={`pb-3 flex items-center gap-2 font-medium text-sm transition-colors relative whitespace-nowrap ${
            activeTab === 'terms' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarDays size={18} />
          Terms & Holidays
          {activeTab === 'terms' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
        </button>

        {/* NEW TEAM TAB */}
        <button
          onClick={() => setActiveTab('team')}
          className={`pb-3 flex items-center gap-2 font-medium text-sm transition-colors relative whitespace-nowrap ${
            activeTab === 'team' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={18} />
          Team Management
          {activeTab === 'team' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600"></div>}
        </button>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm min-h-[500px] p-6">
        {activeTab === 'industrial' && <IndustrialPanel />}
        {activeTab === 'terms' && <TermsPanel />}
        {activeTab === 'team' && <TeamSettings />} {/* Renders the new component */}
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: INDUSTRIAL AGREEMENTS ---
const IndustrialPanel = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAward, setSelectedAward] = useState<keyof typeof AWARD_PRESETS>('VIC_TAFE_2024');
  const [values, setValues] = useState(AWARD_PRESETS['VIC_TAFE_2024']);
  const [applyGlobally, setApplyGlobally] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
        try {
            setLoading(true);
            const settings = await ApiService.getSettings();
            if (settings) {
                const savedKey = settings.selected_award as keyof typeof AWARD_PRESETS;
                
                if (savedKey && AWARD_PRESETS[savedKey]) {
                    setSelectedAward(savedKey);
                    setValues({
                        name: settings.default_agreement_name || AWARD_PRESETS[savedKey].name,
                        annualCap: settings.annual_award_hours || AWARD_PRESETS[savedKey].annualCap,
                        weeklyCap: AWARD_PRESETS[savedKey].weeklyCap, 
                        workWeek: AWARD_PRESETS[savedKey].workWeek,
                        color: AWARD_PRESETS[savedKey].color
                    });
                } 
                else if (settings.annual_award_hours === 720) {
                    setSelectedAward('SA_TAFE_EA');
                    setValues(AWARD_PRESETS['SA_TAFE_EA']);
                } else if (settings.annual_award_hours === 800) {
                     setSelectedAward('VIC_TAFE_2024');
                     setValues(AWARD_PRESETS['VIC_TAFE_2024']);
                } else {
                    setSelectedAward('OTHER');
                    setValues({
                        name: settings.default_agreement_name || 'Custom Agreement',
                        annualCap: settings.annual_award_hours || 800,
                        weeklyCap: 20,
                        workWeek: 38,
                        color: 'slate'
                    });
                }
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        } finally {
            setLoading(false);
        }
    };
    fetchSettings();
  }, []);

  const handlePresetChange = (key: keyof typeof AWARD_PRESETS) => {
    setSelectedAward(key);
    setValues(AWARD_PRESETS[key]);
  };

  const handleSave = async () => {
      setSaving(true);
      try {
          await ApiService.saveSettings({
              annual_award_hours: values.annualCap,
              default_agreement_name: values.name,
              selected_award: selectedAward 
          });

          if (applyGlobally) {
             await ApiService.bulkUpdateTeacherLimits(values.annualCap);
          }

          alert(applyGlobally 
            ? "Settings saved & all teachers updated globally." 
            : "Settings saved. Existing teachers unchanged.");
            
      } catch (e) {
          console.error(e);
          alert("Failed to save settings.");
      } finally {
          setSaving(false);
      }
  };

  const getTheme = () => {
    if (selectedAward === 'VIC_TAFE_2024') return { bg: 'bg-blue-50/50', border: 'border-blue-100', text: 'text-blue-600', icon: 'text-blue-600' };
    if (selectedAward === 'SA_TAFE_EA') return { bg: 'bg-red-50/50', border: 'border-red-100', text: 'text-red-600', icon: 'text-red-600' };
    return { bg: 'bg-slate-50/50', border: 'border-slate-200', text: 'text-slate-600', icon: 'text-slate-500' };
  };
  const theme = getTheme();

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div className="flex-1 max-w-xl">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select Active Industrial Agreement</label>
          <div className="relative">
            <select 
              value={selectedAward}
              onChange={(e) => handlePresetChange(e.target.value as any)}
              className="w-full appearance-none bg-white border border-slate-300 hover:border-blue-500 rounded-xl p-4 pr-12 text-slate-800 font-bold shadow-sm transition-all cursor-pointer outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="VIC_TAFE_2024">Victorian TAFE Teaching Staff MEA 2024</option>
              <option value="SA_TAFE_EA">South Australian TAFE Educational Staff EA</option>
              <option value="OTHER">Other / Custom Agreement</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
          </div>
        </div>
        
        <div className="flex flex-col gap-2 items-end">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={applyGlobally}
                    onChange={e => setApplyGlobally(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="font-medium">Update all existing staff</span>
            </label>

            <button 
                onClick={handleSave}
                disabled={saving}
                className="h-[50px] px-6 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-slate-900 shadow-sm transition-all disabled:opacity-50"
            >
                {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                Save & Apply
            </button>
        </div>
      </div>

      <div className={`p-8 rounded-xl border ${theme.bg} ${theme.border} relative overflow-hidden transition-all duration-300`}>
        <div className="absolute top-0 right-0 p-6">
          <span className={`flex items-center gap-1.5 text-xs font-bold bg-white/80 backdrop-blur ${theme.text} px-3 py-1.5 rounded-full border border-slate-200 shadow-sm`}>
            <CheckCircle2 size={14} /> 
            Active Rules
          </span>
        </div>

        <div className="flex items-start gap-4 mb-8">
          <div className={`p-4 bg-white rounded-xl border shadow-sm ${theme.border} ${theme.icon}`}>
            {selectedAward === 'OTHER' ? <Edit2 size={28} /> : <FileText size={28} />}
          </div>
          <div className="flex-1">
             {selectedAward === 'OTHER' ? (
                 <input 
                    className="text-xl font-bold text-slate-800 bg-transparent border-b border-slate-300 focus:border-blue-500 outline-none w-full"
                    value={values.name}
                    onChange={(e) => setValues({...values, name: e.target.value})}
                    placeholder="Enter Agreement Name..."
                 />
             ) : (
                <h3 className="text-xl font-bold text-slate-800">{values.name}</h3>
             )}
            <p className="text-slate-500">Global workload limits for all academic staff.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
              <Clock size={14} /> Annual Teaching Cap
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                value={values.annualCap}
                onChange={e => setValues({...values, annualCap: parseInt(e.target.value)})}
                className="w-full text-3xl font-bold text-slate-800 border-none p-0 focus:ring-0 outline-none"
              />
              <span className="text-sm font-medium text-slate-400">hrs</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-50">Standard max load per year.</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Weekly Teaching Cap</label>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                value={values.weeklyCap}
                onChange={e => setValues({...values, weeklyCap: parseInt(e.target.value)})}
                className="w-full text-3xl font-bold text-slate-800 border-none p-0 focus:ring-0 outline-none"
              />
              <span className="text-sm font-medium text-slate-400">hrs</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-50">Before excess hours apply.</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Standard Work Week</label>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                value={values.workWeek}
                onChange={e => setValues({...values, workWeek: parseFloat(e.target.value)})}
                className="w-full text-3xl font-bold text-slate-800 border-none p-0 focus:ring-0 outline-none"
              />
              <span className="text-sm font-medium text-slate-400">hrs</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-50">Base contract hours.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: TERMS PANEL ---
const TermsPanel = () => {
  const [currentYear, setCurrentYear] = useState('2026');
  const [selectedState, setSelectedState] = useState('VIC');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [allTerms, setAllTerms] = useState<TermItem[]>([]);
  const [allHolidays, setAllHolidays] = useState<HolidayItem[]>([]);
  const [displayTerms, setDisplayTerms] = useState<TermItem[]>([]);
  const [displayHolidays, setDisplayHolidays] = useState<HolidayItem[]>([]);

  useEffect(() => { loadYearData(); }, [currentYear]);
  useEffect(() => { filterData(); }, [selectedState, allTerms, allHolidays]);

  const loadYearData = async () => {
    setLoading(true);
    try {
      const data = await ApiService.getAcademicYear(currentYear);
      if (data) {
        setAllTerms(data.terms || []);
        setAllHolidays(data.holidays || []);
      } else {
        setAllTerms([]);
        setAllHolidays([]);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const filterData = () => {
    const filteredTerms = allTerms.filter(t => t.name.startsWith(`${selectedState} -`) || !t.name.includes('-'));
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
      await ApiService.saveAcademicYear({ id: currentYear, terms: allTerms, holidays: allHolidays });
      alert('Calendar saved successfully.');
    } catch (err) { alert('Failed to save.'); } finally { setSaving(false); }
  };

  const removeTerm = (term: TermItem) => setAllTerms(allTerms.filter(t => t !== term));
  const removeHoliday = (h: HolidayItem) => setAllHolidays(allHolidays.filter(item => item !== h));

  return (
    <div className="space-y-6">
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

      {loading ? (
        <div className="text-center py-12 text-slate-400"><Loader2 className="animate-spin inline mr-2"/> Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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