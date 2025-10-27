import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Toast as ToastType } from '../hooks/useToast';

interface ToastProps {
  toast: ToastType;
  onClose: (id: number) => void;
}

const icons = {
  error: <AlertTriangle className="h-6 w-6 text-red-300" />,
};

const bgColors = {
  error: 'bg-red-900/90 border-red-700/50 backdrop-blur-sm',
};

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  return (
    <div className={`w-full max-w-md rounded-lg shadow-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 border ${bgColors[toast.type]}`}>
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0 pt-0.5">
            {icons[toast.type]}
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-white">
              AI Assistant Error
            </p>
            <p className="mt-1 text-sm text-gray-300">
              {toast.message}
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-700">
        <button
          onClick={() => onClose(toast.id)}
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default Toast;
