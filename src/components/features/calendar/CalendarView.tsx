import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { ChevronLeft, ChevronRight, Loader2, Calendar as CalIcon, Clock, User, X, Filter, Download, Printer } from 'lucide-react';

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const CalendarView = () => {
  const [loading, setLoading] = useState(true);
  
  // Use UTC for the current view state
  const [currentDate, setCurrentDate] = useState(() => { 
      const now = new Date(); 
      return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)); 
  });
  
  const [events, setEvents] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]); 
  const [teachers, setTeachers] = useState<any[]>([]);
  
  const [selectedFilter, setSelectedFilter] = useState('all'); 
  const [filterType, setFilterType] = useState<'all' | 'cohort' | 'teacher'>('all');
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  useEffect(() => {
    loadCalendarData();
  }, []);

  const loadCalendarData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      const [iRes, tRes, subRes, yearRes, aRes, teachRes] = await Promise.all([
        ApiService.getCourseInstances(),
        ApiService.getAll('course_templates'),
        ApiService.getSubjects(),
        ApiService.getAll('academic_years'),
        ApiService.getAllocationsGlobal(),
        supabase.from('teachers').select('*') // Raw fetch for org filtering
      ]);

      let filteredInstances = iRes || [];
      let filteredTemplates = tRes || [];
      let filteredAllocations = aRes || [];
      let filteredTeachers = teachRes.data || [];
      let filteredSubjects = subRes || [];
      let filteredYears = yearRes || [];

      // --- ORGANIZATION FILTER (Kills Ghost Courses) ---
      if (user) {
          const myKnownTeacher = filteredTeachers.find(t => t.user_id === user.id && t.organization_id);
          const myOrgId = myKnownTeacher?.organization_id;

          const isMine = (item: any) => {
              if (myOrgId && item.organization_id === myOrgId) return true;
              return item.user_id === user.id;
          };

          filteredInstances = filteredInstances.filter(isMine);
          filteredTemplates = filteredTemplates.filter(isMine);
          filteredTeachers = filteredTeachers.filter(isMine);
          filteredSubjects = filteredSubjects.filter(isMine);
          filteredYears = filteredYears.filter(isMine);
          
          const validInstanceIds = new Set(filteredInstances.map(i => i.id));
          filteredAllocations = filteredAllocations.filter(a => validInstanceIds.has(a.instance_id));
      }

      setInstances(filteredInstances);
      setTeachers(filteredTeachers);

      let allGeneratedEvents: any[] = [];

      filteredInstances.forEach((instance: any) => {
        if (instance.status === 'completed') return; 

        const template = filteredTemplates.find((t: any) => t.id === instance.template_id);
        
        if (template) {
            const instanceEvents = generateAllEventsForInstance(
                instance, 
                filteredYears as any[], 
                template as any, 
                filteredSubjects as any[], 
                filteredTeachers
            );

            const hydratedEvents = instanceEvents.map(ev => {
                const allocation = filteredAllocations.find((a: any) => 
                    a.instance_id === ev.instanceId && a.subject_id === ev.subjectId
                );
                const teacher = filteredTeachers.find((t: any) => t.id === allocation?.teacher_id);
                
                // --- STRICT UTC MAPPING ---
                const originalDate = new Date(ev.start);
                const year = originalDate.getUTCFullYear();
                const month = originalDate.getUTCMonth();
                const day = originalDate.getUTCDate();

                const [startH, startM] = (instance.start_time || "09:00").split(':').map(Number);
                const fixedStart = new Date(Date.UTC(year, month, day, startH, startM));

                const duration = instance.hours_per_day || 7;
                const fixedEnd = new Date(fixedStart);
                fixedEnd.setUTCHours(fixedStart.getUTCHours() + Math.floor(duration));
                fixedEnd.setUTCMinutes(fixedStart.getUTCMinutes() + (duration % 1 * 60));

                return {
                    ...ev,
                    start: fixedStart,
                    end: fixedEnd,
                    teacherId: teacher?.id,
                    teacherName: teacher?.name || 'Unassigned',
                    teacherColor: teacher?.color || '#94a3b8',
                    teacherEmail: teacher?.email,
                    location: instance.delivery_mode === 'Online' ? 'Online' : 'On Campus',
                    isUnassigned: !teacher,
                    uniqueKey: `${instance.id}|${fixedStart.toISOString().split('T')[0]}|${teacher?.id || 'unassigned'}|${ev.summary}` 
                };
            });

            allGeneratedEvents = [...allGeneratedEvents, ...hydratedEvents];
        }
      });

      const uniqueEventsMap = new Map();
      allGeneratedEvents.forEach(ev => {
          if (!uniqueEventsMap.has(ev.uniqueKey)) {
              uniqueEventsMap.set(ev.uniqueKey, ev);
          }
      });
      
      setEvents(Array.from(uniqueEventsMap.values()));

    } catch (error) {
      console.error("Calendar Load Failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (val: string) => {
      setSelectedFilter(val);
      if (val === 'all') {
          setFilterType('all');
      } else {
          const isTeacher = teachers.some(t => t.id === val);
          setFilterType(isTeacher ? 'teacher' : 'cohort');
      }
  };

  const filteredEvents = selectedFilter === 'all' 
    ? events 
    : filterType === 'teacher'
        ? events.filter(e => e.teacherId === selectedFilter)
        : events.filter(e => e.instanceId === selectedFilter);

  const getMergedEvents = (rawEvents: any[]) => {
    if (rawEvents.length === 0) return [];
    const sorted = [...rawEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: any[] = [];
    let currentGroup: any = null;

    sorted.forEach((ev) => {
        const evKey = `${ev.summary}|${ev.teacherName}`;

        if (!currentGroup) {
            currentGroup = { ...ev, endDate: ev.start, key: evKey };
        } else {
            const prevDate = new Date(currentGroup.endDate);
            prevDate.setUTCDate(prevDate.getUTCDate() + 1); 
            
            const isNextDay = ev.start.toISOString().split('T')[0] === prevDate.toISOString().split('T')[0];
            const isMondayAfterFriday = (currentGroup.endDate.getUTCDay() === 5 && ev.start.getUTCDay() === 1 && (ev.start.getTime() - currentGroup.endDate.getTime()) < 345600000); 

            if (evKey === currentGroup.key && (isNextDay || isMondayAfterFriday)) {
                currentGroup.endDate = ev.start; 
            } else {
                merged.push(currentGroup);
                currentGroup = { ...ev, endDate: ev.start, key: evKey };
            }
        }
    });

    if (currentGroup) merged.push(currentGroup);
    return merged;
  };

  const handleExportCSV = () => {
    if (filteredEvents.length === 0) return alert("No events to export.");

    const mergedList = getMergedEvents(filteredEvents);
    const headers = ["Date Range", "Start Time", "End Time", "Subject", "Teacher", "Cohort"];
    
    const rows = mergedList.map(ev => {
        const dateStr = ev.start.toISOString().split('T')[0] === ev.endDate.toISOString().split('T')[0]
            ? ev.start.toLocaleDateString('en-GB', { timeZone: 'UTC' })
            : `${ev.start.toLocaleDateString('en-GB', { timeZone: 'UTC' })} - ${ev.endDate.toLocaleDateString('en-GB', { timeZone: 'UTC' })}`;

        return [
            `"${dateStr}"`,
            ev.start.toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit', timeZone: 'UTC' }),
            ev.end.toLocaleTimeString('en-GB', { hour: '2-digit', minute:'2-digit', timeZone: 'UTC' }),
            `"${ev.summary}"`,
            `"${ev.teacherName}"`,
            `"${ev.courseName}"`
        ].join(",");
    });

    const blob = new Blob([headers.join(",") + '\n' + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Schedule_Export.csv`;
    link.click();
  };

  const handleSmartPrint = () => {
      if (filterType === 'teacher') {
          printTeacherGrid();
      } else {
          alert("Please select a Teacher from the dropdown to print their monthly schedule.");
      }
  };

  const printTeacherGrid = () => {
    const teacherName = teachers.find(t => t.id === selectedFilter)?.name || "Teacher Schedule";
    const printWindow = window.open('', '', 'height=600,width=800');
    if (!printWindow) return;

    const pYear = currentDate.getUTCFullYear();
    const pMonth = currentDate.getUTCMonth();
    const pFirstDay = new Date(Date.UTC(pYear, pMonth, 1)).getUTCDay();
    const adjustedFirstDay = pFirstDay === 0 ? 6 : pFirstDay - 1; 
    const pDaysInMonth = new Date(Date.UTC(pYear, pMonth + 1, 0)).getUTCDate();
    
    let cellsHtml = '';
    
    for (let i = 0; i < 42; i++) {
        const dayNum = i - adjustedFirstDay + 1;
        
        if (dayNum > 0 && dayNum <= pDaysInMonth) {
             const dateKey = `${pYear}-${String(pMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
             
             const dayEvents = filteredEvents.filter(e => {
                 return e.start.toISOString().split('T')[0] === dateKey;
             });
             
             const uniqueSummaries = Array.from(new Set(dayEvents.map(e => e.summary)));
             
             const eventsHtml = uniqueSummaries.map(summary => {
                 const ev = dayEvents.find(e => e.summary === summary);
                 return `
                    <div class="event">
                        <div class="subject">• ${summary}</div>
                        <div class="cohort">${ev?.courseName}</div>
                    </div>
                 `;
             }).join('');

             cellsHtml += `<div class="cell"><div class="day-num">${dayNum}</div>${eventsHtml}</div>`;
        } else {
             cellsHtml += `<div class="cell bg-gray"></div>`;
        }
        
        if (dayNum >= pDaysInMonth && (i + 1) % 7 === 0) break;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${teacherName} - ${MONTH_NAMES[pMonth]} ${pYear}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; margin-bottom: 5px; }
            h2 { text-align: center; color: #666; margin-top: 0; font-size: 18px; font-weight: normal; margin-bottom: 30px; }
            .grid-container { display: grid; grid-template-columns: repeat(7, 1fr); border-top: 1px solid #ddd; border-left: 1px solid #ddd; }
            .header-cell { background: #f1f5f9; padding: 10px; text-align: center; font-weight: bold; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; text-transform: uppercase; font-size: 12px; color: #475569; }
            .cell { border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; min-height: 120px; padding: 8px; }
            .bg-gray { background: #f8fafc; }
            .day-num { font-weight: bold; color: #333; margin-bottom: 8px; font-size: 14px; }
            .event { margin-bottom: 8px; font-size: 11px; line-height: 1.4; }
            .subject { font-weight: bold; color: #0f172a; }
            .cohort { color: #64748b; }
          </style>
        </head>
        <body>
          <h1>${teacherName}</h1>
          <h2>${MONTH_NAMES[pMonth]} ${pYear}</h2>
          <div class="grid-container">
            <div class="header-cell">Mon</div><div class="header-cell">Tue</div><div class="header-cell">Wed</div>
            <div class="header-cell">Thu</div><div class="header-cell">Fri</div><div class="header-cell">Sat</div><div class="header-cell">Sun</div>
            ${cellsHtml}
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();
  
  const getDaysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const getFirstDayOfMonth = (y: number, m: number) => {
      const day = new Date(Date.UTC(y, m, 1)).getUTCDay();
      return day === 0 ? 6 : day - 1; 
  };
  
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days = Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - firstDay + 1;
      if (dayNum > 0 && dayNum <= daysInMonth) return dayNum;
      return null;
  });

  const handlePrev = () => setCurrentDate(new Date(Date.UTC(year, month - 1, 1)));
  const handleNext = () => setCurrentDate(new Date(Date.UTC(year, month + 1, 1)));
  const handleToday = () => {
      const now = new Date();
      setCurrentDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="p-8 h-full flex flex-col bg-slate-50 relative">
      
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <CalIcon className="text-blue-600" />
                {MONTH_NAMES[month]} {year}
            </h1>
            
            <div className="relative ml-6">
                <Filter className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <select 
                    value={selectedFilter}
                    onChange={(e) => handleFilterChange(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer min-w-[240px]"
                >
                    <option value="all">Show All</option>
                    <optgroup label="Cohorts">
                        {instances.map(inst => ( <option key={inst.id} value={inst.id}>{inst.name}</option> ))}
                    </optgroup>
                    <optgroup label="Teachers">
                        {teachers.map(t => ( <option key={t.id} value={t.id}>{t.name}</option> ))}
                    </optgroup>
                </select>
            </div>
        </div>

        <div className="flex gap-2">
            <button 
                onClick={handleExportCSV}
                className="px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-bold text-sm shadow-sm flex items-center gap-2"
            >
                <Download size={16} /> CSV
            </button>

            {filterType === 'teacher' && (
                <button 
                    onClick={handleSmartPrint}
                    className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold text-sm shadow-sm flex items-center gap-2 mr-4 transition-colors"
                    title="Print Monthly Schedule"
                >
                    <Printer size={16} /> Print Month Grid
                </button>
            )}

            <div className="flex gap-1 bg-white p-1 rounded-lg border shadow-sm">
                <button onClick={handlePrev} className="p-1.5 hover:bg-slate-50 rounded"><ChevronLeft size={20} /></button>
                <button onClick={handleToday} className="px-3 py-1.5 text-sm font-bold hover:bg-slate-50 rounded">Today</button>
                <button onClick={handleNext} className="p-1.5 hover:bg-slate-50 rounded"><ChevronRight size={20} /></button>
            </div>
        </div>
      </div>

      {/* Days Header */}
      <div className="grid grid-cols-7 mb-2">
        {DAYS_OF_WEEK.map(d => <div key={d} className="text-center font-bold text-slate-500 text-sm uppercase">{d}</div>)}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 flex-1 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {days.map((day, idx) => {
            if (!day) return <div key={idx} className="bg-slate-50/50" />;
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            const dayEvents = filteredEvents.filter(e => {
                return e.start.toISOString().split('T')[0] === dateKey;
            });

            const isToday = new Date().toISOString().split('T')[0] === dateKey;

            return (
                <div key={idx} className="bg-white p-2 min-h-[120px] overflow-hidden hover:bg-slate-50 transition-colors group">
                    <div className="text-sm font-bold text-slate-400 mb-1 flex justify-between">
                        <span className={isToday ? "bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full shadow-sm" : ""}>{day}</span>
                        {dayEvents.length > 0 && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold">{dayEvents.length}</span>}
                    </div>
                    
                    <div className="space-y-1.5 overflow-y-auto max-h-[140px] pr-1 custom-scrollbar">
                        {dayEvents.map((ev, i) => (
                            <div 
                                key={i} 
                                onClick={() => setSelectedEvent(ev)}
                                className={`text-[10px] p-1.5 rounded border-l-4 shadow-sm cursor-pointer transition-transform hover:scale-[1.02] active:scale-95 ${ev.isUnassigned ? 'bg-slate-100 border-slate-300 text-slate-500' : 'text-white'}`}
                                style={{ 
                                    backgroundColor: ev.isUnassigned ? '#f1f5f9' : ev.teacherColor,
                                    borderColor: ev.isUnassigned ? '#cbd5e1' : undefined 
                                }}
                            >
                                <div className="font-bold truncate">{ev.summary}</div>
                                <div className="truncate opacity-90 flex items-center gap-1">
                                    <User size={8} /> {ev.teacherName}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        })}
      </div>

      {/* EVENT DETAIL POPUP */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setSelectedEvent(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="h-24 relative p-6 flex flex-col justify-end" style={{ backgroundColor: selectedEvent.teacherColor }}>
                    <button onClick={() => setSelectedEvent(null)} className="absolute top-4 right-4 bg-black/10 hover:bg-black/20 text-white rounded-full p-1 transition-colors"><X size={18} /></button>
                    <h3 className="text-white font-bold text-xl drop-shadow-md leading-tight">{selectedEvent.summary}</h3>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-slate-500"><Clock size={20} /></div>
                        <div>
                            <div className="font-bold text-slate-800">
                                {selectedEvent.start.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })}
                            </div>
                            <div className="text-sm text-slate-500">
                                {selectedEvent.start.toLocaleTimeString('en-AU', { timeZone: 'UTC', hour: '2-digit', minute:'2-digit' })} - {selectedEvent.end.toLocaleTimeString('en-AU', { timeZone: 'UTC', hour: '2-digit', minute:'2-digit' })}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-slate-500"><User size={20} /></div>
                        <div>
                            <div className="font-bold text-slate-800">{selectedEvent.teacherName}</div>
                            {selectedEvent.teacherEmail && <div className="text-sm text-slate-500">{selectedEvent.teacherEmail}</div>}
                        </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-1">Cohort</div>
                        <div className="font-medium text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">{selectedEvent.courseName}</div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};