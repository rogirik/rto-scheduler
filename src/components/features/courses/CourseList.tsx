import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { CourseInstance, Course, UnitAllocation, Teacher, Subject, AcademicYear } from '../../../services/api';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { 
  Plus, Search, FileText, Settings, Loader2, Trash2, 
  CheckCircle2, ShieldAlert, BookOpen, X, Edit2, AlertTriangle, Clock, Archive, History, ArchiveRestore
} from 'lucide-react';
import { ScheduleCourseForm } from './ScheduleCourseForm';
import { CourseAllocation } from './CourseAllocation';
import { CourseForm } from './CourseForm';

const getLocalIsoString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const applyLocalTimeFix = (events: any[], instance: any) => {
    return events.map(ev => {
        const originalDate = new Date(ev.start);
        const year = originalDate.getFullYear();
        const month = originalDate.getMonth();
        const day = originalDate.getDate();

        const [startH, startM] = (instance.start_time || "09:00").split(':').map(Number);
        const fixedStart = new Date(year, month, day, startH, startM);

        const duration = instance.hours_per_day || 7;
        const fixedEnd = new Date(fixedStart);
        fixedEnd.setHours(fixedStart.getHours() + Math.floor(duration));
        fixedEnd.setMinutes(fixedStart.getMinutes() + ((duration % 1) * 60));

        return { ...ev, start: fixedStart, end: fixedEnd };
    });
};

// THE FIX: Forces the ID back to a Number so the scheduler's math works flawlessly
const getFilteredAndNormalizedYears = (rawYears: AcademicYear[], selectedState: string) => {
    const cleanState = (selectedState || 'VIC').toUpperCase();
    
    return rawYears.map(y => {
        let t = (y as any).terms;
        while(typeof t === 'string') { try { t = JSON.parse(t); } catch(e) { break; } }
        let h = (y as any).holidays;
        while(typeof h === 'string') { try { h = JSON.parse(h); } catch(e) { break; } }
        
        return { 
            ...y, 
            terms: Array.isArray(t) ? t : [], 
            holidays: Array.isArray(h) ? h : [] 
        } as AcademicYear;
    }).filter(y => {
        const s = ((y as any).state || '').toString().toUpperCase();
        if (s === 'NATIONAL' || s === 'ALL' || s === cleanState) return true;
        if (y.id && String(y.id).toUpperCase().includes(`-${cleanState}`)) return true;
        if (!s && !String(y.id).includes('-')) return true; 
        return false;
    }).map(y => {
        const terms = y.terms.map((term: any) => ({
            ...term,
            start_date: term.start_date || term.start,
            end_date: term.end_date || term.end,
            start: term.start || term.start_date,
            end: term.end || term.end_date,
            state: cleanState
        }));

        const holidays = y.holidays.map((hol: any) => ({
            ...hol,
            date: hol.date || hol.start || hol.start_date,
            state: cleanState
        }));

        return {
            ...y,
            terms,
            holidays,
            id: parseInt(String(y.id).split('-')[0], 10) // <-- Forces it to be an Integer
        } as AcademicYear;
    });
};

