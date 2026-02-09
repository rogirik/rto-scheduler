import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import type { Subject } from '../../../services/api';
import { X, Save, Loader2, BookOpen } from 'lucide-react';

interface SubjectFormProps {
  initialData?: Subject | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SubjectForm = ({ initialData, onClose, onSuccess }: SubjectFormProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hours: 40 // Default planning hours
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        hours: initialData.hours || 40
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (initialData) {
        await ApiService.updateSubject(initialData.id, formData);
      } else {
        await ApiService.createSubject(formData);
      }
      onSuccess();
    } catch (error) {
      alert('Failed to save subject');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="text-blue-600" size={20} />
            {initialData ? 'Edit Subject' : 'Add New Subject'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Subject Name</label>
            <input
              required
              placeholder="e.g. Communication Skills"
              className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* Hours (Planning) */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Planning Hours</label>
            <input
              type="number"
              min="1"
              className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.hours}
              onChange={e => setFormData({ ...formData, hours: Number(e.target.value) })}
            />
            <p className="text-xs text-slate-400 mt-1">Estimated total hours for allocation planning.</p>
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Description (Optional)</label>
            <textarea
              rows={3}
              className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          {/* FOOTER ACTIONS */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {loading && <Loader2 className="animate-spin" size={16} />}
              {loading ? 'Saving...' : 'Save Subject'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};