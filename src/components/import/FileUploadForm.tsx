
'use client';

import type { SubmitHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Helper function, assuming it's available or define it if not
// For this example, we'll assume it's similar to the one in actions.ts
// If not, it should be imported or defined.
const sanitizeFilenamePart = (filenamePart: string): string => {
  return filenamePart.replace(/[^a-zA-Z0-9_-]/g, '');
};


const createSchema = (requiresId?: boolean, idFieldLabel?: string, allowMultipleFiles?: boolean) => {
  let baseSchemaObject = {
    xmlFile: z
      .custom<FileList>((val) => val instanceof FileList, 'File input is required.')
      .refine((files) => files && files.length > 0, 'At least one XML file is required.')
      .refine(
        (files) => {
          if (!files) return false;
          for (let i = 0; i < files.length; i++) {
            if (files[i]?.size > MAX_FILE_SIZE_BYTES) return false;
          }
          return true;
        },
        `Each file size should be less than ${MAX_FILE_SIZE_MB}MB.`
      )
      .refine(
        (files) => {
          if (!files) return false;
          for (let i = 0; i < files.length; i++) {
            if (!(files[i]?.type === 'text/xml' || files[i]?.type === 'application/xml')) return false;
          }
          return true;
        },
        'All selected files must be XML.'
      ),
  };

  if (!allowMultipleFiles && requiresId) {
    baseSchemaObject = {
      ...baseSchemaObject,
      idField: z.string().min(1, `${idFieldLabel || 'ID'} is required.`).regex(/^[a-zA-Z0-9_-]+$/, 'Filename must be alphanumeric, underscore, or hyphen, without .xml extension.'),
    };
  }
  return z.object(baseSchemaObject);
};

interface BaseFormValues {
  xmlFile: FileList;
}
interface FormValuesWithId extends BaseFormValues {
  idField: string;
}

interface FileUploadFormProps {
  formTitle: string;
  formDescription: ReactNode;
  importAction: (id: string | null, xmlContent: string) => Promise<{ success: boolean; message: string; error?: string }>;
  requiresId?: boolean;
  idFieldLabel?: string;
  idFieldPlaceholder?: string;
  allowMultipleFiles?: boolean;
}

export function FileUploadForm({
  formTitle,
  formDescription,
  importAction,
  requiresId = false,
  idFieldLabel = 'Filename ID',
  idFieldPlaceholder = 'Enter filename ID',
  allowMultipleFiles = false,
}: FileUploadFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const currentSchema = createSchema(requiresId, idFieldLabel, allowMultipleFiles);
  type CurrentFormValues = z.infer<typeof currentSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CurrentFormValues>({
    resolver: zodResolver(currentSchema),
  });

  const onSubmit: SubmitHandler<CurrentFormValues> = async (data) => {
    setIsSubmitting(true);

    if (allowMultipleFiles) {
      const files = data.xmlFile as FileList;
      let filesProcessed = 0;

      for (const file of Array.from(files)) {
        const originalFilename = file.name;
        const idValue = originalFilename.replace(/\.xml$/i, ''); // Case-insensitive .xml removal
        
        // Server-side action (importAction) already sanitizes the filename part.
        // We pass the base name (without .xml) to the action.

        if (!idValue) {
            toast({
                title: 'Skipped File',
                description: `Could not derive a valid ID from filename: ${originalFilename}. It must not be empty and should contain valid characters before the .xml extension.`,
                variant: 'destructive',
            });
            continue;
        }

        try {
          const xmlContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              if (e.target?.result) {
                resolve(e.target.result as string);
              } else {
                reject(new Error("File content is empty or unreadable."));
              }
            };
            reader.onerror = () => reject(new Error("Failed to read file: " + file.name));
            reader.readAsText(file);
          });

          if (!xmlContent) {
            toast({
              title: 'Error Reading File',
              description: `Could not read content for ${originalFilename}.`,
              variant: 'destructive',
            });
            continue;
          }
          
          // The importAction will handle individual toasts
          await importAction(idValue, xmlContent);
          filesProcessed++;

        } catch (error: any) {
          toast({
            title: 'File Processing Error',
            description: `Error processing ${originalFilename}: ${error.message}`,
            variant: 'destructive',
          });
        }
      }
      setIsSubmitting(false);
      if (filesProcessed > 0 || files.length > 0) { // Reset if any file was attempted or selected
        reset();
      }

    } else { // Single file upload logic
      const file = data.xmlFile[0];
      if (!file) {
        toast({
          title: 'Error',
          description: 'No file selected.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      const idValue = requiresId ? (data as FormValuesWithId).idField : null;

      const reader = new FileReader();
      reader.onload = async (e) => {
        const xmlContent = e.target?.result as string;
        if (!xmlContent) {
          toast({
            title: 'Error Reading File',
            description: 'Could not read file content.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }

        try {
          const result = await importAction(idValue, xmlContent);
          if (result.success) {
            toast({
              title: 'Success',
              description: result.message,
            });
            reset(); 
          } else {
            toast({
              title: 'Import Failed',
              description: result.message + (result.error ? ` Details: ${result.error}` : ''),
              variant: 'destructive',
            });
          }
        } catch (error: any) {
          toast({
            title: 'Error',
            description: error.message || 'An unexpected error occurred during import.',
            variant: 'destructive',
          });
        } finally {
          setIsSubmitting(false);
        }
      };
      reader.onerror = () => {
        toast({
          title: 'Error',
          description: 'Failed to read the file.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
      };
      reader.readAsText(file);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{formTitle}</CardTitle>
        {typeof formDescription === 'string' ? <CardDescription>{formDescription}</CardDescription> : formDescription}
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {!allowMultipleFiles && requiresId && (
            <div className="space-y-2">
              <Label htmlFor="idField">{idFieldLabel}</Label>
              <Input
                id="idField"
                type="text"
                placeholder={idFieldPlaceholder}
                {...register('idField' as any)} 
                disabled={isSubmitting}
              />
              {errors.idField && (
                // @ts-ignore
                <p className="text-sm text-destructive">{errors.idField.message}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="xmlFile">XML File(s)</Label>
            <Input
              id="xmlFile"
              type="file"
              accept=".xml,text/xml,application/xml"
              multiple={allowMultipleFiles}
              {...register('xmlFile')}
              disabled={isSubmitting}
            />
            {errors.xmlFile && (
              // @ts-ignore
              <p className="text-sm text-destructive">{errors.xmlFile.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Import XML
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
