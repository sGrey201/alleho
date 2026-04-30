import { Loader2, Send, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatInputBarProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending?: boolean;
  disabled?: boolean;
  wrapperClassName?: string;
  onUploadImages?: (files: File[]) => Promise<void> | void;
  isUploadingImages?: boolean;
};

export default function ChatInputBar({
  value,
  placeholder,
  onChange,
  onSend,
  isSending = false,
  disabled = false,
  wrapperClassName = "border-t px-4 py-3 shrink-0",
  onUploadImages,
  isUploadingImages = false,
}: ChatInputBarProps) {
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    onChange(nextValue);

    const el = e.target;
    el.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = lineHeight * 6;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onUploadImages) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await onUploadImages(Array.from(files));
    e.target.value = "";
  };

  return (
    <div className={wrapperClassName}>
      <div className="flex items-end gap-2">
        {!value.trim() && onUploadImages && (
          <>
            <Button
              variant="outline"
              size="icon"
              disabled={disabled || isSending || isUploadingImages}
              onClick={() => document.getElementById("chat-image-upload")?.click()}
              className="rounded-full shrink-0 bg-[#e8ecf1] text-[#28292c] h-10 w-10"
              data-testid="button-upload-photo"
            >
              {isUploadingImages ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Image className="h-4 w-4" />
              )}
            </Button>
            <input
              id="chat-image-upload"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
        <div className="relative flex-1">
          <Textarea
            placeholder={placeholder}
            value={value}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            rows={1}
            className="min-h-[36px] resize-none overflow-y-auto rounded-full"
            style={{ maxHeight: "144px" }}
            data-testid="input-message"
          />
        </div>
        <Button
          size="icon"
          onClick={onSend}
          disabled={disabled || !value.trim() || isSending}
          className="rounded-full shrink-0 h-10 w-10 disabled:opacity-20"
          data-testid="button-send-message"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
