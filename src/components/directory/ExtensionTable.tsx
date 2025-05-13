import type { Extension } from '@/types';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { UserCircle, PhoneOutgoing } from 'lucide-react';

interface ExtensionTableProps {
  extensions: Extension[];
  localityName: string;
}

export function ExtensionTable({ extensions, localityName }: ExtensionTableProps) {
  if (!extensions || extensions.length === 0) {
    return <p className="text-muted-foreground">No extensions found for {localityName}.</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Extensions for {localityName}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption>A list of extensions for {localityName}.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Department</TableHead>
              <TableHead className="w-[25%]">Extension</TableHead>
              <TableHead className="w-[35%]">Contact Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {extensions.map((ext) => (
              <TableRow key={ext.id}>
                <TableCell className="font-medium">{ext.department}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <PhoneOutgoing className="h-4 w-4 text-primary" />
                    {ext.number}
                  </div>
                </TableCell>
                <TableCell>
                  {ext.name ? (
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-muted-foreground" />
                      {ext.name}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">N/A</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Need to import Card components if not globally available
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
