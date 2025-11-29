import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Code, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [htmlContent, setHtmlContent] = useState(content);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        italic: false,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setHtmlContent(html);
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] p-4 focus:outline-none',
      },
    },
  });

  useEffect(() => {
    if (editor && mode === 'visual' && editor.getHTML() !== htmlContent) {
      editor.commands.setContent(htmlContent);
    }
  }, [mode, editor, htmlContent]);

  useEffect(() => {
    if (content !== htmlContent) {
      setHtmlContent(content);
      if (editor && mode === 'visual') {
        editor.commands.setContent(content);
      }
    }
  }, [content]);

  const handleModeSwitch = () => {
    if (mode === 'visual') {
      setHtmlContent(editor?.getHTML() || '');
      setMode('html');
    } else {
      if (editor) {
        editor.commands.setContent(htmlContent);
      }
      onChange(htmlContent);
      setMode('visual');
    }
  };

  const handleHtmlChange = (value: string) => {
    setHtmlContent(value);
    onChange(value);
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-md">
      <div className="border-b bg-muted/30 p-2 flex flex-wrap gap-1 items-center justify-between">
        <div className="flex gap-1">
          {mode === 'visual' && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive('bold') ? 'bg-accent' : ''}
              data-testid="button-bold"
            >
              <Bold className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <Button
          type="button"
          size="sm"
          variant={mode === 'html' ? 'secondary' : 'ghost'}
          onClick={handleModeSwitch}
          className="gap-1.5"
          data-testid="button-toggle-mode"
        >
          {mode === 'visual' ? (
            <>
              <Code className="h-4 w-4" />
              HTML
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              Visual
            </>
          )}
        </Button>
      </div>
      
      {mode === 'visual' ? (
        <EditorContent editor={editor} />
      ) : (
        <Textarea
          value={htmlContent}
          onChange={(e) => handleHtmlChange(e.target.value)}
          placeholder={placeholder || "Enter HTML content..."}
          className="min-h-[200px] font-mono text-sm border-0 rounded-none focus-visible:ring-0 resize-y"
          data-testid="textarea-html-content"
        />
      )}
    </div>
  );
}
