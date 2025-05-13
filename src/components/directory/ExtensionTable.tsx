
'use client';

import type { Extension } from '@/types';
import { useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { UserCircle, PhoneOutgoing, Search as SearchIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteExtensionButton } from '@/components/actions/DeleteExtensionButton';
import { EditExtensionButton } from '@/components/actions/EditExtensionButton';

interface ExtensionTableProps {
  extensions: Extension[];
  localityName: string;
  localityId: string; 
  zoneId: string; 
  branchId?: string; // Optional branch context
}

export function ExtensionTable({ extensions, localityName, localityId, zoneId, branchId }: ExtensionTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredExtensions = useMemo(() => {
    if (!searchTerm.trim()) {
      return extensions;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    return extensions.filter(ext => 
      ext.department.toLowerCase().includes(lowerSearchTerm) ||
      ext.number.toLowerCase().includes(lowerSearchTerm) ||
      (ext.name && ext.name.toLowerCase().includes(lowerSearchTerm))
    );
  }, [extensions, searchTerm]);

  const renderTableContent = () => {
    if (!extensions || extensions.length === 0) {
      return <p className="text-muted-foreground p-4 text-center">No extensions available for {localityName}.</p>;
    }
    if (filteredExtensions.length === 0 && searchTerm.trim()) {
      return <p className="text-muted-foreground p-4 text-center">No extensions match your search for "{searchTerm}" in {localityName}.</p>;
    }
    if (filteredExtensions.length === 0) {
        // This case should ideally be covered by the first check, but as a fallback
        return <p className="text-muted-foreground p-4 text-center">No extensions to display for {localityName}.</p>;
    }

    return (
      <Table>
        <TableCaption>
          {searchTerm.trim() 
            ? `Displaying extensions matching "${searchTerm}" for ${localityName}.`
            : `A list of all extensions for ${localityName}.`}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[35%]">Department</TableHead>
            <TableHead className="w-[20%]">Extension</TableHead>
            <TableHead className="w-[30%]">Contact Name</TableHead>
            <TableHead className="w-[15%] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredExtensions.map((ext) => (
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
                  <DeleteExtensionButton 
                      localityId={localityId} 
                      zoneId={zoneId} 
                      branchId={branchId} 
                      extension={ext} 
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Extensions for {localityName}</CardTitle>
        {extensions && extensions.length > 0 && (
           <div className="relative mt-4">
            <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search extensions by name, number, or contact..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border bg-background p-2 pl-10 shadow-sm focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {renderTableContent()}
      </CardContent>
    </Card>
  );
}
