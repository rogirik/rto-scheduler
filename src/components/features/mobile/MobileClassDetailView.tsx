import React from 'react';
import { ChevronLeft, Clock, MapPin, BookOpen, GraduationCap } from 'lucide-react';

export const MobileClassDetailView = ({ event, onBack }: { event: any, onBack: () => void }) => {
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  
  const formatTime = (date: Date) => date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden animate-in slide-in-from-right-8 duration-300">
      
      {/* Header with Back Button */}
      <div className="bg-blue-600 px-4 pt-12 pb-6 shadow-md flex items-start gap-3 shrink-0">
        <button onClick={onBack} className="p-2 -ml-2 mt-1 text-blue-100 hover:text-white hover:bg-blue-700 rounded-full transition-colors">
          <ChevronLeft size={28} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white leading-tight pr-4">{event.summary}</h1>
          <p className="text-blue-200 text-sm mt-1 font-medium">Session Details</p>
        </div>
      </div>

      {/* Logistics Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        
        {/* Time & Location */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-50 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Time</p>
              <p className="text-slate-800 font-medium">
                {formatTime(startDate)} - {formatTime(endDate)}
              </p>
              <p className="text-slate-500 text-sm">{Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60))} Hours</p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <MapPin size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Location</p>
              <p className="text-slate-800 font-medium">Room 102</p>
              <p className="text-slate-500 text-sm">Main Campus</p>
            </div>
          </div>
        </div>

        {/* Academic Details */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-50 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
              <GraduationCap size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Cohort</p>
              <p className="text-slate-800 font-medium leading-tight">{event.instanceName}</p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
              <BookOpen size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Unit</p>
              <p className="text-slate-800 font-medium">{event.summary}</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};