export const CourseList = () => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  
  const [userRole, setUserRole] = useState<'admin' | 'teacher'>('teacher');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  
  const [instances, setInstances] = useState<CourseInstance[]>([]);
  const [templates, setTemplates] = useState<Course[]>([]);
  const [allocations, setAllocations] = useState<UnitAllocation[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rawAcademicYears, setRawAcademicYears] = useState<AcademicYear[]>([]);
  
  const [scheduleOverrides, setScheduleOverrides] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Course | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<CourseInstance | null>(null);
  const [showAllocator, setShowAllocator] = useState<CourseInstance | null>(null);

  useEffect(() => { 
      loadData(); 
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const [iRes, tRes, aRes, teachRes, subRes, yearRes, overridesRes] = await Promise.all([
        ApiService.getCourseInstances(),
        ApiService.getAll<Course>('course_templates'),
        ApiService.getAllocationsGlobal(),
        supabase.from('teachers').select('*'), 
        ApiService.getSubjects(),
        ApiService.getAll<AcademicYear>('academic_years'),
        supabase.from('schedule_overrides').select('*')
      ]);

      setScheduleOverrides(overridesRes.data || []); 
      setRawAcademicYears(yearRes || []);

      let filteredInstances = iRes || [];
      let filteredTemplates = tRes || [];
      let filteredAllocations = aRes || [];
      let filteredTeachers = teachRes.data || [];

      if (user) {
          let myOrgId = null;
          let role: 'admin' | 'teacher' = 'teacher';

          try {
              const { data: profile } = await supabase
                  .from('user_profiles')
                  .select('organization_id, role')
                  .eq('id', user.id)
                  .single();
                  
              if (profile) {
                  myOrgId = profile.organization_id;
                  if (profile.role === 'admin') role = 'admin';
              }
          } catch (e) {}

          if (!myOrgId) {
              const myKnownTeacher = filteredTeachers.find(t => t.user_id === user.id && t.organization_id);
              myOrgId = myKnownTeacher?.organization_id;
          }

          setUserRole(role);

          const isMine = (item: any) => {
              if (myOrgId) {
                  if (item.organization_id) return item.organization_id === myOrgId;
                  return item.user_id === user.id;
              }
              return item.user_id === user.id;
          };

          const isMineOrGlobal = (item: any) => {
              if (!item.organization_id) return true; 
              if (myOrgId) return item.organization_id === myOrgId;
              return item.user_id === user.id;
          };

          filteredInstances = filteredInstances.filter(isMine);
          filteredTeachers = filteredTeachers.filter(isMine);
          filteredTemplates = filteredTemplates.filter(isMineOrGlobal);

          const validInstanceIds = new Set(filteredInstances.map(i => i.id));
          filteredAllocations = filteredAllocations.filter(a => validInstanceIds.has(a.instance_id));
      }

      setInstances(filteredInstances);
      setTemplates(filteredTemplates);
      setAllocations(filteredAllocations);
      setTeachers(filteredTeachers); 
      setSubjects(subRes || []);
      
    } catch (error) {
      console.error("Dashboard Load Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (table: string, id: string) => {
    if (!confirm('Permanently delete this record?')) return;
    try { 
        await ApiService.delete(table as any, id); 
        loadData(); 
    } catch (e) { 
        alert("Delete failed."); 
    }
  };

  const handleToggleArchive = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    try {
        await supabase.from('course_instances').update({ status: newStatus }).eq('id', id);
        loadData();
    } catch(e) {
        alert("Failed to update status.");
    }
  };

  const handleAutoArchive = async () => {
      if (!confirm("This will scan all active cohorts and automatically archive any that have passed their final scheduled class date. Proceed?")) return;
      setArchiving(true);
      
      try {
          const today = new Date();
          today.setHours(0,0,0,0);
          const toArchiveIds: string[] = [];

          instances.forEach(instance => {
              if (instance.status === 'archived' || instance.status === 'completed') return;

              const template = templates.find(t => t.id === instance.template_id);
              if (!template) return;

              const instanceAcademicYears = getFilteredAndNormalizedYears(rawAcademicYears, (instance as any).state);
              
              let events = generateAllEventsForInstance(
                  instance as any, 
                  instanceAcademicYears, 
                  template, 
                  subjects, 
                  teachers, 
                  scheduleOverrides
              );
              
              if (events.length > 0) {
                  events.sort((a,b) => a.start.getTime() - b.start.getTime());
                  const lastEventDate = new Date(events[events.length - 1].start);
                  lastEventDate.setHours(0,0,0,0);

                  if (lastEventDate.getTime() < today.getTime()) {
                      toArchiveIds.push(instance.id);
                  }
              }
          });

          if (toArchiveIds.length === 0) {
              alert("All active cohorts are up to date. Nothing to archive.");
              setArchiving(false);
              return;
          }

          for (const id of toArchiveIds) {
              await supabase.from('course_instances').update({ status: 'archived' }).eq('id', id);
          }

          alert(`Success: ${toArchiveIds.length} expired cohort(s) have been moved to the Archive.`);
          await loadData();
      } catch (error) {
          console.error(error);
          alert("Failed to run auto-archive.");
      } finally {
          setArchiving(false);
      }
  };

  const handleGlobalAutoAssign = async () => {
    if (!confirm("Auto-assign trainers to EMPTY units across all active cohorts?")) return;
    setProcessing(true);
    
    try {
        let localAllocations = [...allocations];
        const allGlobalEvents: any[] = [];
        
        instances.forEach(inst => {
            if (inst.status === 'archived' || inst.status === 'completed') return;
            const temp = templates.find(t => t.id === inst.template_id);
            if (!temp) return;
            
            const instanceAcademicYears = getFilteredAndNormalizedYears(rawAcademicYears, (inst as any).state);
            let evs = generateAllEventsForInstance(inst as any, instanceAcademicYears, temp, subjects, teachers, scheduleOverrides);
            evs = applyLocalTimeFix(evs, inst);

            allGlobalEvents.push(...evs.map(e => ({ ...e, instanceId: inst.id })));
        });

        const liveTeacherSchedules: Record<string, any[]> = {};
        allGlobalEvents.forEach(ev => {
            const alloc = localAllocations.find(a => a.instance_id === ev.instanceId && a.subject_id === ev.subjectId);
            if (alloc && alloc.teacher_id) {
                if (!liveTeacherSchedules[alloc.teacher_id]) liveTeacherSchedules[alloc.teacher_id] = [];
                liveTeacherSchedules[alloc.teacher_id].push(ev);
            }
        });

        const isTeacherAvailableOnDay = (teacher: Teacher, day: number) => {
            let avail: any = teacher.availability;
            if (!avail) return false;
            if (typeof avail === 'string') { try { avail = JSON.parse(avail); } catch (e) { avail = {}; } }
            if (avail[String(day)]) return true;
            if (avail.schedule && avail.schedule[String(day)] && avail.schedule[String(day)].active) return true;
            if (Array.isArray(avail) && avail.includes(day)) return true;
            return false;
        };

        for (const instance of instances) {
            if (instance.status === 'archived' || instance.status === 'completed') continue;
            
            const template = templates.find(t => t.id === instance.template_id);
            if (!template) continue;
            
            const rawSeq = (template as any).sequenced_subjects || [];
            const requiredIds = rawSeq.map((item: any) => typeof item === 'string' ? item : item.id).filter(Boolean);
            const missingIds = requiredIds.filter(id => !localAllocations.find(a => a.instance_id === instance.id && a.subject_id === id));
            
            if (missingIds.length === 0) continue;

            for (const subId of missingIds) {
                const subject = subjects.find(s => s.id === subId);
                const subHours = subject?.hours || 20;
                
                const proposedEvents = allGlobalEvents.filter(e => e.instanceId === instance.id && e.subjectId === subId);
                const requiredDays = new Set<number>();
                
                proposedEvents.forEach(ev => {
                    requiredDays.add(ev.start.getDay()); 
                });
                
                const candidates = [...teachers].sort(() => 0.5 - Math.random());
                let assignedTeacherId = null;
                
                for (const teacher of candidates) {
                    if (teacher.trains_online && instance.delivery_mode !== 'Online') continue;
                    
                    const teacherLoad = localAllocations
                        .filter(a => a.teacher_id === teacher.id)
                        .reduce((sum, a) => sum + (subjects.find(sub => sub.id === a.subject_id)?.hours || 0), 0);
                        
                    if (teacherLoad + subHours > (teacher.max_hours || 800)) continue;

                    let isAvailable = true;
                    const daysToCheck = requiredDays.size > 0 ? Array.from(requiredDays) : (instance.allowed_days || [1, 2, 3, 4, 5]);
                    
                    for (const day of daysToCheck) {
                        if (day === 0) continue; 
                        if (!isTeacherAvailableOnDay(teacher, day)) {
                            isAvailable = false;
                            break;
                        }
                    }
                    if (!isAvailable) continue;

                    let hasClash = false;
                    const existingEvents = liveTeacherSchedules[teacher.id] || [];
                    
                    for (const newEv of proposedEvents) {
                        const newStart = newEv.start.getTime();
                        const newEnd = newEv.end.getTime();
                        
                        for (const existEv of existingEvents) {
                            if (newStart < existEv.end.getTime() && newEnd > existEv.start.getTime()) {
                                hasClash = true;
                                break;
                            }
                        }
                        if (hasClash) break;
                    }

                    if (!hasClash) { 
                        assignedTeacherId = teacher.id; 
                        break; 
                    }
                }

                if (assignedTeacherId) {
                    const newAlloc = { instance_id: instance.id, subject_id: subId, teacher_id: assignedTeacherId };
                    await ApiService.saveAllocation(newAlloc);
                    localAllocations.push(newAlloc as UnitAllocation);

                    if (!liveTeacherSchedules[assignedTeacherId]) liveTeacherSchedules[assignedTeacherId] = [];
                    liveTeacherSchedules[assignedTeacherId].push(...proposedEvents);
                }
            }
        }
        await loadData();
        alert("Global allocation finished with clash detection applied.");
    } catch (e) { 
        console.error(e); 
    } finally { 
        setProcessing(false); 
    }
  };

  const handleDownloadPDF = async (instance: CourseInstance) => {
      const template = templates.find(t => t.id === instance.template_id);
      if (!template) return;
      
      const instanceAcademicYears = getFilteredAndNormalizedYears(rawAcademicYears, (instance as any).state);

      let events = generateAllEventsForInstance(instance as any, instanceAcademicYears, template, subjects, teachers, scheduleOverrides);
      events = applyLocalTimeFix(events, instance);

      if (events.length === 0) {
          alert("No schedule dates generated. Please edit the cohort and verify settings.");
          return;
      }

      events.sort((a,b) => a.start.getTime() - b.start.getTime());

      const merged = events.map(e => ({ ...e, type: 'class' }));
      const firstDate = new Date(events[0].start);
      firstDate.setHours(0,0,0,0);
      const lastDate = new Date(events[events.length - 1].start);
      lastDate.setHours(23,59,59,999);

      const timelineInjections: any[] = [];
      
      instanceAcademicYears.forEach((y: any) => {
          y.terms.forEach((t: any) => {
              const tStart = new Date(t.start_date || t.start);
              if (!isNaN(tStart.getTime()) && tStart.getTime() >= firstDate.getTime() && tStart.getTime() <= lastDate.getTime()) {
                  timelineInjections.push({ type: 'term_marker', start: tStart, summary: t.name || 'Term Start' });
              }
          });

          y.holidays.forEach((h: any) => {
              const hDate = new Date(h.date || h.start || h.start_date);
              if (!isNaN(hDate.getTime()) && hDate.getTime() >= firstDate.getTime() && hDate.getTime() <= lastDate.getTime()) {
                  timelineInjections.push({ type: 'holiday', start: hDate, summary: h.name || 'Holiday / Break' });
              }
          });
      });

      const exDates = Array.isArray((instance as any).excluded_dates) ? (instance as any).excluded_dates : [];
      exDates.forEach(dStr => {
          const dDate = new Date(dStr);
          dDate.setHours(12,0,0,0);
          if (dDate.getTime() >= firstDate.getTime() && dDate.getTime() <= lastDate.getTime()) {
              const isDup = timelineInjections.some(kh => getLocalIsoString(kh.start) === getLocalIsoString(dDate));
              if (!isDup) {
                  timelineInjections.push({ type: 'manual_skip', start: dDate, summary: 'Manually Skipped Date' });
              }
          }
      });

      const fullTimeline = [...merged, ...timelineInjections].sort((a, b) => {
          if (a.start.getTime() === b.start.getTime()) {
              if (a.type === 'term_marker') return -1;
              if (b.type === 'term_marker') return 1;
          }
          return a.start.getTime() - b.start.getTime();
      });

      const printWindow = window.open('', '', 'height=800,width=1000');
      if (!printWindow) {
          alert("Popup blocked! Please allow popups for this site to view the schedule.");
          return;
      }

      let classCounterPrint = 1;
      const tableRowsHtml = fullTimeline.map(item => {
          if (item.type === 'term_marker') {
              return `<tr class="term-row"><td colspan="4">🚩 ${item.summary} Begins</td></tr>`;
          }
          if (item.type === 'holiday' || item.type === 'manual_skip') {
              return `<tr class="holiday-row">
                        <td style="text-align: center;">-</td>
                        <td><strong>${item.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong></td>
                        <td colspan="2">🌴 ${item.summary} (No Class)</td>
                      </tr>`;
          }

          const cNum = classCounterPrint++;
          const alloc = allocations.find(a => a.instance_id === instance.id && a.subject_id === item.subjectId);
          const teacher = teachers.find(t => t.id === alloc?.teacher_id);
          const dateStr = item.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          const timeStr = item.start.toLocaleTimeString('en-AU', { hour: '2-digit', minute:'2-digit' });
          const teacherName = teacher?.name || '<span style="color:#94a3b8;font-style:italic;">Unassigned</span>';

          return `<tr>
                    <td style="text-align: center; font-weight: bold; color: #64748b;">${cNum}</td>
                    <td><strong>${dateStr}</strong><br/><span style="font-size:12px;color:#64748b">${timeStr}</span></td>
                    <td>${item.summary}</td>
                    <td>${teacherName}</td>
                  </tr>`;
      }).join('');

      const cleanInstanceName = instance.name.replace(/[^a-zA-Z0-9]/g, '_');

      const fullHtmlString = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Schedule - ${instance.name}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
              #pdf-content { padding: 20px; background: white; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
              th { background: #f8fafc; padding: 14px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 12px; }
              td { padding: 14px; border-bottom: 1px solid #f1f5f9; }
              tr.term-row td { background: #1e293b; color: white; font-weight: bold; text-transform: uppercase; font-size: 11px; padding: 8px 14px; }
              tr.holiday-row td { background: #fef3c7; color: #92400e; font-weight: 600; font-size: 13px; }
              .controls { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin-bottom: 30px; display: flex; gap: 12px; align-items: center; }
              button { padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; font-size: 14px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
              .btn-print { background: #64748b; color: white; }
              .btn-print:hover { background: #475569; }
              .btn-pdf { background: #2563eb; color: white; }
              .btn-pdf:hover { background: #1d4ed8; }
              @media print {
                .controls { display: none !important; }
                body { padding: 0; }
                #pdf-content { padding: 0; }
              }
            </style>
          </head>
          <body>
            <div class="controls" data-html2canvas-ignore="true">
              <button class="btn-pdf" onclick="downloadPDF()" id="pdfBtn">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Download PDF
              </button>
              <button class="btn-print" onclick="window.print()">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"></path></svg>
                Print
              </button>
            </div>
            
            <div id="pdf-content">
                <h1 style="color: #0f172a; margin-bottom: 8px; font-size: 28px;">${instance.name}</h1>
                <p style="color: #64748b; margin-top: 0; margin-bottom: 24px; font-size: 16px;">Class Schedule</p>
                
                <table>
                  <thead>
                    <tr>
                      <th style="width: 50px; text-align: center;">#</th>
                      <th style="width: 160px;">Date & Time</th>
                      <th>Unit / Cluster</th>
                      <th style="width: 200px;">Trainer</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRowsHtml}
                  </tbody>
                </table>
            </div>

            <script>
              function downloadPDF() {
                  const btn = document.getElementById('pdfBtn');
                  const originalText = btn.innerHTML;
                  btn.innerHTML = 'Generating...';
                  btn.disabled = true;

                  var element = document.getElementById('pdf-content');
                  var opt = {
                      margin:       [15, 15, 15, 15],
                      filename:     '${cleanInstanceName}_Schedule.pdf',
                      image:        { type: 'jpeg', quality: 0.98 },
                      html2canvas:  { scale: 2, useCORS: true },
                      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
                  };
                  
                  html2pdf().set(opt).from(element).save().then(() => {
                      btn.innerHTML = originalText;
                      btn.disabled = false;
                  });
              }
            </script>
          </body>
        </html>
      `;

      printWindow.document.write(fullHtmlString);
      printWindow.document.close();
  };

  const getInstanceStats = (instance: CourseInstance) => {
    const template = templates.find(t => t.id === instance.template_id);
    if (!template) return { total: 0, assigned: 0, unallocatedHours: 0, hasClash: false, endDateStr: '' };
    
    const rawSeq = (template as any).sequenced_subjects || [];
    const requiredIds = rawSeq.map((item: any) => typeof item === 'string' ? item : item.id).filter(Boolean);
    
    const total = requiredIds.length;
    let assignedCount = 0;
    let unallocatedHours = 0;

    requiredIds.forEach((id: string) => {
        const isAssigned = allocations.some(a => a.instance_id === instance.id && a.subject_id === id && a.teacher_id);
        if (isAssigned) {
            assignedCount++;
        } else {
            const subject = subjects.find(s => s.id === id);
            unallocatedHours += (subject?.hours || 0);
        }
    });

    let hasClash = false;
    let endDateStr = '';
    
    const instanceAcademicYears = getFilteredAndNormalizedYears(rawAcademicYears, (instance as any).state);
    let events = generateAllEventsForInstance(
        instance as any, 
        instanceAcademicYears, 
        template, 
        subjects, 
        teachers, 
        scheduleOverrides
    );
    
    if (events.length > 0) {
        events.sort((a,b) => a.start.getTime() - b.start.getTime());
        endDateStr = events[events.length - 1].start.toLocaleDateString('en-CA');

        if ((instance as any).scheduling_mode === 'flexible') {
            const dateCounts: Record<string, number> = {};
            for(const ev of events) {
                const dateStr = ev.start.toLocaleDateString('en-CA');
                dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
                if (dateCounts[dateStr] > 1) {
                    hasClash = true;
                    break;
                }
            }
        }
    }

    return { total, assigned: assignedCount, unallocatedHours, hasClash, endDateStr };
  };

  const displayedInstances = instances.filter(i => {
      const matchSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = viewMode === 'active' ? (i.status !== 'archived' && i.status !== 'completed') : (i.status === 'archived' || i.status === 'completed');
      return matchSearch && matchStatus;
  });

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500" size={40} /></div>;

  return (
    <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Scheduled Courses</h1>
          <p className="text-sm text-slate-500">
            {userRole === 'admin' 
              ? 'Manage your active cohorts and schedule dates.' 
              : 'View your scheduled cohorts and class dates.'}
          </p>
        </div>
        
        <div className="flex gap-3">
            <button onClick={handleAutoArchive} disabled={archiving} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-900 shadow-sm transition-all">
                {archiving ? <Loader2 className="animate-spin" size={18} /> : <Archive size={18} />} Auto Archive
            </button>
            <button onClick={handleGlobalAutoAssign} disabled={processing} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-purple-700 shadow-sm transition-all">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <ShieldAlert size={18} />} Global Auto Assign
            </button>
            <button onClick={() => setShowTemplateManager(true)} className="bg-white border px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-slate-50">
                <BookOpen size={18} /> Qualifications
            </button>
            <button onClick={() => { setSelectedInstance(null); setShowScheduleModal(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-blue-700">
                <Plus size={18} /> New Cohort
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border flex items-center justify-between gap-4">
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
                onClick={() => setViewMode('active')}
                className={`px-6 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'active' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Active Cohorts
            </button>
            <button 
                onClick={() => setViewMode('archived')}
                className={`px-6 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5 ${viewMode === 'archived' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <History size={14} /> Archive
            </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
          <input placeholder="Search cohorts..." className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b text-slate-500 text-[10px] uppercase font-bold tracking-widest">
              <th className="p-4">Cohort</th>
              <th className="p-4">Qualification</th>
              <th className="p-4">Dates</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayedInstances.length === 0 ? (
                <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 italic">
                        {viewMode === 'active' ? 'No active cohorts found.' : 'Archive is empty.'}
                    </td>
                </tr>
            ) : displayedInstances.map(instance => {
              const stats = getInstanceStats(instance);
              const isFullyAllocated = stats.total > 0 && stats.assigned === stats.total;

              return (
                <tr key={instance.id} className={`hover:bg-slate-50 transition-all ${viewMode === 'archived' ? 'opacity-70' : ''}`}>
                  <td className="p-4">
                    <div className="font-bold text-slate-800 text-lg">
                        {instance.name} 
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 ml-2 rounded border border-slate-200 uppercase tracking-wider">{(instance as any).state || 'VIC'}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                        {isFullyAllocated ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100">
                                <CheckCircle2 size={10}/> Allocated: {stats.assigned}/{stats.total}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-100">
                                <AlertTriangle size={10}/> Pending: {stats.assigned}/{stats.total}
                            </span>
                        )}
                        
                        {stats.unallocatedHours > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-bold border border-red-100">
                                <Clock size={10}/> {stats.unallocatedHours} hrs Unallocated
                            </span>
                        )}

                        {stats.hasClash && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-[10px] font-bold border border-orange-200">
                                <AlertTriangle size={10}/> Multiple Subjects on Same Day
                            </span>
                        )}

                        {viewMode === 'archived' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-300">
                                <Archive size={10}/> Archived
                            </span>
                        )}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600">{templates.find(t => t.id === instance.template_id)?.name}</td>
                  <td className="p-4 text-sm font-bold text-slate-700">
                      {instance.start_date} {stats.endDateStr ? `to ${stats.endDateStr}` : ''}
                  </td>
                  <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                          <button onClick={() => handleDownloadPDF(instance)} className="p-2 text-slate-400 hover:text-blue-600" title="Print/Download Schedule"><FileText size={18} /></button>
                          
                          {viewMode === 'active' ? (
                              <>
                                  <button onClick={() => { setSelectedInstance(instance); setShowScheduleModal(true); }} className="p-2 text-slate-400 hover:text-blue-600" title="Edit Cohort"><Settings size={18} /></button>
                                  <button onClick={() => setShowAllocator(instance)} className="px-4 py-2 rounded-lg font-bold text-xs bg-blue-600 text-white hover:bg-blue-700">Assign</button>
                                  <button onClick={() => handleDelete('course_instances', instance.id)} className="p-2 text-slate-400 hover:text-red-600" title="Delete Cohort"><Trash2 size={18} /></button>
                              </>
                          ) : (
                              <button onClick={() => handleToggleArchive(instance.id, 'archived')} className="px-3 py-1.5 rounded-lg font-bold text-xs bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center gap-1">
                                  <ArchiveRestore size={14} /> Restore
                              </button>
                          )}
                      </div>
                    </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showScheduleModal && (
        <ScheduleCourseForm initialData={selectedInstance} onClose={() => setShowScheduleModal(false)} onSuccess={() => { setShowScheduleModal(false); loadData(); }} />
      )}
      {showAllocator && (
        <CourseAllocation instance={showAllocator} onClose={() => setShowAllocator(null)} onUpdate={() => loadData()} />
      )}
      
      {showTemplateManager && !showCourseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-bold">Manage Qualifications</h2>
                    <button onClick={() => setShowTemplateManager(false)}><X size={24} className="text-slate-400"/></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-3">
                    {templates.map(t => (
                        <div key={t.id} className="flex justify-between items-center p-4 bg-white border rounded-xl">
                            <div className="font-bold text-slate-800">{t.name}</div>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditingTemplate(t); setShowCourseForm(true); }} className="p-2 text-slate-400 hover:text-blue-600"><Edit2 size={18} /></button>
                                <button onClick={() => handleDelete('course_templates', t.id)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => { setEditingTemplate(null); setShowCourseForm(true); }} className="w-full py-3 border-2 border-dashed rounded-xl text-slate-400 font-bold hover:bg-slate-50">+ New Qualification</button>
                </div>
            </div>
        </div>
      )}
      {showCourseForm && (
          <CourseForm initialData={editingTemplate} onClose={() => setShowCourseForm(false)} onSuccess={() => { setShowCourseForm(false); loadData(); }} />
      )}
    </div>
  );
};
