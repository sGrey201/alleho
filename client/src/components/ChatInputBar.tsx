import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Loader2,
  Send,
  Paperclip,
  Image,
  ClipboardList,
  ListChecks,
  MessageCircle,
  Pill,
  FileText,
  Mic,
  Trash2,
  ArrowUp,
  Lock,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { syncChatTextareaHeight } from "@/lib/chatTextareaAutosize";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import {
  useVoiceRecorder,
  isVoiceRecordingSupported,
  type RecordedVoice,
} from "@/hooks/useVoiceRecorder";

export type ChatMessageMode = "message" | "prescription" | "followup";

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
  onSendQuestionnaire?: () => void;
  showQuestionnaireAttach?: boolean;
  onCreatePoll?: () => void;
  showMessageModeSelector?: boolean;
  messageMode?: ChatMessageMode;
  onMessageModeChange?: (mode: ChatMessageMode) => void;
  /** When provided, an empty composer shows a mic button that records & sends voice. */
  onSendVoice?: (clip: RecordedVoice) => Promise<void> | void;
  isSendingVoice?: boolean;
};

export type ChatInputBarHandle = {
  focusInput: () => void;
};

const CANCEL_DRAG_PX = 90;
const LOCK_DRAG_PX = 70;
const MIN_RECORDING_MS = 700;

function formatRecordTime(ms: number): string {
  const totalCentis = Math.floor(ms / 10);
  const minutes = Math.floor(totalCentis / 6000);
  const seconds = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")},${String(centis).padStart(2, "0")}`;
}

