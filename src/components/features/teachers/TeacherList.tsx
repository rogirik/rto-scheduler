import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { Teacher, CourseInstance, UnitAllocation, Course, Subject, AcademicYear } from '../../../services/api';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { 
  Plus, Search, Mail, Edit2, Trash2, Loader2, FileText, Calendar, Download, AlertTriangle
} from 'lucide-react';
import { TeacherForm } from './TeacherForm';

export const TeacherList = () => {
  const [loading, setLoading] = useState(true);
  
  const [userRole, setUserRole] = useState<'admin' | 'teacher'>('teacher');

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherSchedules, setTeacherSchedules] = useState<Record<string, any[]>>({});
  const [clashes, setClashes] = useState<Record<string, string[]>>({});
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const [tRes, aData, iData, tempData, sData, yData] = await Promise.all([
        supabase.from('teachers').select('*'),
        ApiService.getAllocationsGlobal(),
        ApiService.getCourseInstances(),
        ApiService.getAll<Course>('course_templates'),
        ApiService.getSubjects(),
        ApiService.getAll<AcademicYear>('academic_years')
      ]);

      let validTeachers = tRes.data || [];
      let filteredInstances = iData || [];
      let filteredTemplates = tempData || [];
      
      if (user) {
          let myOrgId = null;
          let role: 'admin' | 'teacher' = 'teacher';

          try {
              const { data: profile, error } = await supabase
                  .from('user_profiles')
                  .select('organization_id, role')
                  .eq('id', user.id)
                  .single();
                  
              if (profile && !error) {
                  myOrgId = profile.organization_id;
                  if (profile.role === 'admin') role = 'admin';
              }
          } catch (e) {}

          if (!myOrgId) {
              const myKnownTeacher = validTeachers.find(t => t.user_id === user.id && t.organization_id);
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

          // STRICT FIX: Allow global templates so the engine can see them
          const isMineOrGlobal = (item: any) => {
              if (!item.organization_id) return true; 
              if (myOrgId) return item.organization_id === myOrgId;
              return item.user_id === user.id;
          };

          validTeachers = validTeachers.filter(isMine);
          filteredInstances = filteredInstances.filter(isMine);
          filteredTemplates = filteredTemplates.filter(isMineOrGlobal);
      } else {
          validTeachers = [];
          filteredInstances = [];
          filteredTemplates = [];
      }

      setTeachers(validTeachers);

      const tSchedules: Record<string, any[]> = {};
      validTeachers.forEach(t => tSchedules[t.id] = []);

      filteredInstances.forEach(inst => {
          if (inst.status === 'completed') return;
          const temp = filteredTemplates.find(t => t.id === inst.template_id);
          if (!temp) return;

          // STRICT FIX: Pass raw sData and yData to the engine so it doesn't skip subjects
          const courseEvents = generateAllEventsForInstance(inst, yData || [], temp as any, sData || [], validTeachers);

          courseEvents.forEach(ev => {
              const alloc = (aData || []).find((a: any) => a.instance_id === inst.id && a.subject_id === ev.subjectId);
              if (alloc && alloc.teacher_id && tSchedules[alloc.teacher_id]) {
                  tSchedules[alloc.teacher_id].push({ ...ev, instanceName: inst.name });
              }
          });
      });

      const newClashes: Record<string, string[]> = {};

      Object.keys(tSchedules).forEach(tId => {
          const events = tSchedules[tId].sort((a, b) => a.start.getTime() - b.start.getTime());
          const teacherClashes = [];
          
          for (let i = 0; i < events.length - 1; i++) {
              const current = events[i];
              const next = events[i+1];
              
              if (next.start.getTime() < current.end.getTime()) {
                  // UTC Removed
                  const dateStr = current.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
                  teacherClashes.push(`• ${current.summary} (${current.instanceName}) overlaps with ${next.summary} (${next.instanceName}) on ${dateStr}`);
              }
          }

          if (teacherClashes.length > 0) {
              newClashes[tId] = teacherClashes;
          }
          tSchedules[tId] = events; 
      });

      setTeacherSchedules(tSchedules);
      setClashes(newClashes);

    } catch (error) {
      console.error("Failed to load teachers and clashes", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = (teacher: Teacher) => {
      const events = teacherSchedules[teacher.id] || [];
      if (events.length === 0) {
          alert(`No active classes found for ${teacher.name}.`);
          return;
      }

      const printWindow = window.open('', '', 'height=800,width=1000');
      if (!printWindow) {
          alert("Popup blocked! Please allow popups for this site to view the schedule.");
          return;
      }

      const tableRowsHtml = events.map(ev => {
          // UTC Overrides Removed - strictly local Australian time
          const dateStr = ev.start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          const startTime = ev.start.toLocaleTimeString('en-AU', { hour: '2-digit', minute:'2-digit' });
          const endTime = ev.end.toLocaleTimeString('en-AU', { hour: '2-digit', minute:'2-digit' });
          const location = ev.deliveryMode === 'Online' ? 'Online' : 'On Campus';
          
          return `<tr>
                    <td><strong>${dateStr}</strong></td>
                    <td>${startTime} - ${endTime}</td>
                    <td><strong>${ev.courseName}</strong></td>
                    <td>${ev.summary}</td>
                    <td>${location}</td>
                  </tr>`;
      }).join('');

      const cleanTeacherName = teacher.name.replace(/[^a-zA-Z0-9]/g, '_');
      const headerColor = teacher.color || '#3b82f6';

      const fullHtmlString = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Schedule - ${teacher.name}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #334155; }
              #pdf-content { padding: 20px; background: white; }
              h1 { color: #0f172a; margin-bottom: 5px; font-size: 28px; }
              .meta { color: #64748b; margin-bottom: 30px; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
              th { background: ${headerColor}; color: white; padding: 14px; text-align: left; border-radius: 4px 4px 0 0; }
              td { padding: 14px; border-bottom: 1px solid #f1f5f9; }
              tr:nth-child(even) td { background-color: #f8fafc; }
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
                <h1>${teacher.name}</h1>
                <div class="meta">Schedule generated on ${new Date().toLocaleDateString()}</div>
                
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Cohort</th>
                      <th>Unit / Subject</th>
                      <th>Location</th>
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
                      filename:     '${cleanTeacherName}_Schedule.pdf',
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

  const handleDownloadICS = (teacher: Teacher) => {
      const events = teacherSchedules[teacher.id] || [];
      if (events.length === 0) {
          alert(`No active classes found for ${teacher.name}.`);
          return;
      }

      let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//AcademicScheduler//TeacherCalendar//EN\n";
      
      events.forEach(ev => {
          const formatTime = (date: Date) => {
              // UTC Overrides Removed - strictly local Australian time
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              const d = String(date.getDate()).padStart(2, '0');
              const h = String(date.getHours()).padStart(2, '0');
              const min = String(date.getMinutes()).padStart(2, '0');
              return `${y}${m}${d}T${h}${min}00`; 
          };
          
          icsContent += "BEGIN:VEVENT\n";
          icsContent += `SUMMARY:${ev.summary} (${ev.courseName})\n`;
          icsContent += `DTSTART:${formatTime(ev.start)}\n`;
          icsContent += `DTEND:${formatTime(ev.end)}\n`;
          icsContent += `DESCRIPTION:Cohort: ${ev.courseName}\\nSubject: ${ev.summary}\n`;
          icsContent += `LOCATION:${ev.deliveryMode === 'Online' ? 'Online' : 'On Campus'}\n`;
          icsContent += "END:VEVENT\n";
      });

      icsContent += "END:VCALENDAR";

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${teacher.name.replace(/\s+/g, '_')}_Schedule.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleEdit = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setSelectedTeacher(null);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this teacher?")) return;
    try {
      await ApiService.deleteTeacher(id);
      loadData();
    } catch (error) {
      alert("Failed to delete teacher.");
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setSelectedTeacher(null);
  };

  const filteredTeachers = teachers.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" size={40} /></div>;

  return (
    <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
          <p className="text-slate-500">
             {userRole === 'admin' ? 'Manage teachers, availability, and employment details.' : 'View staff roster and download schedules.'}
          </p>
        </div>
        
        {userRole === 'admin' && (
            <button 
              onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm"
            >
              <Plus size={18} /> Add Teacher
            </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={20} />
          <input 
            placeholder="Search by name or email..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Grid / List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTeachers.map(teacher => (
            <div key={teacher.id} className={`bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col gap-4 relative group ${clashes[teacher.id] ? 'border-red-300 shadow-red-50' : 'border-slate-200'}`}>
                
                {/* Card Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: teacher.color || '#3b82f6' }}
                        >
                            {teacher.name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                            <div className="font-bold text-slate-800">{teacher.name}</div>
                            <div className="text-xs font-bold text-slate-400 uppercase">{teacher.employment_type || 'Casual'}</div>
                            
                            {clashes[teacher.id] && (
                                <button 
                                    onClick={() => alert(`⚠️ Clashes detected for ${teacher.name}:\n\n` + clashes[teacher.id].join('\n\n'))}
                                    className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-bold border border-red-200 hover:bg-red-100 transition-colors w-fit"
                                    title="Click to view clash details"
                                >
                                    <AlertTriangle size={12} /> {clashes[teacher.id].length} Clash{clashes[teacher.id].length !== 1 ? 'es' : ''}
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {userRole === 'admin' && (
                        <button 
                            onClick={() => handleEdit(teacher)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                            <Edit2 size={18} />
                        </button>
                    )}
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm text-slate-600 mt-2">
                    <div className="flex items-center gap-2">
                        <Mail size={16} className="text-slate-400" />
                        {teacher.email}
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-slate-400" />
                        {teacher.time_fraction ? `${teacher.time_fraction} FTE` : 'No FTE Set'}
                         <span className="text-slate-300">|</span>
                        {teacher.max_hours} hrs/yr
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${teacher.trains_online ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
                        {teacher.trains_online ? 'Online Only' : 'On Campus'}
                    </span>

                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => handleDownloadPDF(teacher)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Print Schedule PDF"
                        >
                            <FileText size={16} />
                        </button>
                        
                        <button 
                            onClick={() => handleDownloadICS(teacher)}
                            className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="Download iCal"
                        >
                            <Download size={16} />
                        </button>
                        
                        {userRole === 'admin' && (
                            <>
                                <div className="w-px h-4 bg-slate-200 mx-1"></div>
                                <button 
                                    onClick={() => handleDelete(teacher.id)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        ))}

        {filteredTeachers.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400">
                No teachers found. Click "Add Teacher" to start.
            </div>
        )}
      </div>

      {isFormOpen && userRole === 'admin' && (
        <TeacherForm 
            initialData={selectedTeacher}
            onClose={handleCloseForm}
            onSuccess={() => {
                handleCloseForm();
                loadData();
            }}
        />
      )}

    </div>
  );
};
