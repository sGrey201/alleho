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
          
          const processNode = (node: Node): string => {
            if (node.nodeType === Node.TEXT_NODE) {
              return node.textContent || '';
            }
            
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const tagName = element.tagName.toLowerCase();
              let childContent = Array.from(node.childNodes).map(processNode).join('');
              
              if (tagName === 'strong' || tagName === 'b') {
                return `<strong>${childContent}</strong>`;
              }
              
              if (tagName === 'br') {
                return '<br>';
              }
              
              if (tagName === 'p' || tagName === 'div') {
                return `<p>${childContent}</p>`;
              }
              
              return childContent;
            }
            
            return '';
          };
          
          const cleanedHtml = Array.from(tempDiv.childNodes).map(processNode).join('');
          
          view.dispatch(
            view.state.tr.replaceSelectionWith(
              view.state.schema.nodeFromJSON({
                type: 'doc',
                content: [{ type: 'paragraph', content: [] }]
              }),
              false
            )
          );
          
          editor?.commands.insertContent(cleanedHtml || text);
          return true;
        }
        
        if (text) {
          editor?.commands.insertContent(text);
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
