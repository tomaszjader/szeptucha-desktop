import React from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "info" | "success" | "error";
}

export const Toast: React.FC<ToastProps> = ({ message, type = "info" }) => {
  if (!message) return null;

  const renderIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={18} className="toast-icon success" />;
      case "error":
        return <AlertCircle size={18} className="toast-icon error" />;
      default:
        return <Info size={18} className="toast-icon info" />;
    }
  };

  return (
    <div className={`toast toast-${type}`}>
      {renderIcon()}
      <span>{message}</span>
    </div>
  );
};
