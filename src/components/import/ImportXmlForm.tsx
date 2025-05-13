'use client';

import type { SubmitHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importZonesFromXml } from '@/app/import-xml/actions';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const schema = z.object({
  xmlFile: z
    .custom<FileList>()
    .refine((files) => files && files.length > 0, 'XML file is required.')
    .refine(
      (files) => files && files[0]?.size <= MAX_FILE_SIZE_BYTES,
      `File size should be less than ${MAX_FILE_SIZE_MB}MB.`
    )
    .refine(
      (files) => files && files[0]?.type === 'text/xml' || files && files[0]?.type === 'application/xml',
      'File must be an XML.'
    ),
});

type ImportXmlFormValues = z.infer<typeof schema>;

export function ImportXmlForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ImportXmlFormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit: SubmitHandler<ImportXmlFormValues> = async (data) => {
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
        const result = await importZonesFromXml(xmlContent);
        if (result.success) {
          toast({
            title: 'Success',
            description: result.message,
          });
          reset(); // Reset form fields
        } else {
          toast({
            title: 'Import Failed',
            description: result.message + (result.error ? ` Details: ${result.error}` : ''),
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'An unexpected error occurred during import.',
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
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>Import Zone Data from XML</CardTitle>
        <CardDescription>
          Upload an XML file to import or update zone branch information. Ensure the XML format is correct.
          The expected root tag is &lt;DirectoryData&gt;, containing &lt;Zone&gt; tags.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
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
