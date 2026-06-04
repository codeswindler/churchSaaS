import { ArrowUp, ChevronLeft, MoreVertical, Plus } from 'lucide-react';

interface SmsPhonePreviewProps {
  message: string;
  sender?: string;
  timestamp?: string;
}

export default function SmsPhonePreview({
  message,
  sender = 'Choice SMS',
  timestamp = 'Today, 12:34 PM',
}: SmsPhonePreviewProps) {
  const previewMessage =
    message.trim() || 'Your message preview will appear here as you type.';

  return (
    <aside className="sms-phone-preview" aria-label="SMS phone preview">
      <div className="sms-phone-preview__device">
        <div className="sms-phone-preview__screen">
          <div className="sms-phone-preview__status">
            <span>9:41</span>
            <span>4G</span>
          </div>
          <div className="sms-phone-preview__header">
            <ChevronLeft className="sms-phone-preview__back" size={20} />
            <strong>{sender}</strong>
            <MoreVertical className="sms-phone-preview__menu" size={18} />
          </div>
          <div className="sms-phone-preview__thread">
            <p className="sms-phone-preview__meta">Text Message</p>
            <p className="sms-phone-preview__time">{timestamp}</p>
            <div className="sms-phone-preview__bubble">{previewMessage}</div>
          </div>
          <div className="sms-phone-preview__composer">
            <span className="sms-phone-preview__add">
              <Plus size={18} />
            </span>
            <span className="sms-phone-preview__placeholder">Text message</span>
            <span className="sms-phone-preview__send">
              <ArrowUp size={16} />
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
