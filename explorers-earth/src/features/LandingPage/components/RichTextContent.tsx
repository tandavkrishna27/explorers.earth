import React from 'react';
import 'quill/dist/quill.snow.css';

interface RichTextContentProps {
  content: any[];
  className?: string;
}

const RichTextContent: React.FC<RichTextContentProps> = ({ content, className = '' }) => {
  const convertBlocksToHtml = (blocks: any[]): string => {
    return blocks.map(block => {
      switch (block.type) {
        case 'paragraph':
          return `<p class="mb-4">${block.children.map((child: any) => {
            let text = child.text || '';
            if (child.bold) text = `<strong>${text}</strong>`;
            if (child.italic) text = `<em>${text}</em>`;
            if (child.underline) text = `<u>${text}</u>`;
            return text;
          }).join('')}</p>`;
        case 'heading':
          return `<h${block.level} class="text-${block.level === 1 ? '4xl' : block.level === 2 ? '3xl' : '2xl'} mb-4">${block.children.map((child: any) => {
            let text = child.text || '';
            if (child.bold) text = `<strong>${text}</strong>`;
            if (child.italic) text = `<em>${text}</em>`;
            if (child.underline) text = `<u>${text}</u>`;
            return text;
          }).join('')}</h${block.level}>`;
        case 'list': {
          const tag = block.format === 'ordered' ? 'ol' : 'ul';
          return `<${tag} class="mb-4 list-disc pl-6">${block.children.map((item: any) => 
            `<li class="mb-2">${item.children.map((child: any) => {
              let text = child.text || '';
              if (child.bold) text = `<strong>${text}</strong>`;
              if (child.italic) text = `<em>${text}</em>`;
              if (child.underline) text = `<u>${text}</u>`;
              return text;
            }).join('')}</li>`
          ).join('')}</${tag}>`;
        }
        case 'quote':
          return `<blockquote class="border-l-4 border-gray-300 pl-4 italic mb-4">${block.children.map((child: any) => {
            let text = child.text || '';
            if (child.bold) text = `<strong>${text}</strong>`;
            if (child.italic) text = `<em>${text}</em>`;
            if (child.underline) text = `<u>${text}</u>`;
            return text;
          }).join('')}</blockquote>`;
        default:
          return '';
      }
    }).join('');
  };

  const htmlContent = convertBlocksToHtml(content);

  return (
    <div className={`prose prose-lg max-w-none ${className}`}>
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
};

export default RichTextContent; 