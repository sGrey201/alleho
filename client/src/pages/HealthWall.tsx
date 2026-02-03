import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { t } from "@/lib/i18n";
import { Loader2, Send, FileText, Image, ArrowLeft, Pill } from "lucide-react";
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
  messageType: 'message' | 'prescription';
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
  const [prescriptionMode, setPrescriptionMode] = useState(false);
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
      setPrescriptionMode(false);
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
      messageType: prescriptionMode ? 'prescription' : 'message',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8 flex flex-col h-[calc(100vh-120px)]">
      <div className="mb-4 flex items-center gap-4">
        {!isOwnWall && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/my-patients')}
            data-testid="button-back-to-patients"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold" data-testid="text-health-wall-title">
            {displayName}
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
            {t.viewQuestionnaireFull}
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
        {messages && messages.length > 0 ? (
          <>
            {messages.map((msg) => {
              const isOwnMessage = msg.authorUserId === user?.id;
              const isPrescription = msg.messageType === 'prescription';

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
                      {msg.imageUrl && (
                        <img 
                          src={msg.imageUrl} 
                          alt="Uploaded" 
                          className="rounded-md max-h-64 mb-2"
                          data-testid={`image-${msg.id}`}
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

      <div className="border-t pt-4">
        {isAdmin && !isOwnWall && (
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant={prescriptionMode ? "default" : "outline"}
              size="sm"
              onClick={() => setPrescriptionMode(!prescriptionMode)}
              data-testid="button-toggle-prescription"
            >
              <Pill className="h-4 w-4 mr-1" />
              {t.prescription}
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder={prescriptionMode ? t.prescriptionPlaceholder : t.writeMessage}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`flex-1 min-h-[44px] max-h-32 resize-none ${prescriptionMode ? 'border-green-300 dark:border-green-700' : ''}`}
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
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
