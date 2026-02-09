import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import type { Teacher, CourseInstance, UnitAllocation, Course, Subject, AcademicYear } from '../../../services/api';
import { generateAllEventsForInstance } from '../../../utils/scheduler';
import { 
  Plus, 
  Search, 
  Mail, 
  Edit2, 
  Trash2, 
  Loader2,
  FileText, // For PDF
  Calendar, // For iCal
  Download
} from 'lucide-react';
import { TeacherForm } from './TeacherForm';

export const TeacherList = () => {
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null); // Track which teacher is downloading
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  useEffect(() => {
    loadTeachers();
  }, []);

  const loadTeachers = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getTeachers();
      setTeachers(data);
    } catch (error) {
      console.error("Failed to load teachers", error);
    } finally {
      setLoading(false);
    }
  };

  // --- HELPER: GENERATE SCHEDULE FOR ONE TEACHER ---
  // This fetches all necessary data on-demand to avoid slowing down the initial page load
  const fetchTeacherSchedule = async (teacherId: string) => {
      // 1. Fetch all context data needed to calculate the schedule
      const [allocations, instances, templates, subjects, academicYears] = await Promise.all([
          ApiService.getAllocationsGlobal(),
          ApiService.getCourseInstances(),
          ApiService.getAll<Course>('course_templates'),
          ApiService.getSubjects(),
          ApiService.getAll<AcademicYear>('academic_years')
      ]);

      // 2. Filter allocations for this teacher
      const myAllocations = allocations.filter(a => a.teacher_id === teacherId);
      if (myAllocations.length === 0) return [];

      // 3. Find which courses they are teaching in
      const myInstanceIds = new Set(myAllocations.map(a => a.instance_id));
      const myInstances = instances.filter(i => myInstanceIds.has(i.id));

      let allEvents: any[] = [];

      // 4. Generate events for each course
      myInstances.forEach(instance => {
          if (instance.status === 'completed') return;

          const template = templates.find(t => t.id === instance.template_id);
          if (!template) return;

          // Generate ALL events for the course
          const courseEvents = generateAllEventsForInstance(
              instance,
              academicYears,
              template,
              subjects,
              teachers // Pass full teacher list for context if needed
          );

          // 5. FILTER: Keep only events where THIS teacher is assigned to the subject
          const mySubjectsInThisCourse = new Set(
              myAllocations
                  .filter(a => a.instance_id === instance.id)
                  .map(a => a.subject_id)
          );

          const myEvents = courseEvents.filter(ev => mySubjectsInThisCourse.has(ev.subjectId));
          allEvents = [...allEvents, ...myEvents];
      });

      // 6. Sort by Date
      return allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
  };

  // --- ACTION: DOWNLOAD PDF ---
  const handleDownloadPDF = async (teacher: Teacher) => {
      setDownloadingId(teacher.id);
      try {
          const events = await fetchTeacherSchedule(teacher.id);
          if (events.length === 0) {
              alert(`No active classes found for ${teacher.name}.`);
              return;
          }

          const printWindow = window.open('', '', 'height=800,width=800');
          if (!printWindow) return;

          printWindow.document.write(`
            <html>
              <head>
                <title>Schedule - ${teacher.name}</title>
                <style>
                  body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #1e293b; }
                  h1 { color: #0f172a; margin-bottom: 5px; font-size: 24px; }
                  .meta { color: #64748b; margin-bottom: 30px; font-size: 14px; }
                  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                  th { background-color: ${teacher.color || '#3b82f6'}; color: white; padding: 12px 15px; text-align: left; }
                  td { border-bottom: 1px solid #e2e8f0; padding: 12px 15px; }
                  tr:nth-child(even) { background-color: #f8fafc; }
                </style>
              </head>
              <body>
                <h1>${teacher.name}</h1>
                <div class="meta">Generated on ${new Date().toLocaleDateString()}</div>
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
                    ${events.map(ev => `
                      <tr>
                        <td>${ev.start.toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'})}</td>
                        <td>${ev.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${ev.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                        <td><strong>${ev.courseName}</strong></td>
                        <td>${ev.summary}</td>
                        <td>${ev.deliveryMode === 'Online' ? 'Online' : 'Room 101'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                <script>window.onload = function() { window.print(); }</script>
              </body>
            </html>
          `);
          printWindow.document.close();

      } catch (e) {
          console.error(e);
          alert("Failed to generate PDF.");
      } finally {
          setDownloadingId(null);
      }
  };

  // --- ACTION: DOWNLOAD iCAL (.ics) ---
  const handleDownloadICS = async (teacher: Teacher) => {
      setDownloadingId(teacher.id);
      try {
          const events = await fetchTeacherSchedule(teacher.id);
          if (events.length === 0) {
              alert(`No active classes found for ${teacher.name}.`);
              return;
          }

          // Generate iCalendar format
          let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//AcademicScheduler//TeacherCalendar//EN\n";
          
          events.forEach(ev => {
              // Format dates to YYYYMMDDTHHmmSS (Local Time)
              const formatTime = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
              
              icsContent += "BEGIN:VEVENT\n";
              icsContent += `SUMMARY:${ev.summary} (${ev.courseName})\n`;
              icsContent += `DTSTART:${formatTime(ev.start)}\n`;
              icsContent += `DTEND:${formatTime(ev.end)}\n`;
              icsContent += `DESCRIPTION:Cohort: ${ev.courseName}\\nSubject: ${ev.summary}\n`;
              icsContent += `LOCATION:${ev.deliveryMode === 'Online' ? 'Online' : 'Room 101'}\n`;
              icsContent += "END:VEVENT\n";
          });

          icsContent += "END:VCALENDAR";

          // Trigger Download
          const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute("download", `${teacher.name.replace(/\s+/g, '_')}_Schedule.ics`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

      } catch (e) {
          console.error(e);
          alert("Failed to generate iCal file.");
      } finally {
          setDownloadingId(null);
      }
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
      loadTeachers();
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

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
          <p className="text-slate-500">Manage teachers, availability, and employment details.</p>
        </div>
        <button 
          onClick={handleAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-sm"
        >
          <Plus size={18} /> Add Teacher
        </button>
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
            <div key={teacher.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 relative group">
                
                {/* Card Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: teacher.color || '#3b82f6' }}
                        >
                            {teacher.name.charAt(0)}
                        </div>
                        <div>
                            <div className="font-bold text-slate-800">{teacher.name}</div>
                            <div className="text-xs font-bold text-slate-400 uppercase">{teacher.employment_type || 'Casual'}</div>
                        </div>
                    </div>
                    <button 
                        onClick={() => handleEdit(teacher)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                        <Edit2 size={18} />
                    </button>
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm text-slate-600">
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
                        {/* --- NEW EXPORT BUTTONS --- */}
                        <button 
                            onClick={() => handleDownloadPDF(teacher)}
                            disabled={downloadingId === teacher.id}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Print Schedule PDF"
                        >
                            {downloadingId === teacher.id ? <Loader2 className="animate-spin" size={16}/> : <FileText size={16} />}
                        </button>
                        
                        <button 
                            onClick={() => handleDownloadICS(teacher)}
                            disabled={downloadingId === teacher.id}
                            className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="Download iCal"
                        >
                            <Download size={16} />
                        </button>
                        {/* ------------------------- */}
                        
                        <div className="w-px h-4 bg-slate-200 mx-1"></div>

                        <button 
                            onClick={() => handleDelete(teacher.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
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

      {/* --- MODAL RENDERING --- */}
      {isFormOpen && (
        <TeacherForm 
            initialData={selectedTeacher}
            onClose={handleCloseForm}
            onSuccess={() => {
                handleCloseForm();
                loadTeachers();
            }}
        />
      )}

    </div>
  );
};