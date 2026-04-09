import React from 'react';
import { GraduationCap, ChevronRight, Plus } from 'lucide-react';
import { useData } from '../../../hooks/useData';
import type { Course } from '../../../services/api';

export const CourseTemplateList = () => {
  const { data: templates, loading } = useData<Course>('course_templates');

  if (loading) return <div className="p-8 text-center text-slate-500">Loading templates...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Qualification Templates</h3>
          <p className="text-slate-500 text-sm">Define the structure of your courses</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium text-sm">
          <Plus size={16} /> New Template
        </button>
      </div>

      <div className="space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors group cursor-pointer bg-slate-50">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">{template.name}</h4>
                  <div className="text-sm text-slate-500 font-mono">{template.code} • {(template.sequenced_subjects || []).length} Units</div>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-500" />
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-center py-8 text-slate-400 border border-dashed border-slate-300 rounded-lg">
            No templates found.
          </div>
        )}
      </div>
    </div>
  );
};