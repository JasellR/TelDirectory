
'use client';

import { useState, useTransition } from 'react';
import type { SubmitHandler } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, FileText, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { CsvImportResult } from '@/lib/actions'; // Assuming this type will be defined
import { useTranslation } from '@/hooks/useTranslation';

const MAX_CSV_FILE_SIZE_MB = 5;
const MAX_CSV_FILE_SIZE_BYTES = MAX_CSV_FILE_SIZE_MB * 1024 * 1024;

const csvUploadSchema = z.object({
  csvFile: z
    .custom<FileList>((val) => val instanceof FileList && val.length > 0, 'CSV file is required.')
    .refine((files) => files?.[0]?.size <= MAX_CSV_FILE_SIZE_BYTES, `File size should be less than ${MAX_CSV_FILE_SIZE_MB}MB.`)
    .refine(
      (files) => files?.[0]?.type === 'text/csv' || files?.[0]?.name.endsWith('.csv'),
      'File must be a CSV (.csv).'
    ),
});

type CsvUploadFormValues = z.infer<typeof csvUploadSchema>;

interface CsvUploadFormProps {
  importAction: (csvContent: string) => Promise<CsvImportResult>;
}

export function CsvUploadForm({ importAction }: CsvUploadFormProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CsvUploadFormValues>({
    resolver: zodResolver(csvUploadSchema),
  });

  const onSubmit: SubmitHandler<CsvUploadFormValues> = async (data) => {
    setImportResult(null);
    setIsSubmitting(true);
    const file = data.csvFile[0];

    if (!file) {
      toast({ title: t('errorTitle'), description: t('noFileSelectedError'), variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;
      if (!csvContent) {
        toast({ title: t('errorTitle'), description: t('fileReadError'), variant: 'destructive' });
        setIsSubmitting(false);
        return;
      }

      startTransition(async () => {
        try {
          const result = await importAction(csvContent);
          setImportResult(result);
          if (result.success) {
            toast({ title: t('successTitle'), description: result.message });
          } else {
            toast({
              title: t('errorTitle'),
              description: result.message || t('csvImportFailedError'),
              variant: 'destructive',
            });
          }
          reset(); // Reset form fields after submission
        } catch (error: any) {
          console.error("CSV Import Error:", error);
          setImportResult({
            success: false,
            message: t('csvImportUnexpectedError'),
            details: { processedRows: 0, extensionsAdded: 0, newLocalitiesCreated: 0, errors: [{ row: 0, data: '', error: error.message || t('unknownError') }] }
          });
          toast({ title: t('errorTitle'), description: t('csvImportUnexpectedError'), variant: 'destructive' });
        } finally {
          setIsSubmitting(false);
        }
      });
    };
    reader.onerror = () => {
      toast({ title: t('errorTitle'), description: t('fileReadError'), variant: 'destructive' });
      setIsSubmitting(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="csvFile">{t('csvFileLabel')}</Label>
          <Input
            id="csvFile"
            type="file"
            accept=".csv,text/csv"
            {...register('csvFile')}
            disabled={isSubmitting}
            className="text-sm"
          />
          {errors.csvFile && (
            <p className="text-sm text-destructive">{errors.csvFile.message}</p>
          )}
          <p className="text-xs text-muted-foreground">{t('csvFormatHint')}</p>
        </div>
        <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          {t('importCsvButton')}
        </Button>
      </form>

      {importResult && (
        <Alert variant={importResult.success ? 'default' : 'destructive'} className="mt-4">
          {importResult.success ? <FileText className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{importResult.success ? t('importSummaryTitle') : t('importErrorsTitle')}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{importResult.message}</p>
            {importResult.details && (
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>{t('processedRowsLabel', { count: importResult.details.processedRows })}</li>
                <li>{t('extensionsAddedLabel', { count: importResult.details.extensionsAdded })}</li>
                <li>{t('newLocalitiesCreatedLabel', { count: importResult.details.newLocalitiesCreated })}</li>
              </ul>
            )}
            {importResult.details?.errors && importResult.details.errors.length > 0 && (
              <>
                <p className="font-semibold mt-2">{t('specificErrorsLabel')}:</p>
                <ul className="list-disc pl-5 text-xs max-h-40 overflow-y-auto">
                  {importResult.details.errors.map((err, index) => (
                    <li key={index}>
                      {t('rowLabel', { row: err.row })}: {err.error} (Data: <code>{err.data.length > 50 ? err.data.substring(0, 50) + '...' : err.data}</code>)
                    </li>
                  ))}
                </ul>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
