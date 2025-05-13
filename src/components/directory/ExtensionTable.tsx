
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteExtensionButton } from '@/components/actions/DeleteExtensionButton';
import { EditExtensionButton } from '@/components/actions/EditExtensionButton';

interface ExtensionTableProps {
  extensions: Extension[];
  localityName: string;
  localityId: string; // Needed for actions
  zoneId: string; // Needed for actions/revalidation context
}

export function ExtensionTable({ extensions, localityName, localityId, zoneId }: ExtensionTableProps) {
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
              <TableHead className="w-[35%]">Department</TableHead>
              <TableHead className="w-[20%]">Extension</TableHead>
              <TableHead className="w-[30%]">Contact Name</TableHead>
              <TableHead className="w-[15%] text-right">Actions</TableHead>
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
                <TableCell className="text-right">
                  <div className="flex justify-end space-x-1">
                    <EditExtensionButton localityId={localityId} extension={ext} />
                    <DeleteExtensionButton localityId={localityId} zoneId={zoneId} extension={ext} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