const ChatInputBar = forwardRef<ChatInputBarHandle, ChatInputBarProps>(function ChatInputBar({
  value,
  placeholder,
  onChange,
  onSend,
  isSending = false,
  disabled = false,
  wrapperClassName = "border-t px-4 py-3 shrink-0",
  onUploadImages,
  isUploadingImages = false,
  onSendQuestionnaire,
  showQuestionnaireAttach = false,
  onCreatePoll,
  showMessageModeSelector = false,
  messageMode = "message",
  onMessageModeChange,
  onSendVoice,
  isSendingVoice = false,
}, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = !!value.trim();
  const isSendDisabled = disabled || !hasText || isSending;

  const voiceRecorder = useVoiceRecorder();
  const [voiceSupported] = useState(() => isVoiceRecordingSupported());
  const [locked, setLocked] = useState(false);
  const [willCancel, setWillCancel] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef(false);

  const canRecordVoice = !!onSendVoice && voiceSupported && !disabled;
  const showMicButton = !hasText && canRecordVoice;
  const isRecording = voiceRecorder.status === "recording" || voiceRecorder.status === "requesting";

  const showAttachMenu =
    !hasText &&
    !isRecording &&
    (onUploadImages || (showQuestionnaireAttach && onSendQuestionnaire) || onCreatePoll);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    },
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || value !== "") return;
    syncChatTextareaHeight(el);
  }, [value]);

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    onChange(nextValue);
    syncChatTextareaHeight(e.target);
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

  const resetRecordingUi = () => {
    setLocked(false);
    setWillCancel(false);
    lockedRef.current = false;
    dragStartRef.current = null;
  };

  const finishAndSend = async () => {
    const tooShort = voiceRecorder.elapsedMs < MIN_RECORDING_MS;
    const clip = await voiceRecorder.stop();
    resetRecordingUi();
    if (clip && !tooShort && onSendVoice) {
      await onSendVoice(clip);
    }
  };

  const discardRecording = async () => {
    await voiceRecorder.cancel();
    resetRecordingUi();
  };

  const handleMicPointerDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canRecordVoice || isRecording) return;
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    await voiceRecorder.start();
  };

  const handleMicPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isRecording || lockedRef.current || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (dx < -CANCEL_DRAG_PX) {
      void discardRecording();
      return;
    }
    if (dy < -LOCK_DRAG_PX) {
      lockedRef.current = true;
      setLocked(true);
      return;
    }
    setWillCancel(dx < -CANCEL_DRAG_PX / 2);
  };

  const handleMicPointerUp = async (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (!isRecording || lockedRef.current) return;
    await finishAndSend();
  };

  if (isRecording) {
    return (
      <div className={wrapperClassName}>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-[22px] bg-[#f7f3e8] px-4 py-2.5 shadow-sm dark:bg-muted",
              willCancel && "opacity-70",
            )}
          >
            <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="shrink-0 text-sm tabular-nums text-foreground">
              {formatRecordTime(voiceRecorder.elapsedMs)}
            </span>
            {locked ? (
              <button
                type="button"
                onClick={discardRecording}
                className="ml-auto text-sm font-medium text-primary"
              >
                {t.voiceRecordCancel}
              </button>
            ) : (
              <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
                <ChevronLeft className="h-4 w-4" />
                {t.voiceRecordSlideToCancel}
              </span>
            )}
          </div>

          {locked ? (
            <Button
              size="icon"
              onClick={finishAndSend}
              disabled={isSendingVoice}
              className="h-10 w-10 shrink-0 rounded-full"
              aria-label={t.voiceRecordSend}
            >
              {isSendingVoice ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-5 w-5" />
              )}
            </Button>
          ) : (
            <div className="relative flex shrink-0 flex-col items-center">
              <span className="absolute -top-9 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 shadow">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <button
                type="button"
                onPointerMove={handleMicPointerMove}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={discardRecording}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition-transform",
                  willCancel ? "bg-red-500 scale-110" : "bg-primary scale-110",
                )}
                aria-label={t.voiceRecordSend}
              >
                <Mic className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <div className="flex items-end gap-2">
        {showAttachMenu && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={disabled || isSending || isUploadingImages}
                  className="h-10 w-10 shrink-0 rounded-full bg-[#e8ecf1] text-[#28292c]"
                  data-testid="button-attach-menu"
                >
                  {isUploadingImages ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {onUploadImages && (
                  <DropdownMenuItem
                    onSelect={() => document.getElementById("chat-image-upload")?.click()}
                  >
                    <Image className="mr-2 h-4 w-4" />
                    {t.messagePhotoLabel ?? "Фото"}
                  </DropdownMenuItem>
                )}
                {showQuestionnaireAttach && onSendQuestionnaire && (
                  <DropdownMenuItem onSelect={onSendQuestionnaire}>
                    <ClipboardList className="mr-2 h-4 w-4" />
                    {t.questionnaire}
                  </DropdownMenuItem>
                )}
                {onCreatePoll && (
                  <DropdownMenuItem onSelect={onCreatePoll}>
                    <ListChecks className="mr-2 h-4 w-4" />
                    {t.pollCreate}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {onUploadImages && (
              <input
                id="chat-image-upload"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            )}
          </>
        )}
        <div className="relative min-w-0 flex-1">
          {showMessageModeSelector && onMessageModeChange && (
            <div className="absolute bottom-1.5 right-2 z-10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || isSending}
                    className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                    data-testid="button-message-mode"
                  >
                    {messageMode === "prescription" ? (
                      <Pill className="h-4 w-4" />
                    ) : messageMode === "followup" ? (
                      <FileText className="h-4 w-4" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onMessageModeChange("message")}>
                    Сообщение
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onMessageModeChange("prescription")}>
                    {t.prescription}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onMessageModeChange("followup")}>
                    {t.followup}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={value}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            rows={1}
            className={cn(
              "min-h-[36px] resize-none overflow-y-auto rounded-[22px] text-sm leading-snug md:text-sm",
              showMessageModeSelector && onMessageModeChange && "pr-10",
            )}
            style={{ maxHeight: "144px" }}
            data-testid="input-message"
          />
        </div>
        {showMicButton ? (
          <Button
            size="icon"
            type="button"
            onPointerDown={handleMicPointerDown}
            onPointerMove={handleMicPointerMove}
            onPointerUp={handleMicPointerUp}
            disabled={isSendingVoice}
            className="h-10 w-10 shrink-0 touch-none select-none rounded-full"
            data-testid="button-record-voice"
            aria-label={t.voiceRecordStart}
          >
            {isSendingVoice ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={onSend}
            disabled={isSendDisabled}
            className="h-10 w-10 shrink-0 rounded-full disabled:!opacity-60"
            data-testid="button-send-message"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
});

export default ChatInputBar;
