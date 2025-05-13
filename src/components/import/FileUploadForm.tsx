
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

const createSchema = (requiresId?: boolean, idFieldLabel?: string) => {
  let baseSchemaObject = {
    xmlFile: z
      .custom<FileList>((val) => val instanceof FileList, 'File input is required.')
      .refine((files) => files && files.length > 0, 'XML file is required.')
      .refine(
        (files) => files && files[0]?.size <= MAX_FILE_SIZE_BYTES,
        `File size should be less than ${MAX_FILE_SIZE_MB}MB.`
      )
      .refine(
        (files) => files && (files[0]?.type === 'text/xml' || files[0]?.type === 'application/xml'),
        'File must be an XML.'
      ),
  };

  if (requiresId) {
    baseSchemaObject = {
      ...baseSchemaObject,
      // Use a generic 'idField' name for the schema, label prop controls display
      idField: z.string().min(1, `${idFieldLabel || 'ID'} is required.`).regex(/^[a-zA-Z0-9_-]+$/, 'Filename must be alphanumeric, underscore, or hyphen, without .xml extension.'),
    };
  }
  return z.object(baseSchemaObject);
};

// Define a base type for form values
interface BaseFormValues {
  xmlFile: FileList;
}
// Define an extended type for when an ID field is present
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
}

export function FileUploadForm({
  formTitle,
  formDescription,
  importAction,
  requiresId = false,
  idFieldLabel = 'Filename ID',
  idFieldPlaceholder = 'Enter filename ID',
}: FileUploadFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const currentSchema = createSchema(requiresId, idFieldLabel);
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
          title: 'Error',
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
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{formTitle}</CardTitle>
        {typeof formDescription === 'string' ? <CardDescription>{formDescription}</CardDescription> : formDescription}
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {requiresId && (
            <div className="space-y-2">
              <Label htmlFor="idField">{idFieldLabel}</Label>
              <Input
                id="idField"
                type="text"
                placeholder={idFieldPlaceholder}
                {...register('idField' as any)} // Cast to any due to conditional field
                disabled={isSubmitting}
              />
              {errors.idField && (
                // @ts-ignore
                <p className="text-sm text-destructive">{errors.idField.message}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="xmlFile">XML File</Label>
            <Input
              id="xmlFile"
              type="file"
              accept=".xml,text/xml,application/xml"
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
