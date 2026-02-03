import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { Loader2, Send, FileText, Image, ArrowLeft, Pill, X } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { useUpload } from "@/hooks/use-upload";

interface Author {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isAdmin?: boolean;
}

interface HealthWallMessage {
  id: string;
  patientUserId: string;
  authorUserId: string;
  messageType: 'message' | 'prescription' | 'followup';
  content?: string;
  imageUrl?: string;
  createdAt: string;
  author: Author;
}

interface PatientInfo {
  id: string;
  email?: string;
  patientName?: string;
  birthMonth?: number;
  birthYear?: number;
  gender?: string;
}

export default function HealthWall() {
  const { isAuthenticated, isLoading: authLoading, isAdmin, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [messageMode, setMessageMode] = useState<'message' | 'prescription' | 'followup'>('message');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [, patientParams] = useRoute("/health-wall/:patientUserId");
  const patientUserId = patientParams?.patientUserId || user?.id;
  const isOwnWall = patientUserId === user?.id;

  const { uploadFile, isUploading: uploadingPhoto } = useUpload({
    onSuccess: async (response) => {
      await sendMessageMutation.mutateAsync({
        content: '',
        imageUrl: response.objectPath,
        messageType: 'message',
      });
    },
    onError: (error) => {
      toast({
        title: t.error,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<HealthWallMessage[]>({
    queryKey: ['/api/health-wall', patientUserId],
    enabled: isAuthenticated && !!patientUserId,
  });

  const { data: patientInfo } = useQuery<PatientInfo>({
    queryKey: ['/api/health-wall', patientUserId, 'info'],
    enabled: isAuthenticated && !!patientUserId && !isOwnWall,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { content?: string; imageUrl?: string; messageType: string }) => {
      return apiRequest('POST', `/api/health-wall/${patientUserId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-wall', patientUserId] });
      setMessage('');
      setMessageMode('message');
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.somethingWrong,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/auth');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (authLoading || messagesLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleSendMessage = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate({
      content: message.trim(),
      messageType: messageMode,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      await uploadFile(file);
    }
    e.target.value = '';
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return `${t.today}, ${format(date, 'HH:mm')}`;
    }
    if (isYesterday(date)) {
      return `${t.yesterday}, ${format(date, 'HH:mm')}`;
    }
    return format(date, 'd MMMM, HH:mm', { locale: ru });
  };

  const getAuthorName = (author: Author) => {
    if (author.firstName) {
      return author.firstName;
    }
    return author.email?.split('@')[0] || 'User';
  };

  const displayName = isOwnWall 
    ? t.healthWall 
    : patientInfo?.patientName || patientInfo?.email?.split('@')[0] || t.patient;

  const handleBackClick = () => {
    if (isOwnWall) {
      setLocation('/');
    } else {
      setLocation('/my-patients');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBackClick}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold" data-testid="text-health-wall-title">
            {isOwnWall ? t.healthWall : displayName}
          </h1>
          {!isOwnWall && patientInfo && (
            <p className="text-sm text-muted-foreground">
              {patientInfo.birthMonth && patientInfo.birthYear && (
                <span>{patientInfo.birthMonth.toString().padStart(2, '0')}.{patientInfo.birthYear}</span>
              )}
            </p>
          )}
        </div>
        <Link href={isOwnWall ? '/questionnaire' : `/patient/${patientUserId}`}>
          <Button variant="outline" size="sm" data-testid="button-view-questionnaire">
            <FileText className="h-4 w-4 mr-2" />
            {t.questionnaire}
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages && messages.length > 0 ? (
          <>
            {messages.map((msg) => {
              const isOwnMessage = msg.authorUserId === user?.id;
              const isPrescription = msg.messageType === 'prescription';
              const isFollowup = msg.messageType === 'followup';

              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                  data-testid={`message-${msg.id}`}
                >
                  <Card 
                    className={`max-w-[85%] ${
                      isPrescription 
                        ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                        : isFollowup
                          ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800'
                          : isOwnMessage 
                            ? 'bg-primary/10' 
                            : ''
                    }`}
                  >
                    <CardContent className="p-3">
                      {isPrescription && (
                        <div className="mb-1">
                          <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs">
                            <Pill className="h-3 w-3 mr-1" />
                            {t.prescription}
                          </Badge>
                        </div>
                      )}
                      {isFollowup && (
                        <div className="mb-1">
                          <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {t.followup}
                          </Badge>
                        </div>
                      )}
                      {msg.imageUrl && (
                        <img 
                          src={msg.imageUrl} 
                          alt="Uploaded" 
                          className="rounded-md max-h-64 mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                          data-testid={`image-${msg.id}`}
                          onClick={() => setSelectedImage(msg.imageUrl!)}
                        />
                      )}
                      {msg.content && (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatMessageDate(msg.createdAt)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-muted-foreground mb-2">{t.noMessages}</p>
            <p className="text-sm text-muted-foreground">{t.noMessagesDescription}</p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 shrink-0">
        {isAdmin && !isOwnWall && (
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant={messageMode === 'prescription' ? "default" : "outline"}
              size="sm"
              onClick={() => setMessageMode(messageMode === 'prescription' ? 'message' : 'prescription')}
              className={messageMode === 'prescription' ? 'bg-green-600 hover:bg-green-700' : ''}
              data-testid="button-toggle-prescription"
            >
              <Pill className="h-4 w-4 mr-1" />
              {t.prescription}
            </Button>
            <Button
              variant={messageMode === 'followup' ? "default" : "outline"}
              size="sm"
              onClick={() => setMessageMode(messageMode === 'followup' ? 'message' : 'followup')}
              className={messageMode === 'followup' ? 'bg-purple-600 hover:bg-purple-700' : ''}
              data-testid="button-toggle-followup"
            >
              <FileText className="h-4 w-4 mr-1" />
              {t.followup}
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder={
              messageMode === 'prescription' ? t.prescriptionPlaceholder : 
              messageMode === 'followup' ? t.followupPlaceholder : 
              t.writeMessage
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`flex-1 min-h-[44px] max-h-32 resize-none ${
              messageMode === 'prescription' ? 'border-green-300 dark:border-green-700' : 
              messageMode === 'followup' ? 'border-purple-300 dark:border-purple-700' : 
              ''
            }`}
            data-testid="input-message"
          />
          <div className="flex flex-col gap-1">
            <Button
              onClick={handleSendMessage}
              disabled={!message.trim() || sendMessageMutation.isPending}
              size="icon"
              data-testid="button-send-message"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={uploadingPhoto}
              onClick={() => document.getElementById('photo-upload')?.click()}
              data-testid="button-upload-photo"
            >
              {uploadingPhoto ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Image className="h-4 w-4" />
              )}
            </Button>
            <input
              id="photo-upload"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
        </div>
      </div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-none bg-transparent">
          <div className="relative flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white z-10"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            {selectedImage && (
              <img 
                src={selectedImage} 
                alt="Full size" 
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
