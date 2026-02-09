import { ApiService } from './api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- SHARED TYPES ---
interface ScheduleEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  teacherName: string;
  subjectName: string;
  courseName: string;
  room: string;
}

// Helper to check if a date string matches a Date object
const isSameDate = (date1: Date, dateStr: string) => {
  const d1 = date1.toISOString().split('T')[0];
  return d1 === dateStr;
};

// Helper to check if a date falls within a range
const isWithinRange = (date: Date, startStr: string, endStr: string) => {
  const d = new Date(date);
  const start = new Date(startStr);
  const end = new Date(endStr);
  // Reset times to ensure pure date comparison
  d.setHours(0,0,0,0);
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);
  return d >= start && d <= end;
};

export const ExportService = {

  // 1. CALCULATE DATES (Now with Holiday/Term Logic)
  async calculateSchedule(filterType: 'teacher' | 'course', filterId: string) {
    // 1. Fetch EVERYTHING needed (including Academic Years)
    const [teachers, instances, allocations, subjects, academicData] = await Promise.all([
      ApiService.getAll<any>('teachers'),
      ApiService.getCourseInstances(),
      ApiService.getAllocationsGlobal(),
      ApiService.getAll<any>('subjects'),
      ApiService.getAcademicYear('2026') // Assuming 2026, or we could fetch based on instance start
    ]);

    const subjectMap = new Map(subjects.map((s: any) => [s.id, s]));
    const teacherMap = new Map(teachers.map((t: any) => [t.id, t]));
    const instanceMap = new Map(instances.map((i: any) => [i.id, i]));
    
    // 2. Prepare Holiday/Term Lookup
    // Defaulting to VIC rules based on your profile, but this could be dynamic
    const stateCode = 'VIC'; 
    
    const publicHolidays = (academicData?.holidays || []).filter((h: any) => {
      // Keep if it's National (no brackets) or specifically for this state
      const isNational = !h.name.includes('(');
      const isState = h.name.includes(`(${stateCode})`);
      return isNational || isState;
    });

    const schoolTerms = (academicData?.terms || []).filter((t: any) => 
      t.name.startsWith(`${stateCode} -`) || !t.name.includes('-')
    );

    const events: ScheduleEvent[] = [];

    // Group allocations
    const allocationsByInstance: Record<string, any[]> = {};
    allocations.forEach((alloc: any) => {
      if (!allocationsByInstance[alloc.instance_id]) allocationsByInstance[alloc.instance_id] = [];
      allocationsByInstance[alloc.instance_id].push(alloc);
    });

    // 3. Process Timelines
    Object.keys(allocationsByInstance).forEach(instanceId => {
      const instance = instanceMap.get(instanceId);
      if (!instance) return;

      if (filterType === 'course' && instance.id !== filterId) return;

      const instanceAllocations = allocationsByInstance[instanceId].sort((a, b) => a.id.localeCompare(b.id));

      let cursorDate = new Date(instance.start_date);
      const allowedDays = Array.isArray(instance.days_of_week) ? instance.days_of_week : [1,2,3,4,5];
      const [startHour, startMinute] = (instance.start_time || "09:00").split(':').map(Number);
      const dailySessionHours = instance.hours_per_session || 7;

      instanceAllocations.forEach((alloc) => {
        const teacher = teacherMap.get(alloc.teacher_id);
        const subject = subjectMap.get(alloc.subject_id);

        if (!teacher || !subject) return;

        const isForSelectedTeacher = filterType === 'teacher' && teacher.id === filterId;
        const isForSelectedCourse = filterType === 'course';

        let hoursRemaining = subject.nominal_hours || 40;

        while (hoursRemaining > 0) {
          if (cursorDate > new Date(instance.end_date)) break;

          // --- SKIP CHECK 1: Public Holidays ---
          const isHoliday = publicHolidays.some((h: any) => isSameDate(cursorDate, h.date));
          
          // --- SKIP CHECK 2: School Holidays (Outside Term Time) ---
          // Only enforce this if we actually have terms defined in settings
          let isSchoolHoliday = false;
          if (schoolTerms.length > 0) {
            const inAnyTerm = schoolTerms.some((t: any) => isWithinRange(cursorDate, t.start, t.end));
            if (!inAnyTerm) isSchoolHoliday = true;
          }

          if (isHoliday || isSchoolHoliday) {
            // Skip this day, do not deduct hours, just move date forward
            cursorDate.setDate(cursorDate.getDate() + 1);
            continue; 
          }

          // --- STANDARD SCHEDULING ---
          if (allowedDays.includes(cursorDate.getDay())) {
            const hoursToday = Math.min(hoursRemaining, dailySessionHours);
            const sessionStart = new Date(cursorDate);
            sessionStart.setHours(startHour, startMinute, 0);
            const sessionEnd = new Date(sessionStart);
            sessionEnd.setTime(sessionStart.getTime() + (hoursToday * 60 * 60 * 1000));

            if (isForSelectedTeacher || isForSelectedCourse) {
              events.push({
                id: `${alloc.id}-${cursorDate.toISOString()}`,
                title: subject.name,
                start: sessionStart,
                end: sessionEnd,
                teacherName: teacher.name,
                subjectName: subject.name,
                courseName: instance.name,
                room: 'Room 101'
              });
            }
            hoursRemaining -= hoursToday;
          }
          
          // Move to next day if we still have hours to burn
          if (hoursRemaining > 0 || Math.abs(hoursRemaining) < 0.1) {
             cursorDate.setDate(cursorDate.getDate() + 1);
          }
        }
      });
    });

    return events;
  },

  // 2. GENERATE TEACHER CALENDAR (Visual Month View - Unchanged)
  generateTrainerCalendarPDF(events: ScheduleEvent[], teacherName: string) {
    if (events.length === 0) { alert('No classes found for this teacher.'); return; }
    
    const sortedEvents = [...events].sort((a,b) => a.start.getTime() - b.start.getTime());
    const startDate = sortedEvents[0].start;
    const endDate = sortedEvents[sortedEvents.length - 1].start;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const finalMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (currentMonth <= finalMonth) {
      if (currentMonth > new Date(startDate.getFullYear(), startDate.getMonth(), 1)) doc.addPage();
      
      const year = currentMonth.getFullYear();
      const monthIndex = currentMonth.getMonth();
      const monthName = currentMonth.toLocaleString('default', { month: 'long' });

      doc.setFillColor(59, 130, 246); doc.rect(0, 0, 297, 25, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.text(`${monthName} ${year}`, 15, 17);
      doc.setFontSize(12); doc.text(`Trainer: ${teacherName}`, 280, 17, { align: 'right' });

      const startX = 10; const startY = 35; const cellWidth = 39.5; const cellHeight = 28;
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      doc.setTextColor(100); doc.setFontSize(10);
      daysOfWeek.forEach((day, i) => doc.text(day, startX + (i * cellWidth) + 2, startY - 2));

      const firstDayOfMonth = new Date(year, monthIndex, 1).getDay();
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      let xPos = firstDayOfMonth; let yPos = 0;

      doc.setDrawColor(200); doc.setTextColor(0);

      for (let day = 1; day <= daysInMonth; day++) {
        const currentX = startX + (xPos * cellWidth); const currentY = startY + (yPos * cellHeight);
        doc.rect(currentX, currentY, cellWidth, cellHeight);
        doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text(day.toString(), currentX + 2, currentY + 5);

        const dayEvents = sortedEvents.filter(e => e.start.getDate() === day && e.start.getMonth() === monthIndex && e.start.getFullYear() === year);
        
        let eventY = currentY + 10;
        dayEvents.forEach(evt => {
          doc.setFontSize(7); doc.setFont("helvetica", "normal");
          const text = evt.subjectName.length > 20 ? evt.subjectName.substring(0, 18) + '...' : evt.subjectName;
          doc.setTextColor(0, 0, 0); doc.text(`• ${text}`, currentX + 2, eventY);
          doc.setTextColor(100); doc.setFontSize(6); doc.text(evt.courseName.substring(0, 20), currentX + 4, eventY + 3);
          eventY += 7;
        });
        xPos++; if (xPos > 6) { xPos = 0; yPos++; }
      }
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
    doc.save(`${teacherName}_Schedule.pdf`);
  },

  // 3. GENERATE DETAILED SESSION LIST (Detailed Table)
  generateCourseTimetablePDF(events: ScheduleEvent[], courseName: string) {
    if (events.length === 0) { alert('No classes scheduled for this course.'); return; }

    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(59, 130, 246);
    doc.text(`Course Schedule: ${courseName}`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);

    // Sort by Date
    const sortedEvents = events.sort((a,b) => a.start.getTime() - b.start.getTime());

    // Create Detailed Rows
    const tableData = sortedEvents.map(e => [
      e.start.toLocaleDateString(), 
      e.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
      e.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),   
      e.subjectName,
      e.teacherName,
      e.room
    ]);

    // Draw Table
    autoTable(doc, {
      startY: 35,
      head: [['Date', 'Start Time', 'End Time', 'Unit / Subject', 'Trainer', 'Location']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 25 }, 
        1: { cellWidth: 20 }, 
        2: { cellWidth: 20 }, 
        3: { cellWidth: 'auto' }, 
        4: { cellWidth: 30 }, 
        5: { cellWidth: 25 }  
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Note: Dates subject to change.", 14, finalY);

    doc.save(`${courseName.replace(/\s+/g, '_')}_Detailed_Schedule.pdf`);
  }
};