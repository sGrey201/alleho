import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
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
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] p-4 focus:outline-none',
      },
      handlePaste: (view, event) => {
        event.preventDefault();
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;
        
        const html = clipboardData.getData('text/html');
        const text = clipboardData.getData('text/plain');
        
        if (html) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          
          const paragraphs: string[] = [];
          
          const extractText = (node: Node): string => {
            if (node.nodeType === Node.TEXT_NODE) {
              return node.textContent || '';
            }
            
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const tagName = element.tagName.toLowerCase();
              const childContent = Array.from(node.childNodes).map(extractText).join('');
              
              if (tagName === 'strong' || tagName === 'b') {
                return `<strong>${childContent}</strong>`;
              }
              
              return childContent;
            }
            
            return '';
          };
          
          const collectParagraphs = (node: Node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const tagName = element.tagName.toLowerCase();
              
              if (tagName === 'p' || tagName === 'div' || tagName === 'li') {
                const content = extractText(node).trim();
                if (content) {
                  paragraphs.push(`<p>${content}</p>`);
                }
              } else {
                Array.from(node.childNodes).forEach(collectParagraphs);
              }
            } else if (node.nodeType === Node.TEXT_NODE) {
              const content = (node.textContent || '').trim();
              if (content) {
                paragraphs.push(`<p>${content}</p>`);
              }
            }
          };
          
          Array.from(tempDiv.childNodes).forEach(collectParagraphs);
          
          const cleanedHtml = paragraphs.join('');
          
          const removeEmptyFirstParagraph = () => {
            setTimeout(() => {
              if (!editor) return;
              const firstNode = editor.state.doc.firstChild;
              if (firstNode && firstNode.type.name === 'paragraph' && firstNode.textContent.trim() === '') {
                editor.chain().focus().setTextSelection(0).deleteNode('paragraph').run();
              }
            }, 0);
          };
          
          if (cleanedHtml) {
            const docText = editor?.state.doc.textContent || '';
            if (docText.trim() === '') {
              editor?.commands.clearContent();
              editor?.commands.setContent(cleanedHtml);
            } else {
              editor?.commands.insertContent(cleanedHtml);
            }
            removeEmptyFirstParagraph();
          } else if (text) {
            const lines = text.split(/\r?\n/);
            const content: any[] = [];
            lines.forEach((line, index) => {
              if (line) content.push({ type: 'text', text: line });
              if (index < lines.length - 1) {
                content.push({ type: 'hardBreak' });
              }
            });
            const docText = editor?.state.doc.textContent || '';
            if (docText.trim() === '') {
              editor?.commands.clearContent();
              editor?.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content }] });
            } else {
              editor?.commands.insertContent(content);
            }
            removeEmptyFirstParagraph();
          }
          return true;
        }
        
        if (text) {
          const lines = text.split(/\r?\n/);
          const content: any[] = [];
          lines.forEach((line, index) => {
            if (line) content.push({ type: 'text', text: line });
            if (index < lines.length - 1) {
              content.push({ type: 'hardBreak' });
            }
          });
          editor?.commands.insertContent(content);
          return true;
        }
        
        return false;
      },
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-md">
      <div className="border-b bg-muted/30 p-2 flex flex-wrap gap-1">
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
      </div>
      
      <EditorContent editor={editor} />
    </div>
  );
}